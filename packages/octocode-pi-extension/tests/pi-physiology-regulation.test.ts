import { describe, expect, it } from 'vitest';
import type { PiRuntimeObservation } from '@octocodeai/agent-contracts/physiology';
import { createPiPhysiologyAdvisory } from '../src/adapters/pi-physiology-regulation.js';

const sample = (failed = 1, generation = 1): PiRuntimeObservation => ({
  schema_version: 1, source: 'pi_runtime',
  session: { owner: 'pi', session_id: 's', generation, observed_at: 100 },
  tools: { window: 32, observed: 1, failed, cancelled: 0, blocked: 0 },
});
describe('Pi physiology advisory delivery', () => {
  it('deduplicates pressure without interpreting unavailable measurements as recovery', () => {
    const project = createPiPhysiologyAdvisory();
    expect(project(sample())).toContain('inspect_recent_tool_failures');
    expect(project(sample())).toBe('');
    const unknown = sample();
    delete unknown.tools;
    expect(project(unknown)).toBe('');
    expect(project(sample())).toBe('');
    expect(project(sample(0))).toBe('');
    expect(project(sample())).toContain('inspect_recent_tool_failures');
    expect(project(sample(1, 2))).toContain('inspect_recent_tool_failures');
  });
  it('omits unavailable state and bounds feedback to canonical action names', () => {
    const project = createPiPhysiologyAdvisory();
    expect(project(undefined)).toBe('');
    expect(project(sample()).length).toBeLessThan(512);
  });
});
