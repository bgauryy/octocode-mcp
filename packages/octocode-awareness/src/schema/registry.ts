import { memorySchemas } from './definitions-memory.js';
import { workSchemas } from './definitions-work.js';
import { operationSchemas } from './definitions-operations.js';
import { adminSchemas } from './definitions-admin.js';
import { integrationSchemas } from './definitions-integration.js';
import { historySchemas } from './definitions-history.js';

export const schemas = {
  ...memorySchemas,
  ...workSchemas,
  ...operationSchemas,
  ...integrationSchemas,
  ...adminSchemas,
  ...historySchemas,
};
export type SchemaName = keyof typeof schemas;
