# Troubleshooting

## "No AI provider available"

Team X-Ray could not start the Copilot SDK and did not have a GitHub token available for the GitHub Models fallback. Your options:

1. Install and authenticate the Copilot CLI:
   ```bash
   curl -fsSL https://gh.io/copilot-install | bash
   copilot auth login
   ```
2. If the CLI is installed outside your PATH, set `teamxray.cliPath` in VS Code settings.
3. Run `Team X-Ray: Set GitHub Token` from the Command Palette.

## Copilot SDK Not Detected

The extension can't find the Copilot CLI. Make sure it's installed and on your PATH:

```bash
# Install
curl -fsSL https://gh.io/copilot-install | bash

# Authenticate
copilot auth login

# Verify
copilot --version
```

If `copilot --version` works in a different shell but not from VS Code, set `teamxray.cliPath` to the full executable path and reload VS Code.

## BYOK provider selected but not working

In the current implementation, BYOK settings are applied through the Copilot SDK session. That means you still need a working Copilot CLI even when `teamxray.aiProvider` is set to `byok-openai`, `byok-anthropic`, or `byok-azure`.

Also verify:
- You ran `Team X-Ray: Set BYOK API Key (Secure)`
- `teamxray.byokBaseUrl` is set
- `teamxray.byokModel` is set and valid for the selected provider (required for BYOK sessions)

## BYOK returns 401 Unauthorized

The API key isn't being sent or isn't valid for the provider you selected.

- Re-run `Team X-Ray: Set BYOK API Key (Secure)` and paste the key again. The secret is stored per-machine; it won't roam with your settings.
- Confirm the key matches the provider: an `sk-ant-...` key with `teamxray.aiProvider` set to `byok-openai` will always 401.
- If you're migrating from the deprecated `teamxray.byokApiKey` settings entry, remove it from `settings.json` after setting the secure key. Mixed state can confuse the fallback logic.

## BYOK returns 404 Not Found

Almost always a `byokBaseUrl` mistake.

- **OpenAI:** the URL needs the `/v1` suffix: `https://api.openai.com/v1`, not `https://api.openai.com`.
- **Anthropic:** same pattern: `https://api.anthropic.com/v1`.
- **Azure OpenAI:** the URL must include both the resource name and the deployment name. Get the full URL from the Azure Portal: OpenAI resource → Deployments → your deployment → "Target URI". It looks like `https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT`.

If you're behind a corporate proxy or gateway, confirm the gateway path matches what the provider's SDK expects, not just the hostname.

## GitHub Models reports a model error

The selected model ID is unavailable to your token or no longer appears in the catalog.

1. Open the [GitHub Models catalog](https://github.com/marketplace/models) and choose an available model ID.
2. Set `teamxray.githubModelsModel` to that ID.
3. Run the analysis again.

`teamxray.aiProvider = github-models` runs the direct API path. With `copilot` or a `byok-*` provider, GitHub Models is the fallback path.

## Azure BYOK: "deployment not found"

Azure routes by **deployment name**, not model name. If you set `teamxray.byokModel` to `gpt-4o`, Azure will reject it unless your deployment happens to be named `gpt-4o`.

Set `teamxray.byokModel` to your deployment name from the Azure Portal Deployments list.

## Analysis Takes Too Long

Large repos (300K+ commits) take time even with the worker thread. The worker prevents VS Code from freezing, but parsing hundreds of thousands of commits is inherently slow.

What to expect:
- Repos under 10K commits: seconds
- 10K–100K commits: under a minute
- 100K+ commits: a few minutes

## Webpack/ESM Errors During Development

If you're contributing and see module resolution errors with the Copilot SDK, check that dynamic imports use the webpack ignore directive:

```typescript
const sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
```

Without this, webpack tries to bundle the ESM module at build time and fails.

## Extension Not Activating

Check your VS Code version:

```
Help → About → Version
```

Team X-Ray requires VS Code **1.100.0** or later. Update if you're on an older version.

## Bot Detection False Positives

`detectBot()` matches contributor names and emails against known patterns:
- Names containing "bot", "dependabot", "renovate", "github-actions"
- Email domains associated with automated services

If a human contributor triggers bot detection, it's likely because their git config name or email matches one of these patterns. Update their git identity:

```bash
git config user.name "Actual Name"
git config user.email "real@email.com"
```

## Export Looks Different from Webview

By design. The webview adapts to your VS Code theme (light or dark). The exported HTML always uses the standalone X-Ray dark theme (`#0a0a0f` background, `#06b6d4` cyan accent, scan-line effects) for a consistent look when sharing.

## "Command Not Found" Errors

Team X-Ray commands won't appear in the Command Palette until the extension activates. Try:

1. Open a folder that contains a git repository
2. Reload VS Code: Command Palette → `Developer: Reload Window`
3. Check the Extensions sidebar — make sure Team X-Ray is enabled
