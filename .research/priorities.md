# Research Priorities & Implementation Roadmap

## octocode-cli Priority Fixes

### P0 - Critical (Fix Immediately) ❌

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | **Tool results disappear in 1s** | 30min | Users can't verify AI findings |
| 2 | **Ctrl+C exits app** | 30min | Should cancel operation first |
| 3 | **Arrow key conflict** | 1hr | Can't scroll when input focused |
| 4 | **No export command** | 1hr | Can't share findings |

### P1 - High Priority ⚠️

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 5 | **100 message limit** | 5min | Lose history in long sessions |
| 6 | **Background task system** | 1 day | Match Claude Code TaskOutput |
| 7 | **Context compaction** | 2 days | Handle long conversations |
| 8 | **Tool result association** | 1hr | Fragile string matching |
| 9 | **Permission UI** | 4hr | `waiting_permission` has no UI |

### P2 - Medium Priority 📋

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 10 | **Search in history** | 2hr | `/search` command |
| 11 | **Scroll position indicator** | 1hr | Show `[5/120]` |
| 12 | **Model-aware cost estimates** | 2hr | Different providers |
| 13 | **New messages alert** | 1hr | When scrolled up |
| 14 | **Keyboard shortcuts help** | 30min | Discoverable shortcuts |

### P3 - Low Priority 📝

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 15 | **Consistent time formatting** | 30min | Unified duration display |
| 16 | **Memory management** | 2hr | Cleanup long sessions |
| 17 | **Better ID generation** | 30min | Use UUID |
| 18 | **Thinking toggle in Chat** | 30min | `[t]` shortcut |

---

## Files Requiring Changes

| Priority | File | Issues |
|----------|------|--------|
| P0 | `src/ui/chat/useChat.ts` | #1, #4, #8, #16 |
| P0 | `src/ui/chat/ChatView.tsx` | #2, #3, #5, #10, #11, #13 |
| P0 | `src/ui/chat/ChatInput.tsx` | #3 |
| P1 | `src/features/task-manager.ts` | #6 (new) |
| P1 | `src/features/context-compaction.ts` | #7 (new) |
| P1 | `src/ui/agent-ink/AgentView.tsx` | #9 |
| P2 | `src/ui/chat/StatusBar.tsx` | #12, #15 |

---

## Feature Implementation Tasks

### Background Task System (P1)

```typescript
// New file: src/features/task-manager.ts
interface Task {
  id: string;
  type: 'background_shell' | 'local_agent' | 'remote_agent';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed';
  command: string;
  startTime: number;
  endTime?: number;
  output: string;
}

// TaskOutput tool equivalent
export function createTaskOutputTool(): Tool {
  return {
    name: 'TaskOutput',
    description: 'Get output from background tasks',
    parameters: z.object({
      task_id: z.string(),
      block: z.boolean().optional().default(true),
      timeout: z.number().optional()
    }),
    execute: async ({ task_id, block, timeout }) => { ... }
  };
}
```

### Context Compaction (P1)

```typescript
// New file: src/features/context-compaction.ts
interface CompactionOptions {
  maxTokens: number;
  preserveRecentMessages: number;
  summarizeThreshold: number;
}

export async function compactContext(
  messages: Message[],
  options: CompactionOptions
): Promise<{ compacted: Message[]; boundary: CompactBoundary }> {
  // 1. Fire PreCompact hook
  // 2. Summarize old messages
  // 3. Create boundary marker
  // 4. Return compacted messages
}
```

---

## SDK Integration Research

### Priority Research Areas

1. **Protocol Analysis**
   - **Goal:** Understand JSON streaming protocol
   - **Target:** `handleControlRequest` + message schemas
   - **Why:** Debug communication, implement custom clients

2. **MCP Integration**
   - **Goal:** Reverse engineer `createSdkMcpServer`
   - **Why:** Extend agent with custom MCP servers

3. **Tool Execution**
   - **Goal:** Trace tool definition → execution flow
   - **Target:** `ProcessTransport` options
   - **Why:** Critical for agent capabilities

4. **Hook System**
   - **Goal:** Map all `HOOK_EVENTS` and triggers
   - **Target:** `Query` class hook handling
   - **Why:** Deep customization of agent lifecycle

---

## Quick Wins (< 1 Hour Each)

| Fix | File | Code Change |
|-----|------|-------------|
| Remove 1s timeout | `useChat.ts:246-250` | Delete `setTimeout` block |
| Cancel before exit | `ChatView.tsx` | Track `cancelCount`, abort first |
| Remove message limit | `ChatView.tsx:76` | `MESSAGES_WINDOW_SIZE = Infinity` |
| Add /export | `ChatView.tsx` | New command handler |
| Separate scroll mode | `ChatView.tsx` | `Ctrl+S` toggle |

---

## Testing Checklist

- [ ] Tool results persist after completion
- [ ] Ctrl+C cancels operation, double-tap exits
- [ ] Can scroll 500+ messages without limit
- [ ] `/export` creates valid markdown
- [ ] Scroll mode (`Ctrl+S`) works without conflict
- [ ] Cost estimates correct for OpenAI/Gemini/Anthropic
- [ ] Permission UI renders for `waiting_permission` state

---

*Last updated: January 5, 2026*
*Based on analysis of Claude Agent SDK v0.1.76 and octocode-cli*

