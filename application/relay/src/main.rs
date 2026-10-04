//! NovaDeck's relay: what an agent starts for NovaDeck's MCP server. It carries the
//! agent's messages to the runner of the terminal it runs in, and the runner's answers
//! back, and answers the handshake by itself, with no tools, outside NovaDeck's
//! terminals. The runner speaks the protocol; the relay only carries lines, so it stays
//! small for as long as the agent runs.

mod endpoint;
mod idle;
mod mcp;

use std::process::ExitCode;

const USAGE: &str = "usage: novadeck-relay mcp <server-version> <protocol-version>...";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.split_first() {
        Some((mode, rest)) if mode == "mcp" => match rest.split_first() {
            Some((server, versions)) if !versions.is_empty() => {
                mcp::run(server, versions);
                ExitCode::SUCCESS
            }
            _ => {
                eprintln!("{USAGE}");
                ExitCode::from(2)
            }
        },
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}
