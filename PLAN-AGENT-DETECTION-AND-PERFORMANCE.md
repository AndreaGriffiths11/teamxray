# Team X-Ray: Agent Detection & Performance Improvement Plan

## Why this plan exists

[Entire](https://entire.io) — the platform launched by former GitHub CEO Thomas Dohmke — is built on one core observation: **AI agents now write a large share of code, and git only records the final diff, not who (or what) actually produced it.** Their first product, Checkpoints, captures agent sessions (prompts, reasoning, tool calls) and links them to commits through git itself:

- A commit trailer `Entire-Checkpoint: <12-char hex id>` ties each commit to a captured agent session.
- An `Entire-Attribution` trailer records how much of a commit came from the agent vs. the human.
- Session metadata is stored on a dedicated `entire/checkpoints/v1` ref, so the record travels with the repo.
- It plugs into every major coding agent: Claude Code, Codex, Cursor, Gemini CLI, Factory, Copilot.

The lesson for Team X-Ray: **agent attribution lives in commit *messages and trailers*, not just in author name/email.** Most agent-assisted work is committed under the *human's* identity with a `Co-Authored-By:` trailer (Claude Code adds one by default; Cursor and Aider do too). Our current detector never sees any of that, because we only fetch `%s` (the subject line) and only inspect author name/email.

This plan covers three things:

1. **Part 1** — making bot/agent detection dramatically more accurate (the Entire-inspired work).
2. **Part 2** — making the extension measurably faster (the analysis pipeline currently does every git scan twice).
3. **Part 3** — other improvements noticed along the way.

---

## Where we stand today

### Detection (`src/utils/bot-detection.ts`)

`detectBotContributor(name, email)` is a 40-line heuristic over author name/email:

- ✅ Catches GitHub App bots: `*[bot]` names, `<id>+<name>[bot]@users.noreply.github.com` emails, `dependabot`, `renovate`, `github-actions`.
- ✅ Catches `noreply@anthropic.com` and `claude@users.noreply.github.com` authors.
- ❌ Misses agents that commit as regular-looking authors: Cursor (`Cursor Agent <cursoragent@cursor.com>` / `agent@cursor.com`), OpenCode (`noreply@opencode.ai`), OpenHands (`openhands@all-hands.dev`), Aider.
- ❌ Misses **all co-authored agent work** — a human-authored commit with `Co-Authored-By: Claude <noreply@anthropic.com>` counts as 100% human today.
- ❌ Misses Entire's own `Entire-Checkpoint` / `Entire-Attribution` trailers — the strongest possible signal that a commit was agent-produced.
- ❌ Binary output — no distinction between an *automation bot* (Dependabot bumping deps) and an *AI coding agent* (Claude Code shipping features), which mean very different things in a management-insights report.
- ❌ Hard-coded lists — no user-extensible patterns for org-internal bots.

### Pipeline (relevant to Part 2)

`analyzeRepository()` (`src/core/expertise-analyzer.ts:97`) runs:

1. `assessRepositorySize()` (line 160) → `getWorkspaceFiles()` + `getLocalGitCommits()` + `getLocalGitContributors()`, **sequentially**.
2. `gatherRepositoryData()` (line 257) → **the exact same three calls again**, sequentially.

`getLocalGitContributors()` runs `git shortlog -sne --all` (all refs, all history — ignoring the configured 90-day window) and then, in `git-worker.ts:87-101`, issues **two more sequential `git log --author` invocations per top-5 contributor** for first/last commit dates. `analyzeFileExperts()` (line 914) repeats the whole assess+gather double-scan on every right-click "Find Expert for This File". Nothing is cached between steps or commands.

Net effect: a single "Analyze Repository" run spawns **~16 git processes where ~2 would do**, all before the AI is even contacted.

---

## Part 1 — Agent & bot detection, Entire-style

### 1.1 Fetch trailers, not just subjects (foundation)

Change the git log pretty-format in `git-worker.ts` / `git-service.ts` to include trailers and use control-character delimiters (fixes a latent parsing bug too — an author name containing `|` currently shifts every field):

```
--pretty=format:%H%x00%an%x00%ae%x00%aI%x00%s%x00%(trailers:key=Co-authored-by,valueonly,separator=;)%x00%(trailers:key=Entire-Checkpoint,valueonly)%x00%(trailers:key=Entire-Attribution,valueonly)%x1E
```

- `%x00` field separator, `%x1E` record separator — immune to `|` in names/subjects.
- `%(trailers:key=...)` is computed by git itself; no need to fetch full bodies (`%B`) or parse them in JS, so the data volume stays almost identical.
- Extend `GitCommit` (`src/types/expert.ts`) with `coAuthors: GitAuthor[]`, `checkpointId?: string`, `attribution?: string`.

### 1.2 Replace the boolean with a classification

New module shape for `bot-detection.ts`:

```ts
export type ContributorKind = 'human' | 'ai-agent' | 'automation-bot' | 'ai-assisted-human';

export interface ContributorClassification {
    kind: ContributorKind;
    confidence: 'high' | 'medium' | 'low';
    signals: string[];          // e.g. ['email:cursoragent@cursor.com', 'trailer:Entire-Checkpoint']
    agentName?: string;         // 'Claude Code', 'Cursor', 'Dependabot', …
    aiAssistRate?: number;      // share of the contributor's commits carrying agent signals
}

export function classifyContributor(
    name: string | undefined,
    email: string | undefined,
    commits?: GitCommit[]       // optional: enables trailer-based signals
): ContributorClassification;

// Kept as a thin wrapper so all existing call sites and tests keep working:
export function detectBotContributor(name?: string, email?: string): boolean;
```

- `isBot` on `Expert` stays (backwards compatible: `isBot = kind !== 'human' && kind !== 'ai-assisted-human'`), and we add `classification` alongside it.
- `automation-bot` (Dependabot, Renovate, GitHub Actions) vs `ai-agent` (Claude Code, Cursor, Devin, Codex, …) render differently: dependency bots are noise to exclude; coding agents are a workforce to *measure*.

### 1.3 Expand the identity table (data-driven, not if-chains)

Move patterns into a declarative table so adding an agent is a one-line change. Confirmed identities to ship (sources at the end):

| Agent | Author-side signal | Trailer/message signal |
|---|---|---|
| Claude Code | `noreply@anthropic.com` (already) | `Co-Authored-By: Claude* <noreply@anthropic.com>` |
| GitHub Copilot agent | `copilot-swe-agent[bot]` | `Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>` |
| Cursor | `cursoragent@cursor.com`, `agent@cursor.com`, name `Cursor Agent` | `Co-authored-by: Cursor Agent …` |
| Devin | `devin-ai-integration[bot]` | — |
| OpenAI Codex | `chatgpt-codex-connector[bot]` | — |
| Google Jules | `google-labs-jules[bot]` | — |
| Amazon Q | `amazon-q-developer[bot]` | — |
| OpenCode | `noreply@opencode.ai` | — |
| OpenHands | `openhands@all-hands.dev` | — |
| Aider | `aider.chat` email domain | subject suffix `(aider)`, `Co-authored-by: aider (<model>) <…>` |
| Entire-instrumented agents | — | `Entire-Checkpoint:` / `Entire-Attribution:` trailers (any agent run under Entire CLI) |

Generic rules stay (any `[bot]` name, GitHub App noreply pattern), so future GitHub-App agents are caught automatically.

### 1.4 User-configurable patterns

New settings in `package.json`:

- `teamxray.additionalBotPatterns: string[]` — glob/regex over `name <email>` for org-internal bots and agents.
- `teamxray.humanOverrides: string[]` — emails to *never* classify as bots (escape hatch for false positives).

### 1.5 "AI-assisted" as a first-class metric (the Entire-inspired feature)

With trailers available per commit, compute during `extractContributorsFromCommits` / contributor aggregation:

- **Per contributor:** `aiAssistRate` = share of their commits carrying an agent co-author, an `Entire-Checkpoint` trailer, or an aider marker. A human with 80% Claude-co-authored commits is classified `ai-assisted-human` — shown as human, badged differently (e.g. `🤝`), never dropped from insights.
- **Per repository:** agent-written share of commits, trend over the analysis window, breakdown by agent (`Claude Code 34%, Cursor 12%, Dependabot 9%`).
- **Surfacing:** a new "AI Attribution" card in the webview + HTML report next to the existing `N humans · M agents` pill; feed the numbers into `analysis-enrichment.ts` so management insights can say things like "60% of commits in `src/core` are agent-assisted with a single human reviewer — review-capacity risk", and so bus-factor math stops counting bots as owners.
- **Prompt enrichment:** include the attribution summary in the AI prompt (`buildAnalysisPrompt`) — it materially improves the quality of team-dynamics output because the model stops inventing personalities for Dependabot.

### 1.6 Optional: native Entire Checkpoints integration (stretch)

If the repo has Entire installed (`git show-ref --verify refs/heads/entire/checkpoints/v1` or the ref on origin), Team X-Ray can:

- Show a "session context available" link per commit/expert that deep-links to `entire.io` via the checkpoint ID.
- Parse `Entire-Attribution` values for line-level agent/human split instead of estimating from co-authorship.

Cheap to detect (one `git show-ref`), high wow-factor, degrades gracefully when absent.

### 1.7 Tests

- Unit-test the classification table: one fixture per agent identity above, plus co-author-trailer fixtures and `humanOverrides` behavior (extend `src/core/__tests__/copilot-service.test.ts` patterns into a dedicated `bot-detection.test.ts`).
- Fixture a NUL-delimited log output with `|` in an author name to lock in the parser fix.

---

## Part 2 — Performance plan

Ordered by impact-per-effort. Items P1–P3 together should cut the pre-AI "gathering" phase from ~16 git spawns to 2–3 and roughly 3–4× the wall-clock speed of that phase; P4 makes repeat commands near-instant.

### P1. Gather once, not twice (biggest win, low risk)

`assessRepositorySize()` and `gatherRepositoryData()` each independently fetch files + commits + contributors (`expertise-analyzer.ts:160-164` and `265-267`). Restructure:

```ts
const snapshot = await this.collectRepoSnapshot();   // one fetch of files/commits/contributors
const repoStats = this.assessRepositorySize(snapshot);   // pure function, no I/O
const repositoryData = this.buildRepositoryData(snapshot, repoStats); // pure sampling
```

Halves git process count and `findFiles` traversals immediately. `analyzeFileExperts()` (line 914) uses the same snapshot instead of re-running both steps per right-click.

### P2. Parallelize the remaining fetches

The three snapshot fetches are independent; the worker client already multiplexes by message id:

```ts
const [files, commits, contributors] = await Promise.all([
    this.getWorkspaceFiles(),
    this.getLocalGitCommits(),
    this.getLocalGitContributors(),
]);
```

Latency drops from sum to max of the three.

### P3. Derive contributors from the commit list — drop `shortlog --all` and the per-author date loops

`git shortlog -sne --all` walks **all refs and all history**, which (a) is the slowest git call we make on large repos and (b) contradicts the `historyWindowDays` setting (commits respect the 90-day window; contributor counts don't — bots retired years ago still appear). Meanwhile `git-worker.ts:87-101` spawns up to 10 more sequential `git log --author` processes for first/last dates — and `--reverse -n 1` re-walks full history per author.

Replace all of it with one in-memory pass over the already-fetched commit array (the logic exists — `extractContributorsFromCommits`, `expertise-analyzer.ts:892` — today it's only a fallback): counts, first/last dates, co-author stats, and AI-assist rates all fall out of a single loop. Keep `shortlog` only for the `historyWindowDays: 0` + >1000-commits edge case, without `--all` (use `HEAD`).

### P4. Cache the snapshot with HEAD-based invalidation

Store the snapshot keyed by `git rev-parse HEAD` (one ~5ms invocation). "Analyze Repository" followed by "Find Expert for This File" — or two file-expert lookups in a row — currently re-runs everything; with the cache they cost one `rev-parse`. Invalidate on HEAD change or `historyWindowDays` change; keep the existing worker-thread architecture (it's good — keeps the extension host responsive).

### P5. Bot-aware sampling → smaller prompts, faster + better AI calls

`sampleContributors()` takes the top-N by commit count — and Dependabot/Renovate are often top committers, so **bots crowd humans out of the AI's view** and burn prompt tokens on churn commits. After classification (Part 1):

- Sample humans and agents separately; send bots as a one-line aggregate ("Dependabot: 214 dependency commits") instead of full profiles.
- Optionally filter agent bump-commits out of the sampled commit list sent to the model.

Smaller prompts = faster + cheaper AI round-trip and fewer chunked-analysis paths (`performChunkedAnalysis` triggers at >100KB).

### P6. Robust parsing (correctness with a perf face)

The NUL/record-separator format from §1.1 also removes the `split('|')` fragility and the multi-block `__TEAMXRAY_COMMIT__` custom parsing in `parseCommitOutputWithFiles`.

### P7. Instrument before/after

Add duration logging around each phase (`snapshot`, `sampling`, `ai`, `render`) to the output channel, e.g. `⏱ snapshot 420ms · sampling 3ms · ai 28s`. Cheap, and turns future perf regressions into bug reports with numbers.

### Expected impact summary

| Scenario | Today | After P1–P4 |
|---|---|---|
| Analyze Repository (pre-AI phase) | ~16 git spawns, 2× workspace scans, serial | 2–3 spawns, 1 scan, parallel |
| Find Expert for This File | ~8 git spawns + workspace scan per invocation | 1 `rev-parse` (cache hit) |
| Contributor dates on large repo | up to 10 full-history walks | 0 (derived in memory) |
| Prompt size w/ bot-heavy repos | bots occupy top contributor slots | humans + agents only, bots aggregated |

---

## Part 3 — Other suggestions noticed along the way

1. **`changeFrequency` is fake data.** `mapFileExpertise` fills it with `Math.floor(Math.random() * 10) + 1` (`expertise-analyzer.ts:1304`) and reports render it. Either compute it from the per-file commit counts we already fetch, or drop the field.
2. **Identity merging (.mailmap).** The same human with work + personal emails is counted as two contributors, which skews bus-factor and top-contributor math. Respect `.mailmap` (`git log` does automatically with `%aN`/`%aE` — a one-character format change) and optionally merge by normalized display name.
3. **Report/webview duplication.** `expertise-webview.ts` (1576 lines) and `report-generator.ts` (452) maintain near-identical HTML/CSS by hand — the humans/agents pill markup exists in 4 places. Extracting a shared template module would make Part 1's new badges (`🤝 AI-assisted`, per-agent breakdown) a single-site change.
4. **`sampleCommits` mutates its input** (`.sort()` in place, line 347) — sort a copy to avoid surprising callers that reuse `allCommits`.
5. **Bounded webview payloads.** For enterprise-size analyses, the webview receives the full expert/file arrays; consider top-N + "show more" to keep the panel snappy.
6. **CI check for the identity table.** A tiny scheduled job (or eval in `evals/`) that runs classification against a fixture corpus keeps the agent table honest as new agents appear — the ecosystem added at least four new commit identities in the last year.

---

## Suggested rollout

| Phase | Scope | Size |
|---|---|---|
| 1 | P1 + P2 + P7 (single snapshot, parallel, timings) — pure refactor, no behavior change | S |
| 2 | §1.1 + §1.2 + §1.3 + §1.7 (trailer fetch, classification, identity table, tests) + P6 | M |
| 3 | P3 + P4 + P5 (in-memory contributors, HEAD cache, bot-aware sampling) | M |
| 4 | §1.4 + §1.5 (config patterns, AI-attribution metrics & UI) | M |
| 5 | §1.6 (Entire Checkpoints deep-links) + Part 3 items | S–M |

Phases 1 and 2 are independent and can land in either order; nothing here breaks the existing `isBot` contract, saved analyses, or the fallback tiers.

---

## Sources

- [Entire blog](https://entire.io/blog) · [Hello Entire World](https://entire.io/blog/hello-entire-world) · [The Entire CLI: How It Works](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) · [Agent Hooks](https://entire.io/blog/agent-hooks-the-integration-layer-between-entire-cli-and-your-agent)
- [Entire docs — Core Concepts](https://docs.entire.io/core-concepts) · [entireio/cli on GitHub](https://github.com/entireio/cli)
- [TechCrunch: Former GitHub CEO raises record $60M seed](https://techcrunch.com/2026/02/10/former-github-ceo-raises-record-60m-dev-tool-seed-round-at-300m-valuation/) · [The New Stack interview with Thomas Dohmke](https://thenewstack.io/thomas-dohmke-interview-entire/)
- [Detecting AI Coding Agents in Open Source: A Validated Multi-Method Census (arXiv)](https://arxiv.org/html/2606.24429v1) · [Fingerprinting AI Coding Agents on GitHub (arXiv)](https://arxiv.org/html/2601.17406v1)
- [powerset-co/github-coding-agent-tracker](https://github.com/powerset-co/github-coding-agent-tracker) (agent commit-identity list) · [Coderbuds open-source AI-detection rules](https://coderbuds.com/blog/open-source-ai-code-detection-yaml-rules)
