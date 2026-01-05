/**
 * ChatInput Component
 *
 * Interactive text input with cursor position tracking and history navigation.
 * Based on best practices from @inkjs/ui TextInput and Shopify CLI.
 *
 * Features:
 * - Cursor position tracking with left/right arrow navigation
 * - Insert text at cursor position
 * - History navigation (Ctrl+Up/Down or Up when empty)
 * - Tab to autocomplete placeholder
 * - Passthrough of unhandled keys to parent (for scrolling)
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ChatTheme } from './types.js';
import { DEFAULT_THEME } from './types.js';

interface ChatInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  history?: string[];
  theme?: ChatTheme;
  focus?: boolean;
}

export function ChatInput({
  onSubmit,
  placeholder = 'Type your message...',
  disabled = false,
  history = [],
  theme = DEFAULT_THEME,
  focus = true,
}: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Keep cursor in bounds when value changes
  useEffect(() => {
    setCursorOffset(prev => {
      if (prev > value.length) {
        return value.length;
      }
      return prev;
    });
  }, [value]);

  const handleSubmit = useCallback(() => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
      setCursorOffset(0);
      setHistoryIndex(-1);
    }
  }, [value, disabled, onSubmit]);

  // Render the input value with cursor
  const renderedValue = useMemo(() => {
    if (disabled) {
      return value || placeholder;
    }

    if (value.length === 0) {
      // Show placeholder with cursor on first char
      if (placeholder.length > 0) {
        return (
          <>
            <Text inverse>{placeholder[0]}</Text>
            <Text dimColor>{placeholder.slice(1)}</Text>
          </>
        );
      }
      return <Text inverse> </Text>;
    }

    // Render value with cursor at cursorOffset
    const beforeCursor = value.slice(0, cursorOffset);
    const atCursor = value[cursorOffset] || ' ';
    const afterCursor = value.slice(cursorOffset + 1);

    return (
      <>
        <Text>{beforeCursor}</Text>
        <Text inverse>{atCursor}</Text>
        <Text>{afterCursor}</Text>
      </>
    );
  }, [value, cursorOffset, placeholder, disabled]);

  useInput(
    (input, key) => {
      if (disabled) return;

      // Keys to pass through to parent for handling (scrolling, etc.)
      // Only pass through up/down when there's text (otherwise use for history)
      if (key.upArrow && value.length > 0 && !key.ctrl) {
        return; // Pass to parent for scroll
      }
      if (key.downArrow && value.length > 0 && !key.ctrl) {
        return; // Pass to parent for scroll
      }
      if (key.pageUp || key.pageDown) {
        return; // Always pass page keys to parent
      }
      if (key.ctrl && input === 'c') {
        return; // Pass Ctrl+C to parent
      }
      if (key.shift && key.tab) {
        return; // Pass shift+tab to parent
      }

      // Handle input
      if (key.return) {
        handleSubmit();
        return;
      }

      // Tab to autocomplete placeholder
      if (key.tab) {
        if (value.length === 0 && placeholder) {
          setValue(placeholder);
          setCursorOffset(placeholder.length);
        }
        return;
      }

      // History navigation
      if (key.upArrow && key.ctrl) {
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          const historyValue = history[history.length - 1 - newIndex] || '';
          setValue(historyValue);
          setCursorOffset(historyValue.length);
        }
        return;
      }
      if (key.downArrow && key.ctrl) {
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          const historyValue = history[history.length - 1 - newIndex] || '';
          setValue(historyValue);
          setCursorOffset(historyValue.length);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setValue('');
          setCursorOffset(0);
        }
        return;
      }

      // Up when empty = history
      if (key.upArrow && value.length === 0) {
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          const historyValue = history[history.length - 1 - newIndex] || '';
          setValue(historyValue);
          setCursorOffset(historyValue.length);
        }
        return;
      }

      // Cursor movement
      if (key.leftArrow) {
        setCursorOffset(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorOffset(prev => Math.min(value.length, prev + 1));
        return;
      }

      // Home/End
      if (key.meta && key.leftArrow) {
        setCursorOffset(0);
        return;
      }
      if (key.meta && key.rightArrow) {
        setCursorOffset(value.length);
        return;
      }

      // Backspace - delete char before cursor
      if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          setValue(prev => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset));
          setCursorOffset(prev => prev - 1);
        }
        setHistoryIndex(-1);
        return;
      }

      // Escape to clear
      if (key.escape) {
        setValue('');
        setCursorOffset(0);
        setHistoryIndex(-1);
        return;
      }

      // Insert character at cursor position
      if (input && !key.ctrl && !key.meta) {
        setValue(prev => prev.slice(0, cursorOffset) + input + prev.slice(cursorOffset));
        setCursorOffset(prev => prev + input.length);
        setHistoryIndex(-1);
      }
    },
    { isActive: focus && !disabled }
  );

  return (
    <Box
      borderStyle="round"
      borderColor={disabled ? theme.dimColor : theme.userColor}
      paddingX={1}
    >
      <Text color={theme.userColor} bold>
        {'❯ '}
      </Text>
      <Text color={disabled ? theme.dimColor : undefined} dimColor={disabled}>
        {renderedValue}
      </Text>
    </Box>
  );
}

export default ChatInput;

