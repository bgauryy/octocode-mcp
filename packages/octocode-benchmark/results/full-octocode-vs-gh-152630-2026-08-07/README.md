# Full campaign — Octocode (local build) vs plain `gh`

The pooled 5.16× is **not** the headline — it is outlier-sensitive (top question = 20.4% of the gh total; leave-one-out 4.23×). The **geometric mean (1.99×)** and **median (2.16×)** are the honest per-question figures. Octocode's edge shows most in **workflow** (4.37 vs 3.85): `gh` has no server-side region read, so whole-file `raw` fetches inflate its footprint where Octocode does a targeted region/symbol read.

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
