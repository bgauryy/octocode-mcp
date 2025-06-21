# LangGraph in Node.js: Complete Tutorial with OpenAI Agent Implementation

## Table of Contents
1. [LangGraph Overview](#langgraph-overview)
2. [Existing LangGraph Implementations](#existing-implementations)
3. [Setting Up Your Environment](#environment-setup)
4. [Building a Simple Agent with OpenAI API](#building-simple-agent)
5. [Advanced Agent Examples](#advanced-examples)
6. [Best Practices](#best-practices)
7. [Resources](#resources)

## LangGraph Overview

LangGraph is a library for building stateful, multi-actor applications with language models. It extends LangChain's expression language with the ability to coordinate multiple chains (or actors) across multiple steps of computation in a cyclic manner.

### Key Features:
- **Stateful**: LangGraph maintains state across interactions
- **Multi-Actor**: Coordinate multiple LLM agents
- **Cyclic Graphs**: Support for loops and complex workflows
- **TypeScript Support**: First-class TypeScript integration
- **Memory & Persistence**: Built-in checkpointing capabilities

## Existing LangGraph Implementations

Based on my research, here are notable LangGraph implementations in the Node.js ecosystem:

### 1. Official LangChain LangGraph JS
- **Repository**: [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs)
- **NPM Package**: `@langchain/langgraph`
- **Latest Version**: 0.3.4
- **Official implementation** with TypeScript support

### 2. Community Projects
- **Agentic Workflows**: [sambhavsaxena/agentic-workflows](https://github.com/sambhavsaxena/agentic-workflows) - Experiments with AI agents using LangGraph
- **Coinbase AgentKit**: [coinbase/agentkit](https://github.com/coinbase/agentkit) - Production-ready crypto agent implementation
- **Monitor Agent**: [fantasy-lotus/monitor_agent_langgraphjs](https://github.com/fantasy-lotus/monitor_agent_langgraphjs) - TypeScript monitoring agent

## Environment Setup

### Prerequisites
- Node.js 18+ or latest LTS
- TypeScript (recommended)
- OpenAI API key

### Installation

```bash
# Create a new project
mkdir langgraph-agent
cd langgraph-agent

# Initialize project
npm init -y

# Install dependencies
yarn add @langchain/langgraph @langchain/openai @langchain/core dotenv zod
yarn add -D typescript @types/node tsx nodemon

# Initialize TypeScript
npx tsc --init
```

### Environment Configuration

Create a `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Building a Simple Agent with OpenAI API

### 1. Basic Weather Agent

Let's start with a simple weather agent that can get weather information:

```typescript
// src/agents/weather-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

// Define weather tool
const getWeatherTool = tool(
  async ({ location }) => {
    // Simulate weather API call
    const weatherData = {
      "san francisco": "Foggy, 60°F",
      "new york": "Sunny, 75°F", 
      "london": "Rainy, 55°F",
      "tokyo": "Cloudy, 68°F"
    };
    
    const weather = weatherData[location.toLowerCase()] || "Weather data not available";
    return `Current weather in ${location}: ${weather}`;
  },
  {
    name: "get_weather",
    description: "Get current weather for a specified location",
    schema: z.object({
      location: z.string().describe("The city or location to get weather for"),
    }),
  }
);

// Define tools array
const tools = [getWeatherTool];

// Initialize the language model
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
});

// Create the agent
const agent = createReactAgent({
  llm,
  tools,
  checkpointSaver: new MemorySaver(),
});

// Example usage
export async function runWeatherAgent() {
  const config = { configurable: { thread_id: "weather-thread-1" } };
  
  const inputs = {
    messages: [new HumanMessage("What's the weather like in San Francisco?")],
  };

  console.log("Starting weather agent...");
  
  const stream = await agent.stream(inputs, config);
  
  for await (const chunk of stream) {
    if ("agent" in chunk) {
      console.log("Agent:", chunk.agent.messages[0].content);
    } else if ("tools" in chunk) {
      console.log("Tool:", chunk.tools.messages[0].content);
    }
    console.log("---");
  }
}
```

### 2. Multi-Tool Research Assistant

Here's a more complex agent that can search the web and summarize information:

```typescript
// src/agents/research-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";

// Mock web search tool
const webSearchTool = tool(
  async ({ query }) => {
    // Simulate web search results
    const mockResults = {
      "javascript frameworks": "Popular JavaScript frameworks include React, Vue.js, Angular, and Svelte. React remains the most popular with 40.58% usage among developers.",
      "ai agents": "AI agents are autonomous programs that perceive their environment and take actions to achieve goals. They're increasingly used in customer service, trading, and automation.",
      "default": `Search results for "${query}": Various articles and resources found discussing the topic.`
    };
    
    return mockResults[query.toLowerCase()] || mockResults.default;
  },
  {
    name: "web_search",
    description: "Search the web for information on a given topic",
    schema: z.object({
      query: z.string().describe("The search query to look up"),
    }),
  }
);

// Calculator tool
const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // Simple calculator (in production, use a safe math parser)
      const result = eval(expression);
      return `${expression} = ${result}`;
    } catch (error) {
      return `Error calculating ${expression}: ${error.message}`;
    }
  },
  {
    name: "calculator",
    description: "Perform mathematical calculations",
    schema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate"),
    }),
  }
);

// Note-taking tool
const noteTool = tool(
  async ({ note }) => {
    console.log(`📝 Note saved: ${note}`);
    return `Note saved: ${note}`;
  },
  {
    name: "save_note",
    description: "Save important information as a note",
    schema: z.object({
      note: z.string().describe("The note content to save"),
    }),
  }
);

const tools = [webSearchTool, calculatorTool, noteTool];

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.1,
});

export const researchAgent = createReactAgent({
  llm,
  tools,
  checkpointSaver: new MemorySaver(),
  prompt: `You are a helpful research assistant. You can:
1. Search the web for information
2. Perform calculations 
3. Save important notes

Always be thorough in your research and provide accurate, helpful responses.`,
});
```

### 3. Conversational Agent with Memory

Here's an agent that maintains conversation history:

```typescript
// src/agents/conversational-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Personal information storage (in production, use a proper database)
const personalInfo: Record<string, any> = {};

const rememberInfoTool = tool(
  async ({ key, value }) => {
    personalInfo[key] = value;
    return `I'll remember that ${key}: ${value}`;
  },
  {
    name: "remember_info",
    description: "Remember personal information about the user",
    schema: z.object({
      key: z.string().describe("The type of information (e.g., 'name', 'favorite_color')"),
      value: z.string().describe("The information to remember"),
    }),
  }
);

const recallInfoTool = tool(
  async ({ key }) => {
    const info = personalInfo[key];
    return info ? `I remember that ${key}: ${info}` : `I don't have information about ${key}`;
  },
  {
    name: "recall_info", 
    description: "Recall previously stored personal information",
    schema: z.object({
      key: z.string().describe("The type of information to recall"),
    }),
  }
);

const tools = [rememberInfoTool, recallInfoTool];

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.7,
});

