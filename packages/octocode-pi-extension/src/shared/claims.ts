import { processStartTime, sameProcess } from './process.js';

/**
 * Rename claims: a process takes a file by renaming it to `<file><marker><pid>-<start time>`, so two processes never
 * both act on it. The name carries the claimer's start time as well as its pid: a claimer that crashed and whose pid the
 * system gave to another process is not taken for a live one (the claim would stay unreleased for as long as that
 * process runs). The start time is omitted where it is unknown, and a name with only a pid is judged by the pid.
 */

/** The suffix this process claims with: `<marker><pid>-<start time>`. */
export function claimSuffix(marker: string): string {
  const started = processStartTime(process.pid);
  return `${marker}${process.pid}${started ? `-${started}` : ''}`;
}

/** The claim in `name`: the unclaimed name and whether the claimer may still be running; undefined when `name` is not a claim by `marker`. */
export function parseClaim(name: string, marker: string): { original: string; running: boolean } | undefined {
  const at = name.lastIndexOf(marker);
  if (at <= 0) return undefined;
  const match = /^(\d+)(?:-(\d+))?$/.exec(name.slice(at + marker.length));
  if (!match) return undefined;
  return { original: name.slice(0, at), running: sameProcess(Number(match[1]), match[2]) };
}
