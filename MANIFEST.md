# Manifest of Octocode for Context Driven Development

> **Disclaimer**: This is an ongoing research document representing the main vision of Octocode. Algorithms and decisions might change; this document serves to demonstrate the main idea behind Octocode.
>
> Octocode intends to make sufficient simplified research using minimal resources to gather data with minimal noise.


## Overview
This document serves as the **Manifest of Octocode for Context Driven Development (CDD)**. It introduces the methodology, the concept of **"Vibe-Research"**, the definition of **"Smart Research"**, and the **Process Context Oriented Flows** that drive high-quality software development. By leveraging Octocode's research capabilities, we shift from "guess-driven" to "research-driven" development without breaking your flow.

---

## Part 1: The Core Philosophy

### What is Context Driven Development (CDD)?
**Context Driven Development (CDD)** is the methodology that formalizes "vibe-research." It prioritizes **evidence gathering** and **context validation** before any code is implemented. The core philosophy is simple: **Code is Truth, but Context is the Map.**

### What is "Vibe-Research"?
"Vibe-research" is the **intuitive flow state** enabled by Octocode's research engine. It transforms the often tedious process of gathering context into a seamless, conversational rhythm. Instead of context-switching, you stay in the "vibe" while Octocode handles the forensics.

### What is "Smart Research"?
"Smart Research" is the automated, evidence-based forensics capability of the Octocode engine. It bridges the gap between intuition ("vibe") and reality (code) by intelligently deciding which tools to use—traversing call graphs, searching external repos, or validating assumptions—without manual micromanagement.

*   **The Vibe**: "I feel like this function is related to the auth service..."
*   **The Research**: Octocode instantly validates that feeling with `localSearchCode` and `lspCallHierarchy`.
*   **The Result**: You move from "guessing" to "knowing" without breaking your coding stride.

### The CDD Equation
$$ CDD = (Static Context + Dynamic Context) \times Validation \times \epsilon$$

*   **Static Context (The Knowns)**: The immutable truth of your current code (`octocode-local`).
*   **Dynamic Context (The Unknowns)**: External knowledge, history, and patterns (`octocode-external`).
*   **Validation (The Proof)**: Cross-referencing against reality to ensure your map matches the territory.

---

## Part 2: The Minimal Context Equation

### Core Principle: Minimal Context, Maximum Quality
> **"The context window should contain the minimal context necessary for the agent to implement the task with maximum quality."**

Octocode explicitly targets the **right context** while preserving clear **reasoning steps** with **minimal context pollution**. By utilizing **chained actions**, where the output of one discrete step becomes the input for the next, it ensures the highest, most effective outputs for any purpose of context creation.

Each flow (Plan, Research, Implement) is executed by a **separate agent or session** to adhere to this principle.

### The Equation
$$Quality = \frac{Relevant\ Context}{Context\ Noise} \times Validation \times \epsilon$$

### Key Mechanisms

#### 1. The Attention Mechanism
**Why Minimal is Better**: LLMs operate on an "attention mechanism," which assigns weights to different parts of the input. When the context is bloated with irrelevant information ("noise"), the model's attention is diluted, leading to hallucinations or missed details.
*   **The CDD Advantage**: By providing **minimal, highly relevant context**, we maximize the agent's effective attention on the task at hand. A focused 2K context window often outperforms a noisy 50K window because the signal-to-noise ratio is higher.

#### 2. The Check-and-Balance Mechanism
**The Reality Check**: A crucial component of this equation is the "check-and-balance" mechanism. This step validates that the gathered context (the map) faithfully represents the physical reality of the environment (the territory).
*   **Function**: It actively verifies assumptions against the actual codebase state (e.g., "Does this file actually exist?", "Is this function actually exported?").
*   **Outcome**: This ensures the agent never plans or implements based on hallucinations or outdated mental models.

### Patterns vs. Anti-Patterns
| Principle | Anti-Pattern | CDD Pattern |
|-----------|--------------|-------------|
| **Focus** | Dump entire codebase | Surgical extraction via LSP |
| **Relevance** | "Just in case" context | Evidence-based inclusion |
| **Freshness** | Stale cached context | Real-time research |
| **Isolation** | Shared mega-context | Per-session minimal context |

---

## Part 3: The Octocode Engine

**Octocode is the Research Engine** that powers this methodology. It bridges the gap between what you know (local codebase) and what you need to know (external knowledge).

### Context Pillars
A robust context is built on four pillars:

