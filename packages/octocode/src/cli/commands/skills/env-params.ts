/**
 * Env param registry — which environment variables each skill needs.
 *
 * Semantics:
 *   required     — skill is fully broken without this
 *   recommended  — skill degrades significantly; works with reduced capability
 *   optional     — nice to have, graceful without it
 *
 * group semantics — when group is set, AT LEAST ONE env var in the group must
 * be present to satisfy the group requirement. The group itself carries the
 * overall `required` level.
 */

import { spawnSync } from 'node:child_process';
import {
  applyOctocodeEnv,
  CONFIG_FIELDS,
  configFieldEnvName,
  ENV_TOKEN_VARS,
  getOctocodeHome,
  loadOctocodeEnv,
} from '@octocodeai/config';
import { nativeCommand, resolveNativeBin } from '../../native-delegate.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EnvRequirement = 'required' | 'recommended' | 'optional';

interface EnvParam {
  /** Environment variable name, e.g. "GH_TOKEN" */
  key: string;
  /** Short human-readable description */
  description: string;
  /** Importance level */
  required: EnvRequirement;
  /**
   * Group tag — when set, AT LEAST ONE var in the group must be present.
   * e.g. "github-token" accepts either supported token variable.
   */
  group?: string;
  /** Where to get the key */
  link?: string;
}

type EnvStatus = 'set' | 'missing';

interface EnvParamStatus {
  param: EnvParam;
  status: EnvStatus;
}

interface SkillEnvStatus {
  skillName: string;
  params: EnvParamStatus[];
  /**
   * Overall readiness:
   *   ready         — all required groups satisfied, all standalone required params set
   *   needs-config  — one or more required params/groups missing
   *   partial       — required ok, but recommended params missing
   *   ok            — no env params needed at all
   */
  readiness: 'ok' | 'ready' | 'partial' | 'needs-config';
}

// ─── Static registry ──────────────────────────────────────────────────────────

// Token and credential names come from the config contract, in precedence order.
const GITHUB_TOKEN_PARAMS: EnvParam[] = ENV_TOKEN_VARS.map((key, index) => ({
  key,
  description:
    index === 0
      ? 'GitHub token — code search, file reads, repo/PR discovery'
      : 'GitHub token (alternate name)',
  required: 'recommended',
  group: 'github-token',
  link: 'https://github.com/settings/tokens',
}));

const CLASSIFICATION_KEY = configFieldEnvName('classification.api');

const CLASSIFICATION_KEY_PARAMS: EnvParam[] = CLASSIFICATION_KEY
  ? [
      {
        key: CLASSIFICATION_KEY,
        description: 'Optional semantic classification and evidence routing',
        required: 'optional',
        group: 'classification-key',
        link: 'https://console.typesafe.ai/keys',
      },
    ]
  : [];

/**
 * Credential readiness for skills. Optional runtime settings stay in their docs.
 */
export const SKILL_ENV_PARAMS: Record<string, EnvParam[]> = {
  'octocode-brainstorming': [
    {
      key: 'TAVILY_API_KEY',
      description:
        'Optional; scripts/search.mjs queries Tavily when set. Host web tools work without it',
      required: 'optional',
    },
    {
      key: 'EXA_API_KEY',
      description:
        'Optional; scripts/search.mjs queries Exa (web, news, papers) when set',
      required: 'optional',
    },
    {
      key: 'SERPER_API_KEY',
      description:
        'Optional; scripts/search.mjs queries Serper (Google web, news, Scholar) when set',
      required: 'optional',
    },
  ],
  'octocode-research': [...GITHUB_TOKEN_PARAMS, ...CLASSIFICATION_KEY_PARAMS],
  'octocode-rfc-generator': [
    ...GITHUB_TOKEN_PARAMS,
    ...CLASSIFICATION_KEY_PARAMS,
  ],
  'octocode-roast': GITHUB_TOKEN_PARAMS,
  'octocode-scraping': [
    {
      key: 'SCRAPING_ANT',
      description:
        'Optional ScrapingAnt provider; direct public fetching needs no key',
      required: 'optional',
    },
  ],
};