export const conversationalAgent = createReactAgent({
  llm,
  tools,
  checkpointSaver: new MemorySaver(),
  prompt: `You are a friendly, conversational AI assistant with the ability to remember information about users.
  
Key behaviors:
- Be warm and personable in your responses
- Remember important details users share with you
- Reference previous conversations naturally
- Ask follow-up questions to show engagement
- Use the remember_info tool when users share personal details
- Use recall_info to reference things you've learned about them`,
});

export async function runConversation() {
  const config = { configurable: { thread_id: "conversation-1" } };
  
  const conversations = [
    "Hi! My name is Alex and I'm a software developer.",
    "What's my name?",
    "I love hiking and photography. What about you?",
    "Do you remember what my hobbies are?"
  ];
  
  for (const message of conversations) {
    console.log(`\n👤 User: ${message}`);
    
    const stream = await conversationalAgent.stream(
      { messages: [new HumanMessage(message)] },
      config
    );
    
    for await (const chunk of stream) {
      if ("agent" in chunk) {
        console.log(`🤖 Assistant: ${chunk.agent.messages[0].content}`);
      }
    }
  }
}
```

### 4. Main Application Runner

```typescript
// src/index.ts
import { runWeatherAgent } from "./agents/weather-agent";
import { researchAgent } from "./agents/research-agent";
import { runConversation } from "./agents/conversational-agent";
import { HumanMessage } from "@langchain/core/messages";
import * as readline from "readline";

async function main() {
  console.log("🚀 LangGraph Agent Demo");
  console.log("Available agents:");
  console.log("1. Weather Agent");
  console.log("2. Research Agent");
  console.log("3. Conversational Agent");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const choice = await new Promise<string>((resolve) => {
    rl.question("Choose an agent (1-3): ", resolve);
  });
  
  switch (choice) {
    case "1":
      await runWeatherAgent();
      break;
    case "2":
      await runResearchDemo();
      break;
    case "3":
      await runConversation();
      break;
    default:
      console.log("Invalid choice");
  }
  
  rl.close();
}

