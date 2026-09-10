import { maven } from './maven.js';
import { nuget } from './nuget.js';
import { crates, go, packagist, pypi, rubygems } from './registries.js';
import {
  ArtifactProviderError,
  type ArtifactProviderResult,
  type ArtifactProviderState,
  type ArtifactQuery,
} from './types.js';

export * from './types.js';

export async function searchRegistry(
  query: ArtifactQuery,
  state: ArtifactProviderState = {}
): Promise<ArtifactProviderResult> {
  if (Boolean(query.packageName) === Boolean(query.keywords?.length)) {
    throw new ArtifactProviderError(
      'invalid_query',
      'Provide exactly one of packageName or keywords.'
    );
  }
  if (
    query.packageName
      ?.split('/')
      .some(part => !part || part === '.' || part === '..')
  ) {
    throw new ArtifactProviderError(
      'invalid_query',
      'Provide a valid package coordinate.'
    );
  }
  let result: ArtifactProviderResult;
  switch (query.type) {
    case 'pypi':
      result = await pypi(query);
      break;
    case 'crates':
      result = await crates(query, state);
      break;
    case 'maven':
      result = await maven(query, state);
      break;
    case 'nuget':
      result = await nuget(query, state);
      break;
    case 'go':
      result = await go(query, state);
      break;
    case 'packagist':
      result = await packagist(query, state);
      break;
    case 'rubygems':
      result = await rubygems(query, state);
      break;
    default:
      throw new ArtifactProviderError(
        'unsupported_capability',
        'Use the npm registry adapter for npm queries.'
      );
  }
  if (query.packageName) {
    const normalize = (name: string): string => {
      if (query.type === 'pypi')
        return name.toLowerCase().replace(/[-_.]+/g, '-');
      if (query.type === 'crates') return name.toLowerCase().replace(/-/g, '_');
      if (query.type === 'nuget' || query.type === 'packagist')
        return name.toLowerCase();
      return name;
    };
    if (
      result.artifacts.some(
        item => normalize(item.name) !== normalize(query.packageName!)
      )
    ) {
      throw new ArtifactProviderError(
        'provider_error',
        `${query.type} returned metadata for a different package.`
      );
    }
  }
  return result;
}