// ─── Runtime status check ─────────────────────────────────────────────────────

type EnvMap = Record<string, string | undefined>;

/**
 * The environment with the layers and trust rules Octocode itself applies:
 * process env, then the workspace and home `.env`.
 */
function effectiveEnv(): EnvMap {
  const effective: EnvMap = { ...process.env };
  const { map, sources } = loadOctocodeEnv({
    home: getOctocodeHome(),
    cwd: process.cwd(),
  });
  applyOctocodeEnv(map, { env: effective, sources });
  return effective;
}

function isSetIn(env: EnvMap, key: string): boolean {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Credential variables the native resolver also fills from `.octocoderc`
 * (`classification.api`, ...). The `.env` layers above do not include that
 * fallback, so for these keys native is asked instead of re-implementing it.
 */
const FILE_BACKED_KEYS: ReadonlySet<string> = new Set(
  CONFIG_FIELDS.flatMap(field =>
    field.credential && field.file && field.env ? [field.env.name] : []
  )
);

/** Whether `key` is set for Octocode: in the environment layers, or natively. */
function isKeySet(env: EnvMap, key: string): boolean {
  return (
    isSetIn(env, key) ||
    (FILE_BACKED_KEYS.has(key) && nativeConfigCheck(key)?.set === true)
  );
}

/** Check whether a single env var is set in the effective environment. */
export function isEnvSet(key: string): boolean {
  return isKeySet(effectiveEnv(), key);
}

interface NativeConfigCheck {
  set: boolean;
  githubTokenSource: string | null;
}

const nativeChecks = new Map<string, NativeConfigCheck | null>();

/**
 * `octocode config check KEY --json` from the native runtime, which owns
 * resolution (every layer, `.octocoderc` credential fallbacks, the stored or
 * `gh` GitHub login); null when the runtime is unavailable. One probe per
 * binary and key; values are never read.
 */
function nativeConfigCheck(key: string): NativeConfigCheck | null {
  const resolved = resolveNativeBin();
  if ('error' in resolved) return null;
  const { bin } = resolved;
  const cacheKey = `${bin}\0${key}`;
  const cached = nativeChecks.get(cacheKey);
  if (cached !== undefined) return cached;
  const [command, args] = nativeCommand(bin, [
    'config',
    'check',
    key,
    '--json',
  ]);
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10_000,
  });
  let check: NativeConfigCheck | null;
  try {
    const parsed = JSON.parse(result.stdout ?? '') as {
      set?: unknown;
      githubTokenSource?: unknown;
    };
    check = {
      set: parsed.set === true,
      githubTokenSource:
        typeof parsed.githubTokenSource === 'string'
          ? parsed.githubTokenSource
          : null,
    };
  } catch {
    check = null;
  }
  nativeChecks.set(cacheKey, check);
  return check;
}

/**
 * The source of the GitHub token the native runtime would use (a stored
 * `octocode auth login`, a `gh` login, ...) without verifying it; null when
 * there is none or the runtime is unavailable.
 */
function nativeGithubTokenSource(): string | null {
  return nativeConfigCheck(ENV_TOKEN_VARS[0]!)?.githubTokenSource ?? null;
}

/** A group a credential outside the environment satisfies: the GitHub token. */
function satisfiedOutsideEnv(group: string | undefined): boolean {
  return group === 'github-token' && nativeGithubTokenSource() !== null;
}

