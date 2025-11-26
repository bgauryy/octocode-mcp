import { describe, it, expect, beforeAll } from 'vitest';
import { jsonToYamlString } from '../src/jsonToYamlString';
import {
  getTokenizer,
  countTokens,
  calculateTokenSavingsPercentage,
} from './helpers/tokenizer';

beforeAll(async () => {
  await getTokenizer();
});

describe('jsonToYamlString (simple expected-YAML cases)', () => {
  it('simple object', () => {
    const input = { name: 'John Doe', age: 30, active: true };
    const expectedYaml = `name: "John Doe"
age: 30
active: true
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);

    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(34.78);
  });

  it('force quotes on all strings', () => {
    const input = {
      title: 'Test Document',
      description: 'A test document for validation',
      tags: ['test', 'validation', 'yaml'],
      metadata: { author: 'Test Author', version: '1.0.0' },
    };
    const expectedYaml = `title: "Test Document"
description: "A test document for validation"
tags:
  - "test"
  - "validation"
  - "yaml"
metadata:
  author: "Test Author"
  version: "1.0.0"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(22.73);
  });

  it('nested objects and arrays', () => {
    const input = {
      user: {
        profile: {
          name: 'Alice Smith',
          preferences: { theme: 'dark', language: 'en' },
        },
        roles: ['admin', 'user'],
      },
      settings: { notifications: true, timeout: 5000 },
    };
    const expectedYaml = `user:
  profile:
    name: "Alice Smith"
    preferences:
      theme: "dark"
      language: "en"
  roles:
    - "admin"
    - "user"
settings:
  notifications: true
  timeout: 5000
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(33.33);
  });

  it('before/after example', () => {
    const input = {
      name: 'My Project',
      version: '1.2.3',
      active: true,
      tags: ['web', 'api'],
      config: { host: 'localhost', port: 3000 },
    };
    const expectedYaml = `name: "My Project"
version: "1.2.3"
active: true
tags:
  - "web"
  - "api"
config:
  host: "localhost"
  port: 3000
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(28.13);
  });

  it('simple package-like object', () => {
    const input = {
      name: 'Test Package',
      version: '1.0.0',
      description: 'A test package for validation',
      keywords: ['test', 'package', 'validation'],
      author: 'Test Author',
    };
    const expectedYaml = `name: "Test Package"
version: "1.0.0"
description: "A test package for validation"
keywords:
  - "test"
  - "package"
  - "validation"
author: "Test Author"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(20.34);
  });

  it('complex nested configuration', () => {
    const input = {
      metadata: {
        title: 'Complex Configuration',
        version: '2.1.0',
        created: '2024-01-15T10:30:00Z',
      },
      database: {
        host: 'localhost',
        port: 5432,
        credentials: { username: 'admin', password: 'secret123' },
        options: { ssl: true, timeout: 30000, retries: 3 },
      },
      features: ['authentication', 'logging', 'metrics', 'caching'],
      environments: {
        development: { debug: true, logLevel: 'verbose' },
        production: { debug: false, logLevel: 'error' },
      },
    };
    const expectedYaml = `metadata:
  title: "Complex Configuration"
  version: "2.1.0"
  created: "2024-01-15T10:30:00Z"
database:
  host: "localhost"
  port: 5432
  credentials:
    username: "admin"
    password: "secret123"
  options:
    ssl: true
    timeout: 30000
    retries: 3
features:
  - "authentication"
  - "logging"
  - "metrics"
  - "caching"
environments:
  development:
    debug: true
    logLevel: "verbose"
  production:
    debug: false
    logLevel: "error"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(25.39);
  });

  it('arrays of objects', () => {
    const input = {
      users: [
        {
          id: 1,
          name: 'User 1',
          email: 'user1@example.com',
          active: true,
          roles: ['user'],
          preferences: { theme: 'dark', notifications: true },
        },
        {
          id: 2,
          name: 'User 2',
          email: 'user2@example.com',
          active: false,
          roles: ['user'],
          preferences: { theme: 'light', notifications: true },
        },
      ],
      pagination: { page: 1, limit: 10, total: 100, hasMore: true },
    };
    const expectedYaml = `users:
  - id: 1
    name: "User 1"
    email: "user1@example.com"
    active: true
    roles:
      - "user"
    preferences:
      theme: "dark"
      notifications: true
  - id: 2
    name: "User 2"
    email: "user2@example.com"
    active: false
    roles:
      - "user"
    preferences:
      theme: "light"
      notifications: true
pagination:
  page: 1
  limit: 10
  total: 100
  hasMore: true
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);
    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(26.97);
  });

  it('github file content response - expected YAML', () => {
    const input = {
      results: [
        {
          queryId: 'readme_options',
          filePath: 'README.md',
          owner: 'nodeca',
          repo: 'js-yaml',
          content: [
            'block to flow style for collections. -1 means block style everwhere',
            '- `styles` - "tag" => "style" map. Each tag may have own set of styles.',
            '- `schema` _(default: `DEFAULT_SCHEMA`)_ specifies a schema to use.',
            '- `sortKeys` _(default: `false`)_ - if `true`, sort keys when dumping YAML. If a',
            '  function, use the function to sort the keys.',
            '- `lineWidth` _(default: `80`)_ - set max line width. Set `-1` for unlimited width.',
            "- `noRefs` _(default: `false`)_ - if `true`, don't convert duplicate objects into references",
            "- `noCompatMode` _(default: `false`)_ - if `true` don't try to be compatible with older",
            '  yaml versions. Currently: don\'t quote "yes", "no" and so on, as required for YAML 1.1',
            "- `condenseFlow` _(default: `false`)_ - if `true` flow sequences will be condensed, omitting the space between `a, b`. Eg. '[a,b]', and omitting the space between `key: value` and quoting the key. Eg. '{\"a\":b}' Can be useful when using yaml for pretty URL query params as spaces are %-encoded.",
            "- `quotingType` _(`'` or `\"`, default: `'`)_ - strings will be quoted using this quoting style. If you specify single quotes, double quotes will still be used for non-printable characters.",
            "- `forceQuotes` _(default: `false`)_ - if `true`, all non-key strings will be quoted even if they normally don't need to.",
            '- `replacer` - callback `function (key, value)` called recursively on each key/value in source object (see `replacer` docs for `JSON.stringify`).',
            '',
            'The following table show availlable styles (e.g. "canonical",',
            '"binary"...) available for each tag (.e.g. !!null, !!int ...). Yaml',
            'output is shown on the right side after `=>` (default setting) or `->`:',
            '',
            '``` none',
            '!!null',
            '  "canonical"   -> "~"',
          ].join('\n'),
          totalLines: 248,
          startLine: 128,
          endLine: 148,
          isPartial: true,
          securityWarnings: ['Found "quotingType" on line 138'],
        },
        {
          queryId: 'dumper_implementation',
          filePath: 'lib/dumper.js',
          owner: 'nodeca',
          repo: 'js-yaml',
          content: [
            '    QUOTING_TYPE_DOUBLE = 2;',
            '',
            'function State(options) {',
            "  this.schema        = options['schema'] || DEFAULT_SCHEMA;",
            "  this.indent        = Math.max(1, (options['indent'] || 2));",
            "  this.noArrayIndent = options['noArrayIndent'] || false;",
            "  this.skipInvalid   = options['skipInvalid'] || false;",
            "  this.flowLevel     = (common.isNothing(options['flowLevel']) ? -1 : options['flowLevel']);",
            "  this.styleMap      = compileStyleMap(this.schema, options['styles'] || null);",
            "  this.sortKeys      = options['sortKeys'] || false;",
            "  this.lineWidth     = options['lineWidth'] || 80;",
            "  this.noRefs        = options['noRefs'] || false;",
            "  this.noCompatMode  = options['noCompatMode'] || false;",
            "  this.condenseFlow  = options['condenseFlow'] || false;",
            '  this.quotingType   = options["quotingType"] === """ ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;',
            "  this.forceQuotes   = options['forceQuotes'] || false;",
            "  this.replacer      = typeof options['replacer'] === 'function' ? options['replacer'] : null;",
            '',
            '  this.implicitTypes = this.schema.compiledImplicit;',
            '  this.explicitTypes = this.schema.compiledExplicit;',
            '',
            '  this.tag = null;',
            "  this.result = '';",
            '',
            '  this.duplicates = [];',
            '  this.usedDuplicates = null;',
            '}',
            '',
            '// Indents every line in a string. Empty lines (\\n only) are not indented.',
            'function indentString(string, spaces) {',
            "  var ind = common.repeat(' ', spaces),",
          ].join('\n'),
          totalLines: 966,
          startLine: 113,
          endLine: 143,
          isPartial: true,
          securityWarnings: [
            'Found "forceQuotes" on line 128 (and 5 other locations)',
          ],
        },
        {
          queryId: 'dumper_examples',
          filePath: 'examples/dumper.js',
          owner: 'nodeca',
          repo: 'js-yaml',
          content:
            '"use strict";var yaml=require("../"),object=require("./dumper.json");console.log(yaml.dump(object,{flowLevel:3,styles:{"!!int":"hexadecimal","!!null":"camelcase"}}));',
          totalLines: 33,
        },
      ],
      hints: [
        'From implementation files, find: imports, exports, tests, and related modules',
        'Always verify documentation claims against actual implementation code',
        'Look for main files, index files, and public APIs to understand code structure',
        'Examine imports/exports to understand dependencies and usage',
      ],
    } as const;

    const expectedYaml = `results:
  - queryId: "readme_options"
    filePath: "README.md"
    owner: "nodeca"
    repo: "js-yaml"
    content: ${JSON.stringify(input.results[0].content)}
    totalLines: 248
    startLine: 128
    endLine: 148
    isPartial: true
    securityWarnings:
      - ${JSON.stringify(input.results[0].securityWarnings[0])}
  - queryId: "dumper_implementation"
    filePath: "lib/dumper.js"
    owner: "nodeca"
    repo: "js-yaml"
    content: ${JSON.stringify(input.results[1].content)}
    totalLines: 966
    startLine: 113
    endLine: 143
    isPartial: true
    securityWarnings:
      - ${JSON.stringify(input.results[1].securityWarnings[0])}
  - queryId: "dumper_examples"
    filePath: "examples/dumper.js"
    owner: "nodeca"
    repo: "js-yaml"
    content: ${JSON.stringify(input.results[2].content)}
    totalLines: 33
hints:
  - "From implementation files, find: imports, exports, tests, and related modules"
  - "Always verify documentation claims against actual implementation code"
  - "Look for main files, index files, and public APIs to understand code structure"
  - "Examine imports/exports to understand dependencies and usage"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);

    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    // This complex test case has lower savings due to large string content
    expect(savingsPercentage).toEqual(3.69);
  });

  it('github search results with multiple repositories', () => {
    const input = {
      results: [
        {
          queryId: 'js-yaml-sortkeys-true',
          reasoning: 'Find implementations that use sortKeys: true in js-yaml',
          repository: 'web-infra-dev/modern.js',
          files: [
            {
              path: 'packages/toolkit/utils/compiled/js-yaml/index.d.ts',
              text_matches: [
                'export function loadAll(str: string, iterator?: null, opts?: LoadOptions): unknown[];\nexport function loadAll(str: string, iterator: (doc: unknown) => void, opts?: LoadOptions): void;\n\nexport function dump(obj: any, opts?: DumpOptions): string;\n\nexport interface LoadOptions {\n    /** string to be used as a file path in error/warning messages. */',
              ],
            },
            {
              path: 'fandogh/src/commands/service/dump.ts',
              text_matches: [
                "\nconst yaml = require('js-yaml');\n\nexport default class Dump extends Command {\n  static description = 'Dump an existing service manifest';\n\n  static flags = {",
              ],
            },
            {
              path: 'lib/yaml.js',
              text_matches: [
                '        throw err;\n      }\n    }\n    return json;\n  },\n  dump: (obj, opts) => yaml.safeDump(obj, { sortKeys: true, ...opts }),\n};',
              ],
            },
          ],
          totalCount: 14,
        },
        {
          queryId: 'js-yaml-sortkeys-false',
          reasoning: 'Find implementations that use sortKeys: false in js-yaml',
          repository: 'violentmonkey/violentmonkey',
          files: [
            {
              path: 'karavan-core/src/core/api/CamelDefinitionYaml.ts',
              text_matches: [
                "            noArrayIndent: false,\n            // forceQuotes: true,\n            quotingType: '\"',\n            sortKeys: function(a: any, b: any) {\n                if (a === 'steps') return 1;\n                else if (b === 'steps') return -1;\n                else return 0;",
              ],
            },
            {
              path: 'src/utils/export.ts',
              text_matches: [
                '\nexport function dump(\n    obj: any,',
                '        schema: yaml.DEFAULT_SCHEMA, // 使用的风格\n        sortKeys: (k1, k2) => {\n            const i1 = KEYS_ORDER.indexOf(k1);',
              ],
            },
          ],
          totalCount: 14,
        },
        {
          queryId: 'yaml-json-token-comparison',
          reasoning:
            'Find actual token count comparisons between YAML and JSON',
          repository: 'goldbergyoni/javascript-testing-best-practices',
          files: [
            {
              path: 'readme.md',
              text_matches: [
                '### :clap: Doing It Right Example: Using Applitools to get snapshot comparison and other advanced features',
              ],
            },
            {
              path: 'index.md',
              text_matches: [
                "* Don't assume that any encoding is canonical unless it is explicitly designed to be so. While there are the obvious cases which ignore whitespace (hex, base64, yaml, json, xml, etc.) many also ignore capitalization (hex, [email headers](https://datatracker.ietf.org/doc/html/rfc5322), etc.).",
              ],
            },
          ],
          totalCount: 15,
        },
      ],
      hints: [
        'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
        'Use github_fetch_content with matchString from search results for precise context extraction',
        'Multiple results found - cross-reference approaches and look for common patterns',
      ],
    };

    const expectedYaml = `results:
  - queryId: "js-yaml-sortkeys-true"
    reasoning: "Find implementations that use sortKeys: true in js-yaml"
    repository: "web-infra-dev/modern.js"
    files:
      - path: "packages/toolkit/utils/compiled/js-yaml/index.d.ts"
        text_matches:
          - ${JSON.stringify(input.results[0].files[0].text_matches[0])}
      - path: "fandogh/src/commands/service/dump.ts"
        text_matches:
          - ${JSON.stringify(input.results[0].files[1].text_matches[0])}
      - path: "lib/yaml.js"
        text_matches:
          - ${JSON.stringify(input.results[0].files[2].text_matches[0])}
    totalCount: 14
  - queryId: "js-yaml-sortkeys-false"
    reasoning: "Find implementations that use sortKeys: false in js-yaml"
    repository: "violentmonkey/violentmonkey"
    files:
      - path: "karavan-core/src/core/api/CamelDefinitionYaml.ts"
        text_matches:
          - ${JSON.stringify(input.results[1].files[0].text_matches[0])}
      - path: "src/utils/export.ts"
        text_matches:
          - ${JSON.stringify(input.results[1].files[1].text_matches[0])}
          - ${JSON.stringify(input.results[1].files[1].text_matches[1])}
    totalCount: 14
  - queryId: "yaml-json-token-comparison"
    reasoning: "Find actual token count comparisons between YAML and JSON"
    repository: "goldbergyoni/javascript-testing-best-practices"
    files:
      - path: "readme.md"
        text_matches:
          - ${JSON.stringify(input.results[2].files[0].text_matches[0])}
      - path: "index.md"
        text_matches:
          - ${JSON.stringify(input.results[2].files[1].text_matches[0])}
    totalCount: 15
