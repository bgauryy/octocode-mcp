# Claude Agent SDK - Terminal UI & Message Architecture Research

> Research date: January 5, 2026
> SDK Version: 0.1.76
> File analyzed: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`

## Executive Summary

The Claude Agent SDK uses a **subprocess-based architecture** where the SDK spawns a separate CLI process (`cli.js`) that handles all the Claude interactions. Communication happens via **JSON-over-stdio** with a bidirectional streaming protocol. The SDK does NOT include any terminal UI rendering - it's a pure message pipeline.

**Key Finding**: The SDK is designed as a message broker, not a UI framework. It provides:
1. `Query` - async generator for streaming SDK messages
2. `Session` - multi-turn conversation management  
3. `ProcessTransport` - subprocess lifecycle & stdio communication
4. `Stream` - async iterable queue for message buffering

---

## Architecture Overview

### Bundle Structure

| Module | Location (lines) | Purpose |
|--------|------------------|---------|
| `Stream` | 13397-13469 | Async iterable queue with enqueue/done/error |
| `ProcessTransport` | 12981-13395 | Subprocess spawn, stdio pipes, message routing |
| `Query` | 13500-13960 | Main API - async generator, control requests |
| `Session` | 13961-14073 | Multi-turn conversation wrapper |
| `query()` | 26708-26854 | Entry point function |

### Message Flow

```
User Code                   SDK                     CLI Process
    │                        │                           │
    │ query({ prompt })     │                           │
    │───────────────────────►│ ProcessTransport.spawn() │
    │                        │──────────────────────────►│
    │                        │                           │
    │                        │ stdin: JSON user message  │
    │                        │──────────────────────────►│
    │                        │                           │
    │                        │ stdout: JSON SDK messages │
    │                        │◄──────────────────────────│
    │ for await (msg)       │                           │
    │◄───────────────────────│                           │
    │                        │                           │
```

---

## Key Discoveries

### 1. Stream Utility Class (`sdk.mjs:13397-13469`)

A simple but elegant async queue:

```typescript
class Stream {
  queue = [];
  readResolve;
  readReject;
  isDone = false;
  hasError;

  enqueue(value) {
    if (this.readResolve) {
      // If someone is waiting, resolve immediately
      this.readResolve({ done: false, value });
    } else {
      // Otherwise buffer
      this.queue.push(value);
    }
  }

  next() {
    if (this.queue.length > 0) {
      return Promise.resolve({ done: false, value: this.queue.shift() });
    }
    if (this.isDone) return Promise.resolve({ done: true });
    if (this.hasError) return Promise.reject(this.hasError);
    
    return new Promise((resolve, reject) => {
      this.readResolve = resolve;
      this.readReject = reject;
    });
  }

  done() { this.isDone = true; /* resolve if waiting */ }
  error(e) { this.hasError = e; /* reject if waiting */ }
}
```

**Best Practice**: Simple promise-based queue beats complex event emitters for streaming.

### 2. ProcessTransport (`sdk.mjs:12981-13395`)

Handles subprocess lifecycle with proper cleanup:

```typescript
class ProcessTransport {
  // Spawns with: stdio: ["pipe", "pipe", stderrMode]
  // Output format: --output-format stream-json
  // Input format: --input-format stream-json
  
  spawnLocalProcess(options) {
    const childProcess = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", stderrMode],
      signal,         // AbortController signal for cleanup
      env,
      windowsHide: true
    });
    
    // stderr forwarding for debugging
    if (env.DEBUG_CLAUDE_AGENT_SDK || this.options.stderr) {
      childProcess.stderr.on("data", (data) => {
        logForSdkDebugging(data.toString());
        this.options.stderr?.(data.toString());
      });
    }
  }
  
  async* readMessages() {
    const rl = createInterface({ input: this.processStdout });
    for await (const line of rl) {
      if (line.trim()) {
        yield JSON.parse(line);  // NDJSON format
      }
    }
  }
}
```

**Best Practice**: Use `readline.createInterface` for line-based JSON parsing.

### 3. Query Class (`sdk.mjs:13500-13960`)

The main API exposes an async generator:

```typescript
class Query {
  inputStream = new Stream;  // For output messages
  
  [Symbol.asyncIterator]() {
    return this.sdkMessages;  // Returns async generator
  }
  
  async readMessages() {
    for await (const message of this.transport.readMessages()) {
      if (message.type === "control_response") {
        // Handle internal control flow
        continue;
      }
      // Pass through to user
      this.inputStream.enqueue(message);
    }
  }
  
