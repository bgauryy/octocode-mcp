import type { ProviderCapabilities, ProviderType } from './types.js';

export const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> =
  {
    github: {
      cloneRepo: true,
      fetchDirectoryToDisk: true,
      requiresScopedCodeSearch: false,
      supportsMergedState: false,
      supportsMultiTopicSearch: true,
    },
    gitlab: {
      cloneRepo: false,
      fetchDirectoryToDisk: false,
      requiresScopedCodeSearch: true,
      supportsMergedState: true,
      supportsMultiTopicSearch: false,
    },
    bitbucket: {
      cloneRepo: false,
      fetchDirectoryToDisk: false,
      requiresScopedCodeSearch: true,
      supportsMergedState: true,
      supportsMultiTopicSearch: false,
    },
  };
