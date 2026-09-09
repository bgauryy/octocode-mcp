/** Display lines are 1-based; characters are 0-based UTF-16 offsets. */
export type CompactCallRange = {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
};

export type CompactCallTarget = {
  name: string;
  kind: string;
  uri: string;
  line: number;
  endLine: number;
  selectionLine?: number;
};

export type CompactCall = {
  direction: 'incoming' | 'outgoing';
  item: CompactCallTarget;
  ranges: CompactCallRange[];
  rangeCount: number;
  contentPreview?: string;
};
