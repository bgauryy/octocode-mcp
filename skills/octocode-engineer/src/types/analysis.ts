export type AnalysisLens = 'graph' | 'ast' | 'hybrid';

export interface RecommendedValidation {
  summary: string;
  tools: string[];
}

export interface FlowTraceStep {
  file: string;
  lineStart: number;
  lineEnd: number;
  label: string;
}

export interface AnalysisSignal {
  kind: string;
  lens: AnalysisLens;
  title: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  files: string[];
  categories: string[];
  evidence: Record<string, unknown>;
}
