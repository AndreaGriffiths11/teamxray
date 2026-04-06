# Architecture

## High-Level Flow

```
Git History → Data Gathering → AI Analysis → Webview / Report
```

![Architecture Diagram](architecture.png)

Team X-Ray reads your repo's git history, structures the data through custom tools, passes it to an AI agent for analysis, and renders the results in a VS Code webview or standalone HTML export.

## Components

| File | Role |
|------|------|
| `extension.ts` | Entry point. Registers commands, initializes services, wires everything together. |
| `expertise-analyzer.ts` | Orchestrator. Runs the analysis pipeline and manages the AI provider fallback chain. |
| `copilot-service.ts` | Copilot SDK integration. Defines 5 custom tools with `defineTool` + Zod schemas. |
| `git-service.ts` | Git data gathering. Extracts commits, contributors, file ownership from repo history. |
| `git-worker.ts` | Worker thread entry point. Runs heavy git operations off the main thread. |
| `git-worker-client.ts` | Worker thread client. Spawns and communicates with the git worker. |
| `expertise-webview.ts` | VS Code webview panel + standalone HTML export generation. |
| `token-manager.ts` | SecretStorage wrapper. Manages API keys securely. |
| `expertise-tree-provider.ts` | TreeView data provider for the sidebar panel. |
| `report-generator.ts` | Structures analysis data into report format. |

## Custom Tools

The Copilot agent calls these 5 tools during analysis to pull data from your repo:

| Tool | What it returns |
|------|----------------|
| `get_contributors` | Contributor profiles — commit counts, first/last activity dates |
| `get_recent_commits` | Recent commit history with authors, messages, timestamps |
| `get_file_experts` | Per-file ownership breakdown (who wrote what percentage) |
| `get_repo_stats` | Repository-level stats — size, languages, age, total commits |
| `get_collaboration_patterns` | Cross-contributor collaboration and review patterns |

Each tool is defined with `defineTool` and validated with Zod schemas. The agent decides which tools to call and in what order based on the analysis prompt.

## Fallback Chain

When you run an analysis, Team X-Ray tries providers in order:

```
Copilot SDK → BYOK → GitHub Models API → Local-only
```

| Step | Condition to activate | What happens on failure |
|------|----------------------|------------------------|
| Copilot SDK | CLI installed + authenticated | Falls through to BYOK |
| BYOK | API key set via SecretStorage | Falls through to GitHub Models |
| GitHub Models | GitHub token with `models: read` | Falls through to local-only |
| Local-only | Always available | Returns git stats without AI prose |

Each tier catches its own errors. If Copilot SDK throws an auth error, BYOK gets a shot. If everything fails, you still get raw git statistics.

## Bot Detection

The `detectBot()` helper identifies automated contributors (Dependabot, Renovate, GitHub Actions bots, Copilot) by matching name and email patterns against known bot signatures.

Detected bots get:
- Gray expertise bars (instead of colored)
- A 🤖 badge next to their name
- Separation from human contributors in management insights

## Worker Thread

Large repos (300K+ commits) freeze VS Code if git operations run on the main thread. The worker thread solves this:

- `git-worker.ts` is a separate webpack entry point
- It runs in a Node.js `Worker` thread — no `vscode` module imported (workers can't access the VS Code API)
- `git-worker-client.ts` spawns the worker and handles message passing
- The main thread stays responsive while heavy git parsing runs in the background
