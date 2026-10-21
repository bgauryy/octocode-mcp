mod commands;
mod config;
mod config_view;
mod graph;
mod lsp_provision;
mod mcp_clients;
mod mcp_install;
mod mcp_manage;
mod schema;
mod serve;
mod skill;
mod system;
use clap::{CommandFactory, FromArgMatches, Parser};
use commands::{AuthCommand, Command, ConfigCommand, ToolArgs};
use octocode_native::config::RuntimeSurface;
use octocode_native::runtime::availability::{Availability, ToolAvailability};
use octocode_native::runtime::error::tool_error_result;
use octocode_native::runtime::{
    Channel, ExitClass, FailureKind, HostOptions, RuntimeError, ToolOutcome, ToolRuntime,
};
use octocode_native::tools::id::ToolId;
use serde_json::{Value, json};
use std::io::{self, Write};

#[derive(Parser)]
#[command(
    name = "octocode",
    version,
    about = "Native Octocode research tools",
    long_about = ROOT_HELP,
    after_help = "Run: octocode <tool> '<json>' | Fields: octocode schema <tool>\nUse --help for output rules and exit codes; <tool> --help for examples."
)]
pub struct Args {
    #[command(subcommand)]
    command: Command,
    /// Print JSON (tools, `graph`, and `schema` already do on a pipe):
    /// indented on a terminal, one line on a pipe.
    #[arg(long, global = true)]
    json: bool,
}

const ROOT_HELP: &str = r#"Native Octocode research tools.

Queries: one JSON object or {"queries":[…]}; --input FILE|- reads a query.
Discovery: schema lists tools; schema <tool> lists query fields.
Reference: schema [<tool>] --view full. Examples: <tool> --help.
Graph: graph ingest <path>, then graph query <op> [ref]; see graph --help.

Output: text on a terminal; JSON on a pipe or with --json (indented on a terminal).
Errors: stdout in JSON mode, stderr otherwise; pipe-selected JSON also reports
text to stderr when stderr is a terminal.
Exits: 0 success, 1 empty, 2 invalid input (including batch rows), 3 not found,
4 auth required, 5 execution error, 7 rate limited, 130 interrupted.
A batch exits with its worst row; stdout still carries every row's result.
More pages still exit 0: follow next.*; check pagination.hasMore."#;

/// How a command answers: JSON or text, and whether a pipe chose JSON.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct OutputMode {
    /// The command prints JSON.
    pub(super) json: bool,
    /// JSON because stdout is a pipe; the caller did not pass `--json`.
    piped: bool,
}

impl OutputMode {
    /// `--json`, or a pipe for a command that answers a pipe in JSON.
    fn new(json_flag: bool, answers_pipe_in_json: bool) -> Self {
        let piped = !json_flag && answers_pipe_in_json && !stdout_is_terminal();
        Self {
            json: json_flag || piped,
            piped,
        }
    }

    /// An error in this mode is also written as text on stderr: a pipe chose
    /// JSON, and stderr is a terminal, so a person may be watching it while
    /// the JSON goes on to the next program.
    fn tells_stderr(self) -> bool {
        use std::io::IsTerminal;
        self.piped && io::stderr().is_terminal()
    }
}

impl From<bool> for OutputMode {
    /// A command's explicit choice: JSON for `--json`, else text.
    fn from(json: bool) -> Self {
        Self { json, piped: false }
    }
}

fn stdout_is_terminal() -> bool {
    use std::io::IsTerminal;
    io::stdout().is_terminal()
}

/// A command's own failure (not a tool call's): the `{error, errorCode}`
/// envelope tool errors use, on stdout in JSON mode, else the message on
/// stderr. Every code is a declared `errorCodes` entry.
fn emit_error(code: &str, message: &str, mode: impl Into<OutputMode>) {
    let mode = mode.into();
    let envelope = error_envelope(code, message, &[]);
    if mode.json {
        write_json(&envelope);
    }
    if !mode.json || mode.tells_stderr() {
        eprintln!("{}", envelope["error"].as_str().unwrap_or_default());
    }
}

/// The `{error, errorCode[, details]}` envelope of a command's own failure,
/// with secrets scrubbed from every line.
fn error_envelope(code: &str, message: &str, details: &[&str]) -> Value {
    use octocode_native::security::scrub_error_text;
    let details = details.iter().map(|line| scrub_error_text(line)).collect();
    let mut envelope = octocode_native::contracts::tool_error(&scrub_error_text(message), details);
    envelope["errorCode"] = json!(code);
    envelope
}

