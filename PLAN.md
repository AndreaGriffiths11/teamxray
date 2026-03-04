# Team X-Ray v2: Copilot SDK Integration Plan

## Goal
Replace the current GitHub Models API + manual token authentication with the **Copilot SDK** (`@github/copilot-sdk`), making Team X-Ray a showcase for building VS Code extensions powered by Copilot's agentic runtime.

---

## Architecture Change Overview

### Current Flow
```
User pastes GitHub token → TokenManager stores in SecretStorage
  → ExpertiseAnalyzer gathers git data locally
  → Sends data blob to GitHub Models API (https://models.github.ai/inference)
  → Parses JSON response → Webview
```

### New Flow
```
Copilot SDK auto-authenticates via user's Copilot subscription (or BYOK)
  → ExpertiseAnalyzer gathers git data locally (unchanged)
  → Creates CopilotClient session with custom tools
  → Agent calls our tools to get team data
  → Agent returns structured analysis → Webview
```

**Key wins:**
- No manual token creation/pasting for AI analysis
- Custom tools let the agent request exactly the data it needs
- Streaming support for progressive results
- BYOK fallback for users without Copilot subscription
- Hooks for logging and error recovery

---

## Implementation Steps

### Phase 1: Add Copilot SDK dependency and create CopilotService

**New file: `src/core/copilot-service.ts`**

This replaces the AI analysis portion of `expertise-analyzer.ts`. It manages:
- CopilotClient lifecycle (start/stop with extension lifecycle)
- Session creation with custom system message
- Custom tools that expose git analysis data to the agent
- Response parsing

```typescript
// Core interface
export class CopilotService {
  private client: CopilotClient | null = null;
  private outputChannel: vscode.OutputChannel;

  async initialize(): Promise<void>          // Start CopilotClient
  async dispose(): Promise<void>             // Stop CopilotClient
  async analyzeTeam(data: RepositoryData, repoStats: RepositoryStats): Promise<ExpertiseAnalysis>
  async analyzeFileExpert(filePath: string, data: RepositoryData): Promise<Expert[]>
  isAvailable(): boolean                     // Check if Copilot CLI is accessible
}
```

**Custom tools to expose:**

| Tool Name | Description | Returns |
|-----------|-------------|---------|
| `get_contributors` | Get all git contributors with commit counts | GitContributor[] |
| `get_recent_commits` | Get recent commits with authors and messages | GitCommit[] |
| `get_file_experts` | Get contributors for a specific file | Expert candidates |
| `get_repo_stats` | Get repository size, languages, activity level | RepositoryStats |
| `get_collaboration_patterns` | Get co-authorship and review patterns | Collaboration data |

**System message (append mode):**
```
You are a team expertise analyst helping engineering managers discover the humans behind their codebase. 

Use the provided tools to gather repository data, then analyze:
1. Each contributor's expertise areas, communication style, and hidden strengths
2. Team health: knowledge silos, single points of failure, collaboration gaps
3. Management insights: risks, opportunities, mentorship matches, growth paths

Always respond with JSON matching the ExpertiseAnalysis schema.
Focus on human qualities — not just code metrics.
```

### Phase 2: Refactor ExpertiseAnalyzer

**Extract from `expertise-analyzer.ts`:**
- Move AI prompt construction → `CopilotService` (system message + tool responses)
- Move AI response parsing → `CopilotService.parseAnalysisResponse()`
- Move data chunking logic → `CopilotService` (infinite sessions handle context limits automatically)
- Keep git data gathering logic in ExpertiseAnalyzer (GitService calls, file listing, sampling)
- Keep fallback analysis logic (for when Copilot is unavailable)

**ExpertiseAnalyzer becomes a thin orchestrator:**
```
assessRepositorySize() → gatherRepositoryData() → copilotService.analyzeTeam() → saveAnalysis()
                                                   ↓ (if unavailable)
                                                   createFallbackAnalysis()
```

### Phase 3: Update Authentication

**TokenManager changes:**
- Keep TokenManager for GitHub API access (user profile, repo checks) — this is separate from AI auth
- Add new `CopilotAuthManager` or extend TokenManager with Copilot-specific auth status
- Remove the requirement for token before AI analysis (Copilot SDK handles its own auth)
- Add BYOK configuration support via VS Code settings

**New settings in package.json contributes.configuration:**
```json
{
  "teamxray.aiProvider": {
    "type": "string",
    "enum": ["copilot", "byok-openai", "byok-anthropic", "byok-azure", "github-models"],
    "default": "copilot",
    "description": "AI provider for team analysis"
  },
  "teamxray.byokApiKey": {
    "type": "string",
    "description": "API key for BYOK provider (stored securely)"
  },
  "teamxray.byokBaseUrl": {
    "type": "string",
    "description": "Base URL for BYOK provider"
  },
  "teamxray.byokModel": {
    "type": "string",
    "description": "Model name for BYOK provider"
  }
}
```

**Auth flow:**
1. Check if Copilot SDK can initialize (CLI available + auth)
2. If yes → use Copilot SDK (zero config needed from user)
3. If no → check BYOK settings → use custom provider
4. If no BYOK → fall back to GitHub Models API (existing behavior, needs token)
5. If nothing → fall back to local-only analysis (no AI insights)

### Phase 4: Update Extension Lifecycle

**extension.ts changes:**

```typescript
// In activate():
const copilotService = new CopilotService(outputChannel);
try {
  await copilotService.initialize();
  outputChannel.appendLine('✅ Copilot SDK connected');
} catch {
  outputChannel.appendLine('⚠️ Copilot CLI not available, using fallback');
}

// Pass copilotService to ExpertiseAnalyzer
const analyzer = new ExpertiseAnalyzer(context, tokenManager, copilotService);

// In deactivate():
await copilotService.dispose();
resourceManager.cleanup();
```

