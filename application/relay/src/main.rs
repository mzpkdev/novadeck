//! NovaDeck's relay: what an agent starts for NovaDeck's MCP server and its hooks. It
//! carries the agent's messages to the runner of the terminal it runs in, and the
//! runner's answers back, and answers by itself outside NovaDeck's terminals. The runner
//! reads everything; the relay only carries it, so it stays small and starts at once,
//! for as long as an agent runs and for every hook it runs.

mod ancestors;
mod endpoint;
mod hook;
mod idle;
mod mcp;
mod status_line;

use std::process::ExitCode;

const USAGE: &str = "usage: novadeck-relay mcp <server-version> <protocol-version>...\n       novadeck-relay hook <agent> [event]";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.split_first() {
        // A hook always succeeds, so its agent never treats NovaDeck as failing.
        Some((mode, rest)) if mode == "hook" => {
            let agent = rest.first().map_or("", String::as_str);
            let event = rest.get(1).map_or("", String::as_str);
            hook::run(agent, event);
            ExitCode::SUCCESS
        }
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
