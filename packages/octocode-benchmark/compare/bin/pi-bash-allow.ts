// Pi runner (RUNNER=pi in run_arm.sh): the arm's shell allowlist, the same prefixes the claude
// runner passes as --allowedTools "Bash(<prefix>:*)". BENCH_BASH_ALLOW holds one prefix per
// line. Every segment of a command line (split on |, ||, &&, ;, newlines) must start with an
// allowed prefix; command substitution and backticks are refused because they could run
// anything. A refused call is blocked with a reason and shows up as a failed call.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const allow = (process.env.BENCH_BASH_ALLOW ?? '').split('\n').map(s => s.trim()).filter(Boolean);

// Command segments split on |, ||, &&, ; and newlines outside quotes. Substitution ($(, `, <()
// outside single quotes is reported as null (refused).
function segmentsOf(command: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === '\\' && quote === '"') { cur += c + (command[++i] ?? ''); continue; }
      if (quote === '"' && (c === '`' || (c === '$' && command[i + 1] === '('))) return null;
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '\\') { cur += c + (command[++i] ?? ''); continue; }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === '`' || (c === '$' && command[i + 1] === '(') || (c === '<' && command[i + 1] === '(')) return null;
    const two = command.slice(i, i + 2);
    if (two === '||' || two === '&&') { out.push(cur); cur = ''; i++; continue; }
    if (c === '|' || c === ';' || c === '\n') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

export function refusal(command: string): string | null {
  const segments = segmentsOf(command);
  if (!segments) return 'command substitution is not allowed in this benchmark runner';
  for (const segment of segments) {
    const ok = allow.some(prefix => segment === prefix || segment.startsWith(`${prefix} `));
    if (!ok) return `\`${segment.split(/\s+/)[0]}\` is not allowed; allowed commands: ${allow.join(', ')}`;
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on('tool_call', async event => {
    if (event.toolName !== 'bash') return undefined;
    const reason = refusal(String((event.input as { command?: unknown }).command ?? ''));
    return reason ? { block: true, reason } : undefined;
  });
}
