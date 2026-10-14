#!/usr/bin/env node
import { fail } from './lib/fail.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: provider-usage.mjs [--check]\nReports ScrapingAnt plan and remaining credits from /v2/usage.\n--check: only report whether SCRAPING_ANT is set ({"key":"set"}), no network call.\nExit 1 when SCRAPING_ANT is missing or the usage call fails; exit 2 on an unknown argument. Never prints the key.');
  process.exit(0);
}
const unknown = args.find((arg) => arg !== '--check');
if (unknown) fail('invalidArguments', `unknown argument ${unknown}`, 2);
const apiKey = process.env.SCRAPING_ANT?.trim();
if (!apiKey) fail('missingKey', 'SCRAPING_ANT missing', 1, { provider: 'scrapingant', apiKeyEnv: 'SCRAPING_ANT', key: 'missing' });
if (args.includes('--check')) {
  console.log(JSON.stringify({ ok: true, provider: 'scrapingant', apiKeyEnv: 'SCRAPING_ANT', key: 'set' }, null, 2));
  process.exit(0);
}

const url = new URL('https://api.scrapingant.com/v2/usage');
url.searchParams.set('x-api-key', apiKey);
const res = await fetch(url, { headers: { 'user-agent': 'octocode-scraping-usage/0.1' } });
const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = { detail: text.slice(0, 500) }; }
const safe = {
  ok: res.ok,
  provider: 'scrapingant',
  status: res.status,
  planName: data.plan_name ?? data.planName ?? null,
  startDate: data.start_date ?? null,
  endDate: data.end_date ?? null,
  planTotalCredits: data.plan_total_credits ?? null,
  creditsUsed: data.credits_used ?? data.used_credits ?? null,
  creditsRemaining: data.credits_remaining ?? data.remaining_credits ?? null,
  detail: data.detail ?? null
};
console.log(JSON.stringify(safe, null, 2));
process.exit(res.ok ? 0 : 1);
