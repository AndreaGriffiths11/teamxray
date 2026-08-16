# AGENTS.md — evals/

Rules for evaluation files. Evals test real analysis quality — treat them like production.

## Constraints

- **Never mock real git data** — use actual fixture repos or recorded git output
- Evals measure analysis quality, not code correctness — don't write evals that just check if functions run without throwing
- `evalite` is the test harness — don't add a second eval framework

## Adding Evals

- New evals go in files named `*.eval.ts`
- Each eval needs a clear scoring criterion — what does "good" look like for this analysis?
- If an eval requires a real GitHub token, mark it with a `// requires: GITHUB_TOKEN` comment at the top so CI can skip it correctly
