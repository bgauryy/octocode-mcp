# Deferred autoresearch ideas

- Split the remaining admin command registry (`commands.ts`) into lightweight command metadata plus per-command lazy handler modules, so `install --help` and other non-agent command help paths can avoid loading the ~280KB commands chunk.
- Investigate whether `help.ts` can emit precomputed static strings with fewer runtime formatting calls without regressing wall-clock time or changing output.
