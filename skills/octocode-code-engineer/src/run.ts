#!/usr/bin/env node
/**
 * Bootstrap entry point for the octocode-code-engineer skill.
 * This skill is shipped prebuilt; runtime should not mutate installs.
 * It simply forwards to the scanner entrypoint.
 */
// Load and run the main scanner.
const { main } = await import('./pipeline/main.js');
await main();

export {};
