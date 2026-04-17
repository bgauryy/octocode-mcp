# Deferred autoresearch ideas

- Split the remaining admin command registry (`commands.ts`) into lightweight command metadata plus per-command lazy handler modules, so `install --help` and other non-agent command help paths can avoid loading the ~280KB commands chunk.
