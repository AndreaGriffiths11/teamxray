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

Use BYOK to route analysis through your own OpenAI, Anthropic, or Azure OpenAI key. The Copilot CLI is still required because BYOK runs inside the Copilot SDK session.

See [AI Providers → BYOK provider overrides](ai-providers.md#byok-provider-overrides) for the full setup, provider-specific `byokBaseUrl` values, and an end-to-end example.

### Option 3: GitHub Models

Open the Command Palette and run:

```
Team X-Ray: Set GitHub Token
```

Store a GitHub token with access to GitHub Models. If the Copilot SDK is unavailable, Team X-Ray uses that token to call GitHub Models.

Set `teamxray.aiProvider` to `github-models` to use this path directly. Set `teamxray.githubModelsModel` to a model ID from the GitHub Models catalog when you need to change models.

### Reduced local fallback

There is no separate "local-only" provider to configure in the normal success path. If AI analysis cannot run or the response cannot be parsed, Team X-Ray can still assemble a reduced analysis from local git history.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `teamxray.aiProvider` | Provider setting: `copilot`, `byok-openai`, `byok-anthropic`, `byok-azure`, `github-models` | `copilot` |
| `teamxray.cliPath` | Path to the Copilot CLI executable when it is not available on your PATH | auto-detect |
| `teamxray.copilotModel` | Optional Copilot model ID; leave empty to use the Copilot CLI default | — |
| `teamxray.githubModelsModel` | GitHub Models catalog ID for direct or fallback analysis | `openai/gpt-4.1` |
| `teamxray.byokModel` | Required model override for BYOK providers (e.g. `gpt-4o`, `claude-sonnet-4-5-20250929`) | — |
| `teamxray.byokBaseUrl` | Custom API endpoint for BYOK (useful for proxies or Azure deployments) | — |
