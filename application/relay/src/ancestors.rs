//! The processes a hook runs under, nearest first, so the runner can tell which agent
//! process ran it: up to eight, each by its pid and name, where the platform tells.

use serde_json::Value;

#[cfg(unix)]
pub fn of_this_process() -> Vec<Value> {
    const MOST: usize = 8;
    let mut found = Vec::new();
    let mut pid = std::os::unix::process::parent_id();
    while found.len() < MOST && pid > 1 {
        let Some((name, parent)) = process(pid) else {
            break;
        };
        found.push(serde_json::json!({ "pid": pid, "name": name }));
        pid = parent;
    }
    found
}

/// Windows doesn't tell a process's parent cheaply, and the runner goes without.
#[cfg(not(unix))]
pub fn of_this_process() -> Vec<Value> {
    Vec::new()
}

/// A process's name and parent, from `/proc`.
#[cfg(target_os = "linux")]
fn process(pid: u32) -> Option<(String, u32)> {
    stat(&std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?)
}

/// A `/proc/<pid>/stat` line's name, which may hold spaces and brackets, and parent.
#[cfg(any(target_os = "linux", test))]
fn stat(line: &str) -> Option<(String, u32)> {
    let name = &line[line.find('(')? + 1..line.rfind(')')?];
    let rest = &line[line.rfind(')')? + 2..];
    let parent = rest.split(' ').nth(1)?.parse().ok()?;
    Some((name.to_owned(), parent))
}

/// A process's name, as its executable's file name, and parent, from the kernel.
#[cfg(target_os = "macos")]
fn process(pid: u32) -> Option<(String, u32)> {
    use std::mem::{MaybeUninit, size_of};

    let mut path = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    let length =
        unsafe { libc::proc_pidpath(pid as i32, path.as_mut_ptr().cast(), path.len() as u32) };
    if length <= 0 {
        return None;
    }
    path.truncate(length as usize);
    let path = String::from_utf8_lossy(&path).into_owned();
    let name = path.rsplit('/').next()?.to_owned();
    let mut info = MaybeUninit::<libc::proc_bsdinfo>::zeroed();
    let size = size_of::<libc::proc_bsdinfo>() as i32;
    let read = unsafe {
        libc::proc_pidinfo(
            pid as i32,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if read != size {
        return None;
    }
    let parent = unsafe { info.assume_init() }.pbi_ppid;
    Some((name, parent))
}

/// Elsewhere the platform doesn't tell, and the runner goes without.
#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
fn process(_pid: u32) -> Option<(String, u32)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_name_with_spaces_and_brackets() {
        assert_eq!(
            stat("4242 (my (odd) agent) S 4100 4242 4100 0"),
            Some(("my (odd) agent".into(), 4100))
        );
        assert_eq!(stat("garbled"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn finds_the_processes_this_one_runs_under() {
        let parent = std::os::unix::process::parent_id();
        let found = of_this_process();
        assert_eq!(
            found.first().and_then(|first| first["pid"].as_u64()),
            Some(u64::from(parent))
        );
        assert!(found.len() <= 8);
    }
}
