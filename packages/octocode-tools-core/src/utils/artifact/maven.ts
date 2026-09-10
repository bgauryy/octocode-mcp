import {
  endpoint,
  invalidResponse,
  object,
  registryJson,
  registryText,
  requiredString,
  rows,
  string,
  total,
} from './http.js';
import {
  ArtifactProviderError,
  type ArtifactProviderResult,
  type ArtifactProviderState,
  type ArtifactQuery,
} from './types.js';

async function exactMaven(
  packageName: string
): Promise<ArtifactProviderResult> {
  const parts = packageName.split(':');
  if (
    parts.length !== 2 ||
    parts.some(part => !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part))
  ) {
    throw new ArtifactProviderError(
      'invalid_query',
      'Maven packageName must be groupId:artifactId.'
    );
  }
  const [group, name] = parts as [string, string];
  const path = `${group.split('.').map(encodeURIComponent).join('/')}/${encodeURIComponent(name)}`;
  const xml = await registryText(
    'maven',
    `https://repo.maven.apache.org/maven2/${path}/maven-metadata.xml`,
    true
  );
  if (xml === undefined) return { artifacts: [], total: 0 };
  // Maven metadata has scalar identity/version fields; never expand XML entities,
  // process DTDs, or fetch resources referenced by registry content.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return invalidResponse('maven');
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  const field = (tag: string): string | undefined => {
    const value = new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`).exec(
      clean
    )?.[1];
    return value?.trim();
  };
  const returnedGroup = requiredString(field('groupId'), 'maven');
  const returnedName = requiredString(field('artifactId'), 'maven');
  return {
    artifacts: [
      {
        type: 'maven',
        name: `${returnedGroup}:${returnedName}`,
        registryUrl: `https://central.sonatype.com/artifact/${encodeURIComponent(returnedGroup)}/${encodeURIComponent(returnedName)}`,
        version: field('release') ?? field('latest'),
      },
    ],
    total: 1,
  };
}

export async function maven(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) return exactMaven(query.packageName);
  const search = query.keywords!.join(' ');
  const offset = state.offset ?? 0;
  const size = query.pageSize ?? 10;
  const data = object(
    object(
      await registryJson(
        'maven',
        endpoint('https://central.sonatype.com/solrsearch/select', {
          q: search,
          rows: size,
          start: offset,
          wt: 'json',
        })
      )
    ).response
  );
  const artifacts = rows(data.docs, 'maven').map(row => {
    const group = requiredString(row.g, 'maven');
    const artifact = requiredString(row.a, 'maven');
    return {
      type: 'maven' as const,
      name: `${group}:${artifact}`,
      registryUrl: `https://central.sonatype.com/artifact/${encodeURIComponent(group)}/${encodeURIComponent(artifact)}`,
      version: string(row.latestVersion) ?? string(row.v),
    };
  });
  const count = total(data.numFound);
  const more =
    count !== undefined
      ? offset + artifacts.length < count
      : artifacts.length === size;
  return {
    artifacts,
    total: count,
    nextState:
      more && artifacts.length
        ? { offset: offset + artifacts.length }
        : undefined,
    terminalLimit:
      more && !artifacts.length
        ? { reason: 'Maven returned an empty page before its reported total.' }
        : undefined,
  };
}
