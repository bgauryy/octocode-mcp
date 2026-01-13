#!/usr/bin/env node
/**
 * Knowledge Gap Generator
 *
 * 1. Clone a package repo
 * 2. Use subagent to find edge-case questions from the code
 * 3. Verify baseline doesn't know the answer
 * 4. Output validated eval cases
 *
 * Usage:
 *   npx tsx tests/evals/scripts/generate-knowledge-gap.ts <repo-url> [--limit N]
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface GeneratedQuestion {
  question: string;
  answer: string;
  keyTerms: string[];
  file: string;
  lineRange: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'api' | 'behavior' | 'edge-case' | 'internal';
}

interface ValidatedCase {
  name: string;
  repo: string;
  prompt: string;
  groundTruth: {
    mustMention: string[];
    validationQuery: string;
  };
  baselineKnows: boolean;
  baselineResponse: string;
}

const QUESTION_FINDER_PROMPT = `You are analyzing a codebase to find OBSCURE knowledge-gap questions.

CRITICAL: Find questions that an AI model CANNOT answer from general knowledge. The AI knows common patterns, typical behaviors, and standard implementations. You must find SURPRISING, NON-OBVIOUS, IMPLEMENTATION-SPECIFIC details.

GOOD questions (hard to guess):
- Exact magic numbers or constants used internally (e.g., "What is the exact timeout value in ms?")
- Counter-intuitive edge cases (e.g., "Does X return null or throw when Y?")
- Specific error messages verbatim (e.g., "What exact error message is thrown when...?")
- Internal variable/function names that affect behavior
- Exact algorithm choices (e.g., "Does it use DFS or BFS internally?")
- Specific regex patterns used for validation
- Exact order of operations when multiple things happen
- Specific defaults that differ from common conventions

BAD questions (AI can guess these):
- "Does isNumber(NaN) return true?" - AI knows NaN handling
- "What does noop return?" - AI knows noop returns undefined
- "Does it notify listeners on change?" - AI knows observer patterns
- Any behavior that follows standard conventions
- Anything documented in README or typical docs

The question should make you think "I'd have to read the source code to know this for sure."

For each question, provide:
1. The exact question (be specific, include exact values when relevant)
2. The precise answer from the code (include exact values, function names, etc.)
3. 3-5 key terms that MUST appear in a correct answer (use specific values, not generic terms)
4. The file and line range
5. Difficulty (easy/medium/hard)
6. Category (api/behavior/edge-case/internal)

Output as JSON array. Find 5-10 truly obscure questions.`;

const BASELINE_CHECK_PROMPT = `Answer this technical question. You MUST be honest about uncertainty.

IMPORTANT RULES:
- If you're guessing or inferring based on common patterns, say "I'm inferring..." or "typically..."
- If you don't know the EXACT value/behavior, say "I don't know the exact..."
- Only provide specific values (numbers, names, messages) if you're CERTAIN
- Don't make up specific values - admit when you'd need to check the source

Question: {question}

Be precise. If uncertain about specifics, admit it.`;

async function cloneRepo(repoUrl: string): Promise<string> {
  const tempDir = mkdtempSync(join(tmpdir(), 'eval-repo-'));
  console.log(`Cloning ${repoUrl} to ${tempDir}...`);

  execSync(`git clone --depth 1 ${repoUrl} ${tempDir}`, {
    stdio: 'pipe',
    timeout: 60000
  });

  return tempDir;
}

function findSourceFiles(dir: string, extensions = ['.ts', '.tsx', '.js']): string[] {
  const results: string[] = [];
  const ignore = ['node_modules', '.git', 'dist', 'build', 'coverage', '__tests__', 'test', 'tests', 'examples', 'docs', 'scripts'];
  const prioritize = ['src', 'lib', 'packages'];

  // Try to find main source directory first
  let startDir = dir;
  for (const pdir of prioritize) {
    const candidate = join(dir, pdir);
    if (existsSync(candidate)) {
      startDir = candidate;
      break;
    }
  }

  function walk(currentDir: string, depth = 0) {
    if (depth > 4) return;

    try {
      const items = readdirSync(currentDir);
      for (const item of items) {
        if (ignore.includes(item) || item.startsWith('.')) continue;

        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (extensions.some(ext => item.endsWith(ext))) {
          // Skip config files, test files, type declaration files
          if (!item.includes('.config.') && !item.includes('.test.') && !item.includes('.spec.') && !item.endsWith('.d.ts')) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(startDir);

  // Sort by file size (smaller files often have more focused code)
  results.sort((a, b) => {
    try {
      return statSync(a).size - statSync(b).size;
    } catch {
      return 0;
    }
  });

  return results.slice(0, 15); // Limit to 15 files
}

function readFileContent(filePath: string, maxLines = 200): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, maxLines);
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function findQuestions(repoPath: string, repoUrl: string): Promise<GeneratedQuestion[]> {
  console.log('\nAnalyzing repo for knowledge-gap questions...');

  // Find and read source files
  const sourceFiles = findSourceFiles(repoPath);
  console.log(`Found ${sourceFiles.length} source files`);

  // Build context from files
  const fileContents: string[] = [];
  for (const file of sourceFiles) {
    const relativePath = file.replace(repoPath + '/', '');
    const content = readFileContent(file);
    if (content) {
      fileContents.push(`\n--- FILE: ${relativePath} ---\n${content}`);
    }
  }

  const codeContext = fileContents.join('\n');
  console.log(`Total context: ${codeContext.length} chars from ${fileContents.length} files`);

  let response = '';

  // Send code as context
  for await (const message of query({
    prompt: `${QUESTION_FINDER_PROMPT}

Repository: ${repoUrl}

Here is the source code to analyze:

${codeContext}

Based on this code, generate 5-10 knowledge-gap questions.
Output ONLY a valid JSON array, no other text.
Example format:
[
  {
    "question": "What happens when...",
    "answer": "The code does...",
    "keyTerms": ["term1", "term2"],
    "file": "src/file.ts",
    "lineRange": "10-25",
    "difficulty": "medium",
    "category": "behavior"
  }
]`,
    options: {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 1,
      mcpServers: {},
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      response = message.result || '';
    }
  }

  // Extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to extract JSON from response');
    console.error('Response was:', response.slice(0, 500));
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    console.error('JSON was:', jsonMatch[0].slice(0, 500));
    return [];
  }
}

async function checkBaseline(question: string): Promise<{ knows: boolean; response: string }> {
  console.log(`  Checking baseline for: "${question.slice(0, 50)}..."`);

  let response = '';

  // Run without any tools - pure baseline
  for await (const message of query({
    prompt: BASELINE_CHECK_PROMPT.replace('{question}', question),
    options: {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 1,
      mcpServers: {},
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      response = message.result || '';
    }
  }

  // Check if baseline knows - look for uncertainty markers
  const uncertaintyMarkers = [
    "i don't know",
    "i'm not sure",
    "i cannot",
    "i can't",
    "uncertain",
    "not certain",
    "may vary",
    "would need to check",
    "depends on the version",
    "i don't have",
    "i'm inferring",
    "typically",
    "usually",
    "likely",
    "probably",
    "i would assume",
    "i believe",
    "i think",
    "commonly",
    "generally",
    "in most cases",
    "would need to",
    "check the source",
    "check the documentation",
    "not 100%",
    "hard to say",
  ];

  const lowerResponse = response.toLowerCase();
  const showsUncertainty = uncertaintyMarkers.some(m => lowerResponse.includes(m));

  return {
    knows: !showsUncertainty,
    response
  };
}

async function validateQuestions(
  questions: GeneratedQuestion[],
  repoUrl: string
): Promise<ValidatedCase[]> {
  console.log(`\nValidating ${questions.length} questions against baseline...`);

  const validated: ValidatedCase[] = [];

  for (const q of questions) {
    const { knows, response } = await checkBaseline(q.question);

    const status = knows ? '❌ BASELINE KNOWS' : '✅ KNOWLEDGE GAP';
    console.log(`  ${status}: ${q.question.slice(0, 40)}...`);

    validated.push({
      name: q.question.slice(0, 50).replace(/[^a-z0-9]/gi, '_').toLowerCase(),
      repo: repoUrl,
      prompt: q.question,
      groundTruth: {
        mustMention: q.keyTerms,
        validationQuery: q.answer,
      },
      baselineKnows: knows,
      baselineResponse: response,
    });
  }

  return validated;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npx tsx tests/evals/scripts/generate-knowledge-gap.ts <repo-url> [--limit N]

Example:
  npx tsx tests/evals/scripts/generate-knowledge-gap.ts https://github.com/honojs/hono --limit 5
`);
    process.exit(1);
  }

  const repoUrl = args[0];
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           KNOWLEDGE GAP GENERATOR                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nRepository: ${repoUrl}`);
  console.log(`Question limit: ${limit}`);

  let repoPath: string | null = null;

  try {
    // Step 1: Clone the repo
    repoPath = await cloneRepo(repoUrl);

    // Step 2: Find questions using subagent with repo access
    const questions = await findQuestions(repoPath, repoUrl);
    console.log(`\nFound ${questions.length} potential questions`);

    if (questions.length === 0) {
      console.log('No questions found. Try a different repo.');
      return;
    }

    // Step 3: Validate against baseline
    const validated = await validateQuestions(questions.slice(0, limit), repoUrl);

    // Step 4: Output results
    const knowledgeGaps = validated.filter(v => !v.baselineKnows);
    const baselineKnows = validated.filter(v => v.baselineKnows);

    console.log('\n' + '═'.repeat(60));
    console.log('RESULTS SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total questions: ${validated.length}`);
    console.log(`Knowledge gaps (baseline doesn't know): ${knowledgeGaps.length}`);
    console.log(`Baseline knows: ${baselineKnows.length}`);

    if (knowledgeGaps.length > 0) {
      console.log('\n✅ VALIDATED KNOWLEDGE GAP QUESTIONS:');
      console.log('─'.repeat(60));

      // Output as JSON for use in evals
      const evalCases = knowledgeGaps.map(kg => ({
        name: kg.name,
        description: `Knowledge gap from ${kg.repo}`,
        prompt: kg.prompt,
        category: 'verified_knowledge_gap',
        difficulty: 4,
        groundTruth: kg.groundTruth,
        expected: { status: 'hasResults' },
        tags: ['verified', 'package-specific', kg.repo.split('/').pop()],
      }));

      console.log('\nJSON for eval file:');
      console.log(JSON.stringify(evalCases, null, 2));
    }

  } finally {
    // Cleanup
    if (repoPath && existsSync(repoPath)) {
      console.log(`\nCleaning up ${repoPath}...`);
      rmSync(repoPath, { recursive: true, force: true });
    }
  }
}

main().catch(console.error);
