# Change Log

All notable changes to the Team X-Ray extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-04-10

### 📖 Documentation
- Clarified current positioning around Copilot SDK, GitHub Models fallback, and reduced local git fallback.

## [2.0.0] - 2026-03-12

### 🚀 Major: Copilot SDK Integration
- **New AI engine**: Replaced MCP server architecture with GitHub Copilot SDK (`@github/copilot-sdk`). No more Docker containers or separate processes — the SDK runs directly inside the extension.
- **Smart fallback chain**: Copilot SDK → BYOK (bring your own key) → GitHub Models API → local-only analysis. If one tier is unavailable, the next kicks in automatically.
- **Custom tools via `defineTool` + Zod**: Five purpose-built tools the SDK agent uses to analyze repositories (file analysis, contributor stats, commit patterns, etc.)
- **Webpack ESM bundling**: Solved `@github/copilot-sdk` being ESM-only with `/* webpackIgnore: true */` on dynamic imports.

### 🤖 Agent & Bot Detection
- **`detectBot(name, email)` helper**: Identifies bot and agent contributors (Dependabot, Copilot, Renovate, etc.) from commit metadata.
- **Visual distinction**: Bot contributors get gray expertise bars and a 🤖 badge instead of the standard color scheme.
- **Why it matters**: As AI agents commit more code, you need to know which expertise is human and which is automated.

### 🎨 Dark X-Ray Redesign
- **Exported reports**: Complete visual overhaul — `#0a0a0f` background, cyan (`#06b6d4`) accent, CSS scan-line patterns, SVG bar charts. Looks like something out of a cybersecurity dashboard.
- **VS Code webview**: Matching dark theme for the in-editor view, consistent with exported reports.

### 📖 Documentation
- **README rewritten**: Added Copilot SDK architecture section, ASCII flow diagram, fallback chain table.
- **Architecture diagram**: Hand-drawn image replacing the old ASCII version.
- **SECURITY.md**: Added vulnerability reporting process.
- **FUNDING.yml**: Added GitHub Sponsors.

### 🔧 Infrastructure
- **Dropped Node 18**: CI now runs on Node 20+ only (`@vscode/vsce` requires it).
- **Security audit**: Changed from `--audit-level high` to `--omit=dev --audit-level critical` — dev-only vulns with no upstream fix were blocking CI for no reason.
- **CI PR comment fix**: `job.status` → `JOB_STATUS` env var.

### 📦 Dependencies
- Bumped rollup 4.53.3 → 4.59.0
- Bumped minimatch 3.1.2 → 3.1.5
- Bumped axios 1.12.0 → 1.13.5
- Bumped webpack 5.99.9 → 5.105.0
- Bumped fastify 5.6.2 → 5.7.4

## [1.0.5] - 2025-11-24

### ✨ UI Improvements
- **Redesigned HTML Reports**: Modern, professional report design with refined color palette
- **Expert Cards**: Clean layout with hover effects, pill-shaped role badges, and tag-style specializations
- **Management Insights**: Color-coded cards with top borders (Red/Risk, Green/Opportunity)
- **AI Section**: Distinct dark theme for strategic insights
- **Typography**: Updated to Inter font stack for better readability

### 🧪 Testing & Quality
- **Evalite Integration**: Added eval-driven development framework for AI output testing
- **Custom Scorers**: Expert identification and collaboration pattern detection with 90%+ accuracy
- **GitHub Models Support**: Configured evalite to use GitHub Models API instead of OpenAI

### 🐛 Bug Fixes
- Fixed duplicate function definitions in validation.ts causing compilation errors
- Resolved TypeScript/ESLint conflicts in evaluation files

## [1.0.0] - 2025-01-18

### 🎉 Initial Release

### Added
- Human-focused team expertise analysis using GitHub MCP integration
- AI-powered analysis with GitHub Models API (gpt-4o) for communication styles
- VS Code webview for beautiful team insights visualization
- File-specific expert identification with right-click context menu
- Command palette integration for repository analysis
- Sidebar tree view for team navigation
- Graceful fallback to local Git analysis when MCP is unavailable
- Comprehensive CI/CD pipeline for automated testing and marketplace publishing

### Features
- **GitHub MCP Integration**: Uses VS Code's native MCP support with GitHub's official server
- **Right-click Analysis**: Context menu for quick file expert identification
- **Team Discovery**: Reveals hidden strengths and communication patterns
- **Beautiful UI**: VS Code-themed webviews with accessibility support
- **Progressive Enhancement**: Works offline with local Git fallback

### 🔒 Security Improvements
- **Enhanced Token Security**: Uses VS Code's SecretStorage API exclusively - no more process.env exposure
- **Input Validation**: Comprehensive validation for all user inputs, file paths, and API responses
- **Error Handling**: Consistent error reporting with user-friendly messages and technical logging
- **Resource Management**: Proper cleanup of processes and child processes to prevent memory leaks
- **Type Safety**: Eliminated all 'any' types with comprehensive TypeScript interfaces

### Technical
- TypeScript implementation with strict mode
- Comprehensive error handling and logging
- VS Code extension best practices
- Docker-based MCP server configuration
- Automated testing and quality validation
- Secure token management with validation and caching
- Resource leak prevention and proper cleanup

## [0.0.1] - 2025-05-28

### Added
- Initial extension structure and core functionality
- Basic team expertise analysis framework
- GitHub MCP server integration setup
- VS Code extension boilerplate with commands and menus
