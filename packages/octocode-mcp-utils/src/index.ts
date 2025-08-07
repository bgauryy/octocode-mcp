/**
 * @octocode/mcp-utils - Shared utilities for Octocode MCP packages
 */

export {
  jsonToLLMString,
  default as jsonToLLMStringDefault,
} from './jsonToLLMString';

export {
  minifyContent as minifyContent,
  isJavaScriptFileV2,
  isIndentationSensitiveV2,
  MINIFY_CONFIG,
} from './minifier';
