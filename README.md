# Team X-Ray

> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

Transform your repository into a team expertise map. Discover who knows what, reveal hidden collaboration patterns, and get AI-powered management insights — all from your git history.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/AndreaGriffiths.teamxray?color=blue&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)

## Features

- **🔍 File Expert Discovery** — Right-click any file to find who knows it best
- **🧠 Team Expertise Analysis** — AI-powered profiles with communication styles, specializations, and collaboration patterns
- **📊 Management Insights** — Actionable recommendations: bus factor risks, growth opportunities, efficiency gaps
- **🤖 GitHub Copilot SDK Integration** — Uses the Copilot SDK with custom tools for deep, context-aware analysis
- **⚙️ Flexible AI Provider Settings** — Default `copilot`, optional `byok-openai`, `byok-anthropic`, `byok-azure`, or `github-models`
- **🤖 Agent & Bot Detection** — Automatically identifies bot/agent contributors (Dependabot, Copilot, Renovate) with visual distinction
- **📄 Dark-themed Reports** — Exportable HTML reports with SVG charts and an X-Ray visual identity
- **🛟 Git-Backed Fallback Analysis** — If AI analysis is unavailable, Team X-Ray can still assemble a reduced view from local git history

## How It Works

Team X-Ray reads your local git history — commits, contributors, file ownership — and feeds that data into the GitHub Copilot SDK when available. If Copilot is unavailable, it falls back to GitHub Models with your GitHub token; if AI output still fails, it produces a reduced git-based analysis.

![Team X-Ray Architecture](docs/architecture.png)

### AI Provider Flow

| Flow | Mode | Requirements |
|------|------|--------------|
| 1 | **Copilot SDK (`copilot`)** | Copilot CLI installed + authenticated; set `teamxray.cliPath` if the CLI is not on your PATH |
| 2 | **BYOK via Copilot SDK** | `teamxray.aiProvider` = `byok-openai`, `byok-anthropic`, or `byok-azure`; run `Team X-Ray: Set BYOK API Key (Secure)`; set `teamxray.byokBaseUrl` |
| 3 | **GitHub Models fallback** | Run `Team X-Ray: Set GitHub Token` |
| 4 | **Reduced local fallback** | No extra setup; basic git-derived analysis only if AI output cannot be produced |

## Installation

```
ext install AndreaGriffiths.teamxray
```

Or [install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray).

**Requirements:** VS Code 1.100.0+, Node.js 20+

## Usage

| Command / Action | How |
|------------------|-----|
| `Team X-Ray: Analyze Repository Expertise` | Command Palette |
| `Team X-Ray: Show Team Expertise Overview` | Command Palette |
| `Team X-Ray: Analyze This File` | Command Palette |
| `Team X-Ray: Find Expert for This File` | Right-click a file or open editor context menu |
| `Team X-Ray: Set GitHub Token` | Command Palette |
| `Team X-Ray: Set BYOK API Key (Secure)` | Command Palette |
| Export report | Click the export button in the analysis webview |

## Documentation

| Doc | Description |
|-----|-------------|
| [Setup](docs/setup.md) | Installation & AI provider configuration |
| [Architecture](docs/architecture.md) | Components, tools, worker threads, bot detection |
| [AI Providers](docs/ai-providers.md) | Copilot SDK, BYOK provider overrides, GitHub Models, and reduced local fallback |
| [Reports](docs/reports.md) | Webview, HTML export, dark X-Ray theme |
| [Troubleshooting](docs/troubleshooting.md) | Common issues & fixes |

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)
- [GitHub Repository](https://github.com/AndreaGriffiths11/teamxray)
- [Report Issues](https://github.com/AndreaGriffiths11/teamxray/issues)

---

**Stop being a stranger on your own team.** 🔬
