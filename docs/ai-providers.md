# AI Providers

Team X-Ray analyzes local git data and then chooses the AI path that the current implementation supports. The main flow is Copilot SDK first, GitHub Models fallback second, with a reduced local fallback only if AI output cannot be produced.

| Mode | Setting value | What it does | Requirements |
|------|---------------|--------------|--------------|
| Copilot SDK | `copilot` | Default analysis path with custom tools over local repo data | Copilot CLI installed + authenticated; set `teamxray.cliPath` if needed |
| BYOK via Copilot SDK | `byok-openai`, `byok-anthropic`, `byok-azure` | Applies a provider override to the Copilot SDK session | Copilot CLI, `Team X-Ray: Set BYOK API Key (Secure)`, `teamxray.byokBaseUrl`, optional `teamxray.byokModel` |
| GitHub Models fallback | `github-models` | Uses your GitHub token when Copilot is unavailable or analysis falls back | `Team X-Ray: Set GitHub Token` |
| Reduced local fallback | — | Builds a basic git-derived analysis if AI output fails | No extra setup |

## Copilot SDK

This is the primary path. Team X-Ray dynamically loads `@github/copilot-sdk`, creates a `CopilotClient`, registers custom tools with `defineTool`, and sends repository data into a single analysis session.

**ESM bundling note:** the SDK is ESM-only, so the dynamic import must target `@github/copilot-sdk` directly:

```typescript
const sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
```

If the CLI is installed outside your PATH, point the extension at it with `teamxray.cliPath`.

## BYOK provider overrides

BYOK settings are available, but in the current implementation they are applied through the Copilot SDK session rather than as a standalone non-Copilot path.

Supported values:
- `byok-openai`
- `byok-anthropic`
- `byok-azure`

Store the secret with:

```
Command Palette → Team X-Ray: Set BYOK API Key (Secure)
```

Also set:
- `teamxray.byokBaseUrl` (required)
- `teamxray.byokModel` (optional)

## GitHub Models fallback

If the Copilot SDK is unavailable, Team X-Ray falls back to GitHub Models using your GitHub token.

Store the token with:

```
Command Palette → Team X-Ray: Set GitHub Token
```

The current implementation calls `https://models.github.ai/inference/chat/completions`.

## Reduced local fallback

Team X-Ray does not currently expose a normal selectable "local-only" tier for the main analysis flow. Instead, it can assemble a reduced result from local git history when AI analysis cannot complete or the AI response cannot be parsed cleanly.