/// Commands whose output is text for people unless `--json` asks otherwise;
/// every other command (tools, `graph`, an unknown name) answers in JSON.
fn text_command(name: &str) -> bool {
    matches!(
        name,
        "config" | "auth" | "skill" | "install" | "help" | "lsp-server" | "cache" | "serve"
    )
}

/// How a parse error is reported: as JSON for `--json` anywhere, or for a
/// non-text command (a mistyped tool name included) whose stdout is a pipe.
fn parse_error_mode(argv: &[std::ffi::OsString]) -> OutputMode {
    let json_flag = argv.iter().any(|arg| arg == "--json");
    let command = argv
        .iter()
        .skip(1)
        .filter_map(|arg| arg.to_str())
        .find(|arg| !arg.starts_with('-'));
    OutputMode::new(json_flag, !command.is_some_and(text_command))
}

/// Clap's diagnostic as text on stderr, colored when stderr is a terminal,
/// with secrets scrubbed.
fn print_clap_error(error: &clap::Error) {
    let rendered = error.render().to_string();
    let sanitized = octocode_native::security::scrub_error_text(&rendered);
    if sanitized == rendered {
        let _ = error.print();
    } else {
        let _ = io::stderr().lock().write_all(sanitized.as_bytes());
    }
}

/// Clap's whole diagnostic as the JSON envelope: `error` is its error line
/// and `tip:` lines (the did-you-mean names), and every other line (possible
/// values, usage) is a `details` entry.
fn clap_error_envelope(error: &clap::Error) -> Value {
    let rendered = error.render().to_string();
    let (message, details): (Vec<&str>, Vec<&str>) = rendered
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .partition(|line| line.starts_with("error: ") || line.starts_with("tip: "));
    let message = message
        .iter()
        .map(|line| line.strip_prefix("error: ").unwrap_or(line))
        .collect::<Vec<_>>()
        .join("; ");
    // A rejected command line is the caller's input, like a bad query.
    error_envelope("invalidInput", &message, &details)
}

pub fn parse_args() -> Result<Args, u8> {
    parse_args_from(std::env::args_os())
}

fn parse_args_from<I, T>(argv: I) -> Result<Args, u8>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let mut argv: Vec<std::ffi::OsString> = argv.into_iter().map(Into::into).collect();
    // A bare `octocode` on a pipe is an agent asking what it can do. A
    // terminal is the ordinary clap help path (stdout and a successful exit).
    if argv.len() == 1 && !stdout_is_terminal() {
        argv.push("schema".into());
    } else if argv.len() == 1 {
        argv.push("--help".into());
    }
    match Args::command()
        .try_get_matches_from(&argv)
        .and_then(|matches| Args::from_arg_matches(&matches))
    {
        Ok(args) => Ok(args),
        Err(error) => {
            let error = if is_help(&error) {
                with_tool_help(hide_unavailable_tools(Args::command()))
                    .try_get_matches_from(&argv)
                    .err()
                    .unwrap_or(error)
            } else {
                error
            };
            let displays_text =
                is_help(&error) || error.kind() == clap::error::ErrorKind::DisplayVersion;
            if displays_text {
                let _ = error.print();
                return Err(error.exit_code() as u8);
            }
            let mode = parse_error_mode(&argv);
            if !mode.json {
                print_clap_error(&error);
                return Err(error.exit_code() as u8);
            }
            write_json(&clap_error_envelope(&error));
            if mode.tells_stderr() {
                print_clap_error(&error);
            }
            Err(2)
        }
    }
}

fn is_help(error: &clap::Error) -> bool {
    matches!(
        error.kind(),
        clap::error::ErrorKind::DisplayHelp
            | clap::error::ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand
    )
}

/// Help lists only the tools this surface can run, as MCP `tools/list` does;
/// a hidden tool stays callable by name and keeps its own help. Only the
/// configuration is resolved: help starts no runtime, cache maintenance, or
/// config warnings.
fn hide_unavailable_tools(mut command: clap::Command) -> clap::Command {
    use octocode_native::config::{acquire_config_input, resolve_config};
    let (Ok(cwd), Some(home)) = (std::env::current_dir(), octocode_io::env::home_dir()) else {
        return command;
    };
    let surface = RuntimeSurface::Cli;
    let input = acquire_config_input(octocode_io::env::vars_lossy(), cwd, home, surface);
    let availability = ToolAvailability::resolve(&resolve_config(&input), surface);
    for tool in ToolId::ALL {
        if !availability.is_available(tool.as_str()) {
            command = command.mut_subcommand(tool.as_str(), |sub| sub.hide(true));
        }
    }
    command
}

