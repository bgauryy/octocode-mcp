# Octocode CLI UX - Remaining Work

**Last Updated:** January 6, 2026
**Scope:** `packages/octocode-cli`

---

## 🔴 HIGH PRIORITY

### 1. Tool Results Disappear After 3s
**File:** `src/ui/agent-ink/useAgent.ts:218-222`

**Problem:** Tool results removed from display after 3 seconds (improved from 1s, but still vanishes).

**Fix:** Keep results visible with collapse/expand UI instead of removing.

```typescript
// Current - REMOVE THIS:
setTimeout(() => {
  setCurrentToolCalls(prev =>
    prev.filter(tc => tc.id !== id || tc.status === 'running')
  );
}, 3000);

// Replace with: Add collapsed state, don't remove
```

---

### 2. Session Tool Results Not Persisted
**Problem:** Sessions only save text messages, not tool call results. Resuming a session loses all context.

**Fix:**
- Store full tool args and results in SQLite
- Include in session resume

**Files:**
- `src/db/schema.ts`
- `src/ui/chat/runChat.tsx`

---

## 🟡 MEDIUM PRIORITY

### 3. Scroll Position Indicator
**Problem:** No visual indication of scroll position in chat history.

**Fix:** Show `[5/120]` or percentage in header when scrolled.

**File:** `src/ui/chat/ChatView.tsx`

---

### 4. New Messages Alert When Scrolled
**Problem:** When scrolled up, new messages arrive silently.

**Fix:** Show "↓ New messages" indicator when scrolled and new content arrives.

**File:** `src/ui/chat/ChatView.tsx`

---

### 5. Keyboard Shortcuts Not Discoverable
**Problem:** Shortcuts only visible via `/help`.

**Fix:** Add permanent hint in status bar or footer.

**Files:**
- `src/ui/chat/StatusBar.tsx`
- `src/ui/chat/ChatView.tsx`

---

## 🟢 LOW PRIORITY

### 6. Input Blocked During AI Response
**Problem:** Can't type while waiting for AI.

**Fix:** Queue messages while AI is thinking.

**Files:**
- `src/ui/chat/ChatInput.tsx`
- `src/ui/chat/useChat.ts`

---

### 7. Inconsistent Time Formatting
**Problem:** Different components show time differently (ms vs s vs m:s).

**Fix:** Unify `formatDuration` across components.

**Files:**
- `src/ui/chat/StatusBar.tsx`
- `src/ui/agent-ink/AgentView.tsx`

---

### 8. Memory Management
**Problem:** Messages grow without bound for long sessions.

**Fix:** Add cleanup/archiving for very long sessions.

**File:** `src/ui/chat/useChat.ts`

---

### 9. Tool Message ID Matching
**File:** `src/ui/chat/useChat.ts:229-243`

**Problem:** Uses fragile `id.split('_')[1]` string matching.

**Fix:** Use proper ID tracking.

---

## 📊 Comparison Gap (vs Claude Code)

| Feature | Claude Code | Octocode CLI |
|---------|-------------|--------------|
| Tool results | Always visible | ❌ Disappear in 3s |
| Session context | ✅ Full resume | ❌ Text-only |
| Multi-context | ✅ Tab support | ❌ Single session |
| Read-before-write | ✅ Enforced | ❌ Not enforced |
| Background tasks | ✅ TaskOutput | ❌ Not implemented |

---

## ✅ Already Implemented (Reference)

- ✅ `/export` command
- ✅ Double Ctrl+C cancel
- ✅ Scroll mode (Ctrl+S)
- ✅ No message limit (was 100)
- ✅ No truncation (unlimited content)
- ✅ PermissionDialog UI
- ✅ Arrow key conflict resolved
