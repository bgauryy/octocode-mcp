# Dependency Upgrade Roadmap

> Tracking major dependency upgrades that require migration effort.
> Last updated: January 7, 2026

---

## ⚠️ Pending Major Upgrades

These dependencies have major version updates available but require migration work before upgrading.

### 1. ESLint 8 → 9

| | |
|---|---|
| **Package** | `eslint` |
| **Current** | `^8.57.0` |
| **Latest** | `9.39.2` |
| **Affected Packages** | `octocode-mcp`, `octocode-cli`, `octocode-vscode`, `octocode-shared` |

#### Breaking Changes
- **Flat Config is now default** - The `.eslintrc.*` configuration format is deprecated
- New `eslint.config.js` (or `.mjs`/`.cjs`) format required
- Plugin configuration syntax changed significantly
- Some rules renamed or removed

#### Migration Steps
1. Create `eslint.config.js` at monorepo root
2. Convert existing `.eslintrc.json` rules to flat config format
3. Update `@typescript-eslint/*` plugin configuration
4. Update `eslint-plugin-prettier` configuration
5. Test all packages with new config

#### Resources
- [ESLint Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [typescript-eslint Flat Config](https://typescript-eslint.io/getting-started/typed-linting/)

---

### 2. Zod 3 → 4

| | |
|---|---|
| **Package** | `zod` |
| **Current** | `^3.24.0` |
| **Latest** | `4.2.1` |
| **Affected Packages** | `octocode-mcp` |

#### Breaking Changes
- New error handling API
- Schema method changes
- Type inference improvements (may require type adjustments)
- `zod-to-json-schema` compatibility needs verification

#### Migration Steps
1. Review [Zod v4 changelog](https://github.com/colinhacks/zod/releases)
2. Update schema definitions for API changes
3. Test all tool schema validations
4. Verify `zod-to-json-schema` compatibility
5. Update `@modelcontextprotocol/sdk` peer dependency support

#### Notes
- `@modelcontextprotocol/sdk` already supports `"zod": "^3.25 || ^4.0"`
- Consider waiting for ecosystem stabilization

---

### 3. @inquirer/prompts 7 → 8

| | |
|---|---|
| **Package** | `@inquirer/prompts` |
| **Current** | `^7.2.1` |
| **Latest** | `8.1.0` |
| **Affected Packages** | `octocode-cli` |

#### Breaking Changes
- Node.js 20.12+ or 22.13+ or 23.5+ required
- Potential API changes in prompt types
- Theme/styling changes

#### Migration Steps
1. Verify Node.js version requirements align with `engines` field
2. Review prompt usage in CLI flows
3. Test interactive prompts across all CLI commands
4. Update any custom theming/styling

---

### 4. Vite 6 → 7

| | |
|---|---|
| **Package** | `vite` |
| **Current** | `^6.0.0` |
| **Latest** | `7.3.0` |
| **Affected Packages** | `octocode-cli` |

#### Breaking Changes
- Node.js 20.19+ or 22.12+ required
- Potential plugin compatibility issues
- Build configuration changes

#### Migration Steps
1. Update Node.js engine requirements
2. Review `vite.config.ts` for deprecated options
3. Test CLI build output
4. Verify bundle size and performance

---

### 5. @vscode/vsce 2 → 3

| | |
|---|---|
| **Package** | `@vscode/vsce` |
| **Current** | `^2.22.0` |
| **Latest** | `3.7.1` |
| **Affected Packages** | `octocode-vscode` |

#### Breaking Changes
- Node.js 20+ required
- CLI command changes
- Package validation changes

#### Migration Steps
1. Review `package` and `publish` script usage
2. Test extension packaging workflow
3. Verify VS Code marketplace compatibility

---

### 6. @types/node 22 → 25

| | |
|---|---|
| **Package** | `@types/node` |
| **Current** | `^22.15.29` |
| **Latest** | `25.0.3` |
| **Affected Packages** | All packages |

#### Breaking Changes
- Node.js 24 type definitions
- Potential type incompatibilities with Node.js 20/22 runtime
- New/changed APIs may require code adjustments

#### Migration Steps
1. Evaluate if Node.js 24 features are needed
2. Consider staying on `@types/node@22` for Node.js 22 runtime compatibility
3. Test type checking across all packages

#### Recommendation
**Wait** until Node.js 24 becomes LTS (expected late 2026) before upgrading.

---

## 🔴 Stale Dependencies

These dependencies haven't been updated in a long time and may need replacement.

### keytar

| | |
|---|---|
| **Package** | `keytar` |
| **Current** | `^7.9.0` |
| **Last Published** | February 2022 (4+ years ago) |
| **Affected Packages** | `octocode-shared` |
| **Status** | ⚠️ Potentially abandoned |

#### Concerns
- No updates in 4+ years
- Native module compilation issues on newer systems
- Potential security vulnerabilities in dependencies
- Maintenance status unclear

#### Alternatives
1. **`@vscode/credentials`** - VS Code's built-in credential storage
2. **`keychain`** - macOS Keychain Access
3. **OS-native APIs** - Direct system keychain integration
4. **`secret-store`** - Cross-platform secret storage

#### Migration Steps
1. Evaluate alternatives for cross-platform support
2. Design migration path for existing stored credentials
3. Implement new credential storage in `octocode-shared`
4. Update `octocode-cli` and `octocode-vscode` consumers
5. Provide migration utility for users with existing credentials

---

## 📋 Upgrade Priority

| Priority | Package | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 High | `keytar` replacement | Medium | Security |
| 🟡 Medium | `eslint` v9 | High | DX improvement |
| 🟡 Medium | `zod` v4 | Medium | Type safety |
| 🟢 Low | `vite` v7 | Low | Build tooling |
| 🟢 Low | `@inquirer/prompts` v8 | Low | CLI UX |
| 🟢 Low | `@vscode/vsce` v3 | Low | Extension packaging |
| ⏸️ Defer | `@types/node` v25 | Low | Wait for Node 24 LTS |

---

## Changelog

### 2026-01-07
- Initial document created
- Documented pending major upgrades
- Identified `keytar` as stale dependency requiring replacement

