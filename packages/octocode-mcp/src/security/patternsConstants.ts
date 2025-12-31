/**
 * Security Pattern Constants for Path and File Filtering
 *
 * Philosophy: MINIMAL BLOCKING - Only block ACTUAL SECRETS
 * - Block actual secrets: credentials, private keys, API tokens
 * - Block sensitive user data: password managers, cryptocurrency wallets
 * - Block credential stores: browser passwords, cloud provider keys
 *
 * IMPORTANT: This is for LOCAL tool access where the user controls their machine.
 * We should ONLY block files that contain actual secrets, not files that MIGHT
 * contain secrets. Users need to explore their codebase freely.
 *
 * Coverage (BLOCKED):
 * ✓ Environment files with secrets (.env*)
 * ✓ Private SSH keys (id_rsa, id_ed25519, etc.)
 * ✓ Cloud provider credential files (AWS, GCP, Azure)
 * ✓ Browser password stores (Login Data, logins.json)
 * ✓ Password managers (KeePass, 1Password, pass)
 * ✓ Cryptocurrency wallets (wallet.dat, keystore)
 * ✓ Shell & database history files (contain typed passwords)
 * ✓ Token files with actual tokens
 * ✓ Explicit secret files (secrets.yml, credentials, etc.)
 *
 * Explicitly ALLOWED for code exploration:
 * ✓ Config files (config.json, settings.json, *.conf)
 * ✓ Log files (*.log)
 * ✓ Database schema files (*.sql)
 * ✓ SQLite databases (*.db, *.sqlite) - content sanitized
 * ✓ Backups (*.bak, *.old, *~)
 * ✓ Public certificates (*.crt, *.cer)
 * ✓ Jupyter notebooks (*.ipynb)
 * ✓ CI/CD configs (visible in repos anyway)
 *
 */

/**
 * Directories and paths that contain sensitive security data
 */
export const IGNORED_PATH_PATTERNS: RegExp[] = [
  // Git directory (internal git data)
  /^\.git$/,
  /^\.git\//,
  /\/\.git$/,
  /\/\.git\//,

  // SSH directory (contains private keys)
  /^\.ssh$/,
  /^\.ssh\//,
  /\/\.ssh$/,
  /\/\.ssh\//,

  // AWS credentials directory
  /^\.aws$/,
  /^\.aws\//,
  /\/\.aws$/,
  /\/\.aws\//,

  // Docker credentials directory
  /^\.docker$/,
  /^\.docker\//,
  /\/\.docker$/,
  /\/\.docker\//,

  // Google Cloud credentials directory
  /^\.config\/gcloud$/,
  /^\.config\/gcloud\//,
  /\/\.config\/gcloud$/,
  /\/\.config\/gcloud\//,

  // Azure credentials directory
  /^\.azure$/,
  /^\.azure\//,
  /\/\.azure$/,
  /\/\.azure\//,

  // Kubernetes config directory
  /^\.kube$/,
  /^\.kube\//,
  /\/\.kube$/,
  /\/\.kube\//,

  // Terraform directories (can contain secrets in state)
  /^\.terraform$/,
  /^\.terraform\//,
  /\/\.terraform$/,
  /\/\.terraform\//,

  // Generic sensitive directories (common naming conventions)
  /^secrets$/,
  /^secrets\//,
  /\/secrets$/,
  /\/secrets\//,
  /^private$/,
  /^private\//,
  /\/private$/,
  /\/private\//,

  // Password managers (pass - Unix password manager)
  /^\.password-store$/,
  /^\.password-store\//,
  /\/\.password-store$/,
  /\/\.password-store\//,

  // Browser credential storage
  /\.mozilla\/firefox\//,
  /\.config\/chromium\//,
  /\.config\/google-chrome\//,
  /Library\/Application Support\/Google\/Chrome\//,
  /Library\/Application Support\/Firefox\//,

  // macOS Keychain
  /Library\/Keychains\//,

  // Email clients
  /^\.thunderbird$/,
  /^\.thunderbird\//,
  /\/\.thunderbird$/,
  /\/\.thunderbird\//,
  /^\.evolution$/,
  /^\.evolution\//,
  /\/\.evolution$/,
  /\/\.evolution\//,

  // Container/VM tools
  /^\.vagrant$/,
  /^\.vagrant\//,
  /\/\.vagrant$/,
  /\/\.vagrant\//,
  /^\.minikube$/,
  /^\.minikube\//,
  /\/\.minikube$/,
  /\/\.minikube\//,

  // Cryptocurrency wallets
  /^\.bitcoin$/,
  /^\.bitcoin\//,
  /\/\.bitcoin$/,
  /\/\.bitcoin\//,
  /^\.ethereum$/,
  /^\.ethereum\//,
  /\/\.ethereum$/,
  /\/\.ethereum\//,
  /^\.electrum$/,
  /^\.electrum\//,
  /\/\.electrum$/,
  /\/\.electrum\//,
];