/// `<tool> --help` ends with what the query needs: required fields and one
/// runnable example, from the embedded CLI presentation.
fn with_tool_help(mut command: clap::Command) -> clap::Command {
    for tool in ToolId::ALL {
        if let Some(help) = schema::tool_help(tool.as_str()) {
            command = command.mut_subcommand(tool.as_str(), |sub| sub.after_help(help));
        }
    }
    command
}

/// Text for a disabled tool whose gating env key was present in a `.env`
/// file but not applied — the state change would otherwise be invisible.
fn dropped_key_hint(
    env_vars: &[&str],
    dotenv: &octocode_native::config::EnvApplyReport,
) -> Option<String> {
    env_vars.iter().find_map(|name| {
        if dotenv.skipped_protected.iter().any(|key| key == name) {
            Some(format!(
                "{name} was found in a .env file but dropped (protected); set it in the process environment or config file"
            ))
        } else if dotenv.skipped_existing.iter().any(|key| key == name) {
            Some(format!(
                "{name} in a .env file is shadowed by the process environment"
            ))
        } else {
            None
        }
    })
}

/// A tool's `availability` in the machine catalog: enabled, or what enables
/// it — the variables of its unset prerequisites, or the tool-list setting.
fn availability_entry(
    availability: Option<&Availability>,
    dotenv: &octocode_native::config::EnvApplyReport,
) -> Value {
    let Some(availability) = availability.filter(|a| !a.is_available()) else {
        return json!({ "enabled": true });
    };
    let mut entry = json!({ "enabled": false });
    match availability {
        Availability::ToolList(setting) => entry["configuration"] = json!(setting.path),
        other => {
            let env_vars = other.env_vars();
            if let Some(hint) = dropped_key_hint(&env_vars, dotenv) {
                entry["hint"] = Value::String(hint);
            }
            if !env_vars.is_empty() {
                entry["envVar"] = Value::String(env_vars.join("|"));
            }
        }
    }
    entry
}

