# Terminal UI Implementation Guide - Claude Agent SDK Best Practices

> Implementation roadmap for applying Claude Agent SDK patterns to Octocode CLI

## Executive Summary

Analysis of Octocode CLI's terminal UI against Claude Agent SDK reveals **6 areas already well-implemented** and **6 improvement opportunities**. This document provides implementation details for each gap.

---

## Current State Assessment

### ✅ Already Implemented (Keep As-Is)

| Pattern | Location | Notes |
|---------|----------|-------|
| Ink Framework | `src/ui/agent-ink/` | React-based terminal UI ✅ |
| Static/Dynamic Split | `AgentView.tsx:508` | `<Static items={completedMessages}>` ✅ |
| Custom Spinner | `src/utils/spinner.ts` | ANSI braille frames, cursor mgmt ✅ |
| Theme System | `src/ui/agent-ink/types.ts:107` | 9 color properties ✅ |
| State Machine | `AgentView.tsx:225-275` | 11 states with animations ✅ |
| Background Tasks | `AgentView.tsx:84-114` | Sorted panel with status ✅ |
| Truncation | `AgentView.tsx:307-323` | Char count display ✅ |

### 🔧 Improvement Opportunities

| Priority | Pattern | Effort | Impact |
|----------|---------|--------|--------|
| P1 | Border Style Variety | Low | Medium |
| P1 | `dimColor` Prop Consistency | Low | Low |
| P2 | Hyperlink Support | Medium | High |
| P2 | Terminal Resize Handling | Medium | Medium |
| P3 | Permission Dialog Component | Medium | Medium |
| P3 | Custom Dashed Borders | Low | Low |

---

## Implementation Details

### P1: Border Style Variety

**Current:** Only `single` and `round` border styles used.

**Target:** Context-appropriate border styles.

#### Add Border Style Constants

```typescript
// src/ui/agent-ink/types.ts

export const BORDER_STYLES = {
  primary: 'round',      // Input areas, main containers
  secondary: 'single',   // Panels, tool calls
  thinking: 'single',    // Thinking blocks (dimmed)
  error: 'double',       // Error states
  permission: 'round',   // Permission dialogs (highlighted)
} as const;

export type BorderStyleType = keyof typeof BORDER_STYLES;
```

#### Usage Pattern

```tsx
// Before
<Box borderStyle="single" borderColor={theme.borderColor}>

// After
<Box borderStyle={BORDER_STYLES.secondary} borderColor={theme.borderColor}>
```

#### Files to Update

- `src/ui/agent-ink/AgentView.tsx` - 6 instances
- `src/ui/chat/ChatInput.tsx` - 1 instance
- `src/ui/chat/ChatView.tsx` - 1 instance
- `src/ui/chat/StatusBar.tsx` - 1 instance

---

### P1: dimColor Prop Consistency

**Current:** Mix of `color={theme.dimColor}` and `dimColor` prop.

**Target:** Prefer `dimColor` prop for automatic theme handling.

#### Pattern Change

```tsx
// Before (38 instances across 8 files)
<Text color={theme.dimColor}>Secondary text</Text>

// After
<Text dimColor>Secondary text</Text>
```

#### Files to Refactor

| File | Instances |
|------|-----------|
| `AgentView.tsx` | 15 |
| `StatusBar.tsx` | 6 |
| `MessageBubble.tsx` | 5 |
| `ChatInput.tsx` | 3 |
| `ChatView.tsx` | 3 |
| `ToolCallDisplay.tsx` | 2 |

**Exception:** Keep explicit color when conditional:
```tsx
// Keep this pattern
<Text color={isActive ? theme.primaryColor : theme.dimColor}>
```

---

### P2: Hyperlink Support

**Current:** Not implemented.

**Target:** Clickable links in terminals that support OSC 8.

#### Add Hyperlink Utility

```typescript
// src/utils/hyperlinks.ts

/**
 * Terminal hyperlink support using OSC 8 escape sequences
 * Supported: iTerm2, Hyper, WezTerm, Windows Terminal, Kitty
 */

export function supportsHyperlinks(): boolean {
  const term = process.env.TERM_PROGRAM;
  return (
    term === 'iTerm.app' ||
    term === 'Hyper' ||
    term === 'WezTerm' ||
    term === 'vscode' ||
    term === 'Kitty' ||
    !!process.env.WT_SESSION // Windows Terminal
  );
}

export function makeHyperlink(url: string, text?: string): string {
  const displayText = text ?? url;
  
  if (!supportsHyperlinks()) {
    return displayText;
  }
  
  // OSC 8 format: \x1B]8;;URL\x07TEXT\x1B]8;;\x07
  return `\x1B]8;;${url}\x07${displayText}\x1B]8;;\x07`;
}

export function fileLink(path: string, text?: string): string {
  const fileUrl = `file://${path}`;
  return makeHyperlink(fileUrl, text ?? path);
}

export function githubLink(owner: string, repo: string, path?: string): string {
  let url = `https://github.com/${owner}/${repo}`;
  if (path) url += `/blob/main/${path}`;
  return makeHyperlink(url, path ?? `${owner}/${repo}`);
}
```

#### Usage in Components

```tsx
// src/ui/agent-ink/AgentView.tsx
import { fileLink } from '../../utils/hyperlinks.js';

