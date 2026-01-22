# Public Repository Evaluation Questions

> 20 questions to evaluate octocode tools against real public repositories
> Repositories: React, Next.js, LangChain, CrewAI, GitHub CLI, Linux
> Difficulty: Basic → Intermediate → Advanced → Expert

---

## Basic (Questions 1-5)

### Q1: React - File Structure Discovery
**Repository:** `facebook/react`
**Difficulty:** Basic
**Tools Expected:** `githubViewRepoStructure`

**Question:**
> What are the main directories in the React repository root? List the top-level folders and identify which ones contain the core React packages.

**Expected Answer Includes:**
- `packages/` directory containing core packages
- Key packages: `react`, `react-dom`, `react-reconciler`, `scheduler`
- Other dirs: `fixtures/`, `scripts/`, `.github/`

**Validation Criteria:**
- [ ] Correctly identifies `packages/` as main source directory
- [ ] Lists at least 5 top-level directories
- [ ] Identifies core package names

---

### Q2: Next.js - Simple Code Search
**Repository:** `vercel/next.js`
**Difficulty:** Basic
**Tools Expected:** `githubSearchCode`

**Question:**
> Find where the `useRouter` hook is exported from in Next.js. What file defines this export?

**Expected Answer Includes:**
- File path in `packages/next/src/client/components/navigation.ts` or similar
- Export statement for `useRouter`

**Validation Criteria:**
- [ ] Finds correct file path
- [ ] Shows the export statement
- [ ] Identifies it's a client-side hook

---

### Q3: GitHub CLI - Package Dependencies
**Repository:** `cli/cli`
**Difficulty:** Basic
**Tools Expected:** `githubGetFileContent`, `githubViewRepoStructure`

**Question:**
> What programming language is the GitHub CLI written in? List 3 main dependencies from its dependency management file.

**Expected Answer Includes:**
- Written in Go
- `go.mod` file location
- Dependencies like `github.com/spf13/cobra`, `github.com/cli/go-gh`

**Validation Criteria:**
- [ ] Correctly identifies Go language
- [ ] Reads go.mod file
- [ ] Lists actual dependencies

---

### Q4: LangChain - README Analysis
**Repository:** `langchain-ai/langchain`
**Difficulty:** Basic
**Tools Expected:** `githubGetFileContent`

**Question:**
> What is the installation command for LangChain according to their README? What are the main components/packages in the LangChain ecosystem?

**Expected Answer Includes:**
- `pip install langchain` or similar
- Components: langchain-core, langchain-community, langchain-openai, etc.

**Validation Criteria:**
- [ ] Provides correct installation command
- [ ] Identifies the monorepo structure
- [ ] Lists main packages

---

### Q5: Linux - License Information
**Repository:** `torvalds/linux`
**Difficulty:** Basic
**Tools Expected:** `githubGetFileContent`, `githubSearchCode`

**Question:**
> What license is the Linux kernel released under? Find the COPYING file and identify the license type.

**Expected Answer Includes:**
- GPL v2 (GNU General Public License version 2)
- Location of COPYING file
- Key license terms mentioned

**Validation Criteria:**
- [ ] Correctly identifies GPL v2
- [ ] Finds COPYING file at root
- [ ] Mentions "free software" or key GPL terms

---

## Intermediate (Questions 6-10)

### Q6: React - Hook Implementation
**Repository:** `facebook/react`
**Difficulty:** Intermediate
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> How is the `useState` hook implemented internally in React? Find the dispatcher mechanism and explain how state updates are queued.

**Expected Answer Includes:**
- `ReactFiberHooks.js` or similar file
- `mountState` and `updateState` functions
- Dispatcher pattern (`ReactCurrentDispatcher`)
- Queue mechanism for state updates

**Validation Criteria:**
- [ ] Finds correct implementation file
- [ ] Explains dispatcher pattern
- [ ] Mentions fiber/reconciler involvement
- [ ] Shows relevant code snippets

---