/// The machine catalog: runtime availability joined with the compact field
/// lists the embedded CLI presentation precomputes from the core Zod rows.
fn machine_catalog(runtime: &ToolRuntime) -> Result<Value, String> {
    let catalog = runtime.catalog();
    let presentation = octocode_native::contracts::cli_presentation()
        .map_err(|error| format!("Embedded CLI presentation is invalid: {error}"))?;
    let presentation_tools = presentation.get("tools").and_then(Value::as_array);
    let dotenv = &runtime.config().dotenv;
    let tools = ToolId::ALL
        .into_iter()
        .map(|tool| {
            let name = tool.as_str();
            let fields = presentation_tools
                .and_then(|tools| tools.iter().find(|candidate| candidate["name"] == name))
                .map(|tool| schema::configured_tool(tool, &catalog))
                .and_then(|tool| tool["fields"].as_str())
                .unwrap_or("[]");
            json!({
                "name": name,
                "fields": fields,
                "availability": availability_entry(runtime.availability(name), dotenv),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "fingerprint": catalog["fingerprint"],
        "grammarCapabilities": catalog["grammarCapabilities"],
        "presentation": catalog["presentation"],
        "tools": tools
    }))
}

pub async fn run(args: Args) -> u8 {
    let Args { command, json } = args;
    let mode = command.output_mode(json);
    let json_out = mode.json;
    let command = match command {
        Command::Config {
            command:
                Some(ConfigCommand::View {
                    no_open,
                    idle_timeout,
                }),
            ..
        } => {
            return config_view::run(no_open, idle_timeout, json_out).await;
        }
        Command::Serve { socket } => return serve::run(&socket).await,
        Command::Tool(tool) => return run_tool(tool, mode).await,
        command => command,
    };
    let runtime = match ToolRuntime::from_host(cli_host()) {
        Ok(runtime) => runtime,
        Err(error) => return start_failed(&error, mode),
    };
    let result = dispatch(command, &runtime, mode).await;
    runtime.close().await;
    result
}

/// The CLI's runtime host: this process's environment and directory.
fn cli_host() -> HostOptions {
    HostOptions {
        surface: RuntimeSurface::Cli,
        ..HostOptions::default()
    }
}

/// The exit code of a login or logout; one that succeeded stops the warm
/// servers, which may still remember the credential it replaced.
fn credential_changed(code: u8) -> u8 {
    if code == 0 {
        serve::stop_all();
    }
    code
}

/// A runtime that could not start: its error in the command's output mode.
fn start_failed(error: &RuntimeError, mode: OutputMode) -> u8 {
    emit_error(&error.code, &error.message, mode);
    exit_code(error.exit_class())
}

impl Command {
    /// The output mode the command was asked for: tools, `graph`, and
    /// `schema` answer a pipe in JSON; every command answers `--json` in JSON.
    fn output_mode(&self, json: bool) -> OutputMode {
        let answers_pipe_in_json = matches!(
            self,
            Self::Tool(_) | Self::Graph { .. } | Self::Schema { .. }
        );
        OutputMode::new(json, answers_pipe_in_json)
    }
}

async fn dispatch(command: Command, runtime: &ToolRuntime, mode: OutputMode) -> u8 {
    let json_out = mode.json;
    match command {
        Command::Schema { tool, view, select } => {
            let value = machine_catalog(runtime)
                .map_err(|message| schema::SchemaError { message, exit: 5 })
                .and_then(|machine| match tool.as_deref() {
                    None => schema::catalog(&machine, view.as_deref()),
                    Some(name) => {
                        schema::tool_view(&machine, name, view.as_deref(), select.as_deref())
                    }
                });
            match value {
                Ok(value) => write_json(&value),
                Err(error) => {
                    let code = if error.exit == 2 {
                        "invalidInput"
                    } else {
                        "contract"
                    };
                    emit_error(code, &error.message, mode);
                    error.exit
                }
            }
        }
        Command::Config {
            command, manage, ..
        } => {
            if manage {
                return config_management(runtime);
            }
            match command {
                Some(ConfigCommand::Home) => config::home(runtime, json_out),
                Some(ConfigCommand::Get { key }) => {
                    config::get(runtime, config::env_key(&key), json_out)
                }
                Some(ConfigCommand::Set { key, value, stdin }) => {
                    config::set(runtime, config::env_key(&key), value, stdin, json_out)
                }
                Some(ConfigCommand::Unset { key }) => {
                    config::unset(runtime, config::env_key(&key), json_out)
                }
                Some(ConfigCommand::Check { key }) => {
                    config::check(runtime, config::env_key(&key), json_out).await
                }
                // `config view` returns from `run` before the runtime starts.
                Some(ConfigCommand::View { .. }) | None => config::show(runtime, json_out),
            }
        }
        Command::Auth { command } => match command {
            AuthCommand::Status => system::auth_status(runtime, json_out).await,
            AuthCommand::Login {
                hostname,
                force,
                refresh,
            } => credential_changed(
                system::login(runtime, hostname.as_deref(), force, refresh, json_out).await,
            ),
            AuthCommand::Logout => credential_changed(system::logout(runtime, json_out)),
        },
        Command::Graph { command } => graph::graph(runtime, command, mode),
        Command::Skill { command } => skill::run(runtime, command, json_out).await,
        Command::Install(args) => mcp_install::run(mcp_install::InstallArgs {
            json: json_out,
            ..args
        }),
        Command::LspServer {
            action,
            names,
            all,
            yes,
            force,
        } => lsp_provision::run(runtime, &action, names, all, yes, force, json_out).await,
        // Handled in `run` before the runtime starts.
        Command::Tool(_) | Command::Serve { .. } => 2,
    }
}

/// Read at most `limit` bytes from `reader`; `Ok(None)` when it holds more.
fn read_bounded(reader: impl io::Read, limit: u64) -> io::Result<Option<Vec<u8>>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    reader.take(limit + 1).read_to_end(&mut bytes)?;
    Ok((bytes.len() as u64 <= limit).then_some(bytes))
}

/// Largest management request read from stdin.
const MAX_MANAGEMENT_REQUEST_BYTES: u64 = 128 * 1024;

fn config_management(runtime: &ToolRuntime) -> u8 {
    let result = read_bounded(io::stdin(), MAX_MANAGEMENT_REQUEST_BYTES)
        .map_err(|_| config::ManageError::from("Cannot read management request."))
        .and_then(|request| {
            let request = request.ok_or("Management request exceeds 128 KiB.")?;
            config_management_response(runtime, &request)
        });
    match result {
        Ok(response) => write_json(&response),
        Err(error) => {
            write_json(
                &json!({"success": false, "apiVersion": 1, "error": {"code": error.code(), "message": error.to_string()}}),
            );
            error.exit_code()
        }
    }
}

