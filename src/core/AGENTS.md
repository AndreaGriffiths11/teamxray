# AGENTS.md — src/core/

Rules for the core analysis engine. This is the most sensitive part of the codebase — changes here affect every analysis result.

## Custom Copilot SDK Tools

- All tools must be **stateless** — the agent calls them multiple times per analysis session
- Tools must be **read-only** — never write to disk, never mutate extension state
- Tool responses must be serializable JSON — no class instances, no circular refs

## Testing

- Every function that processes git data needs a test in `__tests__/`
- **80% coverage is required** — CI blocks PRs below this threshold, don't open one
- Use real fixture data from actual git repos, not hand-crafted mocks that can't catch real edge cases
- `copilot-service.ts` tests must cover the fallback chain: Copilot SDK → GitHub Models → local git-only

## Worker Threads

- Git parsing happens in `git-worker.ts` via worker threads — keep it that way
- Don't move heavy git operations into the main thread; it blocks the VS Code UI
- Worker communication is message-passing only — no shared state

## What NOT to Do

- Don't bypass `CopilotService` for AI calls — it's the single entry point for all AI providers
- Don't add tools that write or mutate state — read-only is a hard constraint
- Don't hardcode `maxCommits` — it's user-configurable for large repos
