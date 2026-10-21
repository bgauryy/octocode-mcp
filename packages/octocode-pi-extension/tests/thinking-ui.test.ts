import { AssistantMessageComponent, initTheme } from '@earendil-works/pi-coding-agent';
import { Container } from '@earendil-works/pi-tui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { thinkingTranscript } from '../src/ui/thinking.js';

beforeEach(() => initTheme('dark', false));

const message = (thinking: string, text = '') => ({
  role: 'assistant', content: [{ type: 'thinking', thinking }, { type: 'text', text }],
  stopReason: 'stop',
}) as never;
const plain = (component: AssistantMessageComponent, width = 60) => component.render(width).join('\n').replace(/\x1b\[[0-9;]*m/g, '');

function setup() {
  const chat = new Container();
  const root = { children: [chat], requestRender: vi.fn() };
  return { chat, root, transcript: thinkingTranscript(root) };
}

describe('thinking transcript', () => {
  it('expands resumed thinking before rendering and retains the entire text and answer', () => {
    const { chat, transcript } = setup();
    const thought = 'Unique opening. ' + 'Detailed reasoning with evidence. '.repeat(200) + 'Unique ending.';
    const component = new AssistantMessageComponent(message(thought, 'Final answer'), true);
    chat.addChild(component);
    expect(plain(component)).not.toContain('Unique opening.');
    transcript.refresh();
    const rendered = plain(component, 100);
    expect(rendered).toContain('Unique opening.');
    expect(rendered).toContain('Unique ending.');
    expect(rendered).toContain('Final answer');
    expect(rendered.match(/Detailed\s+reasoning\s+with\s+evidence\./g)).toHaveLength(200);
  });

  it('shows streamed thinking immediately, then keeps it when the answer arrives', () => {
    const { chat, transcript } = setup();
    const component = new AssistantMessageComponent(undefined, true);
    chat.addChild(component);
    transcript.refresh();
    component.updateContent(message('First thought.'), true);
    expect(plain(component)).toContain('First thought.');
    component.updateContent(message('First thought. Second thought.', 'Answer.'), false);
    transcript.refresh();
    expect(plain(component)).toContain('Second thought.');
    expect(plain(component)).toContain('Answer.');
  });

  it('toggles existing and future blocks together without reapplying visibility every frame', () => {
    const { chat, root, transcript } = setup();
    const component = new AssistantMessageComponent(message('First thought.'), true);
    const setHidden = vi.spyOn(component, 'setHideThinkingBlock');
    chat.addChild(component);
    transcript.refresh();
    transcript.refresh();
    expect(setHidden).toHaveBeenCalledExactlyOnceWith(false);
    transcript.toggle();
    expect(plain(component)).not.toContain('First thought.');
    const next = new AssistantMessageComponent(message('Next thought.'), false);
    chat.addChild(next);
    transcript.refresh();
    expect(plain(next)).not.toContain('Next thought.');
    transcript.toggle();
    expect(plain(component)).toContain('First thought.');
    expect(plain(next)).toContain('Next thought.');
    expect(root.requestRender).toHaveBeenCalledTimes(2);
    expect(thinkingTranscript(root)).toBe(transcript);
  });

  it('does not overwrite an individual block visibility change on the next frame', () => {
    const { chat, transcript } = setup();
    const component = new AssistantMessageComponent(message('Click to hide.'), true);
    chat.addChild(component);
    transcript.refresh();
    component.setHideThinkingBlock(true);
    transcript.refresh();
    expect(plain(component)).not.toContain('Click to hide.');
  });
});
