# AI Providers

Team X-Ray analyzes local git data and then chooses the AI path that the current implementation supports. The main flow is Copilot SDK first, GitHub Models fallback second, with a reduced local fallback only if AI output cannot be produced.

| Mode | Setting value | What it does | Requirements |
|------|---------------|--------------|--------------|
| Copilot SDK | `copilot` | Default analysis path with custom tools over local repo data | Copilot CLI installed + authenticated; set `teamxray.cliPath` if needed |
| BYOK via Copilot SDK | `byok-openai`, `byok-anthropic`, `byok-azure` | Applies a provider override to the Copilot SDK session | Copilot CLI, `Team X-Ray: Set BYOK API Key (Secure)`, `teamxray.byokBaseUrl`, `teamxray.byokModel` |
| GitHub Models | `github-models` | Uses your GitHub token directly when selected, or as the fallback when Copilot analysis fails | `Team X-Ray: Set GitHub Token` |
| Reduced local fallback | — | Builds a basic git-derived analysis if AI output fails | No extra setup |

## Copilot SDK

This is the primary path. Team X-Ray dynamically loads `@github/copilot-sdk`, creates a `CopilotClient`, registers custom tools with `defineTool`, and sends repository data into a single analysis session.

**ESM bundling note:** the SDK is ESM-only, so the dynamic import must target `@github/copilot-sdk` directly:

```typescript
const sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
```

If the CLI is installed outside your PATH, point the extension at it with `teamxray.cliPath`.

## BYOK provider overrides

BYOK (Bring Your Own Key) lets you point the Copilot SDK session at a different model provider using your own API key. Use it when:

- Your org blocks Copilot but permits direct provider access
- You want a specific frontier model (e.g. a newer Claude release)
- You route AI traffic through an internal proxy or gateway
- You're testing model-to-model quality on the same repo

### Important: Copilot CLI is still required

BYOK is wired through the Copilot SDK session, not as a standalone provider path. The Copilot CLI must be installed and authenticated even when `teamxray.aiProvider` is set to a `byok-*` value. Your API key, baseUrl, and `teamxray.byokModel` override the model the SDK talks to; the session orchestration is still Copilot's.

If this changes in a future version, this note will be removed.

### Supported providers

| `teamxray.aiProvider` | Provider | Typical `byokBaseUrl` |
|---|---|---|
| `byok-openai` | OpenAI | `https://api.openai.com/v1` |
| `byok-anthropic` | Anthropic | `https://api.anthropic.com/v1` |
| `byok-azure` | Azure OpenAI | `https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT` |

Azure URLs include the resource name and deployment name. Get them from the Azure Portal under your OpenAI resource → Deployments.

### End-to-end example (Anthropic)

1. Install and authenticate the Copilot CLI (see Option 1 above).
2. Command Palette: `Team X-Ray: Set BYOK API Key (Secure)`. Paste your `sk-ant-...` key.
3. Open VS Code settings (JSON) and add:
   ```json
   "teamxray.aiProvider": "byok-anthropic",
   "teamxray.byokBaseUrl": "https://api.anthropic.com/v1",
   "teamxray.byokModel": "claude-sonnet-4-5-20250929"
   ```
4. Run `Team X-Ray: Analyze Repository Expertise`.

### Settings reference

| Setting | Required | Notes |
|---|---|---|
| `teamxray.aiProvider` | yes | Set to `byok-openai`, `byok-anthropic`, or `byok-azure` |
| API key (SecretStorage) | yes | Set via `Team X-Ray: Set BYOK API Key (Secure)`, not in JSON settings |
| `teamxray.byokBaseUrl` | yes | Full endpoint URL. See table above |
| `teamxray.byokModel` | yes | Model identifier. Examples: `gpt-4o`, `claude-sonnet-4-5-20250929`, your Azure deployment name |

### Migrating from `teamxray.byokApiKey`

The `teamxray.byokApiKey` setting is deprecated because settings JSON is plaintext. If you have a value there from an older version:

1. Run `Team X-Ray: Set BYOK API Key (Secure)` and paste the same key. It will be stored in VS Code's encrypted SecretStorage.
2. Remove `teamxray.byokApiKey` from your settings JSON.

The extension reads SecretStorage first and only falls back to the plaintext setting for migration.

## GitHub Models

Set `teamxray.aiProvider` to `github-models` to use the GitHub Models API directly. With `copilot` or a `byok-*` value, GitHub Models remains the fallback when the Copilot SDK cannot complete analysis.

Store the token with:

```
Command Palette → Team X-Ray: Set GitHub Token
```

The current implementation calls `https://models.github.ai/inference/chat/completions`. It defaults to `openai/gpt-4.1`, which you can override with `teamxray.githubModelsModel`. Use a model ID from the [GitHub Models catalog](https://github.com/marketplace/models).

Copilot model retirements and GitHub Models catalog availability are separate. Check the catalog before changing this setting rather than assuming a Copilot retirement removes the direct GitHub Models ID.

## Copilot model selection

By default, Team X-Ray lets the Copilot CLI choose its default model. Set `teamxray.copilotModel` only when you need to pin a supported Copilot model for a specific environment. Leave it empty to avoid coupling normal analysis to a retired model.

## Reduced local fallback

Team X-Ray does not currently expose a normal selectable "local-only" tier for the main analysis flow. Instead, it can assemble a reduced result from local git history when AI analysis cannot complete or the AI response cannot be parsed cleanly.