### Q7: Next.js - App Router Implementation
**Repository:** `vercel/next.js`
**Difficulty:** Intermediate
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`

**Question:**
> How does Next.js App Router handle dynamic route segments (e.g., `[slug]`)? Find the code that parses dynamic segments and explain the pattern matching logic.

**Expected Answer Includes:**
- Route matching code in `packages/next/src/shared/lib/router/utils/`
- Dynamic segment regex patterns
- `getRouteMatcher` or similar function

**Validation Criteria:**
- [ ] Identifies route parsing logic location
- [ ] Explains bracket notation parsing
- [ ] Shows regex or pattern matching code
- [ ] Mentions catch-all routes `[...slug]`

---

### Q8: CrewAI - Agent Architecture
**Repository:** `crewAIInc/crewAI`
**Difficulty:** Intermediate
**Tools Expected:** `githubViewRepoStructure`, `githubSearchCode`, `githubGetFileContent`

**Question:**
> What is the class hierarchy for Agents in CrewAI? Find the base Agent class and list its main attributes and methods. How does an Agent interact with Tools?

**Expected Answer Includes:**
- `Agent` class location
- Key attributes: `role`, `goal`, `backstory`, `tools`, `llm`
- Tool execution mechanism
- Pydantic model usage

**Validation Criteria:**
- [ ] Finds Agent class definition
- [ ] Lists core attributes correctly
- [ ] Explains tool binding mechanism
- [ ] Mentions LLM integration

---

### Q9: GitHub CLI - Command Registration
**Repository:** `cli/cli`
**Difficulty:** Intermediate
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> How are commands registered in the GitHub CLI? Find the command registration pattern and explain how `gh repo clone` is implemented.

**Expected Answer Includes:**
- Cobra command framework usage
- Command file location (`pkg/cmd/repo/clone/`)
- `NewCmdClone` function pattern
- Flag definitions and execution flow

**Validation Criteria:**
- [ ] Identifies Cobra framework
- [ ] Finds clone command implementation
- [ ] Shows command structure
- [ ] Explains flag handling

---

### Q10: Linux - System Call Definition
**Repository:** `torvalds/linux`
**Difficulty:** Intermediate
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> How is the `open` system call defined in the Linux kernel? Find the syscall definition and trace it to the actual implementation.

**Expected Answer Includes:**
- Syscall table entry
- `SYSCALL_DEFINE` macro usage
- `do_sys_open` or `do_sys_openat2` implementation
- File: `fs/open.c` or similar

**Validation Criteria:**
- [ ] Finds syscall definition macro
- [ ] Traces to implementation function
- [ ] Identifies correct source file
- [ ] Explains syscall number mapping

---

## Advanced (Questions 11-15)

### Q11: React - Concurrent Mode Internals
**Repository:** `facebook/react`
**Difficulty:** Advanced
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubSearchPullRequests`

**Question:**
> How does React's Concurrent Mode handle priority-based scheduling? Find the Scheduler implementation and explain the different priority levels (Immediate, UserBlocking, Normal, Low, Idle). Include the PR that introduced this feature.

**Expected Answer Includes:**
- `packages/scheduler/src/` files
- Priority constants and their values
- `unstable_scheduleCallback` function
- Time slicing implementation
- Relevant PR history

**Validation Criteria:**
- [ ] Finds Scheduler package
- [ ] Lists all 5 priority levels with values
- [ ] Explains time slicing mechanism
- [ ] Finds introducing or related PR
- [ ] Shows task queue implementation

---

### Q12: Next.js - Server Components Streaming
**Repository:** `vercel/next.js`
**Difficulty:** Advanced
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubSearchPullRequests`

**Question:**
> How does Next.js implement streaming for React Server Components? Find the flight response generation code and explain how suspense boundaries are serialized for the wire format.

**Expected Answer Includes:**
- Flight protocol implementation
- `react-server-dom-webpack` integration
- Streaming chunk format
- Suspense boundary handling
- `renderToReadableStream` usage

**Validation Criteria:**
- [ ] Identifies flight protocol files
- [ ] Explains RSC wire format
- [ ] Shows streaming implementation
- [ ] Explains suspense serialization
- [ ] Mentions webpack plugin integration

---

### Q13: LangChain - LCEL Chain Composition
**Repository:** `langchain-ai/langchain`
**Difficulty:** Advanced
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`

**Question:**
> How does LangChain Expression Language (LCEL) implement the pipe operator (`|`) for chain composition? Find the `Runnable` base class and explain how `__or__` method enables chaining. Show how `RunnableSequence` is constructed.

**Expected Answer Includes:**
- `Runnable` base class in langchain-core
- `__or__` method implementation
- `RunnableSequence` class
- `invoke`, `batch`, `stream` method patterns
- Type coercion for different input types

**Validation Criteria:**
- [ ] Finds Runnable base class
- [ ] Shows `__or__` implementation
- [ ] Explains RunnableSequence construction
- [ ] Identifies coercion logic
- [ ] Shows async variants

