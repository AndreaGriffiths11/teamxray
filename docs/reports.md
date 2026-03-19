# Reports & Export

## In-Editor Webview

After running an analysis, results appear in a VS Code webview panel. The webview adapts to your current VS Code theme (light or dark).

What's in the webview:
- **Contributor profiles** — expertise areas, commit activity, specialization tags
- **Expertise bars** — colored bars showing relative contribution per area (gray for bots)
- **Bot detection badges** — 🤖 next to identified automated contributors
- **Sortable/filterable table** — click column headers to sort, use the filter to narrow by name or area
- **Management insights** — bus factor risks, growth opportunities, efficiency gaps

## Standalone HTML Export

Click the export button in the webview to generate a self-contained HTML file. No external dependencies — everything inlines.

The exported report uses the X-Ray dark theme:

| Element | Value |
|---------|-------|
| Background | `#0a0a0f` |
| Accent | `#06b6d4` (cyan) |
| Effects | CSS scan-line overlay |
| Charts | Inline SVG bar charts |

The export looks different from the webview on purpose — the webview follows your VS Code theme, while the export always uses the dark X-Ray identity for a consistent, shareable look.

## What's in a Report

### Contributor Profiles
Each contributor gets a profile with:
- Total commits and file count
- First and last activity dates
- Top expertise areas with percentage bars
- AI-generated analysis (communication style, specialization, collaboration patterns) when an AI provider is available

### Bot Detection
Automated contributors (Dependabot, Renovate, GitHub Actions) are flagged with:
- 🤖 badge
- Gray expertise bars
- Separated from human contributors in insights

### Management Insights
AI-powered recommendations for team leads:
- **Bus factor** — areas where one person holds all the knowledge
- **Growth opportunities** — contributors showing potential in new areas
- **Efficiency gaps** — patterns that suggest process improvements
