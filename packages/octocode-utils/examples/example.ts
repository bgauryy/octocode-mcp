import { jsonToLLMStringV2 } from '../src/jsonToLLMStringV2';

console.log('='.repeat(80));
console.log('🚀 jsonToLLMStringV2 Examples - Input vs Output');
console.log('='.repeat(80));

function showExample(title: string, input: any, options?: any) {
  console.log(`\n📝 ${title}`);
  console.log('-'.repeat(50));
  console.log('INPUT:');
  console.log(JSON.stringify(input, null, 2));
  console.log('\nOUTPUT:');
  const output = jsonToLLMStringV2(input, options);
  console.log(output);
  console.log('-'.repeat(50));
}

// Example 1: Simple object
showExample('Simple Object', {
  name: 'John Doe',
  age: 30,
  active: true,
  email: null,
});

// Example 2: Nested object
showExample('Nested Object', {
  user: {
    profile: {
      name: 'Alice',
      settings: {
        theme: 'dark',
        notifications: true,
      },
    },
    metadata: {
      created: new Date('2024-01-15T10:30:00Z'),
      lastLogin: new Date('2024-03-01T14:22:00Z'),
    },
  },
});

// Example 3: Arrays - homogeneous primitives
showExample('Homogeneous Arrays', {
  strings: ['apple', 'banana', 'cherry'],
  numbers: [1, 2, 3, 42, 100],
  booleans: [true, false, true, true],
  mixed_primitives: ['hello', 42, true, null],
});

