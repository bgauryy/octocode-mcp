# AI Agent Frameworks & RAG Resources

> Production-ready AI agent frameworks, RAG systems, and vector databases for Node.js/TypeScript

**🎯 Purpose:** Essential AI resources for building intelligent agents with embeddings, RAG, and rerankers  
**🌐 Focus:** TypeScript-native frameworks (Mastra, LlamaIndexTS, LangChainJS, Vercel AI SDK)  
**⚙️ Runtime:** Node.js/TypeScript with production-ready vector databases  
**📅 Updated:** October 14, 2025

---

## Quick Reference

### 🎯 Production Stack (2025)
- **Agent Framework:** `mastra-ai/mastra` - TypeScript-native with built-in RAG + observability
- **RAG Framework:** `run-llama/LlamaIndexTS` - 100+ data connectors, production-ready
- **Vector DB:** `qdrant/qdrant` - Fastest with best Node.js SDK
- **Embeddings:** `xenova/transformers.js` - Run models in Node.js/browser
- **Reranking:** Cohere Re-rank API - 20-30% accuracy boost
- **Observability:** `langfuse/langfuse` - LLM engineering platform

### TypeScript Agent Frameworks (Start Here)
- **Best Overall:** `mastra-ai/mastra` (17K+ ⭐) - Complete framework with RAG + observability
- **Best RAG:** `run-llama/LlamaIndexTS` (3K+ ⭐) - Comprehensive data framework
- **Most Popular:** `langchain-ai/langchainjs` (15K+ ⭐) - Massive ecosystem
- **Best for Next.js:** `vercel/ai` (14K+ ⭐) - Streaming + React components

### Vector Databases
- **Best Performance:** `qdrant/qdrant` (23K+ ⭐) - Fastest with advanced filtering
- **Enterprise Scale:** `milvus-io/milvus` (33K+ ⭐) - Billions of vectors
- **Easiest to Use:** `chroma-core/chroma` (18K+ ⭐) - Best DX, rapid prototyping
- **With PostgreSQL:** `pgvector/pgvector` (16K+ ⭐) - Keep vectors with relational data

### Embeddings & Reranking
- **Node.js Embeddings:** `xenova/transformers.js` (17K+ ⭐) - Run 100+ models in JavaScript
- **Reranking (Essential):** Cohere Re-rank API - Improves RAG accuracy 20-30%
- **API Services:** OpenAI `text-embedding-3-small`, Cohere Embed v3, Voyage AI

### RAG Techniques (Learn Here)
- **Most Comprehensive:** `NirDiamant/RAG_Techniques` (22K+ ⭐) - Complete guide to advanced RAG
- **Advanced Patterns:** `NirDiamant/Controllable-RAG-Agent` (1.4K+ ⭐) - Graph-based agent RAG
- **Practical Cookbook:** `athina-ai/rag-cookbooks` (2.3K+ ⭐) - Working implementations
- **Evaluation:** `explodinggradients/ragas` (9K+ ⭐) - RAG assessment framework

### Multi-Agent Systems
- **Complete Platform:** `langgenius/dify` (116K+ ⭐) - Visual workflows + RAG + monitoring
- **Team-Based:** `crewAIInc/crewAI` (39K+ ⭐) - Role-based collaborative agents
- **Visual Builder:** `FlowiseAI/Flowise` (45K+ ⭐) - Drag-and-drop on LangChain

### Observability
- **Best Overall:** `langfuse/langfuse` (17K+ ⭐) - Open-source LLM engineering platform
- **Built-in:** Mastra, VoltAgent - Frameworks with observability included

---

## Table of Contents
1. [TypeScript Agent Frameworks](#typescript-agent-frameworks)
2. [Vector Databases](#vector-databases-production-ready)
3. [Embeddings & Reranking](#embeddings--reranking)
4. [RAG Frameworks & Techniques](#rag-frameworks--techniques)
5. [Multi-Agent Systems](#multi-agent-systems)
6. [LangChain Ecosystem](#langchain-ecosystem)
7. [Observability & Evaluation](#observability--evaluation)

---

## TypeScript Agent Frameworks

### Production-Ready TypeScript Frameworks

**⭐ mastra-ai/mastra** (17,368+ stars) ⚡ ESSENTIAL
- Complete TypeScript AI agent framework with built-in RAG, observability, and assistants
- 🔗 https://github.com/mastra-ai/mastra
- **Use Case:** THE modern TypeScript framework for AI agents (2025)
- **Why Essential:** TypeScript-native, built-in RAG + observability, supports all LLMs
- **Features:** Assistants, RAG, workflows, agents, observability, streaming
- **Best For:** Production TypeScript AI apps, Next.js integration, modern DX

**⭐ VoltAgent/voltagent** (3,579+ stars) ⚡ HIGHLY RECOMMENDED
- Open Source TypeScript AI Agent Framework with built-in LLM Observability
- 🔗 https://github.com/VoltAgent/voltagent
- **Use Case:** TypeScript agent framework with first-class observability
- **Why Recommended:** Production-ready with monitoring built-in
- **Best For:** TypeScript agents needing observability out of the box

**⭐ run-llama/LlamaIndexTS** (2,912+ stars) ⚡ ESSENTIAL
- TypeScript/JavaScript data framework for LLM applications
- 🔗 https://github.com/run-llama/LlamaIndexTS
- **Use Case:** Comprehensive RAG framework for Node.js/TypeScript
- **Why Essential:** Best TypeScript alternative to Python LlamaIndex
- **Features:** 100+ data connectors, indexing, retrieval, query engines
- **Best For:** Production RAG systems in Node.js, data-heavy applications

**⭐ langchain-ai/langchainjs** (15,400+ stars) ⚡ ESSENTIAL
- Official LangChain JavaScript/TypeScript implementation
- 🔗 https://github.com/langchain-ai/langchainjs
- **Use Case:** Industry-standard LLM framework with comprehensive ecosystem
- **Why Essential:** Most popular, massive ecosystem, production-ready
- **Features:** Document loaders, vector stores, retrievers, chains, agents
- **Best For:** Complex workflows, extensive integrations, mature ecosystem

**⭐ vercel/ai** (13,800+ stars) ⚡ HIGHLY RECOMMENDED
- Vercel AI SDK - build AI-powered products with React, Next.js, Vue, Svelte
- 🔗 https://github.com/vercel/ai
- **Use Case:** Modern RAG in Next.js/React with streaming and UI components
- **Why Recommended:** Best DX for full-stack TypeScript RAG applications
- **Features:** Streaming responses, RAG utilities, UI components, edge runtime
- **Best For:** Next.js apps, streaming RAG, modern web applications

---

## Vector Databases (Production Ready)

### Top 4 Vector Databases for Node.js

**⭐ qdrant/qdrant** (22,800+ stars) ⚡ ESSENTIAL
- Vector database written in Rust with advanced filtering and excellent Node.js SDK
- 🔗 https://github.com/qdrant/qdrant
- **Use Case:** #1 choice for production RAG with TypeScript/Node.js
- **Why Essential:** Fastest vector search, best Node.js SDK, advanced filtering
- **Best For:** Production RAG systems, semantic search with metadata

**⭐ milvus-io/milvus** (32,900+ stars) ⚡ ESSENTIAL
- Industry-standard vector database for billion-scale similarity search
- 🔗 https://github.com/milvus-io/milvus
- **Use Case:** Enterprise-scale vector search with cloud-native architecture
- **Why Essential:** Most mature, handles billions of vectors, strong Node.js client
- **Best For:** Large-scale RAG, recommendation engines, enterprise systems

**⭐ chroma-core/chroma** (18,200+ stars) ⚡ HIGHLY RECOMMENDED
- AI-native embedding database with best developer experience
- 🔗 https://github.com/chroma-core/chroma
- **Use Case:** Fastest to prototype, perfect for LangChain/LlamaIndex integration
- **Why Recommended:** Minimal setup, great DX, excellent LangChain support
- **Best For:** Prototypes, small-medium datasets, rapid development

**⭐ pgvector/pgvector** (16,100+ stars) ⚡ HIGHLY RECOMMENDED
- Vector similarity search for PostgreSQL
- 🔗 https://github.com/pgvector/pgvector
- **Use Case:** Keep embeddings with relational data in Postgres
- **Why Recommended:** Best for hybrid data models, no separate vector DB needed
- **Best For:** Existing Postgres apps, cost-effective RAG

### Managed Services & Utilities

**Pinecone** - Fully managed vector database (SaaS)
- TypeScript client: `pinecone-io/pinecone-ts-client`
- **Best For:** Zero ops, fast time-to-market

**⭐ zilliztech/GPTCache** (7,600+ stars)
- Semantic cache for LLMs - 95%+ cost reduction
- 🔗 https://github.com/zilliztech/GPTCache
- **Best For:** Cost optimization for production LLM apps

---

## Embeddings & Reranking

### Embedding Solutions

**⭐ xenova/transformers.js** (16,500+ stars) ⚡ ESSENTIAL
- Run transformer models directly in Node.js/browser - no Python needed
- 🔗 https://github.com/xenova/transformers.js
- **Use Case:** THE solution for embeddings in Node.js/TypeScript
- **Why Essential:** Run 100+ models in JavaScript, production-ready
- **Popular Models:** `all-MiniLM-L6-v2` (fast), `bge-small-en-v1.5` (quality)
- **Best For:** Node.js backends, edge computing, self-hosted embeddings

**Embedding APIs** ⚡ HIGHLY RECOMMENDED
- **OpenAI:** `text-embedding-3-small` (fast/cheap), `text-embedding-3-large` (quality)
- **Cohere:** Embed v3 (multilingual, compression support)
- **Voyage AI:** Domain-specific (code, finance, legal)
- **Best For:** Production systems, managed infrastructure, consistent quality

### Reranking (Critical for RAG Quality)

**⭐ Cohere Re-rank API** ⚡ ESSENTIAL
- Best-in-class reranking - 20-30% accuracy improvement
- **Use Case:** Rerank top-k retrieved documents before sending to LLM
- **Why Essential:** Dramatically improves RAG accuracy with minimal effort
- **Best For:** All production RAG systems

**⭐ FlagOpen/FlagEmbedding** (8,700+ stars) (Python)
- BAAI's embedding and re-ranking models (bge-reranker)
- 🔗 https://github.com/FlagOpen/FlagEmbedding
- **Use Case:** Self-hosted re-ranking models
- **Node.js Alternative:** Use Cohere Re-rank API or deploy via inference server

---

## RAG Frameworks & Techniques

### RAG Frameworks
(See [TypeScript Agent Frameworks](#typescript-agent-frameworks) for Mastra, LlamaIndexTS, LangChain, Vercel AI SDK)

### Advanced RAG Techniques (Must-Read)

**⭐ NirDiamant/RAG_Techniques** (22,355+ stars) ⚡ ESSENTIAL
- Comprehensive repository of advanced RAG techniques and implementations
- 🔗 https://github.com/NirDiamant/RAG_Techniques
- **Use Case:** THE complete guide to cutting-edge RAG patterns
- **Why Essential:** Most comprehensive RAG techniques collection (2025)
- **Techniques:** Hybrid search, re-ranking, query expansion, fusion, citation tracking
- **Best For:** Learning advanced RAG, implementing SOTA patterns

**⭐ NirDiamant/Controllable-RAG-Agent** (1,448+ stars) ⚡ HIGHLY RECOMMENDED
- Advanced RAG with graph-based agent architecture and controllable retrieval
- 🔗 https://github.com/NirDiamant/Controllable-RAG-Agent
- **Use Case:** State-of-the-art RAG with agent-controlled retrieval
- **Why Recommended:** Implements latest RAG research (2024-2025)
- **Features:** Adaptive retrieval, query decomposition, fusion strategies
- **Best For:** Complex RAG systems, multi-step reasoning

**⭐ athina-ai/rag-cookbooks** (2,280+ stars) ⚡ HIGHLY RECOMMENDED
- Advanced RAG techniques cookbook with practical implementations
- 🔗 https://github.com/athina-ai/rag-cookbooks
- **Use Case:** Hands-on RAG cookbook with working examples
- **Why Recommended:** Practical implementations of advanced techniques
- **Best For:** Production RAG development, learning by example

### RAG Evaluation & Optimization

**⭐ explodinggradients/ragas** (9,200+ stars) ⚡ ESSENTIAL (Python)
- RAG Assessment framework - evaluation metrics for RAG pipelines
- 🔗 https://github.com/explodinggradients/ragas
- **Use Case:** Automated RAG evaluation (faithfulness, relevancy, recall)
- **Why Essential:** Standard RAG evaluation metrics
- **Best For:** RAG quality assessment, A/B testing
- **Node.js Alternative:** LangSmith or custom LLM-as-judge patterns

**⭐ langchain-ai/langsmith-cookbook** (1,900+ stars)
- LangSmith cookbook with RAG evaluation examples
- 🔗 https://github.com/langchain-ai/langsmith-cookbook
- **Use Case:** Production RAG monitoring with LangSmith
- **Best For:** LangChain projects, production observability

### Production RAG Templates

**⭐ a16z-infra/ai-getting-started** (4,900+ stars) ⚡ HIGHLY RECOMMENDED
- A16z's production-ready RAG stack (Next.js + Pinecone + OpenAI)
- 🔗 https://github.com/a16z-infra/ai-getting-started
- **Use Case:** Starting point for production RAG applications
- **Why Recommended:** Best practices from leading VC
- **Best For:** Next.js RAG applications


---

## Multi-Agent Systems

### Multi-Agent Collaboration Frameworks

**⭐ langgenius/dify** (116,335+ stars) ⚡ ESSENTIAL
- Complete AI agent development platform with visual workflows, RAG, and observability
- 🔗 https://github.com/langgenius/dify
- **Use Case:** THE production platform for agentic workflows (2025 leader)
- **Why Essential:** Most popular LLM platform, combines workflows + RAG + monitoring
- **Best For:** Enterprise agent applications, visual development

**⭐ crewAIInc/crewAI** (39,166+ stars) ⚡ ESSENTIAL (Python)
- Role-based collaborative AI agent framework (1M+ monthly downloads)
- 🔗 https://github.com/crewAIInc/crewAI
- **Use Case:** Multi-agent teams working as coordinated crew
- **Why Essential:** #1 for team-based agents, minimal setup, production-proven
- **Node.js Alternative:** `langchain-ai/langgraphjs` for TypeScript multi-agent

**⭐ microsoft/autogen** (Python + .NET) ⚡ HIGHLY RECOMMENDED
- Microsoft's multi-agent conversation framework
- 🔗 https://github.com/microsoft/autogen
- **Use Case:** Enterprise multi-agent with structured interactions
- **Why Recommended:** Microsoft-backed, enterprise-grade
- **Best For:** Complex research workflows, enterprise deployments

### Visual Agent Builders

**⭐ FlowiseAI/Flowise** (45,496+ stars) ⚡ HIGHLY RECOMMENDED
- Drag-and-drop AI agent builder on LangChain
- 🔗 https://github.com/FlowiseAI/Flowise
- **Use Case:** No-code/low-code agent development
- **Why Recommended:** Best visual builder, rapid prototyping
- **Best For:** Non-developers, rapid prototyping, LangChain workflows

### Specialized Agent Applications

**⭐ cline/cline** (51,262+ stars) ⚡ HIGHLY RECOMMENDED
- Autonomous coding agent for VSCode
- 🔗 https://github.com/cline/cline
- **Use Case:** AI pair programmer in IDE
- **Why Recommended:** Top coding agent, highly autonomous

**⭐ assafelovic/gpt-researcher** (23,793+ stars) ⚡ HIGHLY RECOMMENDED (Python)
- Autonomous research agent with web search and citations
- 🔗 https://github.com/assafelovic/gpt-researcher
- **Use Case:** Deep research with proper citations
- **Why Recommended:** Industry-standard research automation
- **Node.js Alternative:** Build with LangChain + web search tools

**⭐ khoj-ai/khoj** (31,313+ stars) ⚡ HIGHLY RECOMMENDED
- Self-hosted AI second brain with web and doc search
- 🔗 https://github.com/khoj-ai/khoj
- **Use Case:** Personal knowledge management with AI
- **Why Recommended:** Best self-hosted knowledge assistant

**⭐ CopilotKit/CopilotKit** (24,408+ stars) ⚡ HIGHLY RECOMMENDED
- React UI + infrastructure for in-app AI copilots
- 🔗 https://github.com/CopilotKit/CopilotKit
- **Use Case:** Embed AI agents in React applications
- **Why Recommended:** Best React integration for agents

### Learning Resources

**⭐ NirDiamant/GenAI_Agents** (17,250+ stars) ⚡ HIGHLY RECOMMENDED
- Comprehensive tutorials for Generative AI Agent techniques
- 🔗 https://github.com/NirDiamant/GenAI_Agents
- **Use Case:** Learn agent patterns and implementations
- **Why Recommended:** Comprehensive, practical examples
- **Best For:** Learning agent development, reference implementations

**⭐ e2b-dev/awesome-ai-agents** (23,397+ stars)
- Curated list of AI autonomous agents
- 🔗 https://github.com/e2b-dev/awesome-ai-agents
- **Use Case:** Discover agent projects and tools

---

## LangChain Ecosystem

### Core Libraries

**⭐ langchain-ai/langchainjs** ⚡ ESSENTIAL
- Official LangChain JavaScript/TypeScript implementation
- 🔗 https://github.com/langchain-ai/langchainjs
- **Use Case:** Industry-standard LLM framework for TypeScript
- **Why Essential:** Massive ecosystem, production-ready, 15K+ stars
- (See [TypeScript Agent Frameworks](#typescript-agent-frameworks) for details)

**⭐ langchain-ai/langgraph** ⚡ HIGHLY RECOMMENDED
- Stateful, graph-based agent workflows for complex multi-agent systems
- 🔗 https://github.com/langchain-ai/langgraph
- **Use Case:** Advanced agent orchestration with cyclical graphs
- **Why Recommended:** Best for complex agent interactions and state management

### LangChain/LangGraph Examples

**⭐ wassim249/fastapi-langgraph-agent-production-ready-template** (1,379+ stars)
- Production-ready FastAPI + LangGraph template
- 🔗 https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template
- **Use Case:** Production LangGraph starting point

**⭐ von-development/awesome-LangGraph** (1,153+ stars)
- Comprehensive LangChain + LangGraph ecosystem index
- 🔗 https://github.com/von-development/awesome-LangGraph
- **Use Case:** Discover LangGraph resources and tools

---

## Observability & Evaluation

**⭐ langfuse/langfuse** (17,000+ stars) ⚡ ESSENTIAL
- Open source LLM engineering platform with observability, metrics, and evals
- 🔗 https://github.com/langfuse/langfuse
- **Use Case:** THE platform for LLM observability and monitoring
- **Why Essential:** Industry-standard for production LLM monitoring
- **Features:** Tracing, metrics, evals, prompt management, cost tracking
- **Best For:** Production LLM apps, debugging, optimization

**⭐ Built-in Observability**
- **Mastra** - Built-in observability in TypeScript agent framework
- **VoltAgent** - TypeScript framework with first-class observability
- **LangSmith** - Official LangChain observability (paid/free tiers)

**⭐ Evaluation Frameworks**
- **RAGAS** - RAG evaluation metrics (Python)
- **LangSmith Cookbook** - Evaluation examples for LangChain
- **Custom LLM-as-judge** - Build evaluation with GPT-4/Claude

---

*Part of octocode-mcp resources collection*

