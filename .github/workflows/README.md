# GitHub Actions Workflows

This directory contains the CI/CD workflows for the Octocode-MCP monorepo. Each workflow automates a specific part of the development and release process.

## 📋 Overview

| Workflow | Trigger | Purpose | Duration |
|----------|---------|---------|----------|
| [CI - Lint, Build & Test](#ci---lint-build--test-ciyml) | Pull Requests | Quality checks before merge | ~3-5 min |
| [Alpha Publishing](#alpha-publishing-publish-alphayml) | Push to `main`/`master` | Auto-publish alpha versions | ~5-8 min |
| [Production Publishing](#production-publishing-publish-octocodeyml) | Push to `publish-octocode*` branch | Official releases to npm | ~4-6 min |
| [Release Binaries](#release-binaries-releasesyml) | GitHub Release published | Build & upload platform binaries | ~8-10 min |

## Workflows

### CI - Lint, Build & Test (`ci.yml`)

**Trigger:** When a Pull Request is opened or updated.

**Purpose:** Ensures code quality and prevents broken code from being merged into the main branches.

**What it does:**
1. ✅ **Lint Check** - Runs ESLint to enforce code style and quality standards
2. ✅ **Build Validation** - Compiles all packages to catch TypeScript errors, verifies `packages/octocode-mcp/dist/index.js` exists
3. ✅ **Test Suite** - Runs the complete test suite with coverage
4. 📊 **PR Validation Complete** - Summary job confirms all checks passed

**Concurrency:** Cancels in-progress runs for the same PR when new commits are pushed (saves CI resources).

**Requirements to merge:**
- All linting rules must pass
- All packages must build successfully (output: `dist/index.js`)
- All tests must pass

**Example Output:**
```
✅ All CI checks passed!
   Lint: success
   Build: success
   Test: success
```

---

### Alpha Publishing (`publish-alpha.yml`)

**Trigger:** Every push to `main` or `master` branches (typically after a PR is merged).

**Purpose:** Automatically publishes alpha/development versions of all packages to npm for testing and early adoption.

**What it does:**

#### Phase 1: Verification
- Runs full quality checks (lint, build, test)

#### Phase 2: Package Discovery
- Scans the `packages/` directory for all publishable packages
- Filters out private packages (packages with `"private": true`)
- Outputs a list of packages to publish

#### Phase 3: Multi-Package Publishing
For each package found:
1. 🔍 **Find Latest Alpha** - Checks npm for existing alpha versions (e.g., `7.0.7-alpha.1`, `7.0.7-alpha.2`, etc.)
2. 🔢 **Increment Alpha Number** - Calculates the next alpha version number
3. 🏷️ **Update Version** - Temporarily updates `package.json` to the new alpha version
4. 🚀 **Publish to npm** - Publishes with the `alpha` tag (NOT `latest`)
5. ⏮️ **Revert Version** - Restores original version in `package.json`
6. ✅ **Confirm** - Verifies successful publication

#### Phase 4: Discord Notification (Optional)
- Sends a notification to Discord webhook if configured
- Includes commit info, package count, and status
- Gracefully skips if webhook is not configured

**Important Notes:**
- ⚠️ Alpha versions are **NOT** published to the `latest` npm tag
- ⚠️ Users must explicitly install alpha versions: `npm install octocode-mcp@alpha`
- ⚠️ Alpha versions are auto-incremented (e.g., `7.0.7-alpha.1`, `7.0.7-alpha.2`)
- ⚠️ The workflow **fails** if the version in `package.json` already contains `-alpha` suffix

**Version Pattern:**
```
Base version in package.json: 7.0.7
Published alpha versions:
  - 7.0.7-alpha.1
  - 7.0.7-alpha.2
  - 7.0.7-alpha.3
  ... (auto-incremented on each push)
```

**Required Secrets:**
- `NPM_TOKEN` - npm authentication token with publish permissions
- `DISCORD_WEBHOOK` (optional) - Discord webhook URL for notifications

**Example Output:**
```
🚀 Processing package: octocode-mcp@7.0.7
📊 Latest alpha number: 2
🆕 New alpha number: 3
🏷️ New alpha version: 7.0.7-alpha.3
✅ Successfully published octocode-mcp@7.0.7-alpha.3 to npm with 'alpha' tag
```

---

### Production Publishing (`publish-octocode.yml`)

**Trigger:** Push to `publish-octocode` or `publish-octocode-*` branches.

**Purpose:** Official production releases to npm.

**What it does:**

1. ✅ **Quality Checks** - Full validation suite (lint, build, test)
2. 🔍 **Version Check** - Verifies version doesn't already exist on npm
3. 📦 **Publish to npm** - Publishes `octocode-mcp` with the `latest` tag

**Publishing Targets:**
- **npm Registry:** `https://registry.npmjs.org/octocode-mcp`

**Authentication:**
- **npm:** Uses `NPM_TOKEN` secret

**Required Secrets:**
- `NPM_TOKEN` - npm authentication token with publish permissions
- `DISCORD_WEBHOOK` (optional) - Discord webhook URL for notifications

**How to Release:**
```bash
# 1. Update version in package.json
cd packages/octocode-mcp
yarn version 10.0.1

# 2. Commit the version change
git add .
git commit -m "chore(release): bump to v10.0.1"

# 3. Create and push to publish branch
git checkout -b publish-octocode
git push origin publish-octocode

# 4. GitHub Actions will automatically:
#    - Run all tests
#    - Check version doesn't exist on npm
#    - Publish to npm with 'latest' tag
```

**Example Output:**
```
🚀 Publishing package: octocode-mcp@10.0.1
✅ npm version 10.0.1 does not exist, proceeding...
🚀 Publishing octocode-mcp@10.0.1 to npm with 'latest' tag...
✅ Successfully published octocode-mcp@10.0.1 to npm
```

---

### Release Binaries (`releases.yml`)

**Trigger:** When a GitHub Release is published, or via manual workflow dispatch.

**Purpose:** Build and upload standalone binaries for all platforms.

**What it does:**

1. 🔨 **Build Binaries** - Compiles standalone executables using Bun for:
   - Linux x64 (glibc)
   - Linux ARM64 (glibc)
   - Linux x64 (musl/Alpine)
   - macOS ARM64 (Apple Silicon)
   - macOS x64 (Intel)
   - Windows x64
2. 📦 **Build JS Source** - Also builds `dist/index.js` for Node.js users
3. 📤 **Upload to Release** - Attaches all binaries to the GitHub Release
4. 🔐 **Create Checksums** - Generates SHA256 checksums for verification

**Required Permissions:**
- `contents: write` - To upload release assets

**Example Output:**
```
🎉 Binaries Released
Successfully built and uploaded binaries for all platforms
Platforms: Linux x64, Linux ARM64, Alpine, macOS ARM64, macOS x64, Windows
```

---

## Workflow Dependencies

```mermaid
graph TD
    A[Developer] -->|Opens PR| B[ci.yml]
    B -->|✅ Passes| C[Merge to main]
    C -->|Auto-trigger| D[publish-alpha.yml]
    D -->|Publishes| E[npm: octocode-mcp@alpha]
    
    A -->|Push publish-octocode branch| F[publish-octocode.yml]
    F -->|Publishes| G[npm: octocode-mcp@latest]
    
    A -->|Create GitHub Release| H[releases.yml]
    H -->|Uploads| I[Platform Binaries]
```

## Environment Setup

### Required Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Required For | How to Get |
|--------|--------------|------------|
| `NPM_TOKEN` | Alpha & Production publishing | [npm Access Tokens](https://www.npmjs.com/settings/YOUR_USERNAME/tokens) - Create "Automation" token |
| `DISCORD_WEBHOOK` | Discord notifications (optional) | Discord Server Settings → Integrations → Webhooks |

### Required Permissions

The workflows use the following GitHub token permissions:

- `contents: write` - To upload release assets (releases workflow)
- `contents: read` - To read repository contents (all workflows)

## Monitoring & Debugging

### View Workflow Runs
- Navigate to **Actions** tab in GitHub
- Click on a specific workflow run to see detailed logs

### Common Issues

#### Alpha Publishing Fails
```
❌ ERROR: package.json version already contains '-alpha' suffix!
```
**Solution:** Ensure `package.json` version is a clean base version (e.g., `7.0.7`, not `7.0.7-alpha.1`)

#### npm Publishing Unauthorized
```
❌ npm ERR! code E401
❌ npm ERR! Unable to authenticate
```
**Solution:** Verify `NPM_TOKEN` secret is valid and has publish permissions

#### CI Validation Fails
```
❌ Validation checks failed!
```
**Solution:** Check the specific step that failed:
- Lint errors: Run `yarn lint:fix` locally
- Build errors: Run `yarn build` locally
- Test failures: Run `yarn test` locally
- Package integrity: Validate `package.json` syntax

### Testing Workflows Locally

```bash
# Run the same checks that PR validation runs
yarn lint        # Lint check
yarn build       # Build validation
yarn test        # Test suite

# Validate package integrity
node -e "console.log(require('./packages/octocode-mcp/package.json'))"
```

## Best Practices

### When to Use Each Workflow

- **CI** - Automatic, runs on every PR
- **Alpha Publishing** - Automatic, runs after merging to main/master
- **Production Publishing** - Manual, push to `publish-octocode` branch
- **Release Binaries** - Automatic when GitHub Release is published

### Release Workflow

1. 🔧 **Development** - Make changes on feature branch
2. 🔍 **PR Review** - Open PR → `ci.yml` runs
3. ✅ **Merge** - After approval → `publish-alpha.yml` publishes alpha version
4. 🧪 **Testing** - Test alpha version: `npm install octocode-mcp@alpha`
5. 📦 **Publish** - Push to `publish-octocode` branch → `publish-octocode.yml` publishes to npm
6. 🎉 **Release** - Create GitHub Release → `releases.yml` builds and uploads binaries

### Version Numbering

```
Development:  7.0.7-alpha.1, 7.0.7-alpha.2, ...
Production:   7.0.8 (when ready to release)
Next Dev:     7.0.8-alpha.1, 7.0.8-alpha.2, ...
```

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [npm Publishing Guide](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [MCP Registry](https://github.com/modelcontextprotocol/registry)
- [Semantic Versioning](https://semver.org/)

---

**Last Updated:** December 2025  
**Maintainer:** Octocode-MCP Team