// In tool result display
<Text>
  Created file: {fileLink('/path/to/file.ts', 'file.ts')}
</Text>
```

---

### P2: Terminal Resize Handling

**Current:** Fixed 66-char width in some flows.

**Target:** Dynamic layout based on terminal dimensions.

#### Add useTerminalSize Hook

```typescript
// src/ui/agent-ink/useTerminalSize.ts

import { useState, useEffect } from 'react';

export interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return size;
}

// Utility for responsive breakpoints
export function getLayoutMode(columns: number): 'compact' | 'normal' | 'wide' {
  if (columns < 60) return 'compact';
  if (columns > 120) return 'wide';
  return 'normal';
}
```

#### Usage in AgentView

```tsx
// src/ui/agent-ink/AgentView.tsx
import { useTerminalSize, getLayoutMode } from './useTerminalSize.js';

function AgentView({ state, config }: AgentViewProps) {
  const { columns } = useTerminalSize();
  const layout = getLayoutMode(columns);
  
  return (
    <Box flexDirection="column">
      {/* Adjust content width */}
      <Box width={Math.min(columns - 4, 120)}>
        {/* ... */}
      </Box>
      
      {/* Conditional detail level */}
      {layout !== 'compact' && (
        <Text dimColor>Extended info...</Text>
      )}
    </Box>
  );
}
```

---

### P3: Permission Dialog Component

**Current:** Basic `waiting_permission` state label.

**Target:** Dedicated permission UI with clear actions.

#### Add PermissionDialog Component

```tsx
// src/ui/agent-ink/PermissionDialog.tsx

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AgentTheme } from './types.js';

interface PermissionDialogProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  theme: AgentTheme;
  onAllow: () => void;
  onDeny: () => void;
  onAllowAll?: () => void;
}

export function PermissionDialog({
  toolName,
  toolArgs,
  theme,
  onAllow,
  onDeny,
  onAllowAll,
}: PermissionDialogProps): React.ReactElement {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onAllow();
    if (input === 'n' || input === 'N') onDeny();
    if (input === 'a' || input === 'A') onAllowAll?.();
    if (key.escape) onDeny();
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warningColor}
      paddingX={1}
      marginX={1}
    >
      {/* Header */}
      <Box>
        <Text backgroundColor="yellow" color="black" bold>
          {' '}⚠ PERMISSION REQUIRED {' '}
        </Text>
      </Box>
      
      {/* Tool info */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          Allow <Text bold color={theme.toolColor}>{toolName}</Text> to execute?
        </Text>
        {toolArgs && (
          <Text dimColor>
            {JSON.stringify(toolArgs, null, 0).slice(0, 100)}
          </Text>
        )}
      </Box>
      
      {/* Actions */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>
          <Text bold color={theme.successColor}>[y]</Text> Allow
        </Text>
        <Text dimColor>
          <Text bold color={theme.errorColor}>[n]</Text> Deny
        </Text>
        {onAllowAll && (
          <Text dimColor>
            <Text bold color={theme.infoColor}>[a]</Text> Allow All
          </Text>
        )}
        <Text dimColor>
          <Text bold>[Esc]</Text> Cancel
        </Text>
      </Box>
    </Box>
  );
}
```

---

### P3: Custom Dashed Borders (Optional)

**Note:** Ink's built-in `borderStyle` doesn't support dashed. This requires custom rendering.

#### Dashed Border Characters

```typescript
// src/ui/agent-ink/borders.ts

export const DASHED_BORDER = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '╌',
  vertical: '╎',
} as const;

// For left-only border effect (like code quotes)
export function renderLeftBorder(
  content: string,
  color: string = 'gray'
): string {
  const lines = content.split('\n');
  return lines.map(line => `╎ ${line}`).join('\n');
}
```

#### Alternative: Use Ink Box with partial borders

```tsx
// Simpler approach - left border only
<Box
  borderLeft
  borderStyle="single"
  borderColor={theme.dimColor}
  paddingLeft={1}
>
  <Text>{content}</Text>
</Box>
```

---

## Implementation Checklist

### Phase 1 (Low Effort)
- [ ] Add `BORDER_STYLES` constant to `types.ts`
- [ ] Replace hardcoded border styles in AgentView
- [ ] Audit and fix `dimColor` prop usage

### Phase 2 (Medium Effort)
- [ ] Create `src/utils/hyperlinks.ts`
- [ ] Add hyperlink support to file paths in tool outputs
- [ ] Create `useTerminalSize.ts` hook
- [ ] Add responsive layout modes

### Phase 3 (Optional)
- [ ] Create `PermissionDialog.tsx` component
- [ ] Integrate permission dialog with agent flow
- [ ] Add dashed border utilities if needed

---

## Testing Recommendations

```bash
# Visual testing in different terminal widths
COLUMNS=60 yarn dev   # Compact mode
COLUMNS=80 yarn dev   # Normal mode  
COLUMNS=140 yarn dev  # Wide mode

# Test hyperlinks in supported terminals
# iTerm2, Hyper, WezTerm, Windows Terminal
```

---

## References

- Original analysis: `.research/best-practices.md`
- Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`
- Ink documentation: https://github.com/vadimdemedes/ink

---

*Generated by Octocode MCP Research Agent 🔍🐙*

