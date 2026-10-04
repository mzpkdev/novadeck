//! An agent hook, run by a connected agent's NovaDeck plugin: the relay sends what the
//! hook knows to the runner of the terminal it runs in, unread, and prints what the
//! runner answers, exactly as the agent expects. A Stop or prompt-time hook's answer may
//! deliver agents' messages under a lease, which the relay acknowledges once printed.
//! Claude Code's status line runs through the hook too: the runner names the person's
//! own command, which the relay runs and prints. Outside NovaDeck's terminals, or when
//! the runner can't be reached, it prints only what its agent needs: Antigravity's JSON,
//! where a PreToolUse answer must say "ask" or Antigravity denies the tool.

use std::env;
use std::io::{self, Read, Write};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::{ancestors, endpoint, status_line};

/// How long a hook may take, from its start: the longest any hook waits, for Claude
/// Code's status line; the runner answers the others well within it.
const LIMIT: Duration = Duration::from_millis(5_000);

/// The most of an agent's payload the hook takes; past it, it reports nothing.
const MAX_PAYLOAD: u64 = 1_000_000;

const AGENTS: [&str; 3] = ["claude", "codex", "agy"];

/// What the runner answered: what to print, the lease that delivers, and the person's
/// own status line to run.
#[derive(Default, Debug, PartialEq)]
pub struct Answer {
    pub stdout: Option<String>,
    pub lease: Option<String>,
    pub status_line: Option<String>,
}

pub fn answer_of(line: &str) -> Answer {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Answer::default();
    };
    let text = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_owned);
    Answer {
        stdout: text("stdout"),
        lease: text("leaseId"),
        status_line: text("statusLine"),
    }
}

/// What the hook prints when the runner gave nothing to print.
pub fn fallback(agent: &str, event: &str) -> &'static str {
    match (agent, event) {
        ("agy", "PreToolUse") => "{\"decision\":\"ask\"}\n",
        ("agy", _) => "{}\n",
        _ => "",
    }
}

fn print(text: &str) {
    let mut stdout = io::stdout().lock();
    let _ = stdout.write_all(text.as_bytes());
    let _ = stdout.flush();
}

pub fn run(agent: &str, event: &str) {
    // When the hook started, in wall-clock milliseconds: a later hook reports a larger one.
    let seq = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |since| since.as_secs_f64() * 1000.0);
    let deadline = Instant::now() + LIMIT;
    // The agent's payload, read whole even where it goes unused, so the agent never
    // writes into a closed pipe; within the hook's limit, as an agent may leave it open.
    let payload = read_input(deadline);
    let terminal = [
        "NOVADECK_TERMINAL_ID",
        "NOVADECK_REPORT",
        "NOVADECK_REPORT_TOKEN",
    ]
    .map(|name| env::var(name).ok().filter(|value| !value.is_empty()));
    let [Some(terminal), Some(endpoint), Some(token)] = terminal else {
        return print(fallback(agent, event));
    };
    let Some(payload) = payload.filter(|_| AGENTS.contains(&agent)) else {
        return print(fallback(agent, event));
    };
    let payload = String::from_utf8_lossy(&payload).into_owned();
    let variable = |name: &str| env::var(name).ok().filter(|value| !value.is_empty());
    let message = json!({
        "relay": 2,
        "kind": "hook",
        "terminalId": terminal,
        "token": token,
        "agent": agent,
        "event": event,
        "seq": seq,
        "ancestors": ancestors::of_this_process(),
        // Only what tells agents apart, and where Claude Code keeps its settings.
        "env": {
            "claudePid": variable("CLAUDE_PID"),
            "cursor": variable("CURSOR_VERSION").is_some(),
            "codexThread": variable("CODEX_THREAD_ID"),
            "claudeConfigDir": variable("CLAUDE_CONFIG_DIR"),
        },
        "payload": payload,
    });
    let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    else {
        return print(fallback(agent, event));
    };
    runtime.block_on(async {
        let left = deadline.saturating_duration_since(Instant::now());
        let asked = tokio::time::timeout(left, ask(&endpoint, format!("{message}\n"))).await;
        let Ok(Some((answer, mut to_runner))) = asked else {
            return print(fallback(agent, event));
        };
        if let Some(stdout) = &answer.stdout {
            print(stdout);
            // Printed: what the lease delivers has reached the agent.
            if let Some(lease) = &answer.lease {
                let ack = format!("{}\n", json!({ "ack": lease }));
                let sent = async {
                    to_runner.write_all(ack.as_bytes()).await?;
                    to_runner.flush().await
                };
                let _ = tokio::time::timeout(Duration::from_millis(500), sent).await;
            }
            return;
        }
        let own = answer
            .status_line
            .map(|command| status_line::run(&command, payload.as_bytes(), deadline));
        match own {
            Some(printed) => print(&printed),
            None => print(fallback(agent, event)),
        }
    });
    runtime.shutdown_background();
}

/// The agent's payload, or None once it runs past what the hook takes, or past
/// `deadline`, when what is left goes unread.
fn read_input(deadline: Instant) -> Option<Vec<u8>> {
    let (sent, received) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut payload = Vec::new();
        let read = io::stdin()
            .lock()
            .take(MAX_PAYLOAD + 1)
            .read_to_end(&mut payload);
        let whole = read.is_ok() && payload.len() as u64 <= MAX_PAYLOAD;
        // Past the most it takes: the rest is drained, unkept.
        if !whole {
            let _ = io::copy(&mut io::stdin().lock(), &mut io::sink());
        }
        let _ = sent.send(whole.then_some(payload));
    });
    received
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .ok()
        .flatten()
}

/// Sends the hook and reads the runner's one-line answer, keeping the connection for
/// the acknowledgement.
async fn ask(endpoint: &str, line: String) -> Option<(Answer, endpoint::Writer)> {
    let (from_runner, mut to_runner) = endpoint::connect(endpoint).await.ok()?;
    to_runner.write_all(line.as_bytes()).await.ok()?;
    to_runner.flush().await.ok()?;
    let mut reply = String::new();
    BufReader::new(from_runner)
        .read_line(&mut reply)
        .await
        .ok()?;
    Some((answer_of(&reply), to_runner))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_runners_answer() {
        assert_eq!(
            answer_of(r#"{"leaseId":"abc","stdout":"{\"decision\":\"block\"}"}"#),
            Answer {
                stdout: Some("{\"decision\":\"block\"}".into()),
                lease: Some("abc".into()),
                status_line: None
            }
        );
        assert_eq!(
            answer_of(r#"{"leaseId":null,"stdout":null,"statusLine":"echo hi"}"#),
            Answer {
                stdout: None,
                lease: None,
                status_line: Some("echo hi".into())
            }
        );
        assert_eq!(answer_of("not json"), Answer::default());
    }

    #[test]
    fn prints_what_antigravity_needs_without_nova_deck() {
        assert_eq!(fallback("agy", "PreToolUse"), "{\"decision\":\"ask\"}\n");
        assert_eq!(fallback("agy", "Stop"), "{}\n");
        assert_eq!(fallback("claude", "Stop"), "");
        assert_eq!(fallback("codex", "PreToolUse"), "");
    }

    #[test]
    fn names_itself_first_so_the_runner_knows_its_line() {
        let hello = json!({ "relay": 2, "kind": "hook", "agent": "claude" }).to_string();
        assert!(hello.starts_with("{\"relay\":2,"));
    }
}
