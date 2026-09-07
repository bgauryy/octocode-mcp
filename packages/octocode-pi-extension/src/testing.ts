import { APPROVED_PI_HOST_VERSION } from './adapters/pi-host-compatibility.js';
import {
  capturePiSdkLifecycle,
  createPiSdkScenarioSuite,
  type ProductionPiLifecycleCapture,
  type ProductionPiScenarioSuite,
} from './adapters/pi-production-probe.js';
import { createOctocodePiExtension } from './index.js';

export {
  PRODUCTION_PI_SCENARIO_IDS,
  capturePiSdkLifecycle,
  createPiSdkScenarioSuite,
  type ProductionPiLifecycleCapture,
  type ProductionPiScenarioId,
  type ProductionPiScenarioInput,
  type ProductionPiScenarioProbe,
  type ProductionPiScenarioReceipt,
  type ProductionPiScenarioSuite,
} from './adapters/pi-production-probe.js';

/** Exercise supported conformance scenarios through the installed Pi SDK composition. */
export function createProductionPiScenarioSuite(cwd: string): ProductionPiScenarioSuite {
  return createPiSdkScenarioSuite(
    cwd,
    createOctocodePiExtension({ hostVersion: APPROVED_PI_HOST_VERSION }),
  );
}

/** Exercise the installed Pi SDK and this extension as one real lifecycle composition. */
export async function captureProductionPiLifecycle(cwd: string): Promise<ProductionPiLifecycleCapture> {
  return capturePiSdkLifecycle(
    cwd,
    createOctocodePiExtension({ hostVersion: APPROVED_PI_HOST_VERSION }),
  );
}