// Example 4: Complex arrays with objects
showExample('Complex Arrays', {
  users: [
    { id: 1, name: 'John', role: 'admin' },
    { id: 2, name: 'Jane', role: 'user' },
    { id: 3, name: 'Bob', role: 'moderator' },
  ],
  nested_arrays: [
    [1, 2, 3],
    ['a', 'b', 'c'],
    [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
  ],
});

// Example 5: GitHub-like API response
showExample('GitHub API Response', {
  name: 'awesome-repo',
  full_name: 'octocat/awesome-repo',
  owner: {
    login: 'octocat',
    id: 1,
    avatar_url: 'https://github.com/images/error/octocat_happy.gif',
    type: 'User',
  },
  description: 'This is your first repo!',
  topics: ['javascript', 'api', 'github'],
  stargazers_count: 80,
  watchers_count: 9,
  language: 'JavaScript',
  has_issues: true,
  has_projects: true,
  has_wiki: true,
  fork: false,
  archived: false,
  disabled: false,
});

// Example 6: Package.json structure
showExample('Package.json Structure', {
  name: '@company/awesome-package',
  version: '1.2.3',
  description: 'An awesome package for demonstration',
  main: 'dist/index.js',
  scripts: {
    build: 'tsc',
    test: 'vitest run',
    dev: 'tsc --watch',
  },
  keywords: ['typescript', 'utility', 'awesome'],
  dependencies: {
    lodash: '^4.17.21',
    axios: '^1.6.0',
  },
  devDependencies: {
    typescript: '^5.0.0',
    vitest: '^1.0.0',
    '@types/node': '^20.0.0',
  },
  author: {
    name: 'Developer Team',
    email: 'dev@company.com',
    url: 'https://company.com',
  },
});

// Example 7: Configuration object
showExample('API Configuration', {
  title: 'API Configuration',
  version: 2.1,
  enabled: true,
  config: {
    database: {
      host: 'localhost',
      port: 5432,
      credentials: {
        username: 'admin',
        password: 'secret123',
      },
    },
    features: ['auth', 'logging', 'metrics'],
    settings: {
      timeout: 30000,
      retries: 3,
      debug: false,
    },
  },
  environments: [
    {
      name: 'development',
      url: 'http://localhost:3000',
      active: true,
    },
    {
      name: 'production',
      url: 'https://api.example.com',
      active: false,
    },
  ],
});

// Example 8: Special objects (after JSON normalization)
showExample('Special Objects (JSON Normalized)', {
  date: new Date('2024-01-01T00:00:00Z'),
  regex: /test.*pattern/gi,
  map: new Map([
    ['key1', 'value1'],
    ['key2', 'value2'],
  ]),
  set: new Set([1, 2, 3, 4]),
  url: new URL('https://example.com/path?param=value'),
  buffer: Buffer.from([1, 2, 3, 4]),
  typedArray: new Uint8Array([5, 6, 7, 8]),
});

// Example 9: Edge cases
showExample('Edge Cases', {
  emptyArray: [],
  emptyObject: {},
  nullValue: null,
  numberEdges: {
    zero: 0,
    negativeZero: -0,
    nan: NaN,
    infinity: Infinity,
    negativeInfinity: -Infinity,
  },
  stringWithControls: 'Line1\nLine2\tTabbed\rCarriage\bBack\fForm\vVert\0Null',
});

// Example 10: Options demonstration
showExample(
  'With ignoreFalsy: false',
  {
    name: 'John',
    email: null,
    phone: undefined,
    active: true,
  },
  { ignoreFalsy: false }
);

showExample(
  'With sortKeys: "asc"',
  {
    zebra: 'animal',
    apple: 'fruit',
    banana: 'fruit',
    cat: 'animal',
  },
  { sortKeys: 'asc' }
);

showExample(
  'With maxDepth: 2',
  {
    level1: {
      level2: {
        level3: {
          level4: 'deep value',
        },
      },
    },
  },
  { maxDepth: 2 }
);

// Example 11: Large array demonstration
showExample('Large Homogeneous Array', {
  large_numbers: Array.from({ length: 20 }, (_, i) => i * 5),
  large_strings: Array.from({ length: 15 }, (_, i) => `item_${i}`),
});

// Example 12: Error cases
console.log(`\n📝 Error Cases`);
console.log('-'.repeat(50));

// Circular reference
const circularObj: any = { name: 'test' };
circularObj.self = circularObj;
console.log('INPUT: Object with circular reference');
console.log('OUTPUT:');
console.log(jsonToLLMStringV2(circularObj));

// BigInt
console.log('\nINPUT: BigInt value');
console.log('OUTPUT:');
console.log(jsonToLLMStringV2(BigInt(123)));

// Undefined
console.log('\nINPUT: undefined value');
console.log('OUTPUT:');
console.log(jsonToLLMStringV2(undefined));

console.log('\n' + '='.repeat(80));
console.log('✅ Examples completed! All outputs maintain the format:');
console.log('"#content converted from json\\n<formatted_content>"');
console.log('='.repeat(80));

showExample(
  'With sortKeys: "asc"',
  {
    data: [
      {
        queryId: 'code-search_1',
        data: {
          repository: 'facebook/react',
          files: [
            {
              path: 'packages/react/src/ReactClient.js',
              text_matches: [
                '  useRef,\n  useState,\n  useTransition,',
                '  useRef,\n  useState,\n  REACT_FRAGMENT_TYPE as Fragment,',
              ],
            },
            {
              path: 'packages/react/src/ReactHooks.js',
              text_matches: [
                '\nexport function useState<S>(\n  initialState: (() => S) | S,',
                '  const dispatcher = resolveDispatcher();\n  return dispatcher.useState(initialState);\n}',
              ],
            },
            {
              path: 'packages/react/src/__tests__/React-hooks-arity.js',
              text_matches: [
                "\n  it(\"ensure useState setter's arity is correct\", () => {\n    function Component() {\n      const [, setState] = React.useState(() => 'Halo!');\n\n      expect(setState.length).toBe(1);\n      return null;",
              ],
            },
            {
              path: 'packages/react/src/__tests__/ReactStartTransition-test.js',
              text_matches: [
                'let assertConsoleWarnDev,useState,useTransition;',
                '({act:act,assertConsoleWarnDev:assertConsoleWarnDev}=require("internal-test-utils")),useState=React.useState,useTransition=React.useTransition;',
              ],
            },
            {
              path: 'packages/react/src/__tests__/ReactProfiler-test.internal.js',
              text_matches: [
                '    function ProfilerSibling() {\n      const [count, setCount] = React.useState(0);\n      updateProfilerSibling = () => setCount(count + 1);',
                '    function Component() {\n      const [didMount, setDidMount] = React.useState(false);\n      const [didMountAndUpdate, setDidMountAndUpdate] = React.useState(false);',
              ],
            },
            {
              path: 'packages/react/src/__tests__/ReactStrictMode-test.js',
              text_matches: [
                'let useMemo,useState,useReducer;',
                'useMemo=React.useMemo,useState=React.useState,useReducer=React.useReducer;',
              ],
            },
          ],
          totalCount: 6,
        },
        metadata: {
          researchGoal: 'code_analysis',
          resultCount: 6,
          hasMatches: true,
          repositories: ['facebook/react'],
        },
      },
    ],
    meta: {
      totalOperations: 1,
      successfulOperations: 1,
      failedOperations: 0,
      researchGoal: 'code_analysis',
    },
    hints: [
      'Use repository structure analysis to find similar implementations',
      'Use github_fetch_content with matchString from search results for precise context extraction',
      'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
      'Single result found - dive deep and look for related examples in the same repository',
      'Research focus: code_analysis - tailor your search accordingly',
    ],
  },
  { sortKeys: 'asc' }
);

showExample(
  'With sortKeys: "asc"',
  {
    data: [
      {
        queryId: 'file-content_1',
        researchGoal: 'code_analysis',
        result: {
          filePath: 'packages/react-reconciler/src/ReactFiberHooks.js',
          owner: 'facebook',
          repo: 'react',
          branch: '940dff5e69a066380f7a2f30ee3aedbc2fe74e83',
          content:
            '  const queue: UpdateQueue<S, BasicStateAction<S>> = {\n    pending: null,\n    lanes: NoLanes,\n    dispatch: null,\n    lastRenderedReducer: basicStateReducer,\n    lastRenderedState: (initialState: any),\n  };\n  hook.queue = queue;\n  return hook;\n}\n\nfunction mountState<S>(\n  initialState: (() => S) | S,\n): [S, Dispatch<BasicStateAction<S>>] {\n  const hook = mountStateImpl(initialState);\n  const queue = hook.queue;\n  const dispatch: Dispatch<BasicStateAction<S>> = (dispatchSetState.bind(\n    null,\n    currentlyRenderingFiber,\n    queue,\n  ): any);\n  queue.dispatch = dispatch;\n  return [hook.memoizedState, dispatch];\n}\n\nfunction updateState<S>(\n  initialState: (() => S) | S,\n): [S, Dispatch<BasicStateAction<S>>] {\n  return updateReducer(basicStateReducer, initialState);\n}\n\nfunction rerenderState<S>(\n  initialState: (() => S) | S,\n): [S, Dispatch<BasicStateAction<S>>] {\n  return rerenderReducer(basicStateReducer, initialState);\n}\n\nfunction mountOptimistic<S, A>(\n  passthrough: S,\n  reducer: ?(S, A) => S,\n): [S, (A) => void] {\n  const hook = mountWorkInProgressHook();\n  hook.memoizedState = hook.baseState = passthrough;\n  const queue: UpdateQueue<S, A> = {\n    pending: null,\n    lanes: NoLanes,\n    dispatch: null,\n    // Optimistic state does not use the eager update optimization.\n    lastRenderedReducer: null,\n    lastRenderedState: null,\n  };',
          totalLines: 5247,
          startLine: 1911,
          endLine: 1961,
          isPartial: true,
          minified: false,
          minificationFailed: true,
          minificationType: 'failed',
          securityWarnings: ['Found "function updateState" on line 1936'],
        },
      },
    ],
    meta: {},
    hints: [
      'From implementation files, find: imports, exports, tests, and related modules',
      'Always verify documentation claims against actual implementation code',
      'Look for main files, index files, and public APIs to understand code structure',
      'Examine imports/exports to understand dependencies and usage',
    ],
  },
  { sortKeys: 'asc' }
);
