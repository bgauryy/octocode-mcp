#!/usr/bin/env python3
"""Run one benchmark question with `pi` instead of `claude -p` (run_arm.sh, RUNNER=pi).

Takes the arm's claude flags after `--` and gives pi the same isolation:

  --tools ""                     no built-in tools (MCP arms)
  --tools Bash                   pi's bash tool only
  --mcp-config <file>            these servers only, exposed directly as tools; their
                                 initialize instructions go into the system prompt, as Claude
                                 Code does with MCP server instructions
  --allowedTools "Bash(<p>:*)"   each command segment must start with an allowed prefix
                                 (pi-bash-allow.ts); "mcp__<server>" is implied by the config

Every run gets a fresh agent dir (only the provider credentials and model registry are linked
in), no session file, no extensions besides the ones above, no skills, prompt templates,
context files or themes. The JSON event stream is written to <run>/transcript.jsonl with a
receive timestamp `_t` (seconds) on every event; transcript_to_log.py --format pi reads it.
"""
import argparse, json, os, select, shutil, subprocess, sys, tempfile, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def parse_claude_flags(flags):
    tools, mcp_config, allowed = None, None, []
    i = 0
    while i < len(flags):
        f = flags[i]
        if f == "--tools":
            tools = flags[i + 1]; i += 2
        elif f == "--mcp-config":
            mcp_config = flags[i + 1]; i += 2
        elif f == "--add-dir":
            i += 2
        elif f == "--allowedTools":
            i += 1
            while i < len(flags) and not flags[i].startswith("--"):
                allowed.append(flags[i]); i += 1
        else:
            i += 1   # --strict-mcp-config: pi only sees the servers written below anyway
    return tools, mcp_config, allowed


def server_instructions(server, timeout=60):
    """The MCP server's initialize instructions, the text Claude Code puts in its system prompt."""
    env = {**os.environ, **server.get("env", {})}
    proc = subprocess.Popen([server["command"], *server.get("args", [])], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, text=True)
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "bench", "version": "1"}}}
    proc.stdin.write(json.dumps(init) + "\n"); proc.stdin.flush()
    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            ready, _, _ = select.select([proc.stdout], [], [], 1)
            if not ready:
                continue
            line = proc.stdout.readline()
            if not line:
                break
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("id") == 1:
                return (msg.get("result") or {}).get("instructions") or ""
    finally:
        proc.kill()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--provider", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--timeout", type=int, default=1200)
    ap.add_argument("flags", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    flags = args.flags[1:] if args.flags[:1] == ["--"] else args.flags
    run = Path(args.run)
    tools, mcp_config, allowed = parse_claude_flags(flags)

    source = Path(os.environ.get("PI_CODING_AGENT_DIR") or Path.home() / ".pi/agent")
    agent = Path(tempfile.mkdtemp(prefix="bench-pi-agent-"))
    try:
        for name in ("auth.json", "models.json"):
            if (source / name).exists():
                (agent / name).symlink_to(source / name)
        (agent / "settings.json").write_text("{}\n")

        cmd = ["pi", "--mode", "json", "--no-session", "--no-extensions", "--no-skills",
               "--no-prompt-templates", "--no-context-files", "--no-themes", "--offline",
               "--provider", args.provider, "--model", args.model]
        env = {**os.environ, "PI_CODING_AGENT_DIR": str(agent)}
        system = []
        if mcp_config:
            servers = json.load(open(mcp_config))["mcpServers"]
            pi_servers = {}
            for name, s in servers.items():
                pi_servers[name] = {"command": s["command"], "args": s.get("args", []), "env": s.get("env", {}),
                                    "exposure": "direct"}
                text = server_instructions(s)
                if text:
                    system.append(f"## {name}\n{text}")
            (agent / "mcp.json").write_text(json.dumps({"autoEnableCodemode": False, "mcpServers": pi_servers}, indent=1))
            cmd += ["-e", "builtin:mcp"]
        bash_allow = [a[len("Bash("):-len(":*)")] for a in allowed if a.startswith("Bash(") and a.endswith(":*)")]
        if tools == "Bash":
            cmd += ["--tools", "bash", "-e", str(HERE / "pi-bash-allow.ts")]
            env["BENCH_BASH_ALLOW"] = "\n".join(bash_allow)
        else:
            cmd += ["--no-builtin-tools"]
        if system:
            instructions = run / "mcp-instructions.md"
            instructions.write_text("# MCP Server Instructions\n\n" + "\n\n".join(system) + "\n")
            cmd += ["--append-system-prompt", str(instructions)]
        cmd += ["--", Path(args.prompt).read_text()]
        (run / "runner.json").write_text(json.dumps({
            "runner": "pi", "provider": args.provider, "model": args.model, "tools": tools,
            "bashAllow": bash_allow, "mcp": bool(mcp_config), "timeout": args.timeout}, indent=1))

        start = time.time()
        timed_out = False
        with open(run / "transcript.jsonl", "w") as out, open(run / "stderr.log", "w") as err:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, env=env, text=True)

            def pump():
                for line in proc.stdout:
                    try:
                        event = json.loads(line)
                    except ValueError:
                        err.write(line); continue
                    if event.get("type") == "message_update":
                        continue   # streaming deltas: the final message_end carries the same content
                    event["_t"] = time.time()
                    out.write(json.dumps(event) + "\n")

            reader = threading.Thread(target=pump, daemon=True)
            reader.start()
            try:
                status = proc.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                proc.kill(); timed_out = True; status = proc.wait()
            reader.join(timeout=30)
            out.write(json.dumps({"type": "bench_end", "_t": time.time(), "start": start, "exit": status,
                                  "timedOut": timed_out}) + "\n")
        return 124 if timed_out else status
    finally:
        shutil.rmtree(agent, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