#### 1. Static Context (The "Knowns")
Immutable or slowly changing sources of truth. **(Powered by `octocode-local`)**
*   **Tools**: `localSearchCode`, `localViewStructure`, `lspGotoDefinition`
*   **Source**: The actual code on disk, definitions, and call graphs.

#### 2. Dynamic Context (The "Unknowns")
External or rapidly changing information. **(Powered by `octocode-external`)**
*   **Tools**: `githubSearchCode`, `packageSearch`, `githubSearchPullRequests`
*   **Source**: Remote repos, package internals, and code history.

#### 3. Validated Context (The "Verified")
Verified against any external resource.
*   **Sources**: Knowledge Bases, Jira, Slack, Logs, Vector DBs.
*   **Hint-Driven**: Octocode receives hints and autonomously searches to validate context.

#### 4. CDD Data (The "Session State")
The artifacts generated during the CDD process itself.
*   **Sources**: `plan.md`, `research.md`, design docs.
*   **Role**: Provides the immediate historical context and decisions made within the current session, acting as the bridge between steps.

### Context Creation
**Octocode is the research initiator.** It proactively aggregates context from three primary sources to build the CDD map:

*   **Known Stuff**: Structured knowledge retrieved from Vector DBs, Knowledge Graphs (KG), and established facts.
*   **Dynamic Research**: Real-time exploration using Octocode tools to traverse code, flows, and external packages.
*   **Existing Context**: Documentation describing the organization, business features, and repositories.

### The Research Engine Architecture
```
+---------------------------------------------------------------+
|                   OCTOCODE RESEARCH ENGINE                    |
+---------------------------------------------------------------+
|                                                               |
|  +------------------+        +------------------------+       |
|  |   LOCAL TOOLS    |        |    EXTERNAL TOOLS      |       |
|  |  (octocode-local)|        |  (octocode-external)   |       |
|  +------------------+        +------------------------+       |
|           |                              |                    |
|           +-------------+----------------+                    |
|                         v                                     |
|           +----------------------------------+                |
|           |   CONTEXT VALIDATION (Hints)     |                |
|           +----------------------------------+                |
+---------------------------------------------------------------+
```

---

## Part 4: Process Context Oriented Flows (The Workflow)

### Multi-Agent Session Architecture (GAN-Inspired)
This workflow draws inspiration from **Generative Adversarial Networks (GANs)**, where a "Generator" (the doing agent) and a "Discriminator" (the validating agent) compete to ensure maximum quality.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CDD ADVERSARIAL FLOW                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. PLAN             2. VERIFY            3. RESEARCH                  │
│  ┌───────────┐      ┌───────────┐       ┌───────────┐                  │
│  │ Planner   │─────►│ Verifier  │──────►│Researcher │                  │
│  │ (Gen)     │      │ (Disc)    │       │ (Gen)     │                  │
│  └───────────┘      └───────────┘       └───────────┘                  │
│       │                                       │                        │
│       ▼                                       ▼                        │
│   [plan.md]                              [research.md]                 │
│                                               │                        │
│                                               ▼                        │
│  6. VALIDATE         5. IMPLEMENT         4. VALIDATE                  │
│  ┌───────────┐      ┌───────────┐       ┌───────────┐                  │
│  │ Verifier  │◄─────│ Coder     │◄──────│ Verifier  │                  │
│  │ (Disc)    │      │ (Gen)     │       │ (Disc)    │                  │
│  └───────────┘      └───────────┘       └───────────┘                  │
│       ▲                  ▲                                             │
│       └──────────────────┘                                             │
│         [code + tests]                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Detailed Flow Breakdown

#### 1. Plan Implementation (Generator)
*   **Goal**: Define objective & identify "Unknowns".
*   **Output**: `plan.md` with research questions.

#### 2. Verify Plan (Discriminator)
*   **Goal**: Critique the plan for gaps, assumptions, and clarity.
*   **Action**: Adversarial review by a separate agent context.
*   **Output**: Approved `plan.md` or feedback loop.

#### 3. Create Research (Generator)
*   **Goal**: Gather evidence to answer the plan's questions.
*   **Action**: Trace flows (LSP), find patterns (GitHub), validate hints.
*   **Output**: `research.md` (The "CDD Data").

#### 4. Validate Research (Discriminator)
*   **Goal**: Ensure research is sufficient and evidence-backed.
*   **Action**: Verify that all "Unknowns" from the plan are addressed with concrete evidence (line numbers, file paths).
*   **Output**: Approved `research.md` or request for more info.

