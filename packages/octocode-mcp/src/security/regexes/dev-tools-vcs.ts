import type { SensitiveDataPattern } from './types.js';

export const developerToolsPatterns: SensitiveDataPattern[] = [
  {
    name: 'npmAccessToken',
    description: 'NPM access token',
    regex: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'nugetApiKey',
    description: 'NuGet API key',
    regex: /\boy2[a-z0-9]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'artifactoryApiKey',
    description: 'JFrog Artifactory API key',
    regex: /\bAKCp[A-Za-z0-9]{69}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'herokuApiKey',
    description: 'Heroku API key',
    regex:
      /\bheroku.*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b/gi,
    matchAccuracy: 'high',
  },
  {
    name: 'terraformCloudToken',
    description: 'Terraform Cloud API token',
    regex: /\b[a-zA-Z0-9]{14}\.[a-zA-Z0-9]{6}\.[a-zA-Z0-9]{16}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pulumiAccessToken',
    description: 'Pulumi access token',
    regex: /\bpul-[a-f0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'atlassianApiToken',
    description: 'Atlassian API token (Jira/Confluence)',
    regex: /\bATATT3[A-Za-z0-9_\-=]{186}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'sourcegraphApiKey',
    description: 'Sourcegraph API key',
    regex: /\bsgp_[a-zA-Z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'linearApiKey',
    description: 'Linear API key',
    regex: /\blin_api_[0-9A-Za-z]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'notionIntegrationToken',
    description: 'Notion integration token',
    regex: /\bntn_[a-zA-Z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'stackhawkApiKey',
    description: 'StackHawk API key',
    regex: /\bhawk\.[0-9A-Za-z\-_]{20}\.[0-9A-Za-z\-_]{20}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'sentryAuthToken',
    description: 'Sentry authentication token',
    regex: /\bsentry[\s\w]*(?:auth|token)[\s:=]*["']?[a-f0-9]{64}["']?\b/gi,
    matchAccuracy: 'medium',
  },
  {
    name: 'bugsnagApiKey',
    description: 'Bugsnag API key',
    regex: /\bbugsnag[\s\w]*(?:api|key)[\s:=]*["']?[a-f0-9]{32}["']?\b/gi,
    matchAccuracy: 'medium',
  },
  {
    name: 'rollbarAccessToken',
    description: 'Rollbar access token',
    regex: /\brollbar[\s\w]*(?:access|token)[\s:=]*["']?[a-f0-9]{32}["']?\b/gi,
    matchAccuracy: 'medium',
  },
  // Postman API Token
  {
    name: 'postmanApiToken',
    description: 'Postman API token',
    regex: /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/gi,
    matchAccuracy: 'high',
  },
  // Prefect API Token
  {
    name: 'prefectApiToken',
    description: 'Prefect API token',
    regex: /\bpnu_[a-zA-Z0-9]{36}\b/g,
    matchAccuracy: 'high',
  },
  // Readme API Token
  {
    name: 'readmeApiToken',
    description: 'Readme API token',
    regex: /\brdme_[a-z0-9]{70}\b/g,
    matchAccuracy: 'high',
  },
  // RubyGems API Token
  {
    name: 'rubygemsApiToken',
    description: 'RubyGems API token',
    regex: /\brubygems_[a-f0-9]{48}\b/g,
    matchAccuracy: 'high',
  },
  // Clojars API Token
  {
    name: 'clojarsApiToken',
    description: 'Clojars API token',
    regex: /\bCLOJARS_[a-z0-9]{60}\b/gi,
    matchAccuracy: 'high',
  },
  // Snyk API Token
  {
    name: 'snykApiToken',
    description: 'Snyk API token',
    regex:
      /\b['"]?(?:snyk[_.-]?(?:(?:api|oauth)[_.-]?)?(?:key|token))['"]?\s*(?::|=>|=)\s*['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]?\b/gi,
    matchAccuracy: 'high',
  },
  // SonarQube Token
  {
    name: 'sonarqubeToken',
    description: 'SonarQube/SonarCloud token',
    regex: /\b(?:squ_|sqp_|sqa_)[a-z0-9=_-]{40}\b/gi,
    matchAccuracy: 'high',
  },
  // TravisCI Access Token
  {
    name: 'travisciAccessToken',
    description: 'Travis CI access token',
    regex:
      /\b['"]?(?:travis)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{22}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Codecov Access Token
  {
    name: 'codecovAccessToken',
    description: 'Codecov access token',
    regex:
      /\b['"]?(?:codecov)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // DroneCI Access Token
  {
    name: 'droneCiAccessToken',
    description: 'DroneCI access token',
    regex:
      /\b['"]?(?:droneci|drone)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Octopus Deploy API Key
  {
    name: 'octopusDeployApiKey',
    description: 'Octopus Deploy API key',
    regex: /\bAPI-[A-Z0-9]{26}\b/g,
    matchAccuracy: 'high',
  },
  // CircleCI Token
  {
    name: 'circleciToken',
    description: 'CircleCI personal API token',
    regex:
      /\b['"]?(?:circleci|circle)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{40}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Buildkite Agent Token
  {
    name: 'buildkiteAgentToken',
    description: 'Buildkite agent token',
    regex: /\bbkagent_[a-f0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  // LaunchDarkly Access Token
  {
    name: 'launchdarklyAccessToken',
    description: 'LaunchDarkly access token',
    regex:
      /\b['"]?(?:launchdarkly)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9=_-]{40}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Algolia API Key
  {
    name: 'algoliaApiKey',
    description: 'Algolia API key',
    regex:
      /\b['"]?(?:algolia)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },

  // --- New Developer Tools Patterns ---

  // Clerk Secret Key
  {
    name: 'clerkSecretKey',
    description: 'Clerk secret key',
    regex: /\bsk_(?:live|test)_[a-zA-Z0-9]{24,}\b/g,
    matchAccuracy: 'high',
  },
  // Clerk Publishable Key
  {
    name: 'clerkPublishableKey',
    description: 'Clerk publishable key',
    regex: /\bpk_(?:live|test)_[a-zA-Z0-9]{24,}\b/g,
    matchAccuracy: 'medium',
  },
  // LaunchDarkly SDK Key
  {
    name: 'launchdarklySdkKey',
    description: 'LaunchDarkly SDK key',
    regex:
      /\bsdk-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g,
    matchAccuracy: 'high',
  },
  // Vercel OIDC Token
  {
    name: 'vercelOidcToken',
    description: 'Vercel OIDC token',
    regex:
      /\b['"]?(?:VERCEL_OIDC_TOKEN)['"]?\s*(?::|=>|=)\s*['"]?eyJ[a-zA-Z0-9_-]{100,}['"]?\b/g,
    matchAccuracy: 'high',
  },
  // NOTE: Turso database token pattern is in cloud-infrastructure.ts (tursoDatabaseToken) - covers both libsql and turso prefixes
  // Novu API Key
  {
    name: 'novuApiKey',
    description: 'Novu API key',
    regex:
      /\b['"]?(?:NOVU|novu)_?(?:API|api)?_?(?:KEY|key)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{32,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Trigger.dev API Key
  {
    name: 'triggerDevApiKey',
    description: 'Trigger.dev API key',
    regex: /\btr_(?:dev|prod)_[a-zA-Z0-9]{20,}\b/g,
    matchAccuracy: 'high',
  },
  // Nx Cloud Access Token
  {
    name: 'nxCloudAccessToken',
    description: 'Nx Cloud access token',
    regex:
      /\b['"]?(?:NX_CLOUD_ACCESS_TOKEN|nxCloudAccessToken)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{36,}['"]?\b/g,
    matchAccuracy: 'medium',
  },
  // Depot API Token
  {
    name: 'depotToken',
    description: 'Depot.dev build token',
    regex: /\bdpt_[a-zA-Z0-9]{40,}\b/g,
    matchAccuracy: 'high',
  },
  // Grafbase API Key
  {
    name: 'grafbaseApiKey',
    description: 'Grafbase API key',
    regex:
      /\b['"]?(?:GRAFBASE|grafbase)_?(?:API|api)?_?(?:KEY|key)['"]?\s*(?::|=>|=)\s*['"]?eyJ[a-zA-Z0-9_-]{50,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
];

export const versionControlPatterns: SensitiveDataPattern[] = [
  {
    name: 'gitlabPersonalAccessToken',
    description: 'GitLab personal access token',
    regex: /\bglpat-[A-Za-z0-9_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'gitlabDeployToken',
    description: 'GitLab deploy token',
    regex: /\bgldt-[A-Za-z0-9_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'gitlabRunnerToken',
    description: 'GitLab runner registration token',
    regex: /\bglrt-[A-Za-z0-9_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'gitlabCiJobToken',
    description: 'GitLab CI/CD job token',
    regex: /\bglcbt-[0-9a-zA-Z]{1,5}_[0-9a-zA-Z_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  // NOTE: gitlabRunnerAuthToken removed - identical regex to gitlabRunnerToken above (glrt-[A-Za-z0-9_-]{20})
  {
    name: 'gitlabPipelineTriggerToken',
    description: 'GitLab pipeline trigger token',
    regex: /\bglptt-[0-9a-f]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'bitbucketAppPassword',
    description: 'Bitbucket app password',
    regex: /\bATBB[a-zA-Z0-9]{24}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'githubTokens',
    description: 'GitHub personal access token (classic)',
    regex: /\b((?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,255})\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'githubFineGrainedToken',
    description: 'GitHub fine-grained personal access token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
    matchAccuracy: 'high',
    fileContext: /(?:\.env|config|settings|secrets)/i,
  },
  {
    name: 'githubAppInstallationToken',
    description: 'GitHub App installation token',
    regex: /\bghs_[0-9a-zA-Z]{37}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab SCIM Token
  {
    name: 'gitlabScimToken',
    description: 'GitLab SCIM token',
    regex: /\bglsoat-[0-9a-zA-Z_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab Feature Flag Client Token
  {
    name: 'gitlabFeatureFlagToken',
    description: 'GitLab feature flag client token',
    regex: /\bglffct-[0-9a-zA-Z_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab Feed Token
  {
    name: 'gitlabFeedToken',
    description: 'GitLab feed token',
    regex: /\bglft-[0-9a-zA-Z_-]{20}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab Incoming Mail Token
  {
    name: 'gitlabIncomingMailToken',
    description: 'GitLab incoming mail token',
    regex: /\bglimt-[0-9a-zA-Z_-]{25}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab Kubernetes Agent Token
  {
    name: 'gitlabK8sAgentToken',
    description: 'GitLab Kubernetes agent token',
    regex: /\bglagent-[0-9a-zA-Z_-]{50}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab OAuth App Secret
  {
    name: 'gitlabOAuthAppSecret',
    description: 'GitLab OAuth application secret',
    regex: /\bgloas-[0-9a-zA-Z_-]{64}\b/g,
    matchAccuracy: 'high',
  },
  // GitLab Session Cookie
  {
    name: 'gitlabSessionCookie',
    description: 'GitLab session cookie',
    regex: /_gitlab_session=[0-9a-z]{32}/g,
    matchAccuracy: 'high',
  },
  // Bitbucket Repository Token
  {
    name: 'bitbucketRepoToken',
    description: 'Bitbucket repository access token',
    regex: /\bATCTT3[a-zA-Z0-9]{24}\b/g,
    matchAccuracy: 'high',
  },
];

export const mappingMonitoringPatterns: SensitiveDataPattern[] = [
  // Mapping Services
  {
    name: 'mapboxSecretToken',
    description: 'Mapbox secret access token',
    regex: /\bsk\.eyJ[a-zA-Z0-9._-]{87}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'mapboxPublicToken',
    description: 'Mapbox public access token',
    regex: /\bpk\.eyJ[a-zA-Z0-9._-]{80,}\b/g,
    matchAccuracy: 'high',
  },
  // Monitoring & Analytics
  {
    name: 'grafanaCloudApiKey',
    description: 'Grafana Cloud API key',
    regex: /\bglc_[a-zA-Z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'newRelicApiKey',
    description: 'New Relic API key',
    regex: /\bNRAK-[A-Z0-9]{27}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'newRelicInsightKey',
    description: 'New Relic Insights query key',
    regex: /\bNRIK-[A-Z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  // New Relic Browser API Token
  {
    name: 'newRelicBrowserApiToken',
    description: 'New Relic browser API token',
    regex: /\bNRJS-[a-f0-9]{19}\b/g,
    matchAccuracy: 'high',
  },
  // New Relic Insert Key
  {
    name: 'newRelicInsertKey',
    description: 'New Relic ingest insert key',
    regex: /\bNRII-[a-z0-9-]{32}\b/gi,
    matchAccuracy: 'high',
  },
  // Grafana API Key
  {
    name: 'grafanaApiKey',
    description: 'Grafana API key',
    regex: /\beyJrIjoi[A-Za-z0-9]{70,400}={0,3}\b/gi,
    matchAccuracy: 'high',
  },
  // Grafana Service Account Token
  {
    name: 'grafanaServiceAccountToken',
    description: 'Grafana service account token',
    regex: /\bglsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}\b/g,
    matchAccuracy: 'high',
  },
  // Sentry Organization Token
  {
    name: 'sentryOrgToken',
    description: 'Sentry organization token',
    regex:
      /\bsntrys_eyJpYXQiO[a-zA-Z0-9+/]{10,200}(?:LCJyZWdpb25fdXJs|InJlZ2lvbl91cmwi|cmVnaW9uX3VybCI6)[a-zA-Z0-9+/]{10,200}={0,2}_[a-zA-Z0-9+/]{43}\b/g,
    matchAccuracy: 'high',
  },
  // Sentry User Token
  {
    name: 'sentryUserToken',
    description: 'Sentry user token',
    regex: /\bsntryu_[a-f0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  // SumoLogic Access ID
  {
    name: 'sumoLogicAccessId',
    description: 'SumoLogic access ID',
    regex:
      /\b['"]?(?:sumo)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?su[a-zA-Z0-9]{12}['"]?\b/gi,
    matchAccuracy: 'high',
  },
  // Splunk API Token
  {
    name: 'splunkApiToken',
    description: 'Splunk HEC token',
    regex:
      /\b['"]?(?:splunk)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // LogDNA / Mezmo API Key
  {
    name: 'logdnaApiKey',
    description: 'LogDNA/Mezmo API key',
    regex:
      /\b['"]?(?:logdna|mezmo)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Loggly Token
  {
    name: 'logglyToken',
    description: 'Loggly customer token',
    regex:
      /\b['"]?(?:loggly)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
];
