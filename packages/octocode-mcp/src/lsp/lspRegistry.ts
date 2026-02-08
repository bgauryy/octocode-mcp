/**
 * Language Server Registry
 * Default language server commands by file extension.
 * Reference: https://github.com/helix-editor/helix/blob/master/languages.toml
 *            https://github.com/microsoft/multilspy
 * @module lsp/lspRegistry
 */

import type { LanguageServerCommand } from './types.js';

export const LANGUAGE_SERVER_COMMANDS: Record<string, LanguageServerCommand> = {
  // TypeScript/JavaScript (bundled)
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.tsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescriptreact',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.js': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.jsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascriptreact',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.mjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.cjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },

  // Python: pip install python-lsp-server
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },
  '.pyi': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },

  // Go: go install golang.org/x/tools/gopls@latest
  '.go': {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
    envVar: 'OCTOCODE_GO_SERVER_PATH',
  },

  // Rust: rustup component add rust-analyzer
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
    envVar: 'OCTOCODE_RUST_SERVER_PATH',
  },

  // Java: brew install jdtls OR download from Eclipse
  '.java': {
    command: 'jdtls',
    args: [],
    languageId: 'java',
    envVar: 'OCTOCODE_JAVA_SERVER_PATH',
  },

  // Kotlin: brew install kotlin-language-server
  '.kt': {
    command: 'kotlin-language-server',
    args: [],
    languageId: 'kotlin',
    envVar: 'OCTOCODE_KOTLIN_SERVER_PATH',
  },
  '.kts': {
    command: 'kotlin-language-server',
    args: [],
    languageId: 'kotlin',
    envVar: 'OCTOCODE_KOTLIN_SERVER_PATH',
  },

  // C/C++: brew install llvm (includes clangd)
  '.c': {
    command: 'clangd',
    args: [],
    languageId: 'c',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.h': {
    command: 'clangd',
    args: [],
    languageId: 'c',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cpp': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.hpp': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cc': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cxx': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },

  // C#: dotnet tool install -g csharp-ls
  '.cs': {
    command: 'csharp-ls',
    args: [],
    languageId: 'csharp',
    envVar: 'OCTOCODE_CSHARP_SERVER_PATH',
  },

  // Ruby: gem install solargraph
  '.rb': {
    command: 'solargraph',
    args: ['stdio'],
    languageId: 'ruby',
    envVar: 'OCTOCODE_RUBY_SERVER_PATH',
  },

  // PHP: npm install -g intelephense
  '.php': {
    command: 'intelephense',
    args: ['--stdio'],
    languageId: 'php',
    envVar: 'OCTOCODE_PHP_SERVER_PATH',
  },

  // Swift: comes with Xcode
  '.swift': {
    command: 'sourcekit-lsp',
    args: [],
    languageId: 'swift',
    envVar: 'OCTOCODE_SWIFT_SERVER_PATH',
  },

  // Dart: dart pub global activate dart_language_server
  '.dart': {
    command: 'dart',
    args: ['language-server', '--client-id=octocode'],
    languageId: 'dart',
    envVar: 'OCTOCODE_DART_SERVER_PATH',
  },

  // Lua: brew install lua-language-server
  '.lua': {
    command: 'lua-language-server',
    args: [],
    languageId: 'lua',
    envVar: 'OCTOCODE_LUA_SERVER_PATH',
  },

  // Zig: https://github.com/zigtools/zls
  '.zig': {
    command: 'zls',
    args: [],
    languageId: 'zig',
    envVar: 'OCTOCODE_ZIG_SERVER_PATH',
  },

  // Elixir: https://github.com/elixir-lsp/elixir-ls
  '.ex': {
    command: 'elixir-ls',
    args: [],
    languageId: 'elixir',
    envVar: 'OCTOCODE_ELIXIR_SERVER_PATH',
  },
  '.exs': {
    command: 'elixir-ls',
    args: [],
    languageId: 'elixir',
    envVar: 'OCTOCODE_ELIXIR_SERVER_PATH',
  },

  // Scala: cs install metals
  '.scala': {
    command: 'metals',
    args: [],
    languageId: 'scala',
    envVar: 'OCTOCODE_SCALA_SERVER_PATH',
  },
  '.sc': {
    command: 'metals',
    args: [],
    languageId: 'scala',
    envVar: 'OCTOCODE_SCALA_SERVER_PATH',
  },

  // Haskell: ghcup install hls
  '.hs': {
    command: 'haskell-language-server-wrapper',
    args: ['--lsp'],
    languageId: 'haskell',
    envVar: 'OCTOCODE_HASKELL_SERVER_PATH',
  },

  // OCaml: opam install ocaml-lsp-server
  '.ml': {
    command: 'ocamllsp',
    args: [],
    languageId: 'ocaml',
    envVar: 'OCTOCODE_OCAML_SERVER_PATH',
  },
  '.mli': {
    command: 'ocamllsp',
    args: [],
    languageId: 'ocaml',
    envVar: 'OCTOCODE_OCAML_SERVER_PATH',
  },

  // Clojure: brew install clojure-lsp
  '.clj': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },
  '.cljs': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },
  '.cljc': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },

  // Vue: npm install -g @vue/language-server
  '.vue': {
    command: 'vue-language-server',
    args: ['--stdio'],
    languageId: 'vue',
    envVar: 'OCTOCODE_VUE_SERVER_PATH',
  },

  // Svelte: npm install -g svelte-language-server
  '.svelte': {
    command: 'svelteserver',
    args: ['--stdio'],
    languageId: 'svelte',
    envVar: 'OCTOCODE_SVELTE_SERVER_PATH',
  },

  // YAML: npm install -g yaml-language-server
  '.yaml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    languageId: 'yaml',
    envVar: 'OCTOCODE_YAML_SERVER_PATH',
  },
  '.yml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    languageId: 'yaml',
    envVar: 'OCTOCODE_YAML_SERVER_PATH',
  },

  // TOML: cargo install taplo-cli --features lsp
  '.toml': {
    command: 'taplo',
    args: ['lsp', 'stdio'],
    languageId: 'toml',
    envVar: 'OCTOCODE_TOML_SERVER_PATH',
  },

  // JSON: npm install -g vscode-langservers-extracted
  '.json': {
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    languageId: 'json',
    envVar: 'OCTOCODE_JSON_SERVER_PATH',
  },
  '.jsonc': {
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    languageId: 'jsonc',
    envVar: 'OCTOCODE_JSON_SERVER_PATH',
  },

  // HTML/CSS: npm install -g vscode-langservers-extracted
  '.html': {
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    languageId: 'html',
    envVar: 'OCTOCODE_HTML_SERVER_PATH',
  },
  '.css': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'css',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },
  '.scss': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'scss',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },
  '.less': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'less',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },

  // Bash: npm install -g bash-language-server
  '.sh': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },
  '.bash': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },
  '.zsh': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },

  // SQL: npm install -g sql-language-server
  '.sql': {
    command: 'sql-language-server',
    args: ['up', '--method', 'stdio'],
    languageId: 'sql',
    envVar: 'OCTOCODE_SQL_SERVER_PATH',
  },

  // GraphQL: npm install -g graphql-language-service-cli
  '.graphql': {
    command: 'graphql-lsp',
    args: ['server', '-m', 'stream'],
    languageId: 'graphql',
    envVar: 'OCTOCODE_GRAPHQL_SERVER_PATH',
  },
  '.gql': {
    command: 'graphql-lsp',
    args: ['server', '-m', 'stream'],
    languageId: 'graphql',
    envVar: 'OCTOCODE_GRAPHQL_SERVER_PATH',
  },

  // Terraform: brew install terraform-ls
  '.tf': {
    command: 'terraform-ls',
    args: ['serve'],
    languageId: 'terraform',
    envVar: 'OCTOCODE_TERRAFORM_SERVER_PATH',
  },

  // Dockerfile: npm install -g dockerfile-language-server-nodejs
  // Note: Dockerfile has no extension, handled separately if needed
};