#### 5. Implement Plan (Generator)
*   **Goal**: Execute the plan using the validated Research Context.
*   **Input**: `plan.md` + `research.md` (CDD Data).
*   **Output**: Code changes + Tests.

#### 6. Validate Implementation (Discriminator)
*   **Goal**: Verify correctness against the Plan, Research, and Rules.
*   **Action**: Run tests, lint, and perform a logic check against the `research.md` findings.
*   **Output**: "Done" signal or fix request.

### The Adversarial Zero-Sum Game
Similar to a GAN, the **Verifier (Discriminator)** tries to find flaws in the **Generator's** output.
*   **Generator's Goal**: Produce output so good the Verifier cannot find faults.
*   **Verifier's Goal**: Find any discrepancy between the output and the "Truth" (Codebase/Context).
*   This tension forces quality up without manual user intervention at every micro-step.

### Cross-Model Validation
If the Verifier is the same model as the Generator (e.g., both are GPT-4o or Claude 3.5), they might share the same blind spots. **Cross-Model Validation** (using a different model for the Verifier) would make this bulletproof. By ensuring different models check each other, we eliminate shared biases and drastically reduce the probability of undetected errors.

---

## Part 5: Concrete Instantiation & The Science

### CDD Concrete Example
```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       CDD PIPELINE INSTANTIATION                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   A₁ = PLAN              A₂ = RESEARCH           A₃ = IMPLEMENT                 │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐                 │
│   │ C₁ = {      │        │ C₂ = {      │        │ C₃ = {      │                 │
│   │   goal      │        │   plan.md   │        │  research   │                 │
│   │ }           │        │ }           │        │ }           │                 │
│   └──────┬──────┘        └──────┬──────┘        └──────┬──────┘                 │
│          ▼                      ▼                      ▼                        │
│      [plan.md]            [research.md]           [code.ts]                     │
│          │                      │                      │                        │
│          ▼                      ▼                      ▼                        │
│   V₁ = PLAN_VERIFY       V₂ = RESEARCH_VERIFY   V₃ = CODE_VERIFY                │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐                 │
│   │ Cv₁ = {     │        │ Cv₂ = {     │        │ Cv₃ = {     │                 │
│   │  plan,      │        │ research,   │        │  code,      │                 │
│   │  logic      │        │ sources     │        │  plan, res  │                 │
│   │ }           │        │ }           │        │ }           │                 │
│   └──────┬──────┘        └──────┬──────┘        └──────┬──────┘                 │
│          ▼                      ▼                      ▼                        │
│      [plan.md']───────►   [research.md']───────►  [code.ts']                    │
│                                                                                 │
│   VALIDATION CRITERIA (Adversarial):                                            │
│   • V₁: Are there logical gaps? Are unknowns identified?                        │
│   • V₂: Is every claim backed by a file reference?                              │
│   • V₃: Does it pass tests? Does it match the research?                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### The Key Principles Validated

| Principle | Document Reference |
|-----------|--------------------|
| Separate sessions | "Each flow (Plan, Research, Implement) is executed by a separate agent or session" |
| Minimal context per action | "The context window should contain the minimal context necessary" |
| Output bridges actions | `[plan.md]` → `[research.md]` → `[code + tests]` |
| Adversarial Checks | "Verifier (Discriminator) tries to find flaws in the Generator's output" |

### Why Clean Fresh Context Window Matters? (The Science)

**The concept of clean window context is critical for robust implementation.**

$$ ACTION_1 \rightarrow OUTPUT \rightarrow ACTION_2 \rightarrow ... $$

Each action operates with a **fresh context window**, utilizing only the *output* of the previous action as its *input*.

#### Why it matters:

1.  **Eliminates Context Pollution**: Prevents "ghosts" from previous attempts or unrelated files from confusing the model.
2.  **Maximizes Attention**: The model's attention mechanism is fully focused on the immediate task inputs, not diluted by history.
3.  **Enforces Modularity**: By treating steps as isolated functions (`f(plan) -> research`, `f(research) -> code`), we create a debuggable, deterministic pipeline.


## References

*   [Recursive Meta-Metacognition: A Hierarchical Model of Self-Evaluation](https://www.researchgate.net/publication/391826471_Recursive_Meta-Metacognition_A_Hierarchical_Model_of_Self-Evaluation)
*   [Generative Adversarial Network](https://en.wikipedia.org/wiki/Generative_adversarial_network)
*   [Chain of Verification](https://github.com/ritun16/chain-of-verification)
