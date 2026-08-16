# AGENTS.md — src/

Rules for all TypeScript source in this directory.

## Language & Style

- TypeScript strict mode — no `any`, no type assertions without a comment explaining why
- No inline styles in webview components — CSP blocks them and they will silently fail
- All VS Code API calls must handle the case where the extension is not yet activated

## Testing

- Every new function in `core/` or `utils/` needs a corresponding test in `__tests__/`
- Target 80% coverage per file — CI enforces this, don't open a PR below it
- Use real fixture data for tests, not mocked git output (see `evals/` for examples)

## What NOT to Do

- Don't import from `vscode` in `core/` or `utils/` — those modules must stay testable outside the extension host
- Don't add `console.log` — use the extension's output channel via `error-handler.ts`
- Don't hardcode paths — use `vscode.Uri` and `path.join`