**Command changes:**
- `teamxray.setGitHubToken` → Keep, but label it "Set GitHub Token (for API access)"
- Add `teamxray.configureAI` → Opens settings for AI provider selection
- Modify `teamxray.analyzeRepository` → No longer requires GitHub token if Copilot SDK is available

### Phase 5: Streaming Support in Webview

**Add progressive analysis display:**

Currently the webview only renders after full analysis completes. With SDK streaming:

1. Open webview immediately when analysis starts
2. Show skeleton/loading state for each section
3. As `assistant.message_delta` events arrive, parse partial JSON and update sections
4. Expert cards appear one by one as the agent identifies them
5. Management insights populate progressively

**Implementation:**
- Webview receives messages from extension via `panel.webview.postMessage()`
- Extension listens to SDK session events and forwards deltas
- Webview JavaScript handles incremental DOM updates

### Phase 6: Simplify CopilotMCPService

**What to keep:**
- `detectRepository()` — still needed for GitHub repo detection
- `getExpertRecentActivity()` → Keep but simplify (uses local git, not MCP)
- `showExpertActivity()` → Keep (UI display)

**What to remove:**
- `checkMCPServerStatus()` — Docker container checking (Copilot SDK replaces this)
- `ensureMCPServerRunning()` — Docker management
- `gatherRepositoryData()` — Replaced by ExpertiseAnalyzer's local git gathering
- `queryCopilotWithMCP()` — Replaced by CopilotService
- `buildMCPDataGatheringPrompt()` — Replaced by CopilotService system message
- `fallbackLocalAnalysis()` — Already handled by ExpertiseAnalyzer

This file shrinks significantly. Consider renaming to `github-service.ts` since it's really just GitHub repo detection + expert activity display.

### Phase 7: Add Unit Tests

**Test files to create:**

| File | Tests |
|------|-------|
| `src/core/__tests__/copilot-service.test.ts` | SDK initialization, tool definitions, response parsing, BYOK config, error handling |
| `src/core/__tests__/expertise-analyzer.test.ts` | Data gathering, sampling logic, fallback analysis, orchestration |
| `src/core/__tests__/git-service.test.ts` | Commit parsing, contributor extraction, date handling |
| `src/utils/__tests__/validation.test.ts` | All validators: token, path, email, URL, shell input |

Use **vitest** (already in devDependencies).

### Phase 8: Update package.json and Dependencies

**Add:**
```
npm install @github/copilot-sdk zod
```

**Remove (eventually):**
- `axios` — Only used for GitHub Models API calls and token validation. Keep for now (token validation still uses it), remove later if we move token validation to use fetch.

**Webpack externals update:**
```javascript
externals: {
  vscode: 'commonjs vscode',
  '@github/copilot-sdk': 'commonjs @github/copilot-sdk',
}
```
The Copilot SDK communicates with the CLI process and shouldn't be bundled.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/copilot-service.ts` | **NEW** | CopilotClient wrapper with custom tools |
| `src/core/expertise-analyzer.ts` | **MODIFY** | Remove AI prompt/parsing, delegate to CopilotService |
| `src/core/copilot-mcp-service.ts` | **MODIFY** | Strip MCP/Docker code, rename to github-service.ts |
| `src/extension.ts` | **MODIFY** | Add CopilotService lifecycle, update command wiring |
| `src/core/token-manager.ts` | **MODIFY** | Keep for GitHub API, remove as AI analysis requirement |
| `src/core/expertise-webview.ts` | **MODIFY** | Add streaming/progressive rendering support |
| `package.json` | **MODIFY** | Add dependencies, new settings, update commands |
| `webpack.config.js` | **MODIFY** | Add SDK to externals |
| `src/core/__tests__/*.test.ts` | **NEW** | Unit tests for core modules |

---

## Migration Path (Backwards Compatibility)

The extension should work in **three modes:**

1. **Copilot SDK mode** (preferred) — Zero config, uses Copilot subscription
2. **BYOK mode** — User provides their own API key in settings
3. **GitHub Models mode** (legacy) — User provides GitHub token (existing behavior)
4. **Local-only mode** — No AI, just git statistics (existing fallback)

Detection order: Copilot SDK → BYOK settings → GitHub Models token → Local-only

This means existing users who have a GitHub token configured continue to work unchanged, while new users get the zero-config Copilot experience.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Copilot SDK is Technical Preview | Keep GitHub Models fallback, graceful degradation |
| SDK requires Copilot CLI installed | Check availability on startup, show helpful install message |
| Breaking API changes in SDK | Pin SDK version, wrap in abstraction layer (CopilotService) |
| Token limits with custom tools | Keep smart sampling from current code, infinite sessions help |
| VS Code extension sandboxing | SDK uses JSON-RPC to external CLI process — should work fine |

---

## Implementation Order

1. **Phase 1** (CopilotService) — Core SDK integration
2. **Phase 2** (Refactor Analyzer) — Wire new service into existing flow
3. **Phase 3** (Auth) — Update settings and auth flow
4. **Phase 4** (Extension lifecycle) — Wire up startup/shutdown
5. **Phase 7** (Tests) — Add unit tests for new and existing code
6. **Phase 6** (Simplify MCP service) — Clean up dead code
7. **Phase 8** (Dependencies) — Update package.json and webpack
8. **Phase 5** (Streaming) — Progressive webview rendering (nice-to-have, can defer)
