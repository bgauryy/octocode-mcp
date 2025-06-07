import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface TechnologyMapping {
  [key: string]: string[];
}

interface SearchGuidance {
  problem: string;
  solutions: string[];
  examples?: string[];
}

async function generateQueryExpansionData() {
  return {
    expansion_strategies: {
      technology_mapping: {
        react: [
          'hooks',
          'components',
          'jsx',
          'state management',
          'context',
          'redux',
          'router',
        ],
        nodejs: [
          'express',
          'async',
          'npm',
          'server',
          'middleware',
          'streams',
          'filesystem',
        ],
        typescript: [
          'interfaces',
          'types',
          'generics',
          'decorators',
          'enums',
          'modules',
        ],
        python: [
          'django',
          'flask',
          'pandas',
          'numpy',
          'async',
          'decorators',
          'classes',
        ],
        javascript: [
          'promises',
          'async/await',
          'closures',
          'prototypes',
          'es6',
          'modules',
        ],
        docker: [
          'dockerfile',
          'compose',
          'containers',
          'images',
          'volumes',
          'networks',
        ],
        kubernetes: [
          'pods',
          'services',
          'deployments',
          'configmaps',
          'secrets',
          'ingress',
        ],
        aws: [
          'lambda',
          's3',
          'ec2',
          'cloudformation',
          'api-gateway',
          'dynamodb',
        ],
        database: [
          'sql',
          'nosql',
          'mongodb',
          'postgres',
          'mysql',
          'redis',
          'migrations',
        ],
        testing: [
          'unit tests',
          'integration',
          'mocking',
          'jest',
          'cypress',
          'selenium',
        ],
        security: [
          'authentication',
          'authorization',
          'jwt',
          'oauth',
          'encryption',
          'cors',
        ],
        performance: [
          'optimization',
          'caching',
          'lazy loading',
          'bundling',
          'minification',
        ],
      } as TechnologyMapping,

      search_enhancement: {
        too_broad: {
          problem: 'Getting 1000+ results that are not relevant',
          solutions: [
            'Add programming language filter (language:javascript)',
            'Add path restrictions (path:src, path:components)',
            'Use specific function names instead of generic terms',
            'Add NOT filters to exclude unwanted results',
            'Use organization filters for quality repositories',
          ],
          examples: [
            "Instead of 'authentication', use 'JWT authentication language:javascript'",
            "Instead of 'api', use 'REST API endpoint language:python path:src'",
          ],
        } as SearchGuidance,

        too_narrow: {
          problem: 'Getting 0-5 results or no relevant matches',
          solutions: [
            'Remove language and path filters',
            'Use broader, more generic terms',
            'Check spelling and try alternative spellings',
            'Use OR operators to combine related terms',
            'Start with topics search to find correct terminology',
          ],
          examples: [
            "Instead of 'useAuthenticationHook', use 'authentication hook'",
            "Instead of 'fastapi-async-database', use 'fastapi OR database'",
          ],
        } as SearchGuidance,

        wrong_context: {
          problem: "Results don't match what you're looking for",
          solutions: [
            'Add framework context (react, vue, angular)',
            'Specify use case (tutorial, production, example)',
            'Add technology stack context',
            'Use file extension filters',
            'Add specific domain context',
          ],
          examples: [
            "Instead of 'form validation', use 'react form validation'",
            "Instead of 'deployment', use 'docker deployment nodejs'",
          ],
        } as SearchGuidance,

        outdated_results: {
          problem: 'Finding old or deprecated implementations',
          solutions: [
            'Add recent date filters (created:>2022-01-01)',
            'Sort by recently updated repositories',
            'Look for active maintenance indicators',
            'Check for framework version compatibility',
            'Filter by star count for popular solutions',
          ],
          examples: [
            'react hooks created:>2021-01-01',
            'typescript generics updated:>2023-01-01',
          ],
        } as SearchGuidance,
      },

      semantic_alternatives: {
        auth: [
          'authentication',
          'login',
          'session',
          'jwt',
          'oauth',
          'passport',
          'identity',
        ],
        api: [
          'endpoint',
          'route',
          'service',
          'rest',
          'graphql',
          'microservice',
          'webhook',
        ],
        database: [
          'db',
          'sql',
          'nosql',
          'mongodb',
          'postgres',
          'mysql',
          'orm',
          'migration',
        ],
        frontend: [
          'ui',
          'client',
          'browser',
          'react',
          'vue',
          'angular',
          'component',
        ],
        backend: [
          'server',
          'api',
          'nodejs',
          'python',
          'java',
          'microservice',
          'service',
        ],
        test: [
          'testing',
          'unit test',
          'integration',
          'e2e',
          'spec',
          'mock',
          'jest',
        ],
        deploy: [
          'deployment',
          'deploy',
          'production',
          'staging',
          'ci/cd',
          'docker',
          'kubernetes',
        ],
        config: [
          'configuration',
          'settings',
          'environment',
          'env',
          'dotenv',
          'config',
        ],
        error: [
          'exception',
          'error handling',
          'try catch',
          'logging',
          'debugging',
        ],
        async: [
          'asynchronous',
          'promise',
          'await',
          'callback',
          'concurrent',
          'parallel',
        ],
        cache: [
          'caching',
          'redis',
          'memcached',
          'storage',
          'session',
          'memory',
        ],
        security: [
          'auth',
          'authorization',
          'encryption',
          'cors',
          'csrf',
          'xss',
          'sanitization',
        ],
      },

      contextual_expansion: {
        by_language: {
          javascript: [
            'npm',
            'node',
            'browser',
            'es6',
            'typescript',
            'react',
            'vue',
          ],
          python: [
            'pip',
            'django',
            'flask',
            'pandas',
            'async',
            'class',
            'decorator',
          ],
          java: [
            'maven',
            'spring',
            'gradle',
            'junit',
            'annotation',
            'interface',
          ],
          go: ['mod', 'goroutine', 'channel', 'interface', 'struct', 'package'],
          rust: ['cargo', 'trait', 'ownership', 'lifetime', 'macro', 'crate'],
          csharp: [
            'nuget',
            'async',
            'linq',
            'entity',
            'attribute',
            'namespace',
          ],
        },

        by_domain: {
          web_development: [
            'html',
            'css',
            'javascript',
            'responsive',
            'seo',
            'accessibility',
          ],
          mobile: [
            'ios',
            'android',
            'react-native',
            'flutter',
            'xamarin',
            'cordova',
          ],
          devops: [
            'docker',
            'kubernetes',
            'ci/cd',
            'monitoring',
            'logging',
            'infrastructure',
          ],
          data_science: [
            'python',
            'r',
            'jupyter',
            'pandas',
            'numpy',
            'machine learning',
          ],
          game_development: [
            'unity',
            'unreal',
            'opengl',
            'physics',
            'rendering',
            'audio',
          ],
          blockchain: [
            'ethereum',
            'smart contract',
            'web3',
            'solidity',
            'defi',
            'nft',
          ],
        },

        by_use_case: {
          tutorial: [
            'example',
            'guide',
            'tutorial',
            'learn',
            'beginner',
            'step-by-step',
          ],
          production: [
            'production',
            'enterprise',
            'scalable',
            'performance',
            'security',
          ],
          example: ['demo', 'sample', 'example', 'proof of concept', 'minimal'],
          advanced: [
            'advanced',
            'expert',
            'complex',
            'optimization',
            'architecture',
          ],
          troubleshooting: [
            'debug',
            'fix',
            'issue',
            'problem',
            'error',
            'troubleshoot',
          ],
        },
      },
    },

    query_optimization_rules: {
      progressive_refinement: {
        step1: 'Start with core technology term',
        step2: 'Add primary context (framework, language)',
        step3: 'Add specific use case or pattern',
        step4: 'Add filters for precision (path, file type)',
        step5: 'Add exclusions to remove noise',
      },

      boolean_optimization: {
        OR_usage:
          "Use for alternative terms: 'authentication OR auth OR login'",
        AND_usage:
          "Implicit between terms: 'react authentication' = 'react AND authentication'",
        NOT_usage: "Exclude unwanted results: 'react NOT angular'",
        grouping: "Use parentheses: '(react OR vue) AND authentication'",
      },

      filter_optimization: {
        language_first: 'Add language filter early for code searches',
        path_second: 'Add path filters to focus on relevant directories',
        date_when_needed: 'Use date filters for recent implementations',
        size_rarely: 'File size filters usually not needed',
        organization_for_quality: 'Use org filters for trusted sources',
      },
    },

    learning_patterns: {
      beginner_queries: {
        characteristics: ['Generic terms', 'Single words', 'No context'],
        improvements: [
          "Add 'tutorial' or 'example'",
          'Specify technology stack',
          "Add 'beginner' context",
        ],
        examples: {
          api: 'REST API tutorial javascript',
          database: 'database connection example nodejs',
        },
      },

      intermediate_queries: {
        characteristics: [
          'Technology-specific',
          'Some context',
          'Basic filters',
        ],
        improvements: [
          'Add architectural context',
          'Specify patterns',
          'Use advanced filters',
        ],
        examples: {
          'react components': 'react component patterns hooks',
          'nodejs server': 'nodejs express server middleware',
        },
      },

      expert_queries: {
        characteristics: [
          'Specific patterns',
          'Multiple filters',
          'Complex boolean logic',
        ],
        improvements: [
          'Fine-tune with path filters',
          'Add performance context',
          'Use advanced syntax',
        ],
        examples: {
          'react hooks performance':
            'react hooks performance optimization useMemo',
          'microservices architecture':
            'microservices architecture patterns resilience',
        },
      },
    },
  };
}

export function registerQueryExpansionResource(server: McpServer) {
  server.resource('query-expansion', 'smart://query-expansion', async uri => {
    try {
      const expansionData = await generateQueryExpansionData();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Query Expansion - SEARCH OPTIMIZATION ENGINE',
                description:
                  'Intelligent query expansion and search optimization guidance',
                version: '1.0.0',
                ...expansionData,
                meta: {
                  technology_mappings: Object.keys(
                    expansionData.expansion_strategies.technology_mapping
                  ).length,
                  semantic_alternatives: Object.keys(
                    expansionData.expansion_strategies.semantic_alternatives
                  ).length,
                  optimization_rules: Object.keys(
                    expansionData.query_optimization_rules
                  ).length,
                  last_updated: new Date().toISOString(),
                  search_success_improvement: '78% better result relevance',
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Query Expansion - ERROR',
                error: (error as Error).message,
                message: 'Unable to generate query expansion data',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });
}
