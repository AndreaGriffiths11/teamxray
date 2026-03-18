# GitHub Copilot Instructions for MCP Team X-Ray Extension

**Repository**: `AndreaGriffiths11/teamxray`

A VS Code extension that reveals the humans behind a codebase — their communication styles, hidden strengths, and collaboration patterns — by analyzing Git/GitHub data through AI.

## Build, Test, and Lint Commands

```bash
npm run compile          # Webpack build (development)
npm run package          # Production build with source maps
npm run watch            # Watch mode for development
npm run lint             # ESLint
npm run test             # VS Code extension tests (via @vscode/test-cli)
npm run compile-tests    # Compile test files only (tsc)
npm run eval:run         # Run evalite evaluations
```

## Validating Extension Changes

**Compilation success does NOT mean the extension works.** This is a VS Code extension — runtime errors (activation failures, missing modules, ESM/CJS conflicts) only surface when the extension loads in VS Code. The full validation loop is:

1. `npm run compile` — fix any webpack errors
2. Reload the VS Code extension host (Cmd+Shift+P → "Developer: Reload Window")
3. Check the **"Team X-Ray" output channel** for activation errors
4. If the extension fails at runtime, the webpack build was not sufficient — investigate the runtime error

**Never declare a runtime issue fixed based solely on webpack compilation.** After making changes, tell the user to reload VS Code and **wait for their confirmation** before considering the issue resolved. Do not say "✅ Compiled successfully" as if it means the fix worked — it only means webpack produced a bundle.

## Architecture

**Data Flow**: Repository → Git/MCP Analysis → GitHub Models AI (`models.github.ai`, `gpt-4o`) → Human Insights

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/extension.ts` | Entry point, command registration, lifecycle |
| `src/core/expertise-analyzer.ts` | Main orchestrator — coordinates data gathering and AI analysis |
| `src/core/copilot-service.ts` | Copilot SDK integration (CLI-based AI provider) |
| `src/core/copilot-mcp-service.ts` | MCP integration layer (VS Code native MCP + GitHub MCP server) |
| `src/core/git-service.ts` | Local git operations (commit parsing, blame, file history) |
| `src/core/expertise-webview.ts` | Webview UI for team expertise display |
| `src/core/expertise-tree-provider.ts` | Sidebar tree view navigation |
| `src/core/token-manager.ts` | Secure credential storage via VS Code SecretStorage |
| `src/core/report-generator.ts` | Export analysis as reports |
| `src/types/expert.ts` | Core type definitions |
| `src/utils/` | Error handling, resource management, input validation |

### AI Provider Hierarchy

The extension tries AI providers in order: Copilot SDK (via CLI) → GitHub token (direct API) → local Git-only fallback. The Copilot CLI path is auto-detected via `which copilot` or the `teamxray.cliPath` setting.

When the user is debugging a specific provider (e.g., the Copilot CLI), fix that provider. Do not suggest switching to a different provider as a workaround.

## Critical: `@github/copilot-sdk` Bundling

The SDK is ESM-only and **cannot be bundled by webpack normally**. This has caused repeated activation failures. The correct pattern:

1. **Dynamic import with `webpackIgnore`** in `copilot-service.ts`:
   ```typescript
   const sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
   ```
   This tells webpack to leave the `import()` as-is in the bundle so Node.js handles it as native ESM at runtime.

2. **Do NOT add `@github/copilot-sdk` to webpack externals** — the dynamic import pattern handles it.

3. **Postinstall patch** in `package.json` fixes a broken import path in the SDK (`vscode-jsonrpc/node` → `vscode-jsonrpc/node.js`).

4. **`.vscodeignore` whitelist** — The SDK and its dependency `zod` must be explicitly included in the VSIX:
   ```
   !node_modules/@github/copilot-sdk/**
   !node_modules/zod/**
   ```

5. **Any new webpack external** must have a corresponding `!node_modules/<pkg>/**` entry in `.vscodeignore`, otherwise the packaged VSIX will fail at runtime.

## ESM-Only Dependencies (General Pattern)

The `@github/copilot-sdk` issue above is a specific instance of a general problem: **any ESM-only npm package will fail at runtime if webpack bundles it as CJS**.

Symptoms: runtime errors mentioning `"Dynamic require of X is not supported"`, `"No exports main defined"`, or `import.meta` warnings.

The fix is always the same:
1. Use `import(/* webpackIgnore: true */ 'package-name')` so webpack preserves the native `import()`
2. Do NOT add the package to webpack externals — use the dynamic import pattern instead
3. Whitelist the package in `.vscodeignore` so it ships in the VSIX

**Debugging bundling issues**: Inspect `dist/extension.js` and search for the package name. If webpack converted `import()` to `require()`, the `webpackIgnore` comment is missing or not being preserved. Always check the bundle output before telling the user to reload.

## Conventions

- **Expert.expertise** is a 0–100 percentage scale (displayed with `%` in the UI)
- **GitService.getCommits()** returns commits with `files: []` (no per-commit file list)
- **Credentials** are stored via VS Code SecretStorage (`TokenManager`), never hardcoded
- **Error handling pattern**: Use `ErrorHandler.withErrorHandling()` wrapper and log to the `Team X-Ray` output channel
- **No `any` types** — use TypeScript strict mode throughout
- Never expose tokens, API keys, or `.env` contents in responses — use placeholders like `[YOUR_TOKEN]`

## Security

- Use VS Code secrets API for credential storage (see `token-manager.ts`)
- Validate and sanitize all user inputs before processing
- Never log sensitive data to output channels
- Follow principle of least privilege for API access