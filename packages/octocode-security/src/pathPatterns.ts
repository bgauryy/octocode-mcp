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