/** Get env status for all params of a skill. */
export function getSkillEnvStatus(skillName: string): SkillEnvStatus {
  const params = SKILL_ENV_PARAMS[skillName] ?? [];

  if (params.length === 0) {
    return { skillName, params: [], readiness: 'ok' };
  }

  const env = effectiveEnv();
  const paramStatuses: EnvParamStatus[] = params.map(p => ({
    param: p,
    status: isKeySet(env, p.key) ? 'set' : 'missing',
  }));

  // Evaluate group satisfication
  const groups = new Map<
    string,
    { level: EnvRequirement; anySatisfied: boolean }
  >();
  const standaloneUnsatisfied: EnvRequirement[] = [];

  for (const ps of paramStatuses) {
    const { group, required } = ps.param;
    if (group) {
      const existing = groups.get(group);
      if (existing) {
        if (ps.status === 'set') existing.anySatisfied = true;
      } else {
        groups.set(group, {
          level: required,
          anySatisfied: ps.status === 'set' || satisfiedOutsideEnv(group),
        });
      }
    } else {
      if (ps.status === 'missing') standaloneUnsatisfied.push(required);
    }
  }

  // Determine readiness
  let hasRequiredMissing = false;
  let hasRecommendedMissing = false;

  for (const [, g] of groups) {
    if (!g.anySatisfied) {
      if (g.level === 'required') hasRequiredMissing = true;
      else if (g.level === 'recommended') hasRecommendedMissing = true;
    }
  }
  for (const level of standaloneUnsatisfied) {
    if (level === 'required') hasRequiredMissing = true;
    else if (level === 'recommended') hasRecommendedMissing = true;
  }

  const readiness = hasRequiredMissing
    ? 'needs-config'
    : hasRecommendedMissing
      ? 'partial'
      : 'ready';

  return { skillName, params: paramStatuses, readiness };
}

/** Get env status for a list of skills. */
export function getSkillsEnvStatus(skillNames: string[]): SkillEnvStatus[] {
  return skillNames.map(getSkillEnvStatus);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable credential group label. */
export function groupLabel(group: string): string {
  const labels: Record<string, string> = {
    'github-token': `GitHub token (one of ${ENV_TOKEN_VARS.join(', ')})`,
    'classification-key': `classification key (${CLASSIFICATION_KEY})`,
  };
  return labels[group] ?? group;
}

/** True when the group that contains this param is satisfied by ANY other set param in the list. */
function isGroupSatisfied(ps: EnvParamStatus, all: EnvParamStatus[]): boolean {
  const { group } = ps.param;
  if (!group) return ps.status === 'set';
  return (
    satisfiedOutsideEnv(group) ||
    all.some(other => other.param.group === group && other.status === 'set')
  );
}

/** One JSON row per env param: its status, and its group's satisfaction when grouped. */
export function envParamRows(env: SkillEnvStatus) {
  return env.params.map(param => ({
    key: param.param.key,
    status: param.status,
    required: param.param.required,
    description: param.param.description,
    ...(param.param.group
      ? {
          group: param.param.group,
          groupSatisfied: isGroupSatisfied(param, env.params),
        }
      : {}),
    ...(param.param.link ? { link: param.param.link } : {}),
  }));
}

/** Compact summary of what's missing, for inline display. */
export function missingHint(envStatus: SkillEnvStatus): string {
  if (envStatus.readiness === 'ok' || envStatus.readiness === 'ready')
    return '';

  const unsatisfiedGroups = new Set<string>();
  const standaloneKeys: string[] = [];

  for (const ps of envStatus.params) {
    if (ps.status === 'set' || ps.param.required === 'optional') continue;
    if (ps.param.group) {
      const groupSatisfied = isGroupSatisfied(ps, envStatus.params);
      if (!groupSatisfied) unsatisfiedGroups.add(ps.param.group);
    } else {
      standaloneKeys.push(ps.param.key);
    }
  }

  const parts: string[] = [
    ...[...unsatisfiedGroups].map(groupLabel),
    ...standaloneKeys,
  ];

  if (parts.length === 0) return '';
  const verb =
    envStatus.readiness === 'needs-config' ? 'missing' : 'recommended';
  return `${verb}: ${parts.join(', ')}`;
}
