import { expect, it } from 'vitest';
// @ts-expect-error The subprocess fixture is plain JavaScript and has no declaration file.
import { runNativeReliability } from './fixtures/native-reliability-runner.mjs';

it('preserves native request identity across concurrent retries and repeated process crashes', async () => {
  const report = await runNativeReliability();
  expect(report.errors).toEqual([]);
  expect(report.cases).toHaveLength(7);
  expect(report.cases.every((result: { passed: boolean }) => result.passed)).toBe(true);
  expect(report.cleanup).toEqual({ processesAlive: 0, runtimeRemoved: true });
}, 120_000);
