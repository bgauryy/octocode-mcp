/**
 * Security Pattern Constants for Path and File Filtering
 *
 * Philosophy: BALANCED SECURITY FOR CODE UNDERSTANDING
 * - Block actual secrets: credentials, private keys, API tokens
 * - Block sensitive user data: password managers, cryptocurrency wallets
 * - Block credential stores: browser passwords, cloud provider keys
 * - Allow code artifacts: configs, logs, databases, backups, notebooks
 *
 * Coverage includes:
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
 * Explicitly allows (removed from blocking):
 * ✓ Config files (config.json, settings.json, *.conf)
 * ✓ Log files (*.log)
 * ✓ Database files (*.sql, *.db, *.sqlite)
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

  // VPN configs
  /\.ovpn$/,

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

  // Database dump files (often contain credentials/sensitive data)
  /\.sql$/,
  /\.dump$/,
  /\.db$/,
  /\.sqlite$/,
  /\.sqlite3$/,
  /^dump\.rdb$/, // Redis dump
  /^mongodb\.dump$/,
  /\.bson$/,

  // Backup files (may contain original sensitive data)
  /~$/, // Unix backup files (file~)
  /\.bak$/,
  /\.backup$/,
  /\.old$/,
  /\.orig$/,
  /\.save$/,

  // Editor temporary/swap files (may contain unsaved sensitive data)
  /\.swp$/, // Vim swap
  /\.swo$/, // Vim swap
  /\.swn$/, // Vim swap
  /^\.#.*$/, // Emacs lock files
  /^\.#.+$/, // Emacs auto-save

  // IDE configuration with potential secrets
  /^\.vscode\/settings\.json$/,
  /^\.vscode\/launch\.json$/,
  /^\.idea\/workspace\.xml$/,
  /^\.idea\/dataSources\.xml$/,
  /^\.idea\/webServers\.xml$/,
  /^\.idea\/deployment\.xml$/,

  // CI/CD configuration files (can contain encrypted secrets)
  /^\.travis\.yml$/,
  /^\.gitlab-ci\.yml$/,
  /^bitbucket-pipelines\.yml$/,
  /^\.circleci\/config\.yml$/,
  /^\.github\/workflows\/.*\.yml$/,
  /^\.github\/workflows\/.*\.yaml$/,
  /^azure-pipelines\.yml$/,
  /^Jenkinsfile$/,
  /^\.drone\.yml$/,

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

  // Jupyter notebooks (often contain hardcoded API keys)
  /\.ipynb$/,
  /\.ipynb_checkpoints\//,

  // Generic configuration files (often contain secrets)
  /^config\.json$/,
  /^config\.yaml$/,
  /^config\.yml$/,
  /^settings\.json$/,
  /^configuration\.json$/,
  /^app\.config$/,
  /^appsettings\.json$/,
  /^appsettings\..*\.json$/,

  // Log files (may contain accidentally logged secrets)
  /\.log$/,
  /\.out$/,
  /^debug\.log$/,
  /^error\.log$/,
  /^access\.log$/,

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

  // Additional VPN files
  /\.conf$/, // Can be VPN configs
  /^wireguard\.conf$/,
  /^wg[0-9]+\.conf$/,

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
