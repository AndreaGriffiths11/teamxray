# Troubleshooting

## "No AI provider available"

The fallback chain couldn't find any configured provider. Your options:

1. Install and authenticate the Copilot CLI:
   ```bash
   curl -fsSL https://gh.io/copilot-install | bash
   copilot auth login
   ```
2. Set an API key: Command Palette → `Team X-Ray: Set API Key`
3. Use local-only mode — you'll get git stats without AI analysis

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

Restart VS Code after installing.

## Analysis Takes Too Long

Large repos (300K+ commits) take time even with the worker thread. The worker prevents VS Code from freezing, but parsing hundreds of thousands of commits is inherently slow.

What to expect:
- Repos under 10K commits: seconds
- 10K–100K commits: under a minute
- 100K+ commits: a few minutes

## Webpack/ESM Errors During Development

If you're contributing and see module resolution errors with the Copilot SDK, check that dynamic imports use the webpack ignore directive:

```typescript
const module = await import(/* webpackIgnore: true */ '@anthropic-ai/sdk');
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
