import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { normalizeReportData } from "./report-schema.ts";
import { resolvePath } from "./shared.ts";

const execFileAsync = promisify(execFile);
const PLACEHOLDER = "__REPORT_DATA__";
const CSS_PLACEHOLDER = "__INLINE_CSS__";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = path.join(SCRIPT_DIR, "report-template.html");

function printUsage() {
  console.log(`Usage:
  node scripts/build-report.mjs --input <report.json> --output <report.html> [--json-out <validated.json>] [--template <template.html>] [--open] [--require-full-content]

What it does:
  1. Reads a research JSON file.
  2. Validates and normalizes it with Zod.
  3. Writes a canonical JSON output file.
  4. Loads the HTML template once.
  5. Replaces ${PLACEHOLDER} with the validated JSON string and writes the final HTML.

Examples:
  node skills/whats-new/scripts/build-report.mjs \\
    --input ~/tmp/20260401-120000-whats-new.raw.json \\
    --json-out ~/tmp/20260401-120000-whats-new.json \\
    --output ~/tmp/20260401-120000-whats-new.html \\
    --require-full-content \\
    --open
`);
}

function defaultJsonPath(outputPath) {
  const ext = path.extname(outputPath);
  if (ext === ".html" || ext === ".htm") {
    return outputPath.slice(0, -ext.length) + ".json";
  }
  return outputPath + ".json";
}

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    jsonOut: "",
    template: DEFAULT_TEMPLATE,
    open: false,
    requireFullContent: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--open") {
      args.open = true;
      continue;
    }
    if (arg === "--require-full-content") {
      args.requireFullContent = true;
      continue;
    }
    if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--output") {
      args.output = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--json-out") {
      args.jsonOut = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--template") {
      args.template = argv[index + 1] || "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function collectItems(report) {
  return [...report.topItems, ...report.sections.flatMap((section) => section.items)];
}

function validateFullContentEvidence(report) {
  const failures = [];
  const items = collectItems(report);

  const tldrLength = report.tldr.trim().length;
  if (tldrLength < 120) {
    failures.push(`tldr is too short (${tldrLength} chars). Write a fuller executive summary.`);
  }

  for (const item of items) {
    const evidence = item.contentEvidence;
    if (!evidence) {
      failures.push(`${item.title}: missing contentEvidence`);
      continue;
    }
    const whyImportant = item.whyImportant || item.whyInteresting;
    if (!whyImportant || !whyImportant.trim()) {
      failures.push(`${item.title}: missing whyImportant`);
    }
    if (!Array.isArray(item.references) || item.references.length === 0) {
      failures.push(`${item.title}: missing references`);
    }
    if (evidence.method !== "full-page") {
      failures.push(`${item.title}: contentEvidence.method must be "full-page"`);
    }

    if (!Number.isInteger(evidence.chars) || evidence.chars < 200) {
      failures.push(`${item.title}: contentEvidence.chars must be >= 200`);
    }

    const summaryLength = item.summary.trim().length;
    if (summaryLength < 120) {
      failures.push(`${item.title}: summary is too short (${summaryLength} chars)`);
    }
  }

  if (!Array.isArray(report.sourcesChecked) || report.sourcesChecked.length === 0) {
    failures.push("sourcesChecked must include at least one recorded source.");
  }

  if (failures.length > 0) {
    throw new Error(
      `Full-content validation failed (${failures.length} validation issues):\n- ${failures.join("\n- ")}`
    );
  }
}

async function openInDefaultBrowser(filePath) {
  if (process.platform === "darwin") {
    await execFileAsync("open", [filePath]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", filePath]);
    return;
  }
  await execFileAsync("xdg-open", [filePath]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.input) {
    throw new Error("Missing required --input path.");
  }
  if (!args.output) {
    throw new Error("Missing required --output path.");
  }

  const inputPath = resolvePath(args.input);
  const outputPath = resolvePath(args.output);
  const templatePath = resolvePath(args.template || DEFAULT_TEMPLATE);
  const jsonOutPath = resolvePath(args.jsonOut || defaultJsonPath(outputPath));

  const rawJson = await fs.readFile(inputPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Could not parse JSON input at ${inputPath}: ${error.message}`);
  }

  const normalized = normalizeReportData(parsed);
  if (args.requireFullContent) {
    validateFullContentEvidence(normalized);
  }
  const prettyJson = JSON.stringify(normalized, null, 2) + "\n";
  const embeddedJson = prettyJson.trim().replace(/</g, "\\u003c");

  await fs.mkdir(path.dirname(jsonOutPath), { recursive: true });
  await fs.writeFile(jsonOutPath, prettyJson, "utf8");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  let html = await fs.readFile(templatePath, "utf8");

  if (html.includes(CSS_PLACEHOLDER)) {
    const cssPath = templatePath.replace(/\.html$/, ".css");
    const css = await fs.readFile(cssPath, "utf8");
    html = html.replace(CSS_PLACEHOLDER, () => css);
  }

  if (!html.includes(PLACEHOLDER)) {
    throw new Error(`Template placeholder ${PLACEHOLDER} not found in ${templatePath}.`);
  }

  html = html.replace(PLACEHOLDER, () => embeddedJson);
  await fs.writeFile(outputPath, html, "utf8");

  if (args.open) {
    await openInDefaultBrowser(outputPath);
  }

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        json: jsonOutPath,
        html: outputPath,
        opened: args.open
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