---

### Q14: GitHub CLI - Authentication Flow
**Repository:** `cli/cli`
**Difficulty:** Advanced
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> How does the GitHub CLI handle OAuth device flow authentication? Trace the entire flow from `gh auth login` to token storage. Include the device code polling mechanism.

**Expected Answer Includes:**
- `pkg/cmd/auth/login/` implementation
- Device flow code request
- Polling interval handling
- Token storage in config
- Keyring integration for secure storage

**Validation Criteria:**
- [ ] Traces complete auth flow
- [ ] Shows device code request
- [ ] Explains polling mechanism
- [ ] Identifies token storage location
- [ ] Mentions different auth methods (web, token)

---

### Q15: Linux - Memory Allocator (SLUB)
**Repository:** `torvalds/linux`
**Difficulty:** Advanced
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> How does the SLUB memory allocator work in the Linux kernel? Find the main allocation path (`kmem_cache_alloc`) and explain the fast path vs slow path. What is the role of per-CPU caches?

**Expected Answer Includes:**
- `mm/slub.c` implementation
- `kmem_cache_alloc` function
- `__slab_alloc` slow path
- Per-CPU partial lists
- `cpu_slab` structure

**Validation Criteria:**
- [ ] Finds SLUB implementation file
- [ ] Explains fast path (per-CPU)
- [ ] Explains slow path (page allocator)
- [ ] Shows freelist management
- [ ] Mentions NUMA awareness

---

## Expert (Questions 16-20)

### Q16: React - Reconciliation Algorithm Deep Dive
**Repository:** `facebook/react`
**Difficulty:** Expert
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubSearchPullRequests`

**Question:**
> Analyze React's fiber reconciliation algorithm. How does `reconcileChildFibers` handle the different cases (single element, array, iterator)? Explain the key diffing optimization and find the PR that introduced the fiber architecture.

**Expected Answer Includes:**
- `ReactChildFiber.js` implementation
- `reconcileSingleElement`, `reconcileChildrenArray`
- Key-based reconciliation
- `placeChild` and `deleteChild` operations
- Original Fiber Architecture PR (likely from 2017)
- Work loop and commit phase separation

**Validation Criteria:**
- [ ] Deep understanding of fiber structure
- [ ] Explains all reconciliation cases
- [ ] Shows key algorithm importance
- [ ] Finds historical PRs
- [ ] Explains effect list generation

---

### Q17: Next.js - Turbopack Integration Architecture
**Repository:** `vercel/next.js`
**Difficulty:** Expert
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`, `githubSearchPullRequests`

**Question:**
> How is Turbopack integrated into Next.js? Find the Rust-to-JavaScript binding layer, explain the incremental computation model, and identify how it differs from webpack's architecture. Include recent PRs that improved Turbopack performance.

**Expected Answer Includes:**
- `packages/next-swc/` Rust code
- Turbo tasks incremental model
- napi-rs bindings
- Graph-based dependency tracking
- Comparison with webpack
- Recent optimization PRs

**Validation Criteria:**
- [ ] Identifies Rust crate locations
- [ ] Explains incremental computation
- [ ] Shows JS-Rust bridge
- [ ] Finds performance PRs
- [ ] Compares with webpack approach

---

### Q18: LangChain - Custom LLM Provider Implementation
**Repository:** `langchain-ai/langchain`
**Difficulty:** Expert
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `packageSearch`

**Question:**
> How would you implement a custom LLM provider for LangChain? Analyze the `BaseLLM` and `BaseChatModel` abstract classes, explain the callback system, and show how token counting and rate limiting are handled. Compare with the OpenAI implementation.

**Expected Answer Includes:**
- `BaseLLM` abstract methods
- `BaseChatModel` for chat models
- Callback manager integration
- `_generate` vs `_agenerate` patterns
- Token counting hooks
- OpenAI implementation as reference
- Retry and rate limit decorators

**Validation Criteria:**
- [ ] Shows both base classes
- [ ] Explains required methods
- [ ] Details callback system
- [ ] Shows OpenAI implementation
- [ ] Identifies retry mechanisms
- [ ] Explains streaming support

---

### Q19: GitHub CLI - Extension System Architecture
**Repository:** `cli/cli`
**Difficulty:** Expert
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`, `githubSearchPullRequests`

**Question:**
> How does the GitHub CLI extension system work? Analyze the extension discovery, installation, and execution flow. How are binary extensions vs script extensions handled differently? Find the PRs that introduced and evolved the extension system.

**Expected Answer Includes:**
- `pkg/cmd/extension/` implementation
- Extension manifest format
- Binary vs bash/script extensions
- PATH integration
- Extension upgrade mechanism
- `gh extension create` scaffolding
- Key PRs introducing extensions

**Validation Criteria:**
- [ ] Explains discovery mechanism
- [ ] Shows binary execution path
- [ ] Shows script execution path
- [ ] Identifies manifest format
- [ ] Finds introducing PRs
- [ ] Explains upgrade flow

---

### Q20: Linux - Network Stack Packet Path
**Repository:** `torvalds/linux`
**Difficulty:** Expert
**Tools Expected:** `githubSearchCode`, `githubGetFileContent`

**Question:**
> Trace the complete path of an incoming TCP packet through the Linux network stack. Start from the network driver interrupt handler, through the protocol layers, to the socket receive buffer. Include NAPI, softirq processing, and the `sk_buff` lifecycle.

**Expected Answer Includes:**
- Driver `napi_poll` entry point
- `netif_receive_skb` processing
- Protocol handler dispatch (`ip_rcv`, `tcp_v4_rcv`)
- Socket lookup and delivery
- `sk_buff` allocation and cloning
- Softirq context (`NET_RX_SOFTIRQ`)
- Key files: `net/core/dev.c`, `net/ipv4/tcp_input.c`

**Validation Criteria:**
- [ ] Traces complete packet path
- [ ] Explains NAPI mechanism
- [ ] Shows protocol layer transitions
- [ ] Identifies key functions at each layer
- [ ] Explains sk_buff lifecycle
- [ ] Mentions GRO/GSO optimizations
- [ ] Shows socket buffer queuing

---

## Scoring Rubric

| Level | Points per Question | Total Points |
|-------|---------------------|--------------|
| Basic (1-5) | 5 points | 25 points |
| Intermediate (6-10) | 10 points | 50 points |
| Advanced (11-15) | 15 points | 75 points |
| Expert (16-20) | 20 points | 100 points |
| **Maximum Total** | | **250 points** |

### Scoring Criteria

**Full Credit:**
- All validation criteria met
- Correct code references with file paths
- Accurate technical explanations
- Relevant PRs found (where applicable)

**Partial Credit:**
- 75%: Most criteria met, minor inaccuracies
- 50%: Core answer correct, missing details
- 25%: Partial understanding, significant gaps

**No Credit:**
- Incorrect file paths
- Fundamentally wrong explanations
- Failed to use appropriate tools

---

## Tool Usage Expectations

| Question | Primary Tools | Secondary Tools |
|----------|---------------|-----------------|
| Q1 | githubViewRepoStructure | - |
| Q2 | githubSearchCode | githubGetFileContent |
| Q3 | githubGetFileContent | githubViewRepoStructure |
| Q4 | githubGetFileContent | - |
| Q5 | githubSearchCode | githubGetFileContent |
| Q6 | githubSearchCode | githubGetFileContent |
| Q7 | githubSearchCode | githubGetFileContent, githubViewRepoStructure |
| Q8 | githubViewRepoStructure | githubSearchCode, githubGetFileContent |
| Q9 | githubSearchCode | githubGetFileContent |
| Q10 | githubSearchCode | githubGetFileContent |
| Q11 | githubSearchCode | githubGetFileContent, githubSearchPullRequests |
| Q12 | githubSearchCode | githubGetFileContent, githubSearchPullRequests |
| Q13 | githubSearchCode | githubGetFileContent, githubViewRepoStructure |
| Q14 | githubSearchCode | githubGetFileContent |
| Q15 | githubSearchCode | githubGetFileContent |
| Q16 | githubSearchCode | githubGetFileContent, githubSearchPullRequests |
| Q17 | githubSearchCode | All GitHub tools |
| Q18 | githubSearchCode | githubGetFileContent, packageSearch |
| Q19 | githubSearchCode | githubGetFileContent, githubSearchPullRequests |
| Q20 | githubSearchCode | githubGetFileContent |

---

## Repository Reference

| Repository | Owner | Primary Language | Size |
|------------|-------|------------------|------|
| React | facebook | JavaScript | Large |
| Next.js | vercel | TypeScript/Rust | Very Large |
| LangChain | langchain-ai | Python | Large |
| CrewAI | crewAIInc | Python | Medium |
| GitHub CLI | cli | Go | Medium |
| Linux | torvalds | C | Massive |
