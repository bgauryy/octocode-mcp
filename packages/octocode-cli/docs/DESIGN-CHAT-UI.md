# Chat UI Architecture

> Design documentation for the interactive Ink-based chat interface in octocode-cli.

## Overview

The Chat UI provides an interactive terminal-based chat experience using **Ink** (React for CLI). It features real-time streaming responses, token tracking, tool call visualization, and session statistics.

```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Octocode Chat              /help for commands        │
├─────────────────────────────────────────────────────────┤
│ Messages Area (scrollable, last 10 messages)            │
│   👤 You: Hello                                         │
│   🤖 Octocode: Hi! How can I help?▌                     │
├─────────────────────────────────────────────────────────┤
│ 🔧 Tool Calls (active tools with spinners)              │
├─────────────────────────────────────────────────────────┤
│ Status Bar: 🤖 model │ 🎯 tokens │ 💬 msgs │ ⏰ time    │
├─────────────────────────────────────────────────────────┤
│ ╭─ Input Area ─────────────────────────────────────────╮│
│ │ > Type your message...▌                              ││
│ ╰──────────────────────────────────────────────────────╯│
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
src/ui/chat/
├── types.ts           # Type definitions
├── useChat.ts         # State management hook
├── ChatView.tsx       # Main container component
├── ChatInput.tsx      # Input with history navigation
├── MessageBubble.tsx  # Individual message rendering
├── ToolCallDisplay.tsx# Active tool call visualization
├── StatusBar.tsx      # Session stats display
├── runChat.tsx        # Entry point / AI integration
└── index.ts           # Public exports
```

## Core Components

### 1. `ChatView` - Main Container

The orchestrating component that manages layout and coordinates all sub-components.

```tsx
interface ChatViewProps {
  onMessage: (message: string, callbacks: MessageCallbacks) => Promise<void>;
  config?: Partial<ChatConfig>;
  welcomeMessage?: string;
  model?: string;
}

interface MessageCallbacks {
  onToken: (token: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string) => void;
  onComplete: (usage?: { inputTokens?: number; outputTokens?: number }) => void;
  onError: (error: Error) => void;
}
```

**Responsibilities:**
- Layout management (calculates heights based on terminal size)
- Command handling (`/exit`, `/clear`, `/help`, `/stats`)
- Keyboard shortcuts (Ctrl+C, Ctrl+L)
- Coordinates message flow between input and AI

### 2. `useChat` - State Management Hook

Central state management using React hooks.

```tsx
interface UseChatReturn {
  state: ChatState;
  addUserMessage: (content: string) => string;
  addAssistantMessage: (content: string, isStreaming?: boolean) => string;
  updateAssistantMessage: (id: string, content: string) => void;
  completeAssistantMessage: (id: string, tokens?: TokenInfo, durationMs?: number) => void;
  addToolCall: (toolCall: Omit<ToolCall, 'status'>) => void;
  completeToolCall: (id: string, result?: string, error?: string) => void;
  addSystemMessage: (content: string) => void;
  setThinking: (isThinking: boolean) => void;
  clearMessages: () => void;
  updateStats: (updates: Partial<ChatStats>) => void;
  inputHistory: string[];
}
```

**State Shape:**
```tsx
interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  currentToolCalls: ToolCall[];
  inputHistory: string[];
  historyIndex: number;
  stats: ChatStats;
  currentModel?: string;
}

interface ChatStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMessages: number;
  totalToolCalls: number;
  sessionStartTime: number;
  lastResponseTime?: number;
  estimatedCost?: number;
}
```

### 3. `ChatInput` - Input Component

Handles user text input with history navigation.

```tsx
interface ChatInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  history?: string[];
  theme?: ChatTheme;
}
```

**Features:**
- Text input with cursor blink animation
- History navigation (↑/↓ arrows)
- Submit on Enter
- Clear on Escape
- Disabled state during AI response

### 4. `MessageBubble` - Message Rendering

Renders individual chat messages with role-based styling.

```tsx
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
  durationMs?: number;
  tokens?: { input?: number; output?: number };
}
```

**Role Icons:**
- 👤 User
- 🤖 Assistant
- 🔧 Tool
- ⚙️ System

### 5. `StatusBar` - Session Stats

Real-time display of session metrics.

```tsx
interface StatusBarProps {
  stats: ChatStats;
  model?: string;
  isThinking?: boolean;
  theme?: ChatTheme;
}
```

**Displays:**
- Model name
- Token count (total, input↑, output↓)
- Message count
- Tool call count
- Last response time
- Estimated cost
- Session duration

### 6. `ToolCallDisplay` - Active Tools

Shows currently executing tool calls with spinners.

