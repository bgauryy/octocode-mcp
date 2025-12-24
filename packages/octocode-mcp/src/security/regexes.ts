import type { SensitiveDataPattern } from '../types.js';

const aiProviderPatterns: SensitiveDataPattern[] = [
  // OpenAI & Compatible
  {
    name: 'openaiApiKey',
    description: 'OpenAI API key',
    regex: /\b(sk-[a-zA-Z0-9_-]+T3BlbkFJ[a-zA-Z0-9_-]+)\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'openaiOrgId',
    description: 'OpenAI organization ID',
    regex: /\borg-[a-zA-Z0-9]{20,}\b/g,
    matchAccuracy: 'high',
  },
  // Groq
  {
    name: 'groqApiKey',
    description: 'Groq API key',
    regex: /\bgsk_[a-zA-Z0-9-_]{51,52}\b/g,
    matchAccuracy: 'high',
  },

  // Cohere
  {
    name: 'cohereApiKey',
    description: 'Cohere API key',
    regex: /\bco-[a-zA-Z0-9-_]{38,64}\b/g,
    matchAccuracy: 'high',
  },

  // Hugging Face
  {
    name: 'huggingFaceToken',
    description: 'Hugging Face API token',
    regex: /\bhf_[a-zA-Z0-9]{34}\b/g,
    matchAccuracy: 'high',
  },

  // Perplexity
  {
    name: 'perplexityApiKey',
    description: 'Perplexity AI API key',
    regex: /\bpplx-[a-zA-Z0-9]{30,64}\b/g,
    matchAccuracy: 'high',
  },

  // Replicate
  {
    name: 'replicateApiToken',
    description: 'Replicate API token',
    regex: /\br8_[a-zA-Z0-9]{30,}\b/g,
    matchAccuracy: 'high',
  },

  // Anthropic (Claude)
  {
    name: 'anthropicApiKey',
    description: 'Anthropic API key',
    regex: /\b(sk-ant-(?:admin01|api03)-[\w-]{93}AA)\b/g,
    matchAccuracy: 'high',
  },
  // Mistral AI
  {
    name: 'mistralApiKey',
    description: 'Mistral AI API key',
    regex: /\b(?:mistral-|mist_)[a-zA-Z0-9]{32,}\b/g,
    matchAccuracy: 'high',
  },
  // Tavily
  {
    name: 'tavilyApiKey',
    description: 'Tavily API key',
    regex: /\btvly-[a-zA-Z0-9]{30,}\b/g,
    matchAccuracy: 'high',
  },
  // DeepSeek
  {
    name: 'deepseekApiKey',
    description: 'DeepSeek API key',
    regex: /\bsk-[a-zA-Z0-9]{32,64}\b/g,
    matchAccuracy: 'medium',
  },
  // Together AI
  {
    name: 'togetherApiKey',
    description: 'Together AI API key',
    regex:
      /\b['"]?(?:TOGETHER|together)_?(?:API|api)?_?(?:KEY|key)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{40,64}['"]?\b/g,
    matchAccuracy: 'medium',
  },
  // Fireworks AI
  {
    name: 'fireworksApiKey',
    description: 'Fireworks AI API key',
    regex:
      /\b['"]?(?:FIREWORKS|fireworks)_?(?:API|api)?_?(?:KEY|key)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{40,64}['"]?\b/g,
    matchAccuracy: 'medium',
  },
  // xAI (Grok)
  {
    name: 'xaiApiKey',
    description: 'xAI (Grok) API key',
    regex: /\bxai-[a-zA-Z0-9]{48,}\b/g,
    matchAccuracy: 'high',
  },
  // OpenRouter
  {
    name: 'openRouterApiKey',
    description: 'OpenRouter API key',
    regex: /\bsk-or-v1-[a-zA-Z0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  // Amazon Bedrock
  {
    name: 'amazonBedrockApiKey',
    description: 'Amazon Bedrock API key',
    regex: /\bABSK[A-Za-z0-9+/]{109,269}={0,2}\b/g,
    matchAccuracy: 'high',
  },
  // AI21 Labs
  {
    name: 'ai21ApiKey',
    description: 'AI21 Labs API key',
    regex:
      /\b['"]?(?:AI21|ai21)_?(?:API|api)?_?(?:KEY|key)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{40,64}['"]?\b/g,
    matchAccuracy: 'medium',
  },
  // Stability AI
  {
    name: 'stabilityApiKey',
    description: 'Stability AI API key',
    regex: /\bsk-[a-zA-Z0-9]{48,}\b/g,
    matchAccuracy: 'medium',
  },
  // Voyage AI
  {
    name: 'voyageApiKey',
    description: 'Voyage AI API key',
    regex: /\bpa-[a-zA-Z0-9]{40,}\b/g,
    matchAccuracy: 'high',
  },
];

const awsPatterns: SensitiveDataPattern[] = [
  {
    name: 'awsAccessKeyId',
    description: 'AWS access key ID',
    regex: /\b((?:AKIA|ABIA|ACCA)[A-Z0-9]{16})\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsAccountId',
    description: 'AWS account ID',
    regex:
      /\b['"]?(?:AWS|aws|Aws)?_?(?:ACCOUNT|account|Account)_?(?:ID|id|Id)?['"]?\s*(?::|=>|=)\s*['"]?[0-9]{12}['"]?\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsAppSyncApiKey',
    description: 'AWS AppSync GraphQL API key',
    regex: /\bda2-[a-z0-9]{26}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsIamRoleArn',
    description: 'AWS IAM role ARN',
    regex: /\barn:aws:iam::[0-9]{12}:role\/[a-zA-Z0-9_+=,.@-]+\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsLambdaFunctionArn',
    description: 'AWS Lambda function ARN',
    regex: /\barn:aws:lambda:[a-z0-9-]+:[0-9]{12}:function:[a-zA-Z0-9_-]+\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsMwsAuthToken',
    description: 'AWS MWS authentication token',
    regex:
      /\bamzn\.mws\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsS3BucketArn',
    description: 'AWS S3 bucket ARN',
    regex: /\barn:aws:s3:::[a-zA-Z0-9._-]+\b/g,
    matchAccuracy: 'high',
  },
  // Alibaba Cloud
  {
    name: 'alibabaAccessKeyId',
    description: 'Alibaba Cloud AccessKey ID',
    regex: /\bLTAI[a-zA-Z0-9]{20}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsSecretAccessKey',
    description: 'AWS secret access key',
    regex:
      /\b['"]?(?:AWS|aws|Aws)?_?(?:SECRET|secret|Secret)_?(?:ACCESS|access|Access)_?(?:KEY|key|Key)['"]?\s*(?::|=>|=)\s*['"]?[A-Za-z0-9/+=]{40}['"]?\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'awsSessionToken',
    description: 'AWS session token',
    regex:
      /\b['"]?(?:AWS|aws|Aws)?_?(?:SESSION|session|Session)_?(?:TOKEN|token|Token)['"]?\s*(?::|=>|=)\s*['"]?[A-Za-z0-9/+=]{200,}['"]?\b/g,
    matchAccuracy: 'high',
  },
  // Secrets Manager Secret ARN
  {
    name: 'awsSecretsManagerArn',
    description: 'AWS Secrets Manager secret ARN',
    regex:
      /\barn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[a-zA-Z0-9/_+=.@-]+\b/g,
    matchAccuracy: 'high',
  },
];

const analyticsModernPatterns: SensitiveDataPattern[] = [
  {
    name: 'vercelToken',
    description: 'Vercel API token',
    regex: /\bvercel_[a-zA-Z0-9]{24}\b/g,
  },
  {
    name: 'posthogApiKey',
    description: 'PostHog API key',
    regex: /\bphc_[a-zA-Z0-9_-]{39}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'posthogPersonalApiKey',
    description: 'PostHog personal API key',
    regex: /\bphx_[a-zA-Z0-9_-]{39}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'datadogApiKey',
    description: 'Datadog API and application keys (with context)',
    regex:
      /\bdatadog[\s\w]*(?:api|app)[\s\w]*key[\s:=]*["']?[a-fA-F0-9]{32,40}["']?/gi,
    matchAccuracy: 'medium',
  },
  {
    name: 'honeycombApiKey',
    description: 'Honeycomb API key',
    regex: /\bhcaik_[a-zA-Z0-9_-]{32,64}\b/g,
    matchAccuracy: 'high',
  },
];

const authPatterns: SensitiveDataPattern[] = [
  {
    name: 'jwtToken',
    description: 'JWT (JSON Web Token - 3-part)',
    regex:
      /\b(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9/_-]{17,}\.(?:[a-zA-Z0-9/_-]{10,}={0,2})?)\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'sessionIds',
    description: 'Session IDs / Cookies',
    regex:
      /(?:JSESSIONID|PHPSESSID|ASP\.NET_SessionId|connect\.sid|session_id)=([a-zA-Z0-9%:._-]+)/gi,
    matchAccuracy: 'high',
  },
  {
    name: 'googleOauthToken',
    description: 'Google OAuth token',
    regex: /\bya29\.[a-zA-Z0-9_-]+\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'onePasswordSecretKey',
    description: '1Password secret key',
    regex:
      /\bA3-[A-Z0-9]{6}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'onePasswordServiceAccountToken',
    description: '1Password service account token',
    regex: /\bops_eyJ[a-zA-Z0-9+/]+={0,2}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'jsonWebTokenEnhanced',
    description: 'JSON Web Token with enhanced detection',
    regex: /\bey[a-zA-Z0-9]+\.ey[a-zA-Z0-9/_-]+\.(?:[a-zA-Z0-9/_-]+={0,2})?\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'authressServiceClientAccessKey',
    description: 'Authress service client access key',
    regex:
      /\b(?:sc|ext|scauth|authress)_[a-z0-9]+\.[a-z0-9]+\.acc[_-][a-z0-9-]+\.[a-z0-9+/_=-]+\b/gi,
    matchAccuracy: 'high',
  },
];

const cloudProviderPatterns: SensitiveDataPattern[] = [
  // Google Cloud Platform
  {
    name: 'googleApiKey',
    description: 'Google API key',
    regex: /\bAIza[a-zA-Z0-9_-]{30,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'googleAiApiKey',
    description: 'Google AI API key',
    regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'googleOAuth2ClientId',
    description: 'Google OAuth2 client ID',
    regex: /\b[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'googleOAuthClientSecret',
    description: 'Google OAuth client secret',
    regex: /\b"client_secret":\s*"[a-zA-Z0-9-_]{24}"\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'gcpServiceAccountEmail',
    description: 'GCP service account email',
    regex: /\b[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'azureStorageConnectionString',
    description: 'Azure storage account connection string',
    regex:
      /\bDefaultEndpointsProtocol=https?;AccountName=[a-z0-9]+;AccountKey=[a-zA-Z0-9+/]+={0,2};EndpointSuffix=core\.windows\.net\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'azureSubscriptionId',
    description: 'Azure subscription ID',
    regex:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.onmicrosoft\.com\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'azureCosmosDbConnectionString',
    description: 'Azure Cosmos DB connection string',
    regex:
      /\bAccountEndpoint=https:\/\/[a-z0-9-]+\.documents\.azure\.com:443\/;AccountKey=[a-zA-Z0-9+/]+={0,2}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'azureServiceBusConnectionString',
    description: 'Azure Service Bus connection string',
    regex:
      /\bEndpoint=sb:\/\/[a-z0-9-]+\.servicebus\.windows\.net\/;SharedAccessKeyName=[a-zA-Z0-9]+;SharedAccessKey=[a-zA-Z0-9+/]+={0,2}\b/g,
    matchAccuracy: 'high',
  },

  // Dropbox
  {
    name: 'dropboxAccessToken',
    description: 'Dropbox access token',
    regex: /\bsl\.[a-zA-Z0-9_-]{64}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'dropboxAppKey',
    description: 'Dropbox app key',
    regex: /\b[a-z0-9]{15}\.(?:app|apps)\.dropbox\.com\b/g,
    matchAccuracy: 'high',
  },

  // Database Services
  {
    name: 'supabaseServiceKey',
    description: 'Supabase service role key',
    regex: /\bsbp_[a-f0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'planetScaleConnectionString',
    description: 'PlanetScale connection string',
    regex:
      /\bmysql:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_=-]+@[a-z0-9.-]+\.psdb\.cloud\/[a-zA-Z0-9_-]+\?sslaccept=strict\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'planetScaleToken',
    description: 'PlanetScale API token',
    regex: /\bpscale_tkn_[a-zA-Z0-9_-]{38,43}\b/g,
    matchAccuracy: 'high',
  },

  // Email Services
  {
    name: 'sendgridApiKey',
    description: 'SendGrid API key',
    regex: /\bSG\.[A-Za-z0-9_-]{20,22}\.[A-Za-z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'mailgunApiKey',
    description: 'Mailgun API key',
    regex: /\bkey-[0-9a-z]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'mailchimpApiKey',
    description: 'MailChimp API key',
    regex: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g,
    matchAccuracy: 'high',
  },

  // Communication Platforms
  {
    name: 'discordBotToken',
    description: 'Discord bot token',
    regex: /\b[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'discordWebhookUrl',
    description: 'Discord webhook URL',
    regex:
      /\bhttps:\/\/discord\.com\/api\/webhooks\/[0-9]{18}\/[A-Za-z0-9_-]{68}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'telegramBotToken',
    description: 'Telegram bot token',
    regex: /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'twilioApiKey',
    description: 'Twilio API key',
    regex: /\bSK[a-z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'twilioAccountSid',
    description: 'Twilio account SID',
    regex: /\bAC[0-9a-fA-F]{32}\b/g,
    matchAccuracy: 'high',
  },

  // Package Managers & Registries
  {
    name: 'dockerHubToken',
    description: 'Docker Hub personal access token',
    regex: /\bdckr_pat_[a-zA-Z0-9_]{36}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pypiApiToken',
    description: 'PyPI API token',
    regex: /\bpypi-[a-zA-Z0-9_-]{84}\b/g,
    matchAccuracy: 'high',
  },

  // Version Control & Development Tools
  {
    name: 'figmaToken',
    description: 'Figma personal access token',
    regex: /\bfigd_[a-zA-Z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'renderToken',
    description: 'Render API token',
    regex: /\brnd_[a-zA-Z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },
  // Business & Productivity Tools
  {
    name: 'airtablePersonalAccessToken',
    description: 'Airtable personal access token',
    regex: /\bpat[a-zA-Z0-9]{14}\.[a-zA-Z0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'typeformToken',
    description: 'Typeform API token',
    regex: /\btfp_[a-zA-Z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'intercomAccessToken',
    description: 'Intercom access token',
    regex: /\bdG9rOi[a-zA-Z0-9+/]{46,48}={0,2}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'digitalOceanToken',
    description: 'DigitalOcean API token',
    regex: /\bdop_v1_[a-f0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  // DigitalOcean OAuth
  {
    name: 'digitalOceanOAuthToken',
    description: 'DigitalOcean OAuth access token',
    regex: /\bdoo_v1_[a-f0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  // DigitalOcean Refresh Token
  {
    name: 'digitalOceanRefreshToken',
    description: 'DigitalOcean OAuth refresh token',
    regex: /\bdor_v1_[a-f0-9]{64}\b/g,
    matchAccuracy: 'high',
  },
  // Cloudflare API Key
  {
    name: 'cloudflareApiKey',
    description: 'Cloudflare API key',
    regex:
      /\b['"]?(?:cloudflare)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9_-]{40}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Cloudflare Global API Key
  {
    name: 'cloudflareGlobalApiKey',
    description: 'Cloudflare Global API key',
    regex:
      /\b['"]?(?:cloudflare)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{37}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Cloudflare Origin CA Key
  {
    name: 'cloudflareOriginCaKey',
    description: 'Cloudflare Origin CA key',
    regex: /\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b/g,
    matchAccuracy: 'high',
  },
  // Fly.io Access Token
  {
    name: 'flyioAccessToken',
    description: 'Fly.io API access token',
    regex: /\bfo1_[\w-]{43}\b/g,
    matchAccuracy: 'high',
  },
  // Fly.io Machine Token
  {
    name: 'flyioMachineToken',
    description: 'Fly.io machine token',
    regex: /\bfm[12][ar]?_[a-zA-Z0-9+/]{100,}={0,3}\b/g,
    matchAccuracy: 'high',
  },
  // Doppler API Token
  {
    name: 'dopplerApiToken',
    description: 'Doppler API token',
    regex: /\bdp\.pt\.[a-z0-9]{43}\b/gi,
    matchAccuracy: 'high',
  },
  // Dynatrace API Token
  {
    name: 'dynatraceApiToken',
    description: 'Dynatrace API token',
    regex: /\bdt0c01\.[a-z0-9]{24}\.[a-z0-9]{64}\b/gi,
    matchAccuracy: 'high',
  },
  // Netlify Access Token
  {
    name: 'netlifyAccessToken',
    description: 'Netlify access token',
    regex:
      /\b['"]?(?:netlify)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9=_-]{40,46}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Scalingo API Token
  {
    name: 'scalingoApiToken',
    description: 'Scalingo API token',
    regex: /\btk-us-[\w-]{48}\b/g,
    matchAccuracy: 'high',
  },
  // Infracost API Token
  {
    name: 'infracostApiToken',
    description: 'Infracost API token',
    regex: /\bico-[a-zA-Z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  // Harness API Key
  {
    name: 'harnessApiKey',
    description: 'Harness Access Token (PAT or SAT)',
    regex:
      /\b(?:pat|sat)\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9]{24}\.[a-zA-Z0-9]{20}\b/g,
    matchAccuracy: 'high',
  },
  // Azure AD Client Secret
  {
    name: 'azureAdClientSecret',
    description: 'Azure AD client secret',
    regex:
      /(?:^|[\\'"` \s>=:(,)])([a-zA-Z0-9_~.]{3}\dQ~[a-zA-Z0-9_~.-]{31,34})(?:$|[\\'"` \s<),])/g,
    matchAccuracy: 'high',
  },
  // Heroku API Key v2
  {
    name: 'herokuApiKeyV2',
    description: 'Heroku API key (new format)',
    regex: /\bHRKU-AA[0-9a-zA-Z_-]{58}\b/g,
    matchAccuracy: 'high',
  },
  // Microsoft Teams Webhook
  {
    name: 'microsoftTeamsWebhook',
    description: 'Microsoft Teams incoming webhook URL',
    regex:
      /https:\/\/[a-z0-9]+\.webhook\.office\.com\/webhookb2\/[a-z0-9]{8}-(?:[a-z0-9]{4}-){3}[a-z0-9]{12}@[a-z0-9]{8}-(?:[a-z0-9]{4}-){3}[a-z0-9]{12}\/IncomingWebhook\/[a-z0-9]{32}\/[a-z0-9]{8}-(?:[a-z0-9]{4}-){3}[a-z0-9]{12}/gi,
    matchAccuracy: 'high',
  },
  // Okta Access Token
  {
    name: 'oktaAccessToken',
    description: 'Okta access token',
    regex:
      /\b['"]?(?:okta)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?00[\w=-]{40}['"]?\b/gi,
    matchAccuracy: 'high',
  },
  // OpenShift User Token
  {
    name: 'openshiftUserToken',
    description: 'OpenShift user token',
    regex: /\bsha256~[\w-]{43}\b/g,
    matchAccuracy: 'high',
  },
];

const codeConfigPatterns: SensitiveDataPattern[] = [
  // Application Secrets
  {
    name: 'jwtSecrets',
    description: 'JWT secrets',
    regex: /\bjwt[_-]?secret\s*[:=]\s*['"][^'"]{16,}['"]\b/gi,
    matchAccuracy: 'high',
  },
  // Infrastructure & Deployment
  {
    name: 'kubernetesSecrets',
    description: 'Kubernetes secrets in YAML',
    regex:
      /\bkind:\s*["']?Secret["']?[\s\S]{0,2000}?\bdata:\s*[\s\S]{0,2000}?[a-zA-Z0-9_-]+:\s*[a-zA-Z0-9+/]{16,}={0,3}\b/gi,
    matchAccuracy: 'high',
    fileContext: /\.ya?ml$/i,
  },
  {
    name: 'dockerComposeSecrets',
    description: 'Docker Compose secrets',
    regex:
      /\b(?:MYSQL_ROOT_PASSWORD|POSTGRES_PASSWORD|REDIS_PASSWORD|MONGODB_PASSWORD)\s*[:=]\s*['"][^'"]{4,}['"]\b/gi,
    matchAccuracy: 'medium',
    fileContext: /docker-compose\.ya?ml$/i,
  },

  // Application Configuration
  {
    name: 'springBootSecrets',
    description: 'Spring Boot application secrets',
    regex:
      /\b(?:spring\.datasource\.password|spring\.security\.oauth2\.client\.registration\..*\.client-secret)\s*[:=]\s*['"][^'"]{4,}['"]\b/gi,
    matchAccuracy: 'medium',
    fileContext: /(?:application|bootstrap)(?:-\w+)?\.(?:properties|ya?ml)$/i,
  },
  {
    name: 'dotnetConnectionStrings',
    description: '.NET connection strings with credentials',
    regex:
      /\b(?:ConnectionStrings?|connectionString)\s*[:=]\s*['"][^'"]*(?:password|pwd)\s*=\s*[^;'"]{4,}[^'"]*['"]\b/gi,
    matchAccuracy: 'medium',
    fileContext: /(?:appsettings|web\.config).*\.(?:json|config)$/i,
  },

  // Generic High-Value Patterns
  {
    name: 'base64EncodedSecrets',
    description: 'Base64 encoded secrets in config',
    regex:
      /\b(?:secret|password|key|token)[_-]?(?:base64|encoded)?\s*[:=]\s*['"][A-Za-z0-9+/]{32,}={0,3}['"]\b/gi,
    matchAccuracy: 'medium',
  },
];

const cryptographicPatterns: SensitiveDataPattern[] = [
  // Private Keys (PEM Format)
  {
    name: 'rsaPrivateKey',
    description: 'RSA private key',
    regex:
      /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pkcs8PrivateKey',
    description: 'PKCS#8 private key',
    regex:
      /\b-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----\s*[\s\S]*?-----END (?:ENCRYPTED )?PRIVATE KEY-----\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'ecPrivateKey',
    description: 'Elliptic Curve private key',
    regex:
      /\b-----BEGIN EC PRIVATE KEY-----\s*[\s\S]*?-----END EC PRIVATE KEY-----\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'dsaPrivateKey',
    description: 'DSA private key',
    regex:
      /\b-----BEGIN DSA PRIVATE KEY-----\s*[\s\S]*?-----END DSA PRIVATE KEY-----\b/g,
    matchAccuracy: 'high',
  },

  // SSH Keys
  {
    name: 'opensshPrivateKey',
    description: 'OpenSSH private key',
    regex:
      /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    matchAccuracy: 'high',
  },
  {
    name: 'sshPrivateKeyEncrypted',
    description: 'SSH private key (SSH2 encrypted format)',
    regex:
      /\b-----BEGIN SSH2 ENCRYPTED PRIVATE KEY-----\s*[\s\S]*?-----END SSH2 ENCRYPTED PRIVATE KEY-----\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'puttyPrivateKey',
    description: 'PuTTY private key file',
    regex: /\bPuTTY-User-Key-File-[23]:\s*[\s\S]*?Private-MAC:\b/g,
    matchAccuracy: 'high',
  },
  // PGP Keys
  {
    name: 'pgpPrivateKey',
    description: 'PGP private key block',
    regex:
      /\b-----BEGIN PGP PRIVATE KEY BLOCK-----\s*[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----\b/g,
    matchAccuracy: 'high',
  },
  // Service-Specific Keys
  {
    name: 'firebaseServiceAccountPrivateKey',
    description: 'Firebase service account private key (JSON format)',
    regex:
      /\b"private_key":\s*"-----BEGIN PRIVATE KEY-----\\n[a-zA-Z0-9+/=\\n]+\\n-----END PRIVATE KEY-----"\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'openvpnClientPrivateKey',
    description: 'OpenVPN client private key',
    regex: /\b<key>\s*-----BEGIN[^<]*-----END[^<]*<\/key>\b/g,
    matchAccuracy: 'high',
  },

  // Cryptographic Parameters
  {
    name: 'dhParameters',
    description: 'Diffie-Hellman parameters',
    regex:
      /\b-----BEGIN DH PARAMETERS-----\s*[\s\S]*?-----END DH PARAMETERS-----\b/g,
    matchAccuracy: 'high',
  },

  // Modern Encryption Tools
  {
    name: 'ageSecretKey',
    description: 'Age encryption secret key',
    regex: /\bAGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}\b/g,
    matchAccuracy: 'high',
  },
  // Vault & Secrets Management
  {
    name: 'vaultBatchToken',
    description: 'HashiCorp Vault batch token',
    regex: /\bhvb\.[a-zA-Z0-9_-]{20,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'vaultServiceToken',
    description: 'HashiCorp Vault service token',
    regex: /\bhvs\.[a-zA-Z0-9_-]{20,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'vaultPeriodicToken',
    description: 'HashiCorp Vault periodic token',
    regex: /\bhvp\.[a-zA-Z0-9_-]{20,}\b/g,
    matchAccuracy: 'high',
  },

  // Generic Cryptographic Patterns
  {
    name: 'base64PrivateKeyContent',
    description: 'Base64 encoded private key content',
    regex:
      /\b(?:private[_-]?key|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/]{64,}={0,2}["']\b/gi,
    matchAccuracy: 'medium',
  },
  {
    name: 'hexEncodedKey',
    description: 'Hexadecimal encoded cryptographic key',
    regex: /\b(?:key|secret)\s*[:=]\s*["'][a-fA-F0-9]{32,}["']\b/gi,
    matchAccuracy: 'medium',
  },
];

const databasePatterns: SensitiveDataPattern[] = [
  // SQL Databases
  {
    name: 'postgresqlConnectionString',
    description: 'PostgreSQL connection string with credentials',
    regex: /\bpostgresql:\/\/[^:]+:[^@]+@[^/\s]+\/[^?\s]+\b/gi,
    matchAccuracy: 'high',
  },
  {
    name: 'mysqlConnectionString',
    description: 'MySQL connection string with credentials',
    regex: /\bmysql:\/\/[^:]+:[^@]+@[^/\s]+\/[^?\s]+\b/gi,
    matchAccuracy: 'high',
  },

  // NoSQL Databases
  {
    name: 'mongodbConnectionString',
    description: 'MongoDB connection string with credentials',
    regex:
      /\bmongodb:\/\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[0-9]+\/[a-zA-Z0-9._-]+\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'redisConnectionString',
    description: 'Redis connection string with credentials',
    regex:
      /\bredis:\/\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[0-9]+\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'redisAuthPassword',
    description: 'Redis AUTH password command',
    regex: /\bAUTH\s+[a-zA-Z0-9_-]{8,}\b/gi,
    matchAccuracy: 'medium',
  },

  // Search & Analytics
  {
    name: 'elasticsearchCredentials',
    description: 'Elasticsearch credentials in URL',
    regex: /\bhttps?:\/\/[^:]+:[^@]+@[^/\s]+:9200\b/gi,
    matchAccuracy: 'high',
  },

  // Document Databases
  {
    name: 'couchdbCredentials',
    description: 'CouchDB credentials in URL',
    regex: /\bhttp[s]?:\/\/[^:]+:[^@]+@[^/\s]+:5984\b/gi,
    matchAccuracy: 'high',
  },

  // Graph Databases
  {
    name: 'neo4jCredentials',
    description: 'Neo4j database credentials in URL',
    regex: /\bbolt[s]?:\/\/[^:]+:[^@]+@[^/\s]+:7687\b/gi,
    matchAccuracy: 'high',
  },

  // Time Series Databases
  {
    name: 'timescaledbConnectionString',
    description: 'TimescaleDB connection string with credentials',
    regex: /\btimescaledb:\/\/[^:]+:[^@]+@[^/\s]+\/[^?\s]+\b/gi,
    matchAccuracy: 'high',
  },

  // Column-Oriented Databases
  {
    name: 'clickhouseCredentials',
    description: 'ClickHouse connection string with credentials',
    regex: /\bclickhouse:\/\/[^:]+:[^@]+@[^/\s]+:8123\b/gi,
    matchAccuracy: 'high',
  },
  {
    name: 'cassandraConnectionString',
    description: 'Cassandra connection string with credentials',
    regex: /\bcassandra:\/\/[^:]+:[^@]+@[^/\s]+:9042\b/gi,
    matchAccuracy: 'high',
  },

  // Cloud Database Services
  {
    name: 'faunadbKey',
    description: 'FaunaDB secret key',
    regex: /\bfn[a-zA-Z0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'databricksApiToken',
    description: 'Databricks API token',
    regex: /\bdapi[a-f0-9]{32}(?:-\d)?\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pineconeApiKey',
    description: 'Pinecone API key',
    regex:
      /\bpinecone[\s\w]*(?:api|key|env)[\s:=]*["']?[a-zA-Z0-9_-]{32}["']?\b/gi,
    matchAccuracy: 'medium',
  },

  // Generic Database Patterns
  {
    name: 'databaseUrlWithCredentials',
    description: 'Generic database URL with embedded credentials',
    regex: /\b(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^/\s]+\b/gi,
    matchAccuracy: 'medium',
  },
  // ClickHouse Cloud API Secret Key
  {
    name: 'clickhouseCloudApiKey',
    description: 'ClickHouse Cloud API secret key',
    regex: /\b4b1d[A-Za-z0-9]{38}\b/g,
    matchAccuracy: 'high',
  },
  // Neon Database Connection String
  {
    name: 'neonDatabaseConnectionString',
    description: 'Neon database connection string',
    regex: /\bpostgres:\/\/[^:]+:[^@]+@[^/\s]*neon\.tech[^?\s]*\b/gi,
    matchAccuracy: 'high',
  },
  // Turso Database Token
  {
    name: 'tursoDatabaseToken',
    description: 'Turso database auth token',
    regex:
      /\b['"]?(?:turso|libsql)(?:[\s\w.-]{0,20})(?:token|auth)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9._-]{50,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Upstash Redis Token
  {
    name: 'upstashRedisToken',
    description: 'Upstash Redis REST token',
    regex:
      /\b['"]?(?:upstash)(?:[\s\w.-]{0,20})(?:token|key)['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9=]{40,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
];

const developerToolsPatterns: SensitiveDataPattern[] = [
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
];

const ecommerceContentPatterns: SensitiveDataPattern[] = [
  // E-commerce Platforms
  {
    name: 'shopifyStorefrontAccessToken',
    description: 'Shopify storefront API access token',
    regex: /\bshpatf_[0-9a-f]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'woocommerceConsumerKey',
    description: 'WooCommerce consumer key',
    regex: /\bck_[a-f0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'woocommerceConsumerSecret',
    description: 'WooCommerce consumer secret',
    regex: /\bcs_[a-f0-9]{40}\b/g,
    matchAccuracy: 'high',
  },

  // Content Management & CRM
  {
    name: 'contentfulAccessToken',
    description: 'Contentful access token',
    regex: /\bCFPAT-[0-9a-zA-Z]{20}\b/g,
    matchAccuracy: 'high',
  },

  // Email Marketing
  {
    name: 'mailchimpEcommerceApiKey',
    description: 'MailChimp E-commerce API key',
    regex: /\b[0-9a-f]{32}-[a-z]{2,3}[0-9]{1,2}\b/g,
    matchAccuracy: 'high',
  },
];

const versionControlPatterns: SensitiveDataPattern[] = [
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
  {
    name: 'gitlabRunnerAuthToken',
    description: 'GitLab runner authentication token',
    regex: /\bglrt-[0-9a-zA-Z_-]{20}\b/g,
    matchAccuracy: 'high',
  },
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

const mappingMonitoringPatterns: SensitiveDataPattern[] = [
  // Mapping Services
  {
    name: 'mapboxSecretToken',
    description: 'Mapbox secret access token',
    regex: /\bsk\.eyJ[a-zA-Z0-9._-]{87}\b/g,
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

const paymentProviderPatterns: SensitiveDataPattern[] = [
  {
    name: 'stripeSecretKey',
    description: 'Stripe secret key (sk_*, rk_*)',
    regex: /\b[rs]k_live_[a-zA-Z0-9]{20,247}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'stripeWebhookSecret',
    description: 'Stripe webhook signing secret',
    regex: /\bwhsec_[a-zA-Z0-9]{32,}\b/g,
    matchAccuracy: 'high',
  },
  // PayPal
  {
    name: 'paypalAccessToken',
    description: 'PayPal access token',
    regex: /\bA21AA[a-zA-Z0-9_-]{50,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'paypalBraintreeAccessToken',
    description: 'PayPal Braintree access token',
    regex:
      /\baccess_token\$(?:production|sandbox)\$[0-9a-z]{16}\$[0-9a-f]{32}\b/g,
    matchAccuracy: 'high',
  },

  // Square (consolidated - all formats)
  {
    name: 'squareAccessToken',
    description: 'Square access token (all formats)',
    regex:
      /\b(?:EAAAE[A-Za-z0-9_-]{94,}|sq0[a-z]?atp-[0-9A-Za-z\-_]{22,26})\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'squareOauthSecret',
    description: 'Square OAuth secret',
    regex: /\bsq0csp-[0-9A-Za-z\-_]{43}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'squareApplicationId',
    description: 'Square application ID',
    regex: /\bsq0ids-[a-zA-Z0-9_-]{43}\b/g,
    matchAccuracy: 'high',
  },

  // Shopify
  {
    name: 'shopifyPrivateAppPassword',
    description: 'Shopify private app password',
    regex: /\bshppa_[a-fA-F0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'shopifyAccessToken',
    description: 'Shopify access token',
    regex: /\bshpat_[a-fA-F0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'shopifyWebhookToken',
    description: 'Shopify webhook token',
    regex: /\bshpwh_[a-fA-F0-9]{32}\b/g,
    matchAccuracy: 'high',
  },

  // Other Payment Providers
  {
    name: 'adyenApiKey',
    description: 'Adyen API key',
    regex: /\bAQE[a-zA-Z0-9]{70,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'razorpayApiKey',
    description: 'Razorpay API key',
    regex: /\brzp_(?:test|live)_[a-zA-Z0-9]{14}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'flutterwaveKeys',
    description: 'Flutterwave API keys',
    regex: /\bFLW(?:PUBK|SECK)_(?:TEST|LIVE)-[a-h0-9]{32}-X\b/g,
    matchAccuracy: 'high',
  },

  // Cryptocurrency Exchanges
  // Coinbase
  {
    name: 'coinbaseAccessToken',
    description: 'Coinbase access token',
    regex:
      /\b['"]?(?:coinbase)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9_-]{64}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Kraken
  {
    name: 'krakenAccessToken',
    description: 'Kraken access token',
    regex:
      /\b['"]?(?:kraken)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9/=_+-]{80,90}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Kucoin
  {
    name: 'kucoinAccessToken',
    description: 'Kucoin access token',
    regex:
      /\b['"]?(?:kucoin)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{24}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  {
    name: 'kucoinSecretKey',
    description: 'Kucoin secret key',
    regex:
      /\b['"]?(?:kucoin)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Bittrex
  {
    name: 'bittrexAccessKey',
    description: 'Bittrex access key',
    regex:
      /\b['"]?(?:bittrex)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Binance
  {
    name: 'binanceApiKey',
    description: 'Binance API key',
    regex:
      /\b['"]?(?:binance)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[A-Za-z0-9]{64}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Bybit
  {
    name: 'bybitApiKey',
    description: 'Bybit API key',
    regex:
      /\b['"]?(?:bybit)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[A-Za-z0-9]{18,24}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // GoCardless
  {
    name: 'gocardlessApiToken',
    description: 'GoCardless API token',
    regex: /\blive_[a-z0-9\-_=]{40}\b/gi,
    matchAccuracy: 'high',
  },
  // Plaid
  {
    name: 'plaidApiToken',
    description: 'Plaid API token',
    regex:
      /\baccess-(?:sandbox|development|production)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
    matchAccuracy: 'high',
  },
];

const privateKeyPatterns: SensitiveDataPattern[] = [
  // Comprehensive Private Key Detection
  {
    name: 'privateKeyPem',
    description: 'Private key in PEM format (comprehensive)',
    regex:
      /-----BEGIN\s?(?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED)\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----[\s\S]*?-----END\s?(?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED)\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pgpPrivateKeyBlock',
    description: 'PGP private key block (comprehensive)',
    regex:
      /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----[\s\S]*?-----END\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g,
    matchAccuracy: 'high',
  },
];

const genericSecretPatterns: SensitiveDataPattern[] = [
  // URL-based Detection
  {
    name: 'credentialsInUrl',
    description: 'Credentials embedded in URL',
    regex: /\b[a-zA-Z]{3,10}:\/\/[^\\/\s:@]{3,20}:[^\\/\s:@]{3,20}@[^\s'"]+\b/g,
    matchAccuracy: 'high',
  },
  // Generic environment variable secrets
  {
    name: 'envVarSecrets',
    description: 'Environment variable secrets (KEY, SECRET, TOKEN, PASSWORD)',
    regex:
      /\b(?:\w+_)?(?:SECRET|secret|password|key|token|jwt_secret)(?:_\w+)?\s*=\s*["'][^"']{16,}["']/gi,
    matchAccuracy: 'medium',
  },
];

const slackPatterns: SensitiveDataPattern[] = [
  {
    name: 'slackBotToken',
    description: 'Slack bot token',
    regex: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'slackUserToken',
    description: 'Slack user token',
    regex: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'slackWorkspaceToken',
    description: 'Slack workspace token',
    regex: /\bxoxa-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'slackRefreshToken',
    description: 'Slack refresh token',
    regex: /\bxoxr-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    matchAccuracy: 'high',
  },
  // Slack Webhook URL
  {
    name: 'slackWebhookUrl',
    description: 'Slack incoming webhook URL',
    regex:
      /(?:https?:\/\/)?hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/gi,
    matchAccuracy: 'high',
  },
  // Slack App Token
  {
    name: 'slackAppToken',
    description: 'Slack app-level token',
    regex: /\bxapp-\d-[A-Z0-9]+-\d+-[a-z0-9]+\b/gi,
    matchAccuracy: 'high',
  },
  // Slack Config Access Token
  {
    name: 'slackConfigAccessToken',
    description: 'Slack configuration access token',
    regex: /\bxoxe\.xox[bp]-\d-[A-Z0-9]{163,166}\b/gi,
    matchAccuracy: 'high',
  },
  // Sendbird Access Token
  {
    name: 'sendbirdAccessToken',
    description: 'Sendbird access token',
    regex:
      /\b['"]?(?:sendbird)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{40}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // MessageBird API Token
  {
    name: 'messagebirdApiToken',
    description: 'MessageBird API token',
    regex:
      /\b['"]?(?:messagebird|message_bird|message-bird)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{25}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Mattermost Access Token
  {
    name: 'mattermostAccessToken',
    description: 'Mattermost access token',
    regex:
      /\b['"]?(?:mattermost)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{26}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Zendesk Secret Key
  {
    name: 'zendeskSecretKey',
    description: 'Zendesk secret key',
    regex:
      /\b['"]?(?:zendesk)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{40}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Freshdesk API Key
  {
    name: 'freshdeskApiKey',
    description: 'Freshdesk API key',
    regex:
      /\b['"]?(?:freshdesk)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{20}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Sendinblue (Brevo) API Token
  {
    name: 'sendinblueApiToken',
    description: 'Sendinblue (Brevo) API token',
    regex: /\bxkeysib-[a-f0-9]{64}-[a-z0-9]{16}\b/g,
    matchAccuracy: 'high',
  },
];

const socialMediaPatterns: SensitiveDataPattern[] = [
  {
    name: 'twitterBearerToken',
    description: 'Twitter/X Bearer token',
    regex: /\bAAAAAAAAAAAAAAAAAAAAA[a-zA-Z0-9%]{50,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'facebookAccessToken',
    description: 'Facebook/Meta access token',
    regex: /\bEAA[a-zA-Z0-9]{80,120}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'facebookPageAccessToken',
    description: 'Facebook/Meta page access token',
    regex: /\bEAAB[a-zA-Z0-9+/]{100,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'instagramAccessToken',
    description: 'Instagram access token',
    regex: /\bIGQV[a-zA-Z0-9_-]{100,}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'discordSocialBotToken',
    description: 'Discord social bot token',
    regex: /\b[MN][A-Za-z\d]{23}\.[A-Za-z\d-_]{6}\.[A-Za-z\d-_]{27}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'discordSocialWebhookUrl',
    description: 'Discord social webhook URL',
    regex:
      /\bhttps:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]{17,19}\/[A-Za-z0-9_-]{68}\b/g,
    matchAccuracy: 'high',
  },
  {
    name: 'pinterestAccessToken',
    description: 'Pinterest access token',
    regex: /\bpina_[a-zA-Z0-9]{32}\b/g,
    matchAccuracy: 'high',
  },
  // LinkedIn API Token
  {
    name: 'linkedinApiToken',
    description: 'LinkedIn API token',
    regex:
      /\b['"]?(?:linkedin|linked_in|linked-in)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-z0-9]{14,16}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // YouTube API Key
  {
    name: 'youtubeApiKey',
    description: 'YouTube Data API key',
    regex:
      /\b['"]?(?:youtube)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?AIza[a-zA-Z0-9_-]{35}['"]?\b/gi,
    matchAccuracy: 'high',
  },
  // TikTok API Token
  {
    name: 'tiktokApiToken',
    description: 'TikTok API token',
    regex:
      /\b['"]?(?:tiktok)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9_-]{40,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
];

const shippingLogisticsPatterns: SensitiveDataPattern[] = [
  // Shippo API Token
  {
    name: 'shippoApiToken',
    description: 'Shippo API token',
    regex: /\bshippo_(?:live|test)_[a-fA-F0-9]{40}\b/g,
    matchAccuracy: 'high',
  },
  // EasyPost API Token
  {
    name: 'easypostApiToken',
    description: 'EasyPost API token',
    regex: /\bEZAK[a-z0-9]{54}\b/gi,
    matchAccuracy: 'high',
  },
  // EasyPost Test API Token
  {
    name: 'easypostTestApiToken',
    description: 'EasyPost test API token',
    regex: /\bEZTK[a-z0-9]{54}\b/gi,
    matchAccuracy: 'high',
  },
  // Duffel API Token
  {
    name: 'duffelApiToken',
    description: 'Duffel travel API token',
    regex: /\bduffel_(?:test|live)_[a-z0-9_\-=]{43}\b/gi,
    matchAccuracy: 'high',
  },
  // Frame.io API Token
  {
    name: 'frameioApiToken',
    description: 'Frame.io API token',
    regex: /\bfio-u-[a-z0-9\-_=]{64}\b/gi,
    matchAccuracy: 'high',
  },
  // MaxMind License Key
  {
    name: 'maxmindLicenseKey',
    description: 'MaxMind license key',
    regex: /\b[A-Za-z0-9]{6}_[A-Za-z0-9]{29}_mmk\b/g,
    matchAccuracy: 'high',
  },
  // Asana Personal Access Token
  {
    name: 'asanaPersonalAccessToken',
    description: 'Asana personal access token',
    regex:
      /\b['"]?(?:asana)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[0-9]{16}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Monday.com API Token
  {
    name: 'mondayApiToken',
    description: 'Monday.com API token',
    regex:
      /\b['"]?(?:monday)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?eyJ[a-zA-Z0-9_-]{100,}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Trello API Key
  {
    name: 'trelloApiKey',
    description: 'Trello API key',
    regex:
      /\b['"]?(?:trello)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-f0-9]{32}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // Jira API Token (legacy format)
  {
    name: 'jiraApiToken',
    description: 'Jira API token',
    regex:
      /\b['"]?(?:jira)(?:[\s\w.-]{0,20})['"]?\s*(?::|=>|=)\s*['"]?[a-zA-Z0-9]{24}['"]?\b/gi,
    matchAccuracy: 'medium',
  },
  // SettleMint Application Access Token
  {
    name: 'settlemintApplicationAccessToken',
    description: 'SettleMint application access token',
    regex: /\bsm_aat_[a-zA-Z0-9]{16}\b/g,
    matchAccuracy: 'high',
  },
  // SettleMint Personal Access Token
  {
    name: 'settlemintPersonalAccessToken',
    description: 'SettleMint personal access token',
    regex: /\bsm_pat_[a-zA-Z0-9]{16}\b/g,
    matchAccuracy: 'high',
  },
  // SettleMint Service Access Token
  {
    name: 'settlemintServiceAccessToken',
    description: 'SettleMint service access token',
    regex: /\bsm_sat_[a-zA-Z0-9]{16}\b/g,
    matchAccuracy: 'high',
  },
];

export const allRegexPatterns: SensitiveDataPattern[] = [
  ...aiProviderPatterns,
  ...analyticsModernPatterns,
  ...authPatterns,
  ...awsPatterns,
  ...cloudProviderPatterns,
  ...codeConfigPatterns,
  ...cryptographicPatterns,
  ...databasePatterns,
  ...developerToolsPatterns,
  ...ecommerceContentPatterns,
  ...genericSecretPatterns,
  ...mappingMonitoringPatterns,
  ...paymentProviderPatterns,
  ...privateKeyPatterns,
  ...shippingLogisticsPatterns,
  ...slackPatterns,
  ...socialMediaPatterns,
  ...versionControlPatterns,
];
