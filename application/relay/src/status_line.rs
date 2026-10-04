//! The person's own Claude Code status line, which NovaDeck's status line shows: their
//! command, run as Claude Code runs it, with the same input, in a process group of its
//! own, so a deadline ends everything it started.

use std::time::Instant;

/// The most of its output kept.
#[cfg(unix)]
pub const MOST: usize = 65_536;

/// What the command printed by the time it ended, or by `deadline`, when it and whatever
/// it started are ended. Claude Code's status line runs through the hook only on Linux
/// and macOS.
#[cfg(unix)]
pub fn run(command: &str, input: &[u8], deadline: Instant) -> String {
    use std::io::{Read, Write};
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;

    let started = Command::new("/bin/sh")
        .arg("-c")
        .arg(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn();
    let Ok(mut child) = started else {
        return String::new();
    };
    let group = child.id() as i32;
    if let Some(mut stdin) = child.stdin.take() {
        let input = input.to_vec();
        thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
    }
    let Some(mut stdout) = child.stdout.take() else {
        return String::new();
    };
    let (sent, printed) = mpsc::channel::<Vec<u8>>();
    let (ended, closed) = mpsc::channel::<()>();
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        // Read to its end, keeping only what may be shown.
        let mut kept = 0;
        loop {
            match stdout.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) if kept < MOST => {
                    kept += read;
                    if sent.send(buffer[..read].to_vec()).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
            }
        }
        let _ = ended.send(());
    });
    // Its output ends once it and everything it started let go of it.
    let finished = closed
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .is_ok();
    if !finished {
        unsafe { libc::kill(-group, libc::SIGTERM) };
    }
    thread::spawn(move || child.wait());
    let mut kept = Vec::new();
    while let Ok(chunk) = printed.try_recv() {
        if kept.len() < MOST {
            kept.extend_from_slice(&chunk);
        }
    }
    kept.truncate(MOST);
    String::from_utf8_lossy(&kept).into_owned()
}

#[cfg(not(unix))]
pub fn run(_command: &str, _input: &[u8], _deadline: Instant) -> String {
    String::new()
}

#[cfg(all(test, unix))]
mod tests {
    use std::time::Duration;

    use super::*;

    #[test]
    fn prints_what_the_command_printed_from_the_same_input() {
        let printed = run(
            "cat; printf ' done'",
            b"{\"model\":1}",
            Instant::now() + Duration::from_secs(5),
        );
        assert_eq!(printed, "{\"model\":1} done");
    }

    #[test]
    fn ends_a_command_still_running_at_the_deadline_and_shows_what_it_printed() {
        let began = Instant::now();
        let printed = run(
            "printf partly; sleep 30",
            b"",
            began + Duration::from_millis(300),
        );
        assert_eq!(printed, "partly");
        assert!(began.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn keeps_at_most_sixty_four_kibibytes() {
        let printed = run(
            "head -c 200000 /dev/zero | tr '\\0' x",
            b"",
            Instant::now() + Duration::from_secs(5),
        );
        assert_eq!(printed.len(), MOST);
    }
}
