# AGENTS.md

## Purpose

VS Code extension that transforms git history into team expertise maps. Discover who knows what, reveal collaboration patterns, get AI-powered management insights.

## Tagline

**"Stop being a stranger on your own team."** 🔬

## Tech Stack

- **TypeScript** — Extension core
- **VS Code Extension API** — 1.100.0+
- **GitHub Copilot SDK** (`@github/copilot-sdk`) — Agentic analysis with custom tools
- **Node.js 20+** — Worker threads for git processing
- **Webpack** — Bundling
- **simple-git** — Git history parsing

## Architecture

```
VS Code Extension
    ↓
ExpertiseAnalyzer (gathers git history)
    ↓
CopilotService (Copilot SDK session with custom tools)
    ↓ (agent calls tools to request team data)
AI Analysis (team profiles, management insights)
    ↓
Webview (dark-themed reports, HTML export)
```

### Custom Copilot SDK Tools

Agent can request:
- Team member commit counts
- File ownership breakdown
- Collaboration patterns (co-author networks)
- Bus factor analysis (single points of failure)
- Recent activity trends

## AI Provider Modes

| Mode | Provider | Setup | Fallback |
|------|----------|-------|----------|
| 1 | **Copilot SDK (default)** | Copilot CLI installed + authenticated | N/A |
| 2 | **BYOK OpenAI** | Set API key via command | `teamxray.byokBaseUrl`, `teamxray.byokModel` |
| 3 | **BYOK Anthropic** | Set API key via command | `teamxray.byokBaseUrl`, `teamxray.byokModel` |
| 4 | **BYOK Azure** | Set API key + endpoint | `teamxray.byokBaseUrl`, `teamxray.byokModel` |
| 5 | **GitHub Models** | GitHub token (PAT) | Requires `teamxray.aiProvider = github-models` |
| 6 | **Local git-only** | No AI | Reduced analysis (no insights, just ownership) |

**Auto-fallback:** Copilot SDK → GitHub Models (if token set) → Local git-only

## Features

- **🔍 File Expert Discovery** — Right-click any file → find who knows it best
- **🧠 Team Expertise Analysis** — AI profiles: communication styles, specializations, collab patterns
- **📊 Management Insights** — Bus factor risks, growth opportunities, efficiency gaps
- **🤖 Bot/Agent Detection** — Auto-identifies Dependabot, Copilot, Renovate (visual distinction)
- **📄 Dark-themed Reports** — Exportable HTML with SVG charts, X-Ray branding
- **🛟 Git-backed Fallback** — Works without AI (reduced view from local git)

## Commands

| Command | Action |
|---------|--------|
| `Team X-Ray: Analyze Repository Expertise` | Full team analysis |
| `Team X-Ray: Show Team Expertise Overview` | Display cached analysis |
| `Team X-Ray: Analyze This File` | File-specific ownership |
| `Team X-Ray: Find Expert for This File` | Right-click context menu |
| `Team X-Ray: Set GitHub Token` | For GitHub Models fallback |
| `Team X-Ray: Set BYOK API Key (Secure)` | For BYOK providers |

## ⚠️ Runtime Guardrails — Read Before Touching These Areas

These constraints are **invisible from the code**. Violations compile cleanly and break silently at runtime in VS Code.

### Webview: No inline styles (CSP)
The webview runs under a strict Content Security Policy. **Inline `style="..."` attributes are blocked at runtime** even though they compile fine.
- ✅ Add CSS classes and rules to the stylesheet
- ❌ Do not use `style="..."` on any HTML element in the webview

### Copilot SDK: ESM bundling (webpackIgnore)
`@github/copilot-sdk` is ESM-only and cannot be bundled by webpack as CJS. Always use:
```typescript
const sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
```
- ✅ Dynamic import with `webpackIgnore` comment
- ❌ Do not add the package to webpack externals
- ❌ Do not use static `import` — webpack will convert it to `require()` and it will fail at runtime

If adding any other ESM-only package, apply the same pattern and whitelist it in `.vscodeignore`.

## Key Constraints

- **No manual token pasting by default** — Copilot SDK auto-authenticates
- **Custom tools must be stateless** — Agent calls them multiple times per analysis
- **Worker threads for git parsing** — Keeps extension responsive on large repos
- **Bot detection is deterministic** — Regex-based (not LLM inference)
- **Webview uses Content Security Policy** — Strict CSP for security

## Bot/Agent Detection

**Auto-detected bots:**
- Dependabot
- Renovate
- GitHub Actions Bot
- Copilot
- CodeQL
- Mergify
- Snyk
- WhiteSource
- ImgBot
- Stale Bot

**Detection method:** Email/name regex patterns (deterministic, no AI)

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `teamxray.cliPath` | (auto) | Copilot CLI path (if not on PATH) |
| `teamxray.aiProvider` | `copilot` | AI provider mode |
| `teamxray.copilotModel` | (auto) | Optional Copilot model override |
| `teamxray.githubModelsModel` | `openai/gpt-4.1` | GitHub Models catalog ID for direct or fallback analysis |
| `teamxray.byokBaseUrl` | (empty) | BYOK endpoint URL |
| `teamxray.byokModel` | (empty) | BYOK model name |
| `teamxray.maxCommits` | 1000 | Max commits to analyze |
| `teamxray.excludeBots` | true | Filter out bot contributors |

## File Structure

- `src/core/expertise-analyzer.ts` — Git history parser
- `src/core/copilot-service.ts` — Copilot SDK integration
- `src/ui/webview-provider.ts` — Analysis webview
- `src/commands/` — VS Code commands
- `resources/` — HTML templates, CSS, images
- `docs/` — Setup, architecture, troubleshooting

## What NOT to Do

- Don't bypass Copilot SDK for AI calls — it's the primary interface
- Don't add custom tools that mutate state — tools must be read-only
- Don't skip bot detection — filtered bots skew analysis
- Don't hardcode git limits — large repos need configurable thresholds
- Don't use inline styles in webview — CSP blocks them (see Runtime Guardrails above)
- Don't bundle ESM-only packages with webpack — use `webpackIgnore` dynamic import (see Runtime Guardrails above)

## Docs

- [Setup](docs/setup.md) — Installation + config
- [Architecture](docs/architecture.md) — Components, tools, worker threads
- [AI Providers](docs/ai-providers.md) — Provider modes + fallback chain
- [Reports](docs/reports.md) — Webview + HTML export
- [Troubleshooting](docs/troubleshooting.md) — Common issues

## Release

- **Marketplace:** https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray
- **Repo:** https://github.com/AndreaGriffiths11/teamxray
- **Issues:** https://github.com/AndreaGriffiths11/teamxray/issues
