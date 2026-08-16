# AGENTS.md — src/utils/

Rules for utility modules. These are shared across the extension — keep them narrow and side-effect free.

## Bot Detection (`bot-detection.ts`)

- Detection is **deterministic regex only** — never use LLM inference to classify bots
- Adding a new bot pattern requires a corresponding test in `__tests__/bot-detection.test.ts`
- Patterns match on email and/or display name — document which field each pattern targets
- False positives (human flagged as bot) are worse than false negatives — err on the side of inclusion

## Error Handling (`error-handler.ts`)

- All errors surface through this module — don't use `console.log` or `console.error` anywhere in `src/`
- User-facing messages must be plain English, no stack traces
- Log full error details to the extension output channel for debugging

## Testing

- Every util function needs a test in `__tests__/`
- Tests must not import from `vscode` — utils must be testable in plain Node.js
