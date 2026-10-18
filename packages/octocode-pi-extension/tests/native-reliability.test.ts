import { expect, it } from 'vitest';
// @ts-expect-error The subprocess fixture is plain JavaScript and has no declaration file.
import { loadScale, runNativeReliability } from './fixtures/native-reliability-runner.mjs';

it('preserves native request identity across concurrent retries and repeated process crashes', async () => {
  const report = await runNativeReliability();
  expect(report.errors).toEqual([]);
  expect(report.cases).toHaveLength(7);
  expect(report.cases.every((result: { passed: boolean }) => result.passed)).toBe(true);
  expect(report.cleanup).toEqual({ processesAlive: 0, runtimeRemoved: true });
// 37 s alone: the run's own deadlines and this bound grow with the machine's load, so the run's report decides, not this timer.
}, 130_000 * loadScale());
