/**
 * LSP tool schema helpers for typed access to tool schema descriptions.
 */
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { createSchemaHelper } from './schemaHelperFactory.js';

export const LSP_GOTO_DEFINITION = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    contextLines: string;
  };
};

export const LSP_FIND_REFERENCES = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_FIND_REFERENCES
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    includeDeclaration: string;
    contextLines: string;
  };
  pagination: {
    referencesPerPage: string;
    page: string;
  };
};

export const LSP_CALL_HIERARCHY = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    direction: string;
    depth: string;
    contextLines: string;
  };
  pagination: {
    callsPerPage: string;
    page: string;
  };
};
