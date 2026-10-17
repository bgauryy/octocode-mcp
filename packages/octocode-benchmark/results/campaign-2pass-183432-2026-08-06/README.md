# 3-arm campaign, 2 passes — Octocode vs gh+RTK vs gh+Headroom (25×2, 2026-08-06)

Setup identical both passes: 6 isolated runners (claude-sonnet-4-6) per pass, arm A = `npx octocode@18.1.1`, B = gh 2.96.0 + rtk 0.44.2, C = gh + Headroom 0.34.0; 5 blind gpt-5.5 judges/pass with randomized X/Y/Z.

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
