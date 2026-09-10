import {
  coordinatePath,
  endpoint,
  license,
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

export async function pypi(
  query: ArtifactQuery
): Promise<ArtifactProviderResult> {
  if (!query.packageName) {
    throw new ArtifactProviderError(
      'unsupported_capability',
      'PyPI does not provide keyword search. Use type:"pypi" with an exact packageName.'
    );
  }
  const response = await registryJson(
    'pypi',
    `https://pypi.org/pypi/${encodeURIComponent(query.packageName)}/json`,
    true
  );
  if (response === undefined) return { artifacts: [], total: 0 };
  const info = object(object(response).info);
  const name = requiredString(info.name, 'pypi');
  const links = object(info.project_urls);
  const source = Object.entries(links).find(([label]) =>
    /^(source(?: code)?|repository|code)$/i.test(label)
  )?.[1];
  return {
    artifacts: [
      {
        type: 'pypi',
        name,
        registryUrl: `https://pypi.org/project/${encodeURIComponent(name)}/`,
        version: string(info.version),
        description: string(info.summary),
        license: string(info.license_expression) ?? string(info.license),
        homepage: url(info.home_page) ?? url(links.Homepage),
        repository: url(source),
      },
    ],
    total: 1,
  };
}

function crate(row: JsonObject): Artifact {
  const name = requiredString(row.name ?? row.id, 'crates');
  return {
    type: 'crates',
    name,
    registryUrl: `https://crates.io/crates/${encodeURIComponent(name)}`,
    version: string(row.max_stable_version) ?? string(row.max_version),
    description: string(row.description),
    license: license(row.license),
    homepage: url(row.homepage),
    repository: url(row.repository),
  };
}

export async function crates(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) {
    const response = await registryJson(
      'crates',
      `https://crates.io/api/v1/crates/${encodeURIComponent(query.packageName)}`,
      true
    );
    if (response === undefined) return { artifacts: [], total: 0 };
    return { artifacts: [crate(object(object(response).crate))], total: 1 };
  }
  const page = state.page ?? 1;
  const size = query.pageSize ?? 10;
  const data = object(
    await registryJson(
      'crates',
      endpoint('https://crates.io/api/v1/crates', {
        q: query.keywords!.join(' '),
        page,
        per_page: size,
      })
    )
  );
  const artifacts = rows(data.crates, 'crates').map(crate);
  const count = total(object(data.meta).total);
  const more =
    count !== undefined ? page * size < count : artifacts.length === size;
  return {
    artifacts,
    total: count,
    nextState: more && artifacts.length ? { page: page + 1 } : undefined,
    terminalLimit:
      more && !artifacts.length
        ? {
            reason:
              'crates.io returned an empty page before its reported total.',
          }
        : undefined,
  };
}

export async function go(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) {
    let data: unknown;
    let isPackage = false;
    const path = coordinatePath(query.packageName);
    try {
      data = await registryJson(
        'go',
        `https://pkg.go.dev/v1/module/${path}`,
        true
      );
    } catch (error) {
      // pkgsite reports known package paths passed to /module as HTTP 400.
      if (!(error instanceof ArtifactProviderError) || error.status !== 400)
        throw error;
    }
    if (data === undefined) {
      try {
        data = await registryJson(
          'go',
          `https://pkg.go.dev/v1/package/${path}`,
          true
        );
      } catch (error) {
        if (error instanceof ArtifactProviderError && error.status === 400) {
          throw new ArtifactProviderError(
            'invalid_query',
            'Go could not resolve this package path uniquely. Use its containing module path as packageName.',
            400
          );
        }
        throw error;
      }
      isPackage = true;
    }
    if (data === undefined) return { artifacts: [], total: 0 };
    const row = object(data);
    const name = requiredString(row.path, 'go');
    return {
      artifacts: [
        {
          type: 'go',
          name,
          registryUrl: `https://pkg.go.dev/${coordinatePath(name)}`,
          version: string(row.version),
          description: string(row.synopsis),
          repository: url(row.repoUrl),
          modulePath: isPackage ? string(row.modulePath) : name,
          packagePath: isPackage ? name : undefined,
        },
      ],
      total: 1,
    };
  }
  const data = object(
    await registryJson(
      'go',
      endpoint('https://pkg.go.dev/v1/search', {
        q: query.keywords!.join(' '),
        limit: query.pageSize ?? 10,
        token: state.token,
      })
    )
  );
  const artifacts = rows(data.items, 'go').map(row => {
    const name = requiredString(row.packagePath, 'go');
    return {
      type: 'go' as const,
      name,
      registryUrl: `https://pkg.go.dev/${coordinatePath(name)}`,
      modulePath: string(row.modulePath),
      packagePath: name,
      version: string(row.version),
      description: string(row.synopsis),
    };
  });
  const token = string(data.nextPageToken);
  return {
    artifacts,
    total: total(data.total),
    nextState: token ? { token } : undefined,
  };
}

