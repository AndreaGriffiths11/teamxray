# AGENTS.md — src/types/

Rules for shared type definitions.

## Constraints

- Types here are imported across the entire extension — breaking changes affect everything
- No runtime code in this directory — types and interfaces only
- Don't use `any` — if you need an escape hatch, use `unknown` and narrow it at the call site
- Prefer narrow types over wide ones — `'copilot' | 'github-models' | 'byok'` over `string`

## Adding Types

- New types go in the most specific file (`expert.ts` for expertise data, `management-insights.ts` for insights)
- If a type is used in exactly one file, define it there instead — don't centralize prematurely