/**
 * Files that contain sensitive security data (credentials, secrets, API keys)
 */
export const IGNORED_FILE_PATTERNS: RegExp[] = [
  // Environment files with secrets
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.development$/,
  /^\.env\.production$/,
  /^\.env\.test$/,
  /^\.env\..+$/,
  /\.env$/,
  /\.env\.local$/,
  /\.env\..+$/,

  // Credential files
  /^\.npmrc$/,
  /^\.pypirc$/,
  /^\.netrc$/,
  /^\.dockercfg$/,
  /^\.docker\/config\.json$/,
  /^credentials$/,
  /^\.credentials$/,
  /^\.aws\/credentials$/,
  /^\.aws\/config$/,

  // SSH keys (specific patterns)
  /^\.ssh\/.*$/,
  /^id_rsa$/,
  /^id_dsa$/,
  /^id_ecdsa$/,
  /^id_ed25519$/,
  /^id_rsa\.pub$/,
  /^id_dsa\.pub$/,
  /^id_ecdsa\.pub$/,
  /^id_ed25519\.pub$/,
  /^known_hosts$/,
  /^authorized_keys$/,

  // SSH key patterns (broad - any file ending with key types)
  /.*_rsa$/,
  /.*_dsa$/,
  /.*_ecdsa$/,
  /.*_ed25519$/,

  // Private keys (specific patterns)
  /^private.*\.key$/,
  /^private.*\.pem$/,
  /^.*[-_]private[-_].*\.key$/,
  /^.*[-_]private[-_].*\.pem$/,
  /[-_]private\.key$/,
  /[-_]private\.pem$/,
  /^.*\.private\.key$/,
  /^.*\.private\.pem$/,

  // Certificates and keys (broad - blocks ALL .pem, .key, .crt, .cer files)
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /\.cer$/,

  // Certificate stores and keystores (always sensitive)
  /\.keystore$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /\.ppk$/, // PuTTY private keys

  // Cloud provider credentials
  /^service[-_]account.*\.json$/,
  /^.*-service[-_]account.*\.json$/,
  /^application[-_]default[-_]credentials\.json$/,
  /^gcloud[-_]credentials\.json$/,

  // Kubernetes
  /^kubeconfig$/,
  /^\.kube\/config$/,
  /^k8s[-_]config$/,

  // Terraform
  /^terraform\.tfstate$/,
  /^terraform\.tfstate\.backup$/,
  /^terraform\.tfvars$/,
  /^\.terraform\.lock\.hcl$/,

  // Database credentials
  /^\.pgpass$/,
  /^\.my\.cnf$/,
  /^\.psqlrc$/,

  // Ruby/Rails secrets
  /^secrets\.yml$/,
  /^master\.key$/,
  /^config\/master\.key$/,

  // PHP/WordPress
  /^wp-config\.php$/,

  // Mobile app secrets
  /^google-services\.json$/,
  /^GoogleService-Info\.plist$/,
  /^keystore\.properties$/,
  /\.mobileprovision$/,
  /\.provisionprofile$/,

  // Token files (specific patterns)
  /^\.token$/,
  /^token\.txt$/,
  /^access_token$/,
  /^refresh_token$/,
  /^bearer_token$/,
  /^auth_token$/,

  // VPN configs - moved to group with other VPN patterns below
  // /\.ovpn$/, // Moved to VPN section

  // OAuth/SAML (specific files)
  /^client_secret.*\.json$/,
  /^oauth2.*\.json$/,

  // Password/secret files (specific names only)
  /^\.password$/,
  /^password\.txt$/,
  /^passwords\.txt$/,
  /^\.secret$/,
  /^secret\.txt$/,
  /^secrets\.txt$/,
  /^apikey\.txt$/,
  /^api_key\.txt$/,
  /^api-key\.txt$/,

  // Git credentials
  /^\.git-credentials$/,
  /^git-credentials$/,

  // Web server authentication
  /^\.htpasswd$/,

  // Composer (PHP) authentication
  /^auth\.json$/,

  // FTP credentials
  /^\.ftpconfig$/,
  /^ftpconfig\.json$/,

  // Windows credentials
  /^_netrc$/,

  // Shell history (can contain secrets in commands)
  /^\.bash_history$/,
  /^\.zsh_history$/,
  /^\.sh_history$/,
  /^\.history$/,

  // Database history (can contain credentials in queries)
  /^\.mysql_history$/,
  /^\.psql_history$/,
  /^\.sqlite_history$/,

  // Python/pip authentication
  /^\.pip\/pip\.conf$/,

  // Jenkins credentials
  /^credentials\.xml$/,
  /^secrets\/.*\.xml$/,

  // Unix shadow files
  /^shadow$/,
  /^shadow\.bak$/,
  /^gshadow$/,

  // Email client configs (can contain passwords)
  /^\.muttrc$/,
  /^\.mailrc$/,

  // IRC client configs (can contain passwords)
  /^\.ircrc$/,

  // S3 credentials
  /^\.s3cfg$/,
  /^s3cfg$/,

  // Slack tokens
  /^\.slack-token$/,
  /^slack[-_]token$/,

  // GitHub tokens
  /^\.github[-_]token$/,
  /^github[-_]token$/,

  // Heroku credentials
  /^\.netrc\.heroku$/,

  // CircleCI local config
  /^\.circleci\/local[-_]config\.yml$/,

  // Ansible vault files
  /^vault[-_]pass.*\.txt$/,
  /^\.vault[-_]pass.*$/,

  // NPM automation tokens
  /^\.npm[-_]token$/,

  // Maven settings (can contain repository credentials)
  /^settings\.xml$/,
  /^\.m2\/settings\.xml$/,

  // Gradle credentials
  /^gradle\.properties$/,
  /^\.gradle\/gradle\.properties$/,

  // Subversion credentials
  /^\.subversion\/auth\/.*$/,

  // Browser credential storage (CRITICAL - contains saved passwords)
  /^Login Data$/,
  /^Cookies$/,
  /\/Login Data$/,
  /\/Cookies$/,
  /\/logins\.json$/,
  /\/key[34]\.db$/,
  /\.mozilla\/firefox\/.*\/logins\.json$/,
  /\.mozilla\/firefox\/.*\/key[34]\.db$/,
  /\.config\/chromium\/.*\/Login Data$/,
  /\.config\/google-chrome\/.*\/Login Data$/,

  // Password manager databases (CRITICAL)
  /\.kdbx$/, // KeePass database
  /\.kdb$/, // KeePass (old format)
  /^1Password\.sqlite$/,
  /^1Password.*\.sqlite$/,
  /\.agilekeychain\//,
  /\.opvault\//,
  /^password-store$/,
  /^passwords\.kdbx$/,
  /^keepass\.kdbx$/,

  // Cryptocurrency wallet files (CRITICAL)
  /^wallet\.dat$/,
  /^default_wallet$/,
  /^\.bitcoin\/wallet\.dat$/,
  /^\.ethereum\/keystore\/.*$/,
  /^\.electrum\/wallets\/.*$/,
  /\/keystore\/UTC--.*$/,

  // Database dump files - ONLY block actual database dumps, allow schema files
  // /\.sql$/, // ALLOWED - SQL schema files are useful for code understanding
  // /\.db$/, // ALLOWED - SQLite databases may contain app data
  // /\.sqlite$/, // ALLOWED - content is sanitized for secrets
  // /\.sqlite3$/, // ALLOWED - content is sanitized for secrets
  /^dump\.rdb$/, // Redis dump (actual data)
  /^mongodb\.dump$/, // MongoDB dump (actual data)
  /\.bson$/, // MongoDB binary (actual data)
  /\.dump$/, // Generic dump files

  // Backup files - ALLOWED for code exploration
  // /~$/, // ALLOWED - Unix backup files useful for understanding changes
  // /\.bak$/, // ALLOWED - backup files useful for diff analysis
  // /\.backup$/, // ALLOWED
  // /\.old$/, // ALLOWED
  // /\.orig$/, // ALLOWED
  // /\.save$/, // ALLOWED

  // Editor temporary/swap files - ALLOWED (contain code being edited)
  // /\.swp$/, // ALLOWED - Vim swap files
  // /\.swo$/, // ALLOWED
  // /\.swn$/, // ALLOWED
  // /^\.#.*$/, // ALLOWED - Emacs lock files
  // /^\.#.+$/, // ALLOWED

  // IDE configuration - ALLOWED (visible in repos anyway)
  // Note: dataSources.xml may contain DB passwords - keep blocked
  /^\.idea\/dataSources\.xml$/, // May contain database passwords
  /^\.idea\/webServers\.xml$/, // May contain server credentials
  /^\.idea\/deployment\.xml$/, // May contain deployment credentials
  // /^\.vscode\/settings\.json$/, // ALLOWED
  // /^\.vscode\/launch\.json$/, // ALLOWED

  // CI/CD configuration files - ALLOWED (public in repos anyway)
  // Encrypted secrets in these files are safe - only blocked explicitly named secret files
  // /^\.travis\.yml$/, // ALLOWED
  // /^\.gitlab-ci\.yml$/, // ALLOWED
  // /^bitbucket-pipelines\.yml$/, // ALLOWED
  // /^\.circleci\/config\.yml$/, // ALLOWED
  // /^\.github\/workflows\/.*\.yml$/, // ALLOWED
  // /^\.github\/workflows\/.*\.yaml$/, // ALLOWED
  // /^azure-pipelines\.yml$/, // ALLOWED
  // /^Jenkinsfile$/, // ALLOWED
  // /^\.drone\.yml$/, // ALLOWED

  // Vagrant/VM private keys
  /^\.vagrant\/machines\/.*\/private_key$/,
  /^\.vagrant\.d\/insecure_private_key$/,

  // Session and cookie files
  /^cookies\.txt$/,
  /^\.cookies$/,
  /^session$/,
  /^sessionid$/,
  /^\.wget-hsts$/,

  // Core dumps (contain memory with potential secrets)
  /^core$/,
  /^core\.\d+$/,
  /\.core$/,
  /\.dmp$/, // Windows crash dump
  /\.mdmp$/, // Windows minidump

  // Jupyter notebooks - ALLOWED (content is sanitized for secrets)
  // /\.ipynb$/, // ALLOWED - notebooks are code, sanitizer handles secrets
  // /\.ipynb_checkpoints\//, // ALLOWED

  // Generic configuration files - ALLOWED for code exploration
  // Note: Content sanitizer will redact any actual secrets found
  // /^config\.json$/, // ALLOWED - often just settings, not secrets
  // /^config\.yaml$/, // ALLOWED
  // /^config\.yml$/, // ALLOWED
  // /^settings\.json$/, // ALLOWED
  // /^configuration\.json$/, // ALLOWED
  // /^app\.config$/, // ALLOWED
  // /^appsettings\.json$/, // ALLOWED
  // /^appsettings\..*\.json$/, // ALLOWED

  // Log files - ALLOWED for debugging
  // Note: Content sanitizer will redact any secrets logged accidentally
  // /\.log$/, // ALLOWED - logs are essential for debugging
  // /\.out$/, // ALLOWED
  // /^debug\.log$/, // ALLOWED
  // /^error\.log$/, // ALLOWED
  // /^access\.log$/, // ALLOWED

  // Windows credential files
  /^Credentials$/,
  /^NTUSER\.DAT$/,
  /^SAM$/,

  // macOS keychain files
  /\.keychain$/,
  /\.keychain-db$/,

  // Certificate signing requests (can reveal private key info)
  /\.csr$/,

  // Additional token/secret files
  /^oauth[-_]token.*$/,
  /^bearer[-_]token.*$/,
  /^jwt[-_]token.*$/,
  /^\.token\..*$/,
  /^api[-_]keys?\..*$/,

  // Additional database history files
  /^\.redis_history$/,
  /^\.mongo_history$/,
  /^\.dbshell$/,

  // Docker compose with potential secrets
  /^docker-compose\.override\.yml$/,
  /^docker-compose\..*\.yml$/,

  // Additional cloud provider files
  /^\.gcp[-_]credentials\.json$/,
  /^\.azure[-_]credentials$/,
  /^\.do[-_]token$/, // DigitalOcean
  /^\.linode[-_]token$/,

  // Email/SMTP credentials
  /^\.msmtprc$/,
  /^\.fetchmailrc$/,

  // VPN config files - ONLY block specific VPN configs, not all .conf
  // /\.conf$/, // REMOVED - too broad, blocks all config files
  /^wireguard\.conf$/, // WireGuard VPN config
  /^wg[0-9]+\.conf$/, // WireGuard interface configs
  /\.ovpn$/, // OpenVPN configs (moved here for grouping)

  // Private documentation (sometimes contains passwords)
  /^PASSWORDS\.md$/,
  /^SECRETS\.md$/,
  /^CREDENTIALS\.md$/,
  /^ACCESS\.md$/,

  // Laravel .env variants
  /^\.env\.dusk\..*$/,

  // Private keys for code signing
  /\.asc$/, // ASCII armored keys
  /\.gpg$/, // GPG keys

  // SSH config (can contain jump host credentials)
  /^\.ssh\/config$/,

  // RDP files (Windows Remote Desktop - contain credentials)
  /\.rdp$/,

  // Credential wallets
  /^credentials\.db$/,
  /^credentials\.sqlite$/,

  // Postman collections (can contain API keys)
  /\.postman_environment\.json$/,

  // Additional Ruby secrets
  /^\.ruby-env$/,
  /^\.rbenv-vars$/,

  // Additional Python secrets
  /^\.python-env$/,

  // Node.js environment
  /^\.node-env$/,

  // Rsync password file
  /^\.rsync[-_]password$/,
  /^rsync[-_]password$/,
];
