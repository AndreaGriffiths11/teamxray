# Setup

## Requirements

- VS Code 1.100.0+
- Node.js 20+
- A git repository with commit history

## Install

From the VS Code Marketplace:

```
ext install AndreaGriffiths.teamxray
```

Or search "Team X-Ray" in the Extensions sidebar.

## AI Provider Setup

Team X-Ray gathers local git data first, then runs AI analysis through the Copilot SDK when available. GitHub Models is the non-Copilot fallback, and a reduced local analysis is used only when AI output cannot be produced.

### Option 1: Copilot SDK (recommended)

Install the [Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line) and authenticate:

```bash
curl -fsSL https://gh.io/copilot-install | bash
copilot auth login
```

Team X-Ray auto-detects the CLI. If it is not on your PATH, set `teamxray.cliPath` in VS Code settings.

Leave `teamxray.aiProvider` set to `copilot` (the default).

### Option 2: BYOK through the Copilot SDK

Open the Command Palette and run:

```
Team X-Ray: Set BYOK API Key (Secure)
```

Enter your API key. It's stored in VS Code's SecretStorage (encrypted, per-machine).

Then configure:
- `teamxray.aiProvider` = `byok-openai`, `byok-anthropic`, or `byok-azure`
- `teamxray.byokBaseUrl` = your provider endpoint (required in the current implementation)
- `teamxray.byokModel` = optional model override

BYOK is currently wired through the Copilot SDK session, so the Copilot CLI still needs to be installed and authenticated.

### Option 3: GitHub Models fallback

Open the Command Palette and run:

```
Team X-Ray: Set GitHub Token
```

Store a GitHub token with access to GitHub Models. If the Copilot SDK is unavailable, Team X-Ray uses that token to call GitHub Models.

Set `teamxray.aiProvider` to `github-models` if you want settings to reflect the non-BYOK path.

### Reduced local fallback

There is no separate "local-only" provider to configure in the normal success path. If AI analysis cannot run or the response cannot be parsed, Team X-Ray can still assemble a reduced analysis from local git history.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `teamxray.aiProvider` | Provider setting: `copilot`, `byok-openai`, `byok-anthropic`, `byok-azure`, `github-models` | `copilot` |
| `teamxray.cliPath` | Path to the Copilot CLI executable when it is not available on your PATH | auto-detect |
| `teamxray.byokModel` | Model override for BYOK providers (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`) | — |
| `teamxray.byokBaseUrl` | Custom API endpoint for BYOK (useful for proxies or Azure deployments) | — |
