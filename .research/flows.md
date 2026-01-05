# Flows

## Background Task Management
- **Mechanism**: Polling Loop (Async/Await)
- **Implementation**:
  - Checks task status (`completed`, `error`, `cancelled`, `input_required`).
  - If active, waits for `pollInterval` using `setTimeout`.
  - Loops until terminal state.
- **Interval Configuration**:
  - Priority: `task.pollInterval` > `options.defaultTaskPollInterval` > 1000ms.
- **Concurrency**:
  - Non-blocking async loop.
  - Respects `AbortSignal` for cancellation.

## Key Code Snippet (Reconstructed)
```javascript
const pollInterval = (task.pollInterval ?? options.defaultTaskPollInterval) ?? 1000;
await new Promise((resolve) => setTimeout(resolve, pollInterval));
options.signal?.throwIfAborted();
```
