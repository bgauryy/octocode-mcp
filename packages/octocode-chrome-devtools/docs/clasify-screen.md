# Locate answers in unread captures

Load when a saved artifact is unread and a literal search or small read does not decide; admission and result rules belong to the `octocode-research` clasify gate. Why: Locate deciding evidence without loading an entire capture.

1. Capture once. `SNAPSHOT_STDOUT=summary` keeps snapshot refs on disk; if the default stdout refs already answer, stop.
2. Narrow with metadata, URLs, and literal search. For HAR, huge logs, or minified JSON, first extract relevant records to readable text with `har-pager`/`measure-query`; keep the original for provenance.
3. Which passages to read: `localSearch` over the run directory with a literal and `clasifyContext: {classifiers: [...]}` (one self-contained question each) when a classification key is configured; read the returned passages.
4. A typed judgment about one capture file: save `.octocode/clasify-request.json` with a `source` reference (native captures the whole selection and returns no body):

```json
{"queries": [{
  "source": {"tool": "localFetch", "query": {
    "path": "/abs/.octocode/octocode-chrome-devtools/tmp/<run>/page-snapshot.json", "fullContent": true
  }},
  "questions": {
    "search_ref": {"type": "noul", "instructions": "Does the snapshot contain an accessibility ref for a site search control?"}
  }
}]}
```

5. Run `npx -y octocode clasify --input .octocode/clasify-request.json` (public `clasify` needs beta and a classification key). MCP `clasify` takes the same JSON. A capture over the state limit fails its row: select `ranges`.
6. Before acting, run the row's `hints.read` (the exact text judged) or read the deciding lines with `localFetch`. For snapshot JSON, read the whole ref object. A low answer is not site-wide absence.

Hints point into the saved capture, not the live DOM: confirm a ref still exists in the current tab before acting.

Next: act on a confirmed ref with `dom-operations-check` (`cdp-checks.md`).
