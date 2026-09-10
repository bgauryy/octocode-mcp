import {
  endpoint,
  invalidResponse,
  object,
  registryJson,
  requiredString,
  rows,
  string,
  total,
  url,
  type JsonObject,
} from './http.js';
import {
  ArtifactProviderError,
  type Artifact,
  type ArtifactProviderResult,
  type ArtifactProviderState,
  type ArtifactQuery,
} from './types.js';

function officialUrl(value: unknown): string {
  const location = url(value);
  if (location) {
    const parsed = new URL(location);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'nuget.org' ||
        parsed.hostname.endsWith('.nuget.org'))
    )
      return location;
  }
  throw new ArtifactProviderError(
    'provider_error',
    'NuGet did not advertise a supported official metadata endpoint.'
  );
}

async function serviceEndpoint(
  kind: 'SearchQueryService' | 'RegistrationsBaseUrl'
): Promise<string> {
  const index = object(
    await registryJson('nuget', 'https://api.nuget.org/v3/index.json')
  );
  const services = rows(index.resources, 'nuget');
  const preferred =
    kind === 'RegistrationsBaseUrl'
      ? 'RegistrationsBaseUrl/3.6.0'
      : 'SearchQueryService/3.5.0';
  const service =
    services.find(resource => resource['@type'] === preferred) ??
    services.find(resource => {
      const type = string(resource['@type']);
      return type === kind || type?.startsWith(`${kind}/`);
    });
  return officialUrl(service?.['@id']);
}

function artifact(row: JsonObject): Artifact {
  const name = requiredString(row.id, 'nuget');
  return {
    type: 'nuget',
    name,
    registryUrl: `https://www.nuget.org/packages/${encodeURIComponent(name)}`,
    version: string(row.version),
    description: string(row.description),
    homepage: url(row.projectUrl),
    license: string(row.licenseExpression),
    repository: url(object(row.repository).url),
  };
}

/** NuGet precedence: up to four numeric parts, then case-insensitive SemVer prerelease identifiers. */
function compareVersions(left: string, right: string): number {
  const parse = (version: string) => {
    const match =
      /^(\d+(?:\.\d+){0,3})(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i.exec(
        version
      );
    if (!match) return invalidResponse('nuget');
    return {
      core: match[1]!.split('.').map(BigInt),
      pre: match[2]?.toLowerCase().split('.'),
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 4; i++) {
    const x = a.core[i] ?? 0n;
    const y = b.core[i] ?? 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

async function exact(packageName: string): Promise<ArtifactProviderResult> {
  const base = await serviceEndpoint('RegistrationsBaseUrl');
  const response = await registryJson(
    'nuget',
    `${base.replace(/\/$/, '')}/${encodeURIComponent(packageName.toLowerCase())}/index.json`,
    true
  );
  if (response === undefined) return { artifacts: [], total: 0 };
  const pages = rows(object(response).items, 'nuget');
  if (!pages.length) return { artifacts: [], total: 0 };
  // Page order is not part of the API contract: choose the greatest declared upper bound.
  const highest = pages.reduce((best, page) =>
    compareVersions(
      requiredString(page.upper, 'nuget'),
      requiredString(best.upper, 'nuget')
    ) > 0
      ? page
      : best
  );
  const page =
    highest.items === undefined
      ? object(await registryJson('nuget', officialUrl(highest['@id'])))
      : highest;
  const versions = rows(page.items, 'nuget').map(leaf =>
    object(leaf.catalogEntry)
  );
  if (!versions.length) return invalidResponse('nuget');
  const latest = versions.reduce((best, item) =>
    compareVersions(
      requiredString(item.version, 'nuget'),
      requiredString(best.version, 'nuget')
    ) > 0
      ? item
      : best
  );
  // Registration metadata includes unlisted packages, unlike keyword search.
  return { artifacts: [artifact(latest)], total: 1 };
}

export async function nuget(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) return exact(query.packageName);
  const offset = state.offset ?? 0;
  if (offset > 3000)
    return {
      artifacts: [],
      terminalLimit: {
        reason:
          'NuGet search supports skip up to 3000. Narrow keywords to reach additional packages.',
      },
    };
  const base = await serviceEndpoint('SearchQueryService');
  // Reach the exact skip boundary, then fetch its maximum native page. The outer
  // cursor slices that last page to pageSize, preserving all 4,000 reachable hits.
  const size =
    offset === 3000 ? 1000 : Math.min(query.pageSize ?? 10, 3000 - offset);
  const data = object(
    await registryJson(
      'nuget',
      endpoint(base, {
        q: query.keywords!.join(' '),
        skip: offset,
        take: size,
        prerelease: 'true',
        semVerLevel: '2.0.0',
      })
    )
  );
  const native = rows(data.data, 'nuget');
  const artifacts = native.map(artifact);
  const count = total(data.totalHits);
  const nextOffset = offset + native.length;
  const more =
    count !== undefined ? nextOffset < count : native.length === size;
  const reason =
    more && !native.length
      ? 'NuGet returned an empty page before its reported total.'
      : more && nextOffset > 3000
        ? 'NuGet search supports skip up to 3000. Narrow keywords to reach additional packages.'
        : undefined;
  return {
    artifacts,
    total: count,
    nextState: more && !reason ? { offset: nextOffset } : undefined,
    terminalLimit: reason ? { reason } : undefined,
  };
}
