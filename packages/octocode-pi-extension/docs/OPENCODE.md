# OpenCode models

Run Pi and this extension on [OpenCode Console](https://opencode.ai/v2/docs/console/) models. Pi ships both OpenCode providers, so you only add a key; the extension needs no OpenCode setting. Overview: [README](../README.md).

| Pi provider | OpenCode plan | Model example |
|---|---|---|
| `opencode` | Pay-as-you-go (workspace with credits) | `opencode/claude-sonnet-4-6` |
| `opencode-go` | Go subscription | `opencode-go/kimi-k3` |

## 1. Create a key

In the [Console](https://opencode.ai/console):

- **Personal API key** (calls models as you): account menu → **Account** → **Personal API keys** → **Add API key**, choose the workspace, name it, **Create**.
- **Service account key** (shared machines, CI; owners and admins): see [service accounts](https://opencode.ai/v2/docs/console/api#service-accounts).

Copy the key (`oc_sk_...`); it is shown once. Pick a workspace with credits for `opencode`, or one subscribed to Go for `opencode-go`.

## 2. Add the key to Pi

Use one of these; Pi reads them in this order, first match wins:

| Where | How | Stored in |
|---|---|---|
| Command line, one run | `pi --api-key oc_sk_... --model opencode/<id>` | Nowhere |
| `/login` (recommended) | In Pi: `/login opencode` (or `/login opencode-go`), paste the key | `~/.pi/agent/auth.json` |
| `models.json` | `~/.pi/agent/models.json`, below | That file |
| Environment | `export OPENCODE_API_KEY=oc_sk_...` before starting Pi | Your shell |

```json
{
  "providers": {
    "opencode": { "apiKey": "$OPENCODE_API_KEY" },
    "opencode-go": { "apiKey": "$OPENCODE_API_KEY" }
  }
}
```

`apiKey` takes a literal key, `$VAR` or a `!command` (for example a password manager). Set only `apiKey`: Pi's providers already route each model to its API (Chat Completions, Responses, Anthropic Messages or Gemini) and send the `x-opencode-session` header Go requires. A provider-level `baseUrl` would replace that per-model routing with one URL.

`/logout` removes a key stored by `/login`.

## 3. Choose a model

| Goal | How |
|---|---|
| Pick interactively | `/model`, type `opencode` |
| Make it the default | `Ctrl+S` in `/model`, or `defaultProvider` and `defaultModel` in `~/.pi/agent/settings.json` |
| One run | `pi --model opencode/<id>`, with an optional thinking level: `opencode/<id>:high` |
| List model IDs | `pi --list-models opencode` |
| Cycle with `Ctrl+P` through OpenCode only | `/scoped-models`, or `"enabledModels": ["opencode/*"]` in settings |
| A new model is missing | `pi update --models` |

Check the setup:

```bash
pi --list-models opencode
pi -p --model opencode/claude-sonnet-4-6 "Reply OK"
```

## With this extension

Every feature works on any Pi model, OpenCode included. Subagents read the same `auth.json`, so one `/login` covers them.

- A profile's `model` can name an OpenCode model: `model: opencode/claude-sonnet-4-6` ([profile format](CONFIGURATION.md#subagent-profiles)).
- With `small` or `medium` (the bundled profiles' default), the purpose resolves among the models you can use, OpenCode ones included ([Model routing](FEATURES.md#model-routing)).
- `/octocode models` shows each usable model's price, window and abilities, and which model each purpose and profile runs on.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/model` shows no `opencode` models | No key found: repeat step 2 |
| `403 FreeTierError` | OpenCode serves its free models (`*-free`, `big-pickle`) only from the OpenCode app; pick a paid model |
| `401` or `Invalid credential` | Wrong or revoked key, or a key from another workspace |
| `400 MissingSessionID` | A client other than Pi's `opencode-go` provider called Go without `x-opencode-session` |
| Requests fail for lack of credit | Add credits to the key's workspace, or use `opencode-go` with a Go subscription |

## Sources

- OpenCode: [Inference API](https://opencode.ai/v2/docs/console/api/inference/), [Harnesses: Pi](https://opencode.ai/v2/docs/console/harnesses/pi/), [API keys](https://opencode.ai/v2/docs/console/api#personal-api-keys).
- Pi: `/login` and credential order in Pi's `docs/models.md`; `OPENCODE_API_KEY` in its `docs/providers.md`.
