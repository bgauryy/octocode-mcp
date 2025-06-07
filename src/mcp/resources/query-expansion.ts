import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerQueryExpansionResource(server: McpServer) {
  server.resource(
    'query-expansion',
    'help://search-optimization',
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              search_optimization: {
                'too-broad': {
                  problem: 'Getting 100+ irrelevant results',
                  solutions: [
                    'Add language filter: language:javascript',
                    'Add path restriction: path:src',
                    'Use specific terms: "useState hook" not "state"',
                    'Add exclusions: NOT path:test',
                  ],
                },
                'too-narrow': {
                  problem: 'Getting 0-5 results',
                  solutions: [
                    'Remove filters and path restrictions',
                    'Use broader terms: "auth" not "useAuthenticationHook"',
                    'Try alternative spellings',
                    'Use OR operators: "react OR vue"',
                  ],
                },
                'wrong-context': {
                  problem: "Results don't match your technology",
                  solutions: [
                    'Add framework: "react form validation"',
                    'Specify environment: "nodejs express"',
                    'Add use case: "production deployment"',
                  ],
                },
                'outdated-results': {
                  problem: 'Finding old implementations',
                  solutions: [
                    'Add date filter: created:>2022-01-01',
                    'Sort by updated repositories',
                    'Look for active maintenance',
                  ],
                },
              },
              common_alternatives: {
                auth: ['authentication', 'login', 'session', 'jwt', 'oauth'],
                api: ['endpoint', 'route', 'rest', 'graphql', 'service'],
                database: ['db', 'sql', 'nosql', 'mongo', 'postgres'],
                test: ['testing', 'spec', 'unit', 'integration', 'jest'],
                config: ['configuration', 'settings', 'env', 'setup'],
              },
              technology_focus: {
                react: ['hooks', 'components', 'jsx', 'context', 'router'],
                nodejs: ['express', 'async', 'middleware', 'streams'],
                typescript: ['interfaces', 'types', 'generics', 'decorators'],
                python: ['django', 'flask', 'async', 'classes'],
                docker: ['dockerfile', 'compose', 'containers', 'images'],
              },
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
