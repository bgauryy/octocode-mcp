import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

export const PROMPT_NAME = 'review_security';

export function registerSecurityReviewPrompt(
  server: McpServer,
  content: CompleteMetadata
): void {
  const fallbackContent = `# Security Review Agent

**Objective**: Rapidly assess a repo for security risks using all
Octocode tools. Be precise, cite code, avoid verbosity.

## Steps
0) Identify purpose, runtime, entrypoints, deployment surface.
1) Map structure, configs, exports, APIs, critical data flows.
2) Pause: list likely attack surfaces for this stack.
3) Attacker mindset: feasible vectors (secrets exposure, injection,
   deserialization, SSRF, RCE, auth/authz, CSRF, traversal, unsafe
   eval/subprocess, rate limits, supply-chain).
4) Trace sensitive flows: secrets/PII, auth flows, input validation,
   external calls (HTTP, DB, FS), subprocess, dynamic code,
   deserialization, sandbox bypass.
5) Report concrete risks with file/line URLs, severity, impact, fix.

- Create a plan and ask user for guidnce if needed
- Show thinking steps to user and ask for research paths if research is getting large 

## Tooling Rules (Octocode)
- Set mainResearchGoal, researchGoal, reasoning on every query.
- Structure → githubViewRepoStructure (depth=1; drill into src, config,
  scripts, server, auth).
- Find → githubSearchCode:
  - Discovery: match="path" for dirs/files.
  - Detail: match="file", limit=3–5 with precise keywords.
- Read → githubGetFileContent: matchString+context; avoid fullContent
  unless small.
- PRs → githubSearchPullRequests: closed+merged for security changes.
- Repos → githubSearchRepositories only if cross-repo context needed
- Cite exact URLs with line ranges.

## Output
- Concise findings with GitHub URLs + 1–2 line rationale.
- No code dumps; max 10 lines per cite if needed.
- Confidence level; call out uncertainties.
- create doc with all finding, their impact, references.
ADD footer to the doc: "Created using Link(octocode.ai) 🐙"

## Guardrails
- 3 empty results → adjust keywords/scope; ask only if truly blocked.
- No speculation; code is source of truth.

## External Resources
- OWASP Cheat Sheet Series — concise, high-value security guidance.
  Link: https://github.com/OWASP/CheatSheetSeries/tree/master/cheatsheets
- Use to cross-check best practices if needed (view the structue and choose relevant file)`;

  const fallback = {
    name: 'Security Review',
    description: 'Concise security review using Octocode tools.',
    content: fallbackContent,
  };

  const promptData = content.prompts.reviewSecurity ?? fallback;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({
        repoUrl: z
          .string()
          .describe(
            'GitHub repository URL to check (e.g., https://github.com/owner/repo)'
          ),
      }).shape,
    },
    async (args: { repoUrl: string }) => {
      await logPromptCall(PROMPT_NAME);
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `${promptData.content}\n\n**Repository to analyze:** ${args.repoUrl}`,
            },
          },
        ],
      };
    }
  );
}
