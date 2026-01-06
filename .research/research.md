# Claude Agent SDK CLI - Terminal UI Analysis

> Executive summary and key findings from analyzing `@anthropic-ai/claude-agent-sdk/cli.js` (10.5MB minified bundle)

## Executive Summary

The Claude Agent SDK CLI uses **Ink** (React for CLI) with **Yoga** flexbox layout engine for terminal UI rendering. The bundle includes ~5040 lines of minified code incorporating:
- Terminal UI framework (Ink v4+)
- ANSI styling (chalk-based V1 color library)
- Progress indicators
- Interactive components
- Streaming message handling

## Key Architecture Patterns

### 1. Framework Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | **Ink** | React-based terminal UI |
| Layout Engine | **Yoga** | Flexbox for terminals |
| Styling | **Chalk-like** | ANSI colors/styles |
| Input | **Ink useInput** | Keyboard handling |

### 2. Core Components (from `ink` package)

```typescript
// Standard components found in SDK
Box       // Flexbox container with border support
Text      // Styled text rendering
Static    // Render-once items (for terminal scrollback)
useInput  // Keyboard input handling
useApp    // App lifecycle (exit control)
```

### 3. Border Styles (`borderStyle` prop)

```typescript
// Border styles found in cli.js
'single'   // Standard box drawing characters
'double'   // Double-line borders
'round'    // Rounded corners
'dashed'   // Dashed lines (╌ ╎)
```

**Dashed border definition at charOffset ~4279459:**
```javascript
dashed: {
  top: "╌", left: "╎", right: "╎", bottom: "╌",
  topLeft: " ", topRight: " ", bottomLeft: " ", bottomRight: " "
}
```

### 4. Text Styling Props

```typescript
// Text component props found
color="white" | "gray" | "cyan" | "error" | "permission" | theme.dimColor
dimColor={true}     // Apply dim styling
bold={true}         // Bold text
italic={true}       // Italic text  
wrap="truncate-end" // Text overflow handling
wrap="wrap"         // Text wrapping
```

### 5. Layout Props (Flexbox via Yoga)

```typescript
// Box component layout props
flexDirection="column" | "row"
justifyContent="space-between" | "center"
alignItems="center"
paddingX={1}
paddingY={1}
marginTop={1}
marginBottom={1}
marginLeft={1}
gap={1}  // Spacing between children
```

## Message Rendering Patterns

### Message Block Structure

```tsx
// Pattern from Claude SDK for message blocks
<Box flexDirection="column" marginTop={1}>
  <Box flexDirection="row">
    <Text dimColor>({timestamp})</Text>
    <Text bold color={messageTypeColor}>{icon}</Text>
    <Text>{title}</Text>
  </Box>
  <Box borderStyle="dashed" borderColor="subtle" paddingX={1}>
    <Text>{content}</Text>
  </Box>
</Box>
```

### Tool Use Display Pattern

**Found at charOffset ~9413778:**
```tsx
// Tool use rendering with status indicators
<Box flexDirection="column">
  <Box>
    {tool.status === 'running' ? (
      <Spinner />
    ) : (
      <Text color={statusColor}>{statusIcon}</Text>
    )}
    <Text bold>{toolName}</Text>
    <Text dimColor> ({duration})</Text>
  </Box>
  <Box marginLeft={2}>
    <Text dimColor>Input: {truncatedArgs}</Text>
  </Box>
</Box>
```

### Streaming Message Pattern

**Important: Use `Static` for completed messages, dynamic rendering for streaming:**
```tsx
// Completed messages - rendered once, stay in scrollback
<Static items={completedMessages}>
  {(msg) => <MessageBlock key={msg.id} message={msg} />}
</Static>

// Streaming message - updates in real-time
{streamingMessage && (
  <Box>
    <MessageBlock message={streamingMessage} />
  </Box>
)}
```

## Color/Theme System

### Color Constants Pattern
```typescript
// Theme colors found
theme: {
  primaryColor: 'magenta' | 'cyan'
  infoColor: 'blue'
  successColor: 'green'  
  errorColor: 'red'
  warningColor: 'yellow'
  dimColor: 'gray'
  toolColor: 'cyan'
  thinkingColor: 'gray'
  borderColor: 'gray'
}
```

### ANSI Hyperlink Support

**OSC 8 escape sequences at charOffset ~9089386:**
```javascript
// Terminal hyperlink pattern
const OSC_START = "\x1B]8;;";
const OSC_END = "\x07";

function makeHyperlink(url, text) {
  return `${OSC_START}${url}${OSC_END}${text}${OSC_START}${OSC_END}`;
}
```

## Progress Indicators

### Spinner Patterns

```tsx
// Ink's built-in Spinner component
import { Spinner } from '@inkjs/ui';

// Usage
<Spinner label="Loading..." />
```

### Progress Bar (ink-progress)

```tsx
// Custom progress component at charOffset ~4357331
<ink-progress state={state} percentage={percent} />
```

## Best Practices Found

### 1. State-Based UI Updates
```tsx
// Don't force-update during idle states
const isActiveState = !['idle', 'completed', 'error'].includes(state);
useEffect(() => {
  if (!isActiveState) return;
  const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
  return () => clearInterval(interval);
}, [isActiveState]);
```

### 2. Permission Dialogs
- Use dedicated border colors (`borderColor="permission"`)
- Clear status indicators
- Keyboard shortcut hints

### 3. Error Display
```tsx
<Box flexDirection="column" padding={1}>
  <Box>
    <Text backgroundColor="error" color="text"> ERROR </Text>
    <Text> {error.message}</Text>
  </Box>
  {/* Stack trace rendering */}
</Box>
```

### 4. Cursor Management
```javascript
// Hide cursor during spinners
process.stdout.write('\x1B[?25l');

// Show cursor
process.stdout.write('\x1B[?25h');
```

## References

| Feature | Location (charOffset) |
|---------|----------------------|
| Border styles | 4279459 |
| Progress component | 4357331 |
| Message rendering | 9413778 |
| Hyperlinks | 9089386 |
| Tool use display | 9880442 |
| Error display | 4319563 |

---

*Generated from analysis of `@anthropic-ai/claude-agent-sdk/cli.js` v1.x*
