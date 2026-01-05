# Octocode Agent CLI - UX Design Guide

> Comprehensive design system for the interactive agent terminal interface

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Visual Hierarchy](#visual-hierarchy)
- [Color System](#color-system)
- [Iconography & Emojis](#iconography--emojis)
- [Typography & Text](#typography--text)
- [Layout System](#layout-system)
- [State Machine & Animations](#state-machine--animations)
- [Interactive Elements](#interactive-elements)
- [Keyboard Navigation](#keyboard-navigation)
- [Accessibility](#accessibility)
- [Best Practices](#best-practices)

---

## Design Philosophy

### Core Principles

1. **Clarity Over Decoration** - Every visual element serves a purpose
2. **Progressive Disclosure** - Show what's needed, hide what's not
3. **Immediate Feedback** - User actions get instant visual response
4. **Consistent Language** - Same patterns mean same things
5. **Terminal-Native** - Embrace CLI aesthetics, don't fight them

### User Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Brand + Mode + Status                    [Always]  │
├─────────────────────────────────────────────────────────────┤
│  TASK: Current task description                  [Context]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MESSAGES: Chronological conversation stream      [Main]    │
│  - Thinking blocks (collapsible)                            │
│  - Agent responses                                          │
│  - Tool calls with results                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  FINAL ANSWER: Prominent result display        [Completion] │
├─────────────────────────────────────────────────────────────┤
│  ACTIVE TOOLS: Real-time tool execution         [Activity]  │
├─────────────────────────────────────────────────────────────┤
│  INPUT: User prompt entry                         [Action]  │
├─────────────────────────────────────────────────────────────┤
│  STATUS BAR: Stats + Shortcuts                    [Always]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Hierarchy

### Z-Index (Attention Priority)

| Priority | Element | Purpose |
|----------|---------|---------|
| 1 (Highest) | Error states | Critical issues need immediate attention |
| 2 | Final Answer | The user's goal - most important output |
| 3 | Active Tools | Current activity indicator |
| 4 | Messages | Conversation history |
| 5 | Header/Status | Persistent context |
| 6 (Lowest) | Thinking blocks | Optional detail |

### Visual Weight

```
████████████████  ERROR (bold red, high contrast)
██████████████    SUCCESS (bold green, prominent border)
████████████      ACTIVE (cyan, animated spinner)
██████████        CONTENT (white, standard weight)
████████          CONTEXT (gray, dimmed)
██████            METADATA (gray, smaller, dimmed)
```

---

## Color System

### Semantic Colors

| Color | Ink Value | Hex Approx | Semantic Meaning |
|-------|-----------|------------|------------------|
| **Primary** | `blue` | `#0066CC` | Brand, interactive elements, input focus |
| **Success** | `green` | `#00AA00` | Completion, positive results, confirmations |
| **Error** | `red` | `#CC0000` | Failures, warnings requiring action |
| **Warning** | `yellow` | `#CCAA00` | Caution, scroll paused, attention needed |
| **Info** | `cyan` | `#00AAAA` | Tools, informational, secondary actions |
| **Thinking** | `magenta` | `#AA00AA` | AI reasoning, internal process |
| **Dim** | `gray` | `#666666` | Metadata, timestamps, less important |
| **Border** | `gray` | `#444444` | Structure, separation |

### Color Application Rules

```typescript
// Theme interface
interface AgentTheme {
  primaryColor: 'blue';      // Brand, focus, prompts
  successColor: 'green';     // Completed, results, checkmarks
  errorColor: 'red';         // Errors, failures, X marks
  warningColor: 'yellow';    // Scroll paused, attention
  infoColor: 'cyan';         // Tools, system info
  dimColor: 'gray';          // Metadata, secondary text
  borderColor: 'gray';       // Box borders, separators
  thinkingColor: 'magenta';  // AI thinking blocks
  toolColor: 'cyan';         // Tool names, active tools
}
```

### Color Do's and Don'ts

| Do | Don't |
|----|-------|
| Use color to reinforce meaning | Use color as the only indicator |
| Keep contrast high for readability | Mix similar colors adjacent |
| Dim less important information | Make everything bright/bold |
| Use consistent color per type | Change colors arbitrarily |

---

## Iconography & Emojis

### State Icons

| State | Icon | Meaning | Animation |
|-------|------|---------|-----------|
| `idle` | ⏸ | Paused, waiting | Static |
| `waiting_for_input` | ✏️ | Ready for user | Cursor blink |
| `initializing` | 🔄 | Starting up | Spinner |
| `connecting_mcp` | 🔌 | Connecting to servers | Spinner |
| `executing` | ⚡ | Processing | Pulse |
| `thinking` | 🧠 | AI reasoning | Pulse |
| `tool_use` | 🔧 | Running tool | Spinner |
| `formulating_answer` | ✍️ | Preparing response | Dots animation |
| `waiting_permission` | ⏳ | Needs approval | Blink |
| `completed` | ✅ | Done successfully | Static (flash once) |
| `error` | ❌ | Failed | Static (shake) |

### Message Type Icons

| Type | Icon | Color | Purpose |
|------|------|-------|---------|
| Thinking | 💭 | Magenta | AI internal reasoning |
| Text | 🤖 | White | Agent response |
| Tool | 🔧 | Cyan | Tool execution |
| Result | ✅ | Green | Tool/task result |
| System | ℹ️ | Cyan | System messages |
| Error | ❌ | Red | Error messages |

### Mode Icons

| Mode | Icon | Description |
|------|------|-------------|
| Research | 🔍 | Information gathering |
| Coding | 💻 | Code writing/editing |
| Full | 🚀 | All capabilities |
| Planning | 📋 | Strategy/planning |
| Delegate | 👥 | Sub-agent delegation |
| Interactive | 🤝 | Conversational |

### Status Bar Icons

| Metric | Icon | Example |
|--------|------|---------|
| Tokens | 🎯 | `🎯 12,345 tok` |
| Tools | 🔧 | `🔧 5` |
| Time | ⏱ | `⏱ 2m 34s` |
| Cost | 💰 | `💰 $0.0234` |

### Tool Type Prefixes

| Tool Type | Prefix | Example |
|-----------|--------|---------|
| Octocode MCP | 🔍 | `🔍 localSearchCode` |
| Claude Tools | (none) | `Read` |
| Custom MCP | 🔌 | `🔌 customTool` |

---

## Typography & Text

### Text Styles

| Style | Ink Props | Usage |
|-------|-----------|-------|
| **Heading** | `bold` | Section titles, tool names |
| **Body** | (default) | Message content |
| **Emphasis** | `italic` | Thinking labels |
| **Dim** | `dimColor` | Metadata, args |
| **Code** | (monospace inherent) | All terminal text |

### Text Truncation Rules

| Content Type | Max Chars | Indicator |
|--------------|-----------|-----------|
| Task description | 80 | `...` |
| Tool args (message) | 1,000 | `... [X chars truncated]` |
| Tool args (active) | 500 | `... [X chars truncated]` |
| Thinking/Text/Results | Unlimited | Full display |

### Text Formatting

```typescript
// Good: Clear hierarchy
<Text bold color="cyan">🔧 Using tool: </Text>
<Text bold>Read</Text>
<Text dimColor> Input: {"path": "/src/..."}</Text>

// Bad: No visual hierarchy
<Text>Using tool Read with input {"path": "/src/..."}</Text>
```

---

## Layout System

### Box Model

```
┌─ borderStyle="single" ─────────────────────────────────┐
│ ← paddingX={1} →                                       │
│                                                        │
│   Content Area                                         │
│                                                        │
│ ← paddingX={1} →                                       │
└────────────────────────────────────────────────────────┘
     ↑ marginX={1} (space from edges)
```

### Border Styles

| Style | Usage | Example |
|-------|-------|---------|
| `single` | Standard containers | Header, status bar, tools |
| `double` | High emphasis | Final answer |
| `round` | Soft, friendly | Input box |
| (none) | Content flow | Message area |

### Responsive Layout

```typescript
// Dynamic height calculation
const terminalHeight = stdout?.rows || 24;
const terminalWidth = stdout?.columns || 80;

// Reserve space for fixed elements
const headerHeight = 4;
const statusHeight = 3;
const inputHeight = state.state === 'waiting_for_input' ? 3 : 0;
const toolsHeight = showTools && tools.length > 0
  ? Math.min(tools.length + 2, 8)
  : 0;

// Messages get remaining space (min 5 lines)
const messagesHeight = Math.max(
  5,
  terminalHeight - headerHeight - statusHeight - toolsHeight - inputHeight - 2
);
```

### Flexbox Patterns

```typescript
// Horizontal split (header)
<Box flexDirection="row" justifyContent="space-between">
  <Box>Left content</Box>
  <Box>Right content</Box>
</Box>

// Vertical stack (main layout)
<Box flexDirection="column" height={terminalHeight}>
  {/* Children stack vertically */}
</Box>

// Centered content (empty state)
<Box justifyContent="center" alignItems="center" height="100%">
  <Text>Centered message</Text>
</Box>
```

---

## State Machine & Animations

### State Transitions

```
                    ┌──────────────────┐
                    │       idle       │
                    └────────┬─────────┘
                             │ user submits task
                             ▼
                    ┌──────────────────┐
                    │   initializing   │ 🔄 Spinner
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  connecting_mcp  │ 🔌 Spinner
                    └────────┬─────────┘
                             │
                             ▼
         ┌──────────────────────────────────────┐
         │              executing               │ ⚡ Pulse
         └──────────┬───────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────────────┐
   │thinking │ │tool_use │ │formulating_ans. │
   │   🧠    │ │   🔧    │ │       ✍️        │
   └────┬────┘ └────┬────┘ └────────┬────────┘
        │           │               │
        └───────────┼───────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │    completed     │ ✅ Flash
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ waiting_for_input│ ✏️ Cursor
         └──────────────────┘
```

### Animation Types

#### 1. Spinner Animation
Used for: `initializing`, `connecting_mcp`, `tool_use`

```typescript
import { Spinner } from '@inkjs/ui';

// Default spinner (dots)
<Spinner label="Starting agent..." />

// For running tools
{tool.status === 'running' ? (
  <Spinner />
) : (
  <Text>{statusIcon}</Text>
)}
```

#### 2. Pulse Animation (Proposed)
Used for: `executing`, `thinking`

```typescript
// Pulsing dot animation
const PulsingDot = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(v => !v);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return <Text color="cyan">{visible ? '●' : '○'}</Text>;
};
```

#### 3. Dots Animation (Proposed)
Used for: `formulating_answer`

```typescript
// Typing dots animation
const TypingDots = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return <Text>Preparing answer{dots}</Text>;
};
```

#### 4. Progress Bar (Proposed)
Used for: Long operations, token budget

```typescript
// Simple progress bar
const ProgressBar = ({ progress, width = 20 }) => {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return (
    <Text>
      [{'█'.repeat(filled)}{'░'.repeat(empty)}] {Math.round(progress * 100)}%
    </Text>
  );
};
```

### Live Updates

```typescript
// Force re-render every second for live stats
useEffect(() => {
  const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
  return () => clearInterval(interval);
}, []);
```

---

## Interactive Elements

### Input Box

```typescript
<Box
  borderStyle="round"           // Soft, inviting
  borderColor={theme.primaryColor}  // Brand color
  paddingX={1}
>
  <Text color={theme.primaryColor}>→ </Text>  // Prompt indicator
  <TextInput
    placeholder="What would you like me to do?"
    defaultValue={inputValue}
    onChange={setInputValue}
    onSubmit={handleTaskSubmit}
  />
</Box>
```

### Toggle States

```typescript
// Status bar toggle display
<Text color={theme.dimColor}>
  [t] {showThinking ? 'Hide' : 'Show'} Think |
  [l] {showTools ? 'Hide' : 'Show'} Tools
</Text>
```

### Scroll Indicator

```typescript
// Warning when scrolled (messages paused)
{scrollOffset > 0 && (
  <Text color={theme.warningColor} bold>
    {' '}| ⬆ PAUSED ({scrollOffset})
  </Text>
)}
```

---

## Keyboard Navigation

### Shortcut Map

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+C` | Cancel/Exit | Always |
| `t` | Toggle thinking | When not in input mode |
| `l` | Toggle tools | When not in input mode |
| `Enter` | Submit input | Input focused |
| Mouse/Touchpad | Scroll messages | Always (native terminal) |

> **Note**: Scrolling uses native terminal scrolling via `<Static>` component. Use your terminal's mouse/touchpad scrolling instead of keyboard shortcuts.

### Key Binding Patterns

```typescript
// Handle shortcuts when agent is running (not in input mode)
useInput(
  (input, key) => {
    // Modifier + key - cancel/exit
    if (input === 'c' && key.ctrl) {
      onCancel?.();
      exit();
    }

    // Single letter toggles
    if (input === 't') { setShowThinking(prev => !prev); }
    if (input === 'l') { setShowTools(prev => !prev); }
  },
  { isActive: state.state !== 'waiting_for_input' }
);

// Handle Ctrl+C when in input mode
useInput(
  (input, key) => {
    if (input === 'c' && key.ctrl) {
      onCancel?.();
      exit();
    }
  },
  { isActive: state.state === 'waiting_for_input' }
);
```

---

## Accessibility

### Color Independence

Never rely on color alone:
```typescript
// Good: Icon + Color + Text
<Text color="green">✅ Completed</Text>
<Text color="red">❌ Error: Connection failed</Text>

// Bad: Color only
<Text color="green">Done</Text>
```

### Screen Reader Considerations

- Use semantic text labels
- Avoid decorative-only content
- Include alt-text equivalents in messages

### High Contrast Support

```typescript
// Theme can be customized for high contrast
const HIGH_CONTRAST_THEME: AgentTheme = {
  primaryColor: 'white',
  successColor: 'greenBright',
  errorColor: 'redBright',
  warningColor: 'yellowBright',
  // ... etc
};
```

---

## Best Practices

### Message Formatting

```typescript
// Good: Structured, scannable
<Box flexDirection="column">
  <Text color="cyan" bold>🔧 Using tool: Read</Text>
  <Box marginLeft={2}>
    <Text dimColor>Input: {"path": "/src/index.ts"}</Text>
  </Box>
</Box>

// Bad: Wall of text
<Text>Using tool Read with input path /src/index.ts and getting content...</Text>
```

### Error Display

```typescript
// Good: Clear, actionable
<Box borderStyle="single" borderColor="red" paddingX={1}>
  <Text color="red" bold>❌ Error</Text>
  <Text>Connection failed: API key not configured</Text>
  <Text dimColor>Run: export ANTHROPIC_API_KEY=your-key</Text>
</Box>

// Bad: Generic
<Text color="red">Error occurred</Text>
```

### Empty States

```typescript
// Good: Helpful guidance
<Box flexDirection="column" justifyContent="center" alignItems="center">
  <Text dimColor>Enter a task below to start the agent.</Text>
  <Text dimColor>Examples: "Explore the auth module", "Find all TODO comments"</Text>
</Box>

// Bad: Just empty
{/* nothing */}
```

### Loading States

```typescript
// Good: Contextual feedback
{state === 'initializing' && <Spinner label="Starting agent..." />}
{state === 'connecting_mcp' && <Spinner label="Connecting to MCP servers..." />}
{state === 'thinking' && <Text color="magenta">🧠 Thinking...</Text>}

// Bad: Generic
{isLoading && <Spinner />}
```

---

## Component Quick Reference

### Message Types Visual

```
💭 Thinking...                          [magenta, bordered, italic]
┌─────────────────────────────────────┐
│ Analyzing the codebase structure... │
└─────────────────────────────────────┘

🤖 Agent Response                       [white, standard]
   This is the main response text that
   wraps naturally across lines.

🔧 Using tool: Read                     [cyan, bold tool name]
   Input: {"path": "/src/index.ts"}     [gray, dimmed]

✅ Tool Result                          [green]
   File content returned successfully
   (1,234ms)                            [gray, duration]

ℹ️ System: Connected to 2/3 MCP servers [cyan]

❌ Error: Connection timeout            [red, bold]
   Please check your network connection [red]
```

### Final Answer Display

```
╔════════════════════════════════════════╗
║ ✅ Final Answer                        ║  [green, double border]
║                                        ║
║ The analysis shows that the auth      ║
║ module uses JWT tokens stored in...   ║
╚════════════════════════════════════════╝
```

### Active Tools Display

```
┌─ 🔧 Active Tools ──────────────────────┐  [cyan border]
│ ◐ localSearchCode (3s)                 │  [spinner + elapsed]
│   Input: {"pattern": "export..."}      │  [dimmed args]
│ ✓ Read (234ms)                         │  [completed checkmark]
└────────────────────────────────────────┘
```

---

## Future Enhancements

### Planned Features

1. **Progress Indicators** - Token budget usage, operation progress
2. **Theme Presets** - Dark, light, high-contrast, colorblind-friendly
3. **Sound Cues** - Optional audio feedback for completions/errors
4. **Rich Markdown** - Better code block rendering
5. **Image Preview** - ASCII art preview for image tools
6. **History Navigation** - Arrow keys in input for command history

### Experimental Ideas

- Sparkline graphs for token usage over time
- Collapsible message groups
- Split-pane view for parallel tools
- Syntax highlighting for code blocks

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01 | Initial UX system |
| 1.1.0 | 2025-01 | Added state animations, final answer display |

---

*This guide is maintained by the Octocode team. For contributions, see CONTRIBUTING.md*