```tsx
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  startTime?: number;
}
```

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ChatInput   │────▶│   ChatView   │────▶│   useChat    │
│  (user input)│     │  (orchestr.) │     │   (state)    │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  onMessage   │     │ ChatState    │
                     │  (AI call)   │     │ messages[]   │
                     └──────────────┘     │ stats        │
                            │             │ toolCalls[]  │
                            ▼             └──────────────┘
                     ┌──────────────┐            │
                     │  AI SDK      │            ▼
                     │  streamText  │     ┌──────────────┐
                     └──────────────┘     │MessageBubble │
                            │             │ StatusBar    │
                            │             │ToolCallDisp. │
                            ▼             └──────────────┘
                     ┌──────────────┐
                     │  callbacks   │
                     │  onToken     │
                     │  onToolCall  │
                     │  onComplete  │
                     └──────────────┘
```

## Message Lifecycle

### User Message
```
1. User types in ChatInput
2. Presses Enter → handleSubmit()
3. addUserMessage() → creates message, updates stats
4. setThinking(true)
5. addAssistantMessage('', true) → empty streaming message
6. Call onMessage with callbacks
```

### AI Response (Streaming)
```
1. onToken(chunk) → updateAssistantMessage()
2. Repeat for each chunk
3. onComplete(usage) → completeAssistantMessage()
4. Stats updated with token counts
5. setThinking(false)
```

### Tool Call
```
1. onToolCall(name, args) → addToolCall()
2. Tool shows in ToolCallDisplay with spinner
3. Tool executes...
4. onToolResult(name, result) → completeToolCall()
5. Tool removed from active list after 1s delay
```

## Commands

| Command | Description |
|---------|-------------|
| `/exit`, `/quit`, `/q` | Exit chat |
| `/clear` | Clear message history |
| `/help`, `/?` | Show help |
| `/stats` | Show session statistics |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit message |
| `↑` / `↓` | Navigate input history |
| `Escape` | Clear input |
| `Ctrl+C` | Exit |
| `Ctrl+L` | Clear messages |

## Theming

```tsx
interface ChatTheme {
  userColor: string;      // 'green'
  assistantColor: string; // 'blue'
  toolColor: string;      // 'cyan'
  systemColor: string;    // 'yellow'
  errorColor: string;     // 'red'
  borderColor: string;    // 'gray'
  dimColor: string;       // 'gray'
}
```

## Configuration

```tsx
interface ChatConfig {
  verbose: boolean;       // Show detailed output
  showToolCalls: boolean; // Show tool call panel
  showTimestamps: boolean;// Show message timestamps
  maxHistorySize: number; // Input history limit (100)
  theme: ChatTheme;
}
```

## Integration with AI SDK

The `runChat.tsx` integrates with Vercel AI SDK:

```tsx
const result = await streamText({
  model,
  system: systemPrompt,
  messages,
  maxTokens: 4096,
  onStepFinish: ({ toolCalls, toolResults }) => {
    // Handle tool calls
  },
});

for await (const chunk of result.textStream) {
  callbacks.onToken(chunk);
}

const usage = await result.usage;
callbacks.onComplete({
  inputTokens: usage?.promptTokens,
  outputTokens: usage?.completionTokens,
});
```

## Usage

### CLI Command
```bash
octocode chat                              # Default model
octocode chat --model anthropic:claude-4-sonnet
octocode chat -v                           # Verbose mode
```

### Programmatic
```tsx
import { runChat } from './ui/chat/runChat.js';

await runChat({
  model: 'anthropic:claude-4-sonnet',
  systemPrompt: 'You are a helpful assistant.',
  welcomeMessage: 'Welcome!',
  verbose: true,
});
```

## Extending

### Adding a New Command

In `ChatView.tsx`:
```tsx
const COMMANDS: Record<string, string> = {
  '/exit': 'Exit the chat',
  '/mycommand': 'My custom command',  // Add here
};

// In handleCommand():
case '/mycommand':
  // Handle command
  addSystemMessage('Command executed!');
  return true;
```

### Adding a New Stat

1. Update `ChatStats` in `types.ts`
2. Update `createInitialStats()` in `useChat.ts`
3. Update tracking in relevant callbacks
4. Update `StatusBar.tsx` to display

### Custom Message Types

1. Add to `MessageRole` type in `types.ts`
2. Add icon/label in `MessageBubble.tsx`
3. Add color to theme

## Testing

```bash
# Run chat type tests
yarn vitest run tests/ui/chat/types.test.ts

# Build and test manually
yarn build && node out/octocode-cli.js chat
```

## Dependencies

- `ink` - React for CLI
- `@inkjs/ui` - Pre-built components (Spinner)
- `react` - UI framework
- `ai` - Vercel AI SDK for streaming

## Performance Considerations

1. **Message Limit**: Only renders last 10 messages to prevent terminal overflow
2. **Debounced Stats**: Status bar updates every 1 second
3. **Tool Cleanup**: Completed tools removed after 1s delay
4. **Streaming**: Token-by-token rendering for smooth UX

---

*Created by Octocode MCP 🔍🐙*

