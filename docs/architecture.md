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
| `get_file_experts` | Contributors who touched a file, ranked by commit count |
| `get_repo_stats` | Repository-level stats — size, languages, age, total commits |
| `get_collaboration_patterns` | Cross-contributor collaboration and review patterns |

Each tool is defined with `defineTool` and validated with Zod schemas. The agent decides which tools to call and in what order based on the analysis prompt.

## Fallback Chain

When you run an analysis, Team X-Ray uses this order:

```
Copilot SDK session (default or BYOK override) → GitHub Models API → Reduced local fallback
```

| Step | Condition to activate | What happens on failure |
|------|----------------------|------------------------|
| Copilot SDK session | CLI installed + authenticated; `teamxray.aiProvider` selects default Copilot or BYOK override | Falls through to GitHub Models |
| GitHub Models | GitHub token with `models: read` | Falls through to reduced local fallback |
| Reduced local fallback | Always available | Returns git-derived analysis when AI output cannot be produced |

BYOK is a Copilot session configuration, not a separate fallback tier. If the configured Copilot/BYOK session fails, Team X-Ray falls through to GitHub Models, then to the reduced local fallback.

## Agent & Bot Detection

`classifyContributor()` (in `utils/bot-detection.ts`) classifies every contributor into one of four kinds using two signal layers:

1. **Author identity** — name/email matched against a declarative table of known AI coding agents (Claude Code, Copilot, Cursor, Devin, Codex, Jules, Amazon Q, OpenCode, OpenHands, Aider) and automation bots (Dependabot, Renovate, GitHub Actions), plus generic `[bot]` patterns.
2. **Commit trailers** — `Co-authored-by` lines, checkpoint/attribution trailers (`Entire-Checkpoint` / `Entire-Attribution`), and the aider subject marker. Git extracts these in the same `git log` call via `%(trailers:key=...)`, so most agent-assisted work committed under a *human's* identity is still detected.

| Kind | Meaning | Rendering |
|------|---------|-----------|
| `human` | No bot/agent signals | Normal |
| `ai-agent` | AI coding agent committing under its own identity | 🤖 badge, gray bars, excluded from human insights |
| `automation-bot` | Dependency/CI automation | 🤖 badge; aggregated to a one-line summary instead of occupying contributor slots in the AI prompt |
| `ai-assisted-human` | Human whose commits frequently carry agent co-author trailers | 🤝 badge; stays in all human-focused insights, with an AI-assist rate |

The analysis also rolls commit-level signals up into a repository **AI attribution summary** (share of AI-assisted commits, breakdown by agent) shown as a pill in the webview/report header and fed into the AI prompt.

Detection is user-extensible via two settings: `teamxray.additionalBotPatterns` (extra identities to treat as bots) and `teamxray.humanOverrides` (emails never classified as bots). The legacy boolean `detectBotContributor()` remains as a thin wrapper for backwards compatibility.

## Worker Thread

Large repos (300K+ commits) freeze VS Code if git operations run on the main thread. The worker thread solves this:

- `git-worker.ts` is a separate webpack entry point
- It runs in a Node.js `Worker` thread — no `vscode` module imported (workers can't access the VS Code API)
- `git-worker-client.ts` spawns the worker and handles message passing
- The main thread stays responsive while heavy git parsing runs in the background
