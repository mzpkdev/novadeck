//! In a NovaDeck terminal, the MCP server is the runner's: the relay names the terminal
//! once, then carries the agent's lines to the runner and its answers back unchanged.

use std::env;

use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::{endpoint, idle};

/// What the relay sends once the agent has closed its side, as Windows' named pipes
/// can't be half closed: the runner answers the calls under way, then closes.
pub const END: &str = "{\"relay\":\"eof\"}\n";

pub fn run(server: &str, versions: &[String]) {
    let terminal = [
        "NOVADECK_TERMINAL_ID",
        "NOVADECK_REPORT",
        "NOVADECK_REPORT_TOKEN",
    ]
    .map(|name| env::var(name).ok().filter(|value| !value.is_empty()));
    let [Some(terminal), Some(endpoint), Some(token)] = terminal else {
        return idle::serve(server, versions);
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build();
    let Ok(runtime) = runtime else {
        return idle::serve(server, versions);
    };
    // A runner that can't be reached has no tools to offer.
    let Some(connection) = runtime.block_on(async { endpoint::connect(&endpoint).await.ok() })
    else {
        return idle::serve(server, versions);
    };
    let hello = json!({ "relay": 2, "kind": "mcp", "terminalId": terminal, "token": token });
    runtime.block_on(carry(connection, format!("{hello}\n")));
    // The agent's input may still be read on a thread of its own, which can't be
    // cancelled; the process ends without waiting for it.
    runtime.shutdown_background();
}

async fn carry(
    (mut from_runner, mut to_runner): (endpoint::Reader, endpoint::Writer),
    hello: String,
) {
    let answers = async {
        let mut stdout = tokio::io::stdout();
        let mut buffer = vec![0u8; 16 * 1024];
        loop {
            match from_runner.read(&mut buffer).await {
                Ok(0) | Err(_) => return,
                Ok(read) => {
                    let written = stdout.write_all(&buffer[..read]).await;
                    if written.is_err() || stdout.flush().await.is_err() {
                        return;
                    }
                }
            }
        }
    };
    let messages = async {
        let mut stdin = tokio::io::stdin();
        let mut buffer = vec![0u8; 16 * 1024];
        if to_runner.write_all(hello.as_bytes()).await.is_err() {
            return;
        }
        // Whether what went last ends a line, so the end goes on a line of its own.
        let mut whole = true;
        loop {
            match stdin.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    whole = buffer[read - 1] == b'\n';
                    if to_runner.write_all(&buffer[..read]).await.is_err() {
                        return;
                    }
                }
            }
        }
        let tail = if whole {
            END.to_owned()
        } else {
            format!("\n{END}")
        };
        let _ = to_runner.write_all(tail.as_bytes()).await;
        let _ = to_runner.flush().await;
        // The runner closes once it has answered; until then, its answers still come.
        std::future::pending::<()>().await
    };
    // Done when the runner closes: after the end, or when it goes away.
    tokio::select! {
        () = answers => {}
        () = messages => {}
    }
}
