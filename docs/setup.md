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

Team X-Ray uses a fallback chain — configure whichever tier you prefer and it handles the rest.

### Option 1: Copilot SDK (recommended)

Install the [Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line) and authenticate:

```bash
curl -fsSL https://gh.io/copilot-install | bash
copilot auth login
```

Team X-Ray auto-detects the SDK. No configuration needed.

### Option 2: BYOK (Bring Your Own Key)

Open the Command Palette and run:

```
Team X-Ray: Set API Key
```

Enter your API key. It's stored in VS Code's SecretStorage (encrypted, per-machine).

Supported providers:
- **OpenAI** — GPT-4o, GPT-4, etc.
- **Anthropic** — Claude 3.5, Claude 3, etc.
- **Azure OpenAI** — Your Azure-hosted models

Set `teamxray.aiProvider` to `openai`, `anthropic`, or `azure` in VS Code settings.

### Option 3: GitHub Models API

Requires a GitHub token with `models: read` permission. Set `teamxray.aiProvider` to `github-models`.

### Option 4: Local-only

No AI, no setup. You get commit counts, file ownership percentages, activity dates, and contributor lists — but no prose analysis or management insights.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `teamxray.aiProvider` | Provider to use: `copilot`, `openai`, `anthropic`, `azure`, `github-models` | `copilot` |
| `teamxray.byokModel` | Model override for BYOK providers (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`) | — |
| `teamxray.byokBaseUrl` | Custom API endpoint for BYOK (useful for proxies or Azure deployments) | — |