  async* readSdkMessages() {
    for await (const message of this.inputStream) {
      yield message;
    }
  }
}
```

**Best Practice**: Query is both an async generator AND exposes control methods (`interrupt()`, `setModel()`, etc.)

### 4. SDK Message Types (from `agentSdkTypes.d.ts`)

| Message Type | Purpose |
|--------------|---------|
| `SDKAssistantMessage` | Full assistant response with content blocks |
| `SDKUserMessage` | User input message |
| `SDKPartialAssistantMessage` | Streaming event (when `includePartialMessages: true`) |
| `SDKResultMessage` | Final result with usage stats |
| `SDKSystemMessage` | Init message with capabilities |
| `SDKToolProgressMessage` | Tool execution progress |
| `SDKStatusMessage` | Status updates (compacting, etc.) |

---

## Best Practices for Terminal UI

### 1. **Message Processing Pattern**

```typescript
// Good: Async generator consumption
for await (const message of query({ prompt })) {
  switch (message.type) {
    case 'assistant':
      renderAssistantMessage(message.message);
      break;
    case 'stream_event':
      // Partial streaming - update UI incrementally
      handleStreamEvent(message.event);
      break;
    case 'tool_progress':
      updateToolProgress(message.tool_name, message.elapsed_time_seconds);
      break;
    case 'result':
      showFinalResult(message);
      break;
  }
}
```

### 2. **Streaming Text Accumulation**

The SDK sends `stream_event` messages with content block deltas:

```typescript
// Message event types from Anthropic API:
// - content_block_start: New content block beginning
// - content_block_delta: Incremental text
// - content_block_stop: Block complete

// Your UI should accumulate:
let currentText = '';

function handleStreamEvent(event: RawMessageStreamEvent) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    currentText += event.delta.text;
    updateDisplay(currentText);  // Re-render with accumulated text
  }
}
```

### 3. **Control Flow Separation**

The SDK separates message types by responsibility:

- **User messages** → Input stream (send to subprocess)
- **SDK messages** → Output stream (yield to consumer)  
- **Control requests/responses** → Internal handling (not exposed)

```typescript
// Good: Separate concerns
async readMessages() {
  for await (const message of this.transport.readMessages()) {
    if (message.type === "control_response") {
      // Internal: handle control flow
      this.handleControlResponse(message);
      continue;  // Don't yield to user
    }
    // External: pass to consumer
    this.inputStream.enqueue(message);
  }
}
```

### 4. **Cleanup Pattern**

```typescript
class Query {
  cleanup(error) {
    if (this.cleanupPerformed) return;  // Idempotent
    this.cleanupPerformed = true;
    
    try {
      this.transport.close();
      this.pendingControlResponses.clear();
      // ... clear all state
      
      if (error) {
        this.inputStream.error(error);
      } else {
        this.inputStream.done();
      }
    } catch (_error) {
      // Swallow cleanup errors
    }
  }
}
```

### 5. **AbortController Integration**

```typescript
// SDK uses AbortController throughout
const transport = new ProcessTransport({
  abortController,  // Passed in or created
  signal: abortController.signal,
});

// Cleanup on abort
this.abortController.signal.addEventListener("abort", cleanup);

// Process spawn respects signal
spawn(command, args, { signal: abortController.signal });
```

---

## Comparison with octocode-cli

| Aspect | Claude Agent SDK | octocode-cli |
|--------|------------------|--------------|
| **Architecture** | Subprocess + stdio JSON | Direct API calls (Vercel AI SDK) |
| **Streaming** | `stream_event` messages | `streamText()` callbacks |
| **Message queue** | Custom `Stream` class | React state + refs |
| **UI framework** | None (headless) | Ink (React for terminal) |
| **Tool handling** | Via subprocess | Direct tool execution |

### Issues in octocode-cli to Address

Based on the SDK patterns, your `useAgent.ts` could benefit from:

1. **Streaming accumulation** - You already do this well with `streamingTextRef`
2. **Message ID stability** - SDK uses UUIDs, you use timestamp-based IDs (good)
3. **Cleanup handling** - SDK has explicit cleanup; ensure your refs get cleared

---

## References

| File | charOffset | Description |
|------|------------|-------------|
| `sdk.mjs` | 485533 | Stream class |
| `sdk.mjs` | 472074 | ProcessTransport |
| `sdk.mjs` | 487752 | Query class |
| `sdk.mjs` | 502688 | Session class |
| `sdk.mjs` | 918342 | query() entry point |

---

## Next Steps for octocode-cli

1. Review your streaming implementation against SDK patterns
2. Consider adopting the `Stream` queue pattern for message buffering
3. Ensure proper cleanup on component unmount
4. Consider exposing control methods (interrupt, etc.) if not already