async function runResearchDemo() {
  const config = { configurable: { thread_id: "research-1" } };
  
  const query = "Research JavaScript frameworks and calculate the market share if React has 40% and Vue has 25%";
  
  console.log(`\n📋 Research Query: ${query}`);
  
  const stream = await researchAgent.stream(
    { messages: [new HumanMessage(query)] },
    config
  );
  
  for await (const chunk of stream) {
    if ("agent" in chunk) {
      console.log("🔍 Agent:", chunk.agent.messages[0].content);
    } else if ("tools" in chunk) {
      console.log("🛠️  Tool:", chunk.tools.messages[0].content);
    }
    console.log("---");
  }
}

if (require.main === module) {
  main().catch(console.error);
}
```

## Advanced Agent Examples

### State Management Agent

```typescript
// src/agents/state-agent.ts
import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// Define the state structure
const StateAnnotation = Annotation.Root({
  messages: Annotation<HumanMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentTask: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  taskComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

// Define nodes
async function planTask(state: typeof StateAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const response = await llm.invoke([
    new SystemMessage("Break down the user's request into a clear, actionable task."),
    lastMessage,
  ]);
  
  return {
    currentTask: response.content,
    messages: [new HumanMessage(`Task planned: ${response.content}`)],
  };
}

async function executeTask(state: typeof StateAnnotation.State) {
  const response = await llm.invoke([
    new SystemMessage(`Execute this task: ${state.currentTask}`),
    ...state.messages,
  ]);
  
  return {
    messages: [new HumanMessage(`Task executed: ${response.content}`)],
    taskComplete: true,
  };
}

// Build the graph
const workflow = new StateGraph(StateAnnotation)
  .addNode("plan", planTask)
  .addNode("execute", executeTask)
  .addEdge("plan", "execute")
  .addEdge("execute", "__end__");

workflow.setEntryPoint("plan");

export const stateAgent = workflow.compile();
```

## Best Practices

### 1. Error Handling
```typescript
// Robust error handling for agents
async function safeAgentRun(agent: any, inputs: any, config: any) {
  try {
    const stream = await agent.stream(inputs, config);
    
    for await (const chunk of stream) {
      // Process chunks safely
      if ("agent" in chunk && chunk.agent?.messages?.[0]?.content) {
        console.log("Agent:", chunk.agent.messages[0].content);
      }
    }
  } catch (error) {
    console.error("Agent error:", error);
    // Implement retry logic or fallback
  }
}
```

### 2. Tool Validation
```typescript
// Validate tool inputs
const validatedTool = tool(
  async ({ input }) => {
    if (!input || typeof input !== 'string') {
      throw new Error("Invalid input: expected non-empty string");
    }
    
    // Process input safely
    return processInput(input);
  },
  {
    name: "validated_tool",
    description: "A tool with proper input validation",
    schema: z.object({
      input: z.string().min(1, "Input cannot be empty"),
    }),
  }
);
```

### 3. Memory Management
```typescript
// Implement proper memory cleanup
import { MemorySaver } from "@langchain/langgraph";

const memorySaver = new MemorySaver();

// Periodically clean up old conversations
setInterval(() => {
  // Implement cleanup logic for old thread IDs
  console.log("Cleaning up old conversation threads...");
}, 3600000); // Every hour
```

### 4. Configuration Management
```typescript
// src/config/agent-config.ts
export const agentConfig = {
  llm: {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.1"),
  },
  agent: {
    maxIterations: parseInt(process.env.MAX_ITERATIONS || "10"),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT || "30000"),
  },
  memory: {
    maxMessages: parseInt(process.env.MAX_MESSAGES || "100"),
  },
};
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/**/*.ts",
    "test": "jest"
  }
}
```

## Resources

### Official Documentation
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain JS Documentation](https://js.langchain.com/)

### Example Repositories
- [LangGraph JS Examples](https://github.com/langchain-ai/langgraphjs/tree/main/examples)
- [Coinbase AgentKit](https://github.com/coinbase/agentkit) - Production crypto agent
- [Agentic Workflows](https://github.com/sambhavsaxena/agentic-workflows) - Community experiments

### NPM Packages
- `@langchain/langgraph` - Core LangGraph library
- `@langchain/openai` - OpenAI integration
- `@langchain/core` - Core LangChain functionality
- `@langchain/community` - Community tools and integrations

### Best Practice Guides
- [LangGraph Best Practices](https://langchain-ai.github.io/langgraph/how-tos/)
- [Agent Memory Patterns](https://langchain-ai.github.io/langgraph/how-tos/memory/)
- [Tool Calling Guidelines](https://js.langchain.com/docs/modules/agents/tools/)

This tutorial provides a comprehensive foundation for building LangGraph agents in Node.js with TypeScript and OpenAI. Start with the simple examples and gradually work your way up to more complex multi-agent systems! 