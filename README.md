# Team X-Ray

> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

Transform your repository into a team expertise map. Discover who knows what, reveal hidden collaboration patterns, and get AI-powered management insights — all from your git history.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/AndreaGriffiths.teamxray?color=blue&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)

## Features

- **🔍 File Expert Discovery** — Right-click any file to find who knows it best
- **🧠 Team Expertise Analysis** — AI-powered profiles with communication styles, specializations, and collaboration patterns
- **📊 Management Insights** — Actionable recommendations: bus factor risks, growth opportunities, efficiency gaps
- **🤖 GitHub Copilot SDK Integration** — Uses the Copilot SDK with custom tools for deep, context-aware analysis
- **📄 Dark-themed Reports** — Exportable HTML reports with SVG charts and an X-Ray visual identity
- **⚡ Smart Fallback Chain** — Copilot SDK → BYOK (OpenAI/Anthropic/Azure) → GitHub Models API → Local-only analysis

## How It Works

Team X-Ray reads your git history — commits, contributors, file ownership — and feeds it to an AI agent through custom tools. The agent calls back into your repo data to build expertise profiles, identify risks, and generate management-ready insights.

```
Git History → Data Gathering → AI Agent (Copilot SDK) → Expert Profiles + Insights
                                    ↕
                              5 Custom Tools
                         (contributors, commits,
                          file experts, stats,
                          collaboration patterns)
```

### AI Provider Fallback

| Priority | Provider | Requirements |
|----------|----------|-------------|
| 1 | **GitHub Copilot SDK** | Copilot CLI installed + authenticated |
| 2 | **BYOK** | Your own API key (OpenAI, Anthropic, or Azure) |
| 3 | **GitHub Models API** | GitHub token with models access |
| 4 | **Local-only** | No AI — git stats only |

## Installation

**From Marketplace:**

```
ext install AndreaGriffiths.teamxray
```

Or [install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)

## Usage

| Command | How |
|---------|-----|
| **Analyze Repository** | Command Palette → `Team X-Ray: Analyze Repository Expertise` |
| **Find File Expert** | Right-click a file → `Team X-Ray: Find Expert for This File` |
| **Team Overview** | Command Palette → `Team X-Ray: Show Team Expertise Overview` |
| **Set API Key** | Command Palette → `Team X-Ray: Set GitHub Token` |
| **Export Report** | Click export button in the analysis webview |

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `teamxray.aiProvider` | AI provider: `copilot`, `openai`, `anthropic`, `azure`, `github-models` | `copilot` |
| `teamxray.byokModel` | Model override for BYOK providers | — |
| `teamxray.byokBaseUrl` | Custom API endpoint for BYOK | — |

### Copilot SDK Setup

For the best experience, install and authenticate the [Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line):

```bash
# Install
npm install -g @githubnext/github-copilot-cli

# Authenticate
copilot auth login
```

Team X-Ray will automatically detect and use the Copilot SDK when available.

### BYOK (Bring Your Own Key)

Run `Team X-Ray: Set API Key` from the Command Palette. Keys are stored securely in VS Code's SecretStorage.

## Architecture

```
src/
├── extension.ts                 # Entry point, command registration
├── core/
│   ├── copilot-service.ts       # Copilot SDK integration (5 custom tools)
│   ├── expertise-analyzer.ts    # Analysis orchestrator + fallback chain
│   ├── expertise-webview.ts     # VS Code webview UI
│   ├── report-generator.ts      # Standalone HTML report export
│   └── git-data-service.ts      # Git history data gathering
├── types/
│   └── expert.ts                # TypeScript interfaces
└── utils/
    ├── error-handler.ts         # Error handling + telemetry
    ├── resource-manager.ts      # Disposable resource management
    └── validation.ts            # Input validation
```

### Custom Tools (Copilot SDK)

The extension registers 5 tools that the Copilot agent calls during analysis:

| Tool | Description |
|------|-------------|
| `get_contributors` | Contributor profiles with commit counts and activity dates |
| `get_recent_commits` | Recent commit history with authors and messages |
| `get_file_experts` | Per-file ownership and expertise breakdown |
| `get_repo_stats` | Repository-level statistics (size, languages, age) |
| `get_collaboration_patterns` | Cross-contributor collaboration and review patterns |

## Development

```bash
git clone https://github.com/AndreaGriffiths11/teamxray.git
cd teamxray
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

**Requirements:** Node.js 20+, VS Code 1.100.0+

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)
- [GitHub Repository](https://github.com/AndreaGriffiths11/teamxray)
- [Report Issues](https://github.com/AndreaGriffiths11/teamxray/issues)

---

**Stop being a stranger on your own team.** 🔬