hints:
  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"
  - "Use github_fetch_content with matchString from search results for precise context extraction"
  - "Multiple results found - cross-reference approaches and look for common patterns"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);

    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    // This test case should show good token savings due to reduced JSON syntax overhead
    expect(savingsPercentage).toEqual(11.14);
  });

  it('octocode agent search results', () => {
    const input = {
      results: [
        {
          queryId: 'agents_general',
          reasoning:
            'Search for general agent-related code patterns and implementations',
          repository: 'tigerneil/awesome-deep-rl',
          files: [
            {
              path: 'sc.md',
              text_matches: [
                '> Gregory Farquhar, Matteo Hessel, Kate Baumli Zita Marinho, Hado van Hasselt, Angelos Filos, David Silver\n\n## Abstract\nLearned models of the environment provide reinforcement learning (RL) agents with flexible ways of making predictions about the environment.\n\nIn particular, models enable planning, i.e. using more computation to improve value functions or policies, without requiring additional environment interactions.',
              ],
            },
            {
              path: 'sdk.md',
              text_matches: [
                '[Tools](https://python.langchain.com/docs/modules/agents/tools) are interfaces that an agent uses to interact with the world. They connect real world software products with the power of LLMs. This gives more flexibility, the way we use LangChain and improves its capabilities.',
                'LLaMAIndex is a data framework for LLM applications to ingest, structure, and access private or domain-specific data. It provides tools such as data connectors, data indexes, engines (query and chat), and data agents to facilitate natural language access to data.',
              ],
            },
          ],
          totalCount: 20,
        },
        {
          queryId: 'octocode_general',
          reasoning: 'Find all references to octocode in codebases',
          repository: 'OpenWebGlobe/DataProcessing',
          files: [
            {
              path: 'source/core/math/Octocode.h',
              text_matches: [
                '//! \\author Martin Christen, [REDACTED-EMAILADDRESS]\nclass Octocode\n{',
                'public:\n Octocode(){}\n virtual ~Octocode(){}',
              ],
            },
            {
              path: 'docs/_posts/2025-08-03-bgauryy-octocode-mcp.md',
              text_matches: [
                'date: 2025-08-03T10:53:21.227039\nimage: assets/bgauryy_octocode-mcp_cropped.png\n---',
                '# [bgauryy/octocode-mcp](https://github.com/bgauryy/octocode-mcp)',
              ],
            },
          ],
          totalCount: 19,
        },
        {
          queryId: 'ai_agents',
          reasoning: 'Look for AI agent implementations and patterns',
          repository: 'PasuparePopipa/pasuparepopipa.github.io',
          files: [
            {
              path: 'ai.md',
              text_matches: [
                '-100: if the robot moves to a quicksand space\n1: if the robot moves to the goal space\n\nAfter impleneting the Q-Learning algorithm, Dyna-Q was also implemented so that our AI agent could "hallucinate" extra experiences.',
              ],
            },
          ],
          totalCount: 20,
        },
      ],
      hints: [
        'Rich dataset available - analyze patterns, compare implementations, identify best practices',
        'Compare implementations across 3-5 repositories to identify best practices',
        'Use github_fetch_content with matchString from search results for precise context extraction',
        'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
      ],
    };

    const expectedYaml = `results:
  - queryId: "agents_general"
    reasoning: "Search for general agent-related code patterns and implementations"
    repository: "tigerneil/awesome-deep-rl"
    files:
      - path: "sc.md"
        text_matches:
          - ${JSON.stringify(input.results[0].files[0].text_matches[0])}
      - path: "sdk.md"
        text_matches:
          - ${JSON.stringify(input.results[0].files[1].text_matches[0])}
          - ${JSON.stringify(input.results[0].files[1].text_matches[1])}
    totalCount: 20
  - queryId: "octocode_general"
    reasoning: "Find all references to octocode in codebases"
    repository: "OpenWebGlobe/DataProcessing"
    files:
      - path: "source/core/math/Octocode.h"
        text_matches:
          - ${JSON.stringify(input.results[1].files[0].text_matches[0])}
          - ${JSON.stringify(input.results[1].files[0].text_matches[1])}
      - path: "docs/_posts/2025-08-03-bgauryy-octocode-mcp.md"
        text_matches:
          - ${JSON.stringify(input.results[1].files[1].text_matches[0])}
          - ${JSON.stringify(input.results[1].files[1].text_matches[1])}
    totalCount: 19
  - queryId: "ai_agents"
    reasoning: "Look for AI agent implementations and patterns"
    repository: "PasuparePopipa/pasuparepopipa.github.io"
    files:
      - path: "ai.md"
        text_matches:
          - ${JSON.stringify(input.results[2].files[0].text_matches[0])}
    totalCount: 20
hints:
  - "Rich dataset available - analyze patterns, compare implementations, identify best practices"
  - "Compare implementations across 3-5 repositories to identify best practices"
  - "Use github_fetch_content with matchString from search results for precise context extraction"
  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"
`;

    const json = JSON.stringify(input, null, 2);
    const yaml = jsonToYamlString(input);

    expect(yaml).toEqual(expectedYaml);

    const jsonTokens = countTokens(json);
    const yamlTokens = countTokens(yaml);
    expect(yamlTokens).toBeLessThan(jsonTokens);

    const savingsPercentage = calculateTokenSavingsPercentage(
      jsonTokens,
      yamlTokens
    );
    expect(savingsPercentage).toEqual(10.12);
  });
});