fn config_management_response(
    runtime: &ToolRuntime,
    bytes: &[u8],
) -> Result<Value, config::ManageError> {
    let request: Value =
        serde_json::from_slice(bytes).map_err(|_| "Management request must be valid JSON.")?;
    if !request.is_object() {
        return Err("Management request must be an object.".into());
    }
    let catalog = runtime.catalog();
    if request.get("expectedFingerprint") != catalog.get("fingerprint") {
        return Err(config::ManageError::Unavailable(
            "Configuration management contracts do not match. Rebuild or update Octocode.".into(),
        ));
    }
    let operation = request
        .get("operation")
        .and_then(Value::as_str)
        .ok_or("Missing management operation.")?;
    let data = match operation {
        "inspect" | "setEnv" | "removeEnv" | "setSetting" | "removeSetting" => {
            config::manage(runtime, &request)?
        }
        "agents" | "setAgent" | "removeAgent" => {
            let cwd = std::env::current_dir().map_err(|_| "Cannot resolve workspace.")?;
            mcp_manage::manage(&request, &cwd)?
        }
        _ => return Err("Unsupported management operation.".into()),
    };
    Ok(
        json!({"success": true, "apiVersion": 1, "fingerprint": catalog["fingerprint"], "data": data}),
    )
}

/// Parse the query, then run it on the workspace's warm server (read-only
/// tools) or in this process.
async fn run_tool(tool: commands::ToolCommand, mode: OutputMode) -> u8 {
    let input = match tool_input(tool.name, &tool.args) {
        Ok(input) => input,
        Err(message) => {
            emit_error("invalidInput", &message, mode);
            return 2;
        }
    };
    if ToolId::from_name(tool.name).is_some_and(serve::runs_on_server)
        && let Some(code) = serve::call(tool.name, &input, mode).await
    {
        return code;
    }
    let runtime = match ToolRuntime::from_host(cli_host()) {
        Ok(runtime) => runtime,
        Err(error) => return start_failed(&error, mode),
    };
    let code = execute(&runtime, tool.name, input, mode).await;
    runtime.close().await;
    code
}

/// The parsed JSON query of a tool command, or why there is none.
fn tool_input(tool: &str, args: &ToolArgs) -> Result<Value, String> {
    let query_text = args.query_text()?.ok_or_else(|| {
        format!(
            "Missing JSON query. Usage: octocode {tool} '<json>' | --input FILE|-. Contract: octocode schema {tool}"
        )
    })?;
    serde_json::from_str::<Value>(&query_text)
        .map_err(|parse_error| format!("Invalid JSON query: {parse_error}"))
}

/// What an interrupted call says while its cancelled work drains.
const CANCELLING: &str = "Cancelling; press Ctrl-C again to exit now.";

#[derive(Debug, PartialEq, Eq)]
enum Interrupted {
    /// The cancelled work finished.
    Drained,
    /// A second interrupt arrived first.
    Forced,
}

/// Wait for cancelled `execution` to finish, unless `second` (the next
/// interrupt) arrives first.
async fn drain_after_interrupt<T>(
    execution: impl std::future::Future<Output = T>,
    second: impl std::future::Future,
) -> Interrupted {
    tokio::select! {
        _ = execution => Interrupted::Drained,
        _ = second => Interrupted::Forced,
    }
}

/// The channel a CLI call answers in.
fn channel(json_out: bool) -> Channel {
    if json_out {
        Channel::Structured
    } else {
        Channel::Rendered
    }
}

/// Execute one tool call and print its result. Exits with the code of the
/// runtime's [`ExitClass`].
async fn execute(runtime: &ToolRuntime, tool: &str, input: Value, mode: OutputMode) -> u8 {
    const REQUEST: &str = "cli-1";
    let admission = match runtime.admit(REQUEST.into()) {
        Ok(admission) => admission,
        Err(error) => return Printed::finish(tool, Err(error), mode.json).print(mode),
    };
    let execution = runtime.execute(admission, tool.into(), input, channel(mode.json));
    tokio::pin!(execution);
    let result = tokio::select! {
        result = &mut execution => result,
        signal = tokio::signal::ctrl_c() => {
            if signal.is_err() {
                execution.await
            } else {
                runtime.requests.cancel(REQUEST);
                eprintln!("{CANCELLING}");
                if drain_after_interrupt(&mut execution, tokio::signal::ctrl_c()).await
                    == Interrupted::Forced
                {
                    // Work that ignores cancellation must not hold the
                    // terminal hostage: the user asked twice. Returning would
                    // drop the runtime in `main`, which joins its blocking
                    // threads, so the process exits here instead.
                    std::process::exit(130);
                }
                return 130;
            }
        }
    };
    Printed::finish(tool, result, mode.json).print(mode)
}

/// Where a finished call's output goes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Stream {
    Stdout,
    Stderr,
}

/// A finished tool call as printed: the warm server sends it whole, so a
/// call answers byte-for-byte alike in process and through the server.
#[derive(Debug, PartialEq, Eq)]
struct Printed {
    /// The exit code of the call's [`ExitClass`].
    exit: u8,
    stream: Stream,
    /// The serialized JSON (compact) or rendered text, without a trailing
    /// newline.
    body: String,
    /// A failed call's text when its body is the JSON envelope, for a person
    /// watching stderr ([`OutputMode::tells_stderr`]).
    error_text: Option<String>,
}

impl Printed {
    /// The one projection of a finished call: the structured JSON or the
    /// rendered text, or the call's error envelope (JSON on stdout) or text
    /// (stderr).
    fn finish(tool: &str, result: Result<ToolOutcome, RuntimeError>, json_out: bool) -> Self {
        match result {
            Ok(outcome) => Self {
                exit: exit_code(outcome.exit_class()),
                stream: Stream::Stdout,
                body: if json_out {
                    outcome.structured_content.to_string()
                } else {
                    outcome_text(&outcome.content)
                },
                error_text: None,
            },
            Err(error) => {
                let projected = tool_error_result(tool, &error);
                let (stream, body, error_text) = if json_out {
                    let envelope = projected.envelope.to_string();
                    (Stream::Stdout, envelope, Some(projected.text))
                } else {
                    (Stream::Stderr, projected.text, None)
                };
                Self {
                    exit: exit_code(error.exit_class()),
                    stream,
                    body,
                    error_text,
                }
            }
        }
    }

    /// The warm server's reply line: `{exit, stderr, body[, errorText]}`.
    #[cfg(unix)]
    fn to_json(&self) -> Value {
        let mut reply =
            json!({"exit": self.exit, "stderr": self.stream == Stream::Stderr, "body": self.body});
        if let Some(text) = &self.error_text {
            reply["errorText"] = json!(text);
        }
        reply
    }

    /// A reply line read back; `None` when it is not one.
    #[cfg(unix)]
    fn from_json(mut reply: Value) -> Option<Self> {
        Some(Self {
            exit: u8::try_from(reply["exit"].as_u64()?).ok()?,
            stream: if reply["stderr"].as_bool()? {
                Stream::Stderr
            } else {
                Stream::Stdout
            },
            body: match reply["body"].take() {
                Value::String(body) => body,
                _ => return None,
            },
            error_text: match reply["errorText"].take() {
                Value::String(text) => Some(text),
                Value::Null => None,
                _ => return None,
            },
        })
    }

    /// Print the body in the call's output `mode`, and a JSON error's text
    /// on stderr when [`OutputMode::tells_stderr`]; a failed write (other
    /// than a closed pipe) is exit 5.
    fn print(&self, mode: OutputMode) -> u8 {
        let printed = match self.stream {
            Stream::Stdout if mode.json => write_serialized_json(&self.body),
            Stream::Stdout => write_text(&self.body),
            Stream::Stderr => {
                eprintln!("{}", self.body);
                0
            }
        };
        if let Some(text) = self.error_text.as_deref()
            && mode.tells_stderr()
        {
            eprintln!("{text}");
        }
        if printed == 0 { self.exit } else { printed }
    }
}

/// The text channel of a tool result: its content blocks, in order.
fn outcome_text(content: &[octocode_native::response::pager::TextContent]) -> String {
    content
        .iter()
        .map(|block| block.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

fn exit_code(class: ExitClass) -> u8 {
    match class {
        ExitClass::Success => 0,
        ExitClass::Empty => 1,
        ExitClass::InvalidInput => 2,
        ExitClass::Failed(FailureKind::NotFound) => 3,
        ExitClass::Failed(FailureKind::Authentication | FailureKind::Permission) => 4,
        ExitClass::Failed(FailureKind::Execution) => 5,
        ExitClass::Failed(FailureKind::RateLimited) => 7,
    }
}

pub(super) fn write_text(text: &str) -> u8 {
    let text = text.strip_suffix('\n').unwrap_or(text);
    match writeln!(io::stdout().lock(), "{text}") {
        Ok(()) => 0,
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => 0,
        Err(_) => 5,
    }
}

/// Print JSON on stdout: the one writer of every JSON answer, indented for a
/// terminal and one compact line on a pipe.
pub(super) fn write_json(value: &Value) -> u8 {
    match json_text(value, stdout_is_terminal()) {
        Ok(text) => write_text(&text),
        Err(_) => 5,
    }
}

/// Print JSON already serialized compactly (a tool call's body, which the
/// warm server sends as text) as [`write_json`] does: unchanged on a pipe.
fn write_serialized_json(compact: &str) -> u8 {
    if !stdout_is_terminal() {
        return write_text(compact);
    }
    match serde_json::from_str::<Value>(compact) {
        Ok(value) => write_json(&value),
        Err(_) => write_text(compact),
    }
}

/// `value` as printed on a `terminal` (indented) or a pipe (one line).
fn json_text(value: &Value, terminal: bool) -> serde_json::Result<String> {
    if terminal {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
}

#[cfg(test)]
mod tests {
    use super::{Printed, Stream, parse_args_from};
    use octocode_native::runtime::RuntimeError;
    use serde_json::json;

    /// A terminal gets indented JSON, a pipe one compact line, whatever the
    /// command; both are the same value.
    #[test]
    fn json_is_indented_for_a_terminal_and_compact_for_a_pipe() {
        let value = json!({"results": [{"index": 0, "data": {"a": [1, 2]}}], "root": "/w"});
        let pipe = super::json_text(&value, false).expect("compact");
        assert_eq!(
            pipe,
            r#"{"results":[{"index":0,"data":{"a":[1,2]}}],"root":"/w"}"#
        );
        assert_eq!(pipe, value.to_string());
        let terminal = super::json_text(&value, true).expect("pretty");
        assert!(terminal.starts_with("{\n  \"results\": [\n"), "{terminal}");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&terminal).ok(),
            Some(value)
        );
    }

    /// A clap error keeps every line in JSON: the first is `error`, the rest
    /// (possible values, tips, usage) are `details`.
    #[test]
    fn clap_errors_keep_every_line_in_json() {
        use clap::CommandFactory;
        let error = super::Args::command()
            .try_get_matches_from(["octocode", "graph", "query", "notAnOp"])
            .expect_err("invalid op");
        let envelope = super::clap_error_envelope(&error);
        assert_eq!(envelope["errorCode"], "invalidInput");
        assert_eq!(envelope["error"], "invalid value 'notAnOp' for '<OP>'");
        let details = envelope["details"].as_array().expect("details");
        assert!(
            details[0]
                .as_str()
                .is_some_and(|line| line.starts_with("[possible values: stats, ")),
            "{envelope}"
        );
    }

    /// A JSON error carries its text through the warm server, so a client
    /// can tell a watching stderr; a result or a text error carries none.
    #[cfg(unix)]
    #[test]
    fn printed_calls_round_trip_through_the_reply_line() {
        let error = || RuntimeError {
            code: "timeout".into(),
            message: "Tool call timed out.".into(),
            payload: None,
            validation_issues: None,
        };
        let json_error = Printed::finish("localSearch", Err(error()), true);
        assert!(
            json_error
                .error_text
                .as_deref()
                .is_some_and(|text| text.ends_with("(errorCode: timeout)"))
        );
        let text_error = Printed::finish("localSearch", Err(error()), false);
        assert_eq!(text_error.error_text, None);
        for printed in [json_error, text_error] {
            assert_eq!(
                Printed::from_json(printed.to_json()).as_ref(),
                Some(&printed)
            );
        }
    }

    /// After the first Ctrl-C cancels, a second Ctrl-C must stop waiting
    /// for work that ignores cancellation; without one, the drain completes.
    #[tokio::test]
    async fn second_interrupt_stops_waiting_for_uncooperative_work() {
        use super::{Interrupted, drain_after_interrupt};
        let forced =
            drain_after_interrupt(std::future::pending::<()>(), std::future::ready(())).await;
        assert_eq!(forced, Interrupted::Forced);
        let drained =
            drain_after_interrupt(std::future::ready(()), std::future::pending::<()>()).await;
        assert_eq!(drained, Interrupted::Drained);
    }

    /// A rejected call prints the runtime's one projection: the typed
    /// envelope on stdout in JSON mode, its text on stderr otherwise, and
    /// exits by the code's class.
    #[test]
    fn rejected_calls_print_the_runtime_projection() {
        use octocode_native::contracts;
        let tool = "localFetch";
        let error = contracts::prepare_many_and_validate(
            tool,
            json!({"queries":[{"path":"a.rs","matchstring":"x"}]}),
        )
        .expect_err("invalid input");
        let invalid = || RuntimeError {
            code: "invalidInput".into(),
            message: error.to_string(),
            payload: Some(Box::new(contracts::format_input_error(tool, &error))),
            validation_issues: None,
        };
        let json_out = Printed::finish(tool, Err(invalid()), true);
        assert_eq!((json_out.exit, json_out.stream), (2, Stream::Stdout));
        let envelope: serde_json::Value = serde_json::from_str(&json_out.body).expect("json");
        assert!(envelope.get("kind").is_none(), "{envelope}");
        assert_eq!(envelope["errorCode"], "invalidInput", "{envelope}");
        let text = Printed::finish(tool, Err(invalid()), false);
        assert_eq!((text.exit, text.stream), (2, Stream::Stderr));
        assert!(
            text.body.contains("Remove unknown field 'matchstring'"),
            "{}",
            text.body
        );
        assert!(
            text.body.contains("did you mean 'matchString'?"),
            "{}",
            text.body
        );
        assert!(
            text.body.ends_with("(errorCode: invalidInput)"),
            "{}",
            text.body
        );

        let timeout = RuntimeError {
            code: "timeout".into(),
            message: "Tool call timed out.".into(),
            payload: None,
            validation_issues: None,
        };
        let printed = Printed::finish("localSearch", Err(timeout), false);
        assert_eq!(printed.exit, 5);
        assert!(
            printed.body.contains("Retry, or narrow"),
            "{}",
            printed.body
        );
    }

    #[test]
    fn every_contract_tool_parses_as_a_tool_command() {
        use clap::CommandFactory;
        super::Args::command().debug_assert();
        let contract = octocode_native::contracts::parsed_contract().expect("contract");
        for tool in contract["tools"].as_array().expect("tools") {
            let name = tool["name"].as_str().expect("name");
            let args = parse_args_from(["octocode", name, "{}", "--json"]).expect(name);
            assert!(args.json, "{name}");
            match args.command {
                super::Command::Tool(command) => {
                    assert_eq!(command.name, name);
                    assert_eq!(command.args.query.as_deref(), Some("{}"));
                }
                _ => panic!("{name} did not parse as a tool"),
            }
        }
    }

    /// `--json` is one global flag: every command takes it in any position.
    #[test]
    fn json_is_one_global_flag() {
        for argv in [
            vec!["octocode", "--json", "config", "home"],
            vec!["octocode", "config", "get", "K", "--json"],
            vec!["octocode", "config", "--json"],
            vec!["octocode", "auth", "status", "--json"],
            vec!["octocode", "auth", "logout", "--json"],
            vec!["octocode", "install", "--list", "--json"],
            vec!["octocode", "graph", "query", "stats", "--json"],
            vec!["octocode", "lsp-server", "list", "--json"],
        ] {
            let args = parse_args_from(argv.clone()).expect("parses");
            assert!(args.json, "{argv:?}");
        }
    }

    #[test]
    fn argument_errors_exit_two_in_either_output_mode() {
        assert_eq!(
            parse_args_from(["octocode", "notACommand", "--json"]).err(),
            Some(2)
        );
        assert_eq!(parse_args_from(["octocode", "notACommand"]).err(), Some(2));
        assert!(parse_args_from(["octocode", "schema", "localSearch", "--view", "query"]).is_ok());
        assert_eq!(
            parse_args_from(["octocode", "install", "--method", "yarn"]).err(),
            Some(2)
        );
    }

    #[test]
    fn removed_aliases_do_not_parse() {
        for argv in [
            vec!["octocode", "scheme"],
            vec!["octocode", "showConfig"],
            vec!["octocode", "catalog"],
            vec!["octocode", "--json-errors", "schema"],
            vec!["octocode", "--redact-emails", "schema"],
            vec!["octocode", "--no-color", "schema"],
            vec!["octocode", "localSearch", "{}", "--pretty"],
            vec!["octocode", "config", "--add", "K", "V"],
            vec!["octocode", "auth", "--json"],
        ] {
            assert_eq!(parse_args_from(argv.clone()).err(), Some(2), "{argv:?}");
        }
    }

    #[test]
    fn tool_input_reads_a_file_and_rejects_bad_json() {
        let dir = tempfile::tempdir().expect("dir");
        let path = dir.path().join("q.json");
        std::fs::write(&path, r#"{"queries":[]}"#).expect("write");
        let args = super::ToolArgs {
            query: None,
            input: Some(path),
        };
        assert_eq!(
            super::tool_input("localSearch", &args),
            Ok(json!({"queries": []}))
        );
        let bad = super::ToolArgs {
            query: Some("{".into()),
            input: None,
        };
        assert!(
            super::tool_input("localSearch", &bad).is_err_and(|e| e.starts_with("Invalid JSON"))
        );
        let missing = super::ToolArgs {
            query: None,
            input: None,
        };
        assert!(
            super::tool_input("localSearch", &missing)
                .is_err_and(|e| e.starts_with("Missing JSON"))
        );
    }

    #[test]
    fn execution_deadline_exceeds_the_worst_cold_lsp_budget() {
        assert!(
            octocode_native::runtime::DEFAULT_TIMEOUT.as_millis()
                > u128::from(octocode_engine::lsp::MAX_COLD_LSP_EXECUTION_BUDGET_MS)
        );
    }
}