function composer(row: JsonObject): Artifact {
  const name = requiredString(row.name, 'packagist');
  return {
    type: 'packagist',
    name,
    registryUrl: `https://packagist.org/packages/${coordinatePath(name)}`,
    version: string(row.version),
    description: string(row.description),
    license: license(row.license),
    repository: url(object(row.source).url) ?? url(row.repository),
    homepage: url(row.homepage),
  };
}

export async function packagist(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) {
    const name = query.packageName.toLowerCase();
    const response = await registryJson(
      'packagist',
      `https://repo.packagist.org/p2/${coordinatePath(name)}.json`,
      true
    );
    let raw = object(response);
    let entries =
      response === undefined
        ? []
        : rows(object(raw.packages)[name], 'packagist');
    // Packagist separates tagged and development metadata; branch-only packages
    // still exist when the tagged file is empty or absent. See packagist.org/apidoc.
    if (!entries.length) {
      const development = await registryJson(
        'packagist',
        `https://repo.packagist.org/p2/${coordinatePath(name)}~dev.json`,
        true
      );
      if (development === undefined) return { artifacts: [], total: 0 };
      raw = object(development);
      entries = rows(object(raw.packages)[name], 'packagist');
    }
    // Composer's first row is complete; older inherited versions are not returned.
    return {
      artifacts: entries.length ? [composer(entries[0]!)] : [],
      total: entries.length ? 1 : 0,
    };
  }
  const page = state.page ?? 1;
  const data = object(
    await registryJson(
      'packagist',
      endpoint('https://packagist.org/search.json', {
        q: query.keywords!.join(' '),
        page,
        per_page: query.pageSize ?? 10,
      })
    )
  );
  const artifacts = rows(data.results, 'packagist').map(composer);
  // Reconstruct the official endpoint rather than following a provider-supplied URL.
  return {
    artifacts,
    total: total(data.total),
    nextState: string(data.next) ? { page: page + 1 } : undefined,
  };
}

function gem(row: JsonObject): Artifact {
  const name = requiredString(row.name, 'rubygems');
  return {
    type: 'rubygems',
    name,
    registryUrl: `https://rubygems.org/gems/${encodeURIComponent(name)}`,
    version: string(row.version),
    description: string(row.info),
    license: license(row.licenses),
    homepage: url(row.homepage_uri),
    repository:
      url(row.source_code_uri) ?? url(object(row.metadata).source_code_uri),
  };
}

export async function rubygems(
  query: ArtifactQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult> {
  if (query.packageName) {
    const response = await registryJson(
      'rubygems',
      `https://rubygems.org/api/v1/gems/${encodeURIComponent(query.packageName)}.json`,
      true
    );
    return response === undefined
      ? { artifacts: [], total: 0 }
      : { artifacts: [gem(object(response))], total: 1 };
  }
  const page = state.page ?? 1;
  const data = await registryJson(
    'rubygems',
    endpoint('https://rubygems.org/api/v1/search.json', {
      query: query.keywords!.join(' '),
      page,
    })
  );
  const artifacts = rows(data, 'rubygems').map(gem);
  // RubyGems specifies a fixed 30-row page and termination on an empty response.
  return {
    artifacts,
    nextState: artifacts.length ? { page: page + 1 } : undefined,
  };
}
