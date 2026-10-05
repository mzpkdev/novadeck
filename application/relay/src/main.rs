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

use std::path::Path;
use std::process::ExitCode;

/// The version of the protocol the relay and the runner speak (see docs/backend-api.md,
/// "Relay protocol"); the runner takes the versions it knows.
pub const PROTOCOL: u32 = 2;

/// The source the relay was built from, as its build names it, to tell copies apart.
const SOURCE: Option<&str> = option_env!("NOVADECK_RELAY_SOURCE");

const USAGE: &str = "usage: novadeck-relay mcp <server-version> <protocol-version>...
       novadeck-relay hook [--config <relay.json>] <agent> [event]
       novadeck-relay --version";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.split_first() {
        Some((mode, _)) if mode == "--version" => {
            let source = SOURCE.map_or("unknown", |source| &source[..source.len().min(16)]);
            println!(
                "novadeck-relay {} (protocol {PROTOCOL}, source {source})",
                env!("CARGO_PKG_VERSION")
            );
            ExitCode::SUCCESS
        }
        // A hook always succeeds, so its agent never treats NovaDeck as failing.
        Some((mode, rest)) if mode == "hook" => {
            // What the runner tells it of the agents, from the file its launcher names.
            let (config, rest) = match rest {
                [flag, path, rest @ ..] if flag == "--config" => {
                    (hook::Config::read(Some(Path::new(path))), rest)
                }
                _ => (hook::Config::default(), rest),
            };
            let agent = rest.first().map_or("", String::as_str);
            let event = rest.get(1).map_or("", String::as_str);
            hook::run(agent, event, &config);
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
