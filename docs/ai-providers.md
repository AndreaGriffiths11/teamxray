# AI Providers

Team X-Ray supports four AI provider tiers. Each one activates automatically based on what's available.

## Copilot SDK

The primary provider. Uses GitHub Copilot's SDK with 5 custom tools that give the agent structured access to your repo data.

How it works:
1. Team X-Ray imports `@anthropic-ai/sdk` dynamically via the Copilot SDK
2. Registers tools with `defineTool` — each tool has a Zod schema defining its inputs/outputs
3. The agent calls tools as needed during analysis, pulling contributor data, file experts, collaboration patterns
4. Results come back as structured analysis with management insights

**ESM bundling note:** The Copilot SDK uses ESM imports. To prevent webpack from bundling them (which breaks dynamic resolution), the import uses `/* webpackIgnore: true */`:

```typescript
const module = await import(/* webpackIgnore: true */ '@anthropic-ai/sdk');
```

## BYOK (Bring Your Own Key)

Use your own API key with OpenAI, Anthropic, or Azure OpenAI.

| Provider | Setting value | Models |
|----------|--------------|--------|
| OpenAI | `openai` | GPT-4o, GPT-4, GPT-3.5 Turbo |
| Anthropic | `anthropic` | Claude 3.5 Sonnet, Claude 3 Opus/Haiku |
| Azure OpenAI | `azure` | Your deployed models |

Keys are stored in VS Code's [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — encrypted per-machine, never written to settings files.

To set a key:

```
Command Palette → Team X-Ray: Set API Key
```

Override the model with `teamxray.byokModel`. Set a custom endpoint (proxy, Azure deployment) with `teamxray.byokBaseUrl`.

## GitHub Models API

Uses GitHub's hosted models API at `https://models.inference.ai.azure.com`.

Requirements:
- A GitHub token with `models: read` permission
- Set `teamxray.aiProvider` to `github-models`

## Local-Only Mode

No AI provider needed. You get:
- Commit counts per contributor
- File ownership percentages
- First and last activity dates
- Contributor list with bot detection

You don't get:
- Prose expertise profiles
- Communication style analysis
- Management insights (bus factor, growth opportunities, efficiency gaps)
- Collaboration pattern narratives

## Fallback Behavior

The fallback chain runs top-to-bottom. Each tier wraps its initialization in a try/catch:

1. **Copilot SDK** — Checks if the CLI is installed and authenticated. If the import fails or auth is missing, moves on.
2. **BYOK** — Checks SecretStorage for a key. If none found or the API returns an error, moves on.
3. **GitHub Models** — Checks for a valid token. If the endpoint rejects the request, moves on.
4. **Local-only** — Always succeeds. Returns raw git data without AI analysis.

The user sees a notification indicating which provider was used.
