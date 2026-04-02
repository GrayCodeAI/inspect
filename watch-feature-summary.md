# Watch Mode Feature Summary (PR #41)

## What it does

Watch mode continuously monitors a repository for file changes and automatically runs browser tests when those changes are likely to affect user-facing behavior. It's the "CI that runs on your laptop" — a persistent background process that detects edits, decides whether a browser test is warranted, and executes the test if so.

## User-facing entry points

- **`expect watch`** — subcommand on the main CLI
- **`expect-watch`** — standalone binary (separate Vite build entry at `src/watch.ts`)
- **Ctrl+G** from the interactive TUI main menu — launches watch mode inside the Ink UI
- CLI flags: `--target` (unstaged/branch/changes), `--message`, `--headed`, `--no-cookies`, `--ci`, `--timeout`, `--verbose`

## Core architecture

### Supervisor: `Watch` service (`packages/supervisor/src/watch.ts`)

The engine lives in the supervisor package as an Effect service. It runs a polling loop with this lifecycle:

1. **Poll** — every 1.5s (configurable), load the current git snapshot (changed files, diff, branch).
2. **Fingerprint** — SHA-256 hash of branch + changed file list + diff content. If the fingerprint matches the last-handled one, skip.
3. **Debounce/settle** — when a new fingerprint appears, wait for edits to settle (2s default) before assessing. This prevents triggering on every keystroke.
4. **Assess** — a two-tier decision pipeline:
   - **Fast heuristic** — file-extension and category checks. Components/stylesheets/templates → instant "run". Docs/assets/test-only → instant "skip". Config or shared web code → "borderline".
   - **Agent assessment** (borderline cases only) — sends the diff, file list, test coverage, and heuristic context to Claude via a structured prompt. The agent returns `RUN_TEST|yes|reason` or `RUN_TEST|no|reason`.
5. **Execute** — if the decision is "run", fires the browser test via the existing `Executor` pipeline (same as `expect` one-shot mode).
6. **Rerun queue** — if new changes arrive *during* an active run, exactly one rerun is queued. After the current run finishes, the loop rechecks the latest snapshot.

### State machine (`WatchState`)

Pure functions manage state transitions:
- `advanceWatchState` — determines whether to detect a change, settle, assess, or queue a rerun
- `markWatchRunStarted` / `markWatchRunFinished` / `markWatchHandled` — lifecycle markers
- All state is a plain immutable record (fingerprints + pending timestamps + rerun flag)

### CLI layer (`apps/cli/src/commands/watch.ts`)

Headless mode (CI/agent) — plain console logging with a keepalive heartbeat and SIGINT/SIGTERM cleanup.

### TUI layer (`apps/cli/src/components/screens/watch-screen.tsx`)

Interactive Ink screen showing:
- Current watch state (idle vs. run N in progress)
- Scope (working tree / branch)
- Last decision and its source (heuristic vs. agent)
- Last run result (pass/fail with step counts)
- Live test plan step progress during execution
- Recent event log (up to 6 events, reverse chronological)
- Live replay link (`o` to open)
- Notifications toggle (`Ctrl+N`)
- Stop confirmation on `Esc`

### Notifications (`apps/cli/src/utils/watch-notifications.ts`)

When a run fails, sends an OS notification (via `node-notifier`) if notifications are enabled. Messages are truncated to 180 chars.

### Test coverage integration

Before borderline agent assessments, the watch service runs `TestCoverage.analyze` to identify which changed files lack automated tests. This information is included in the agent prompt to improve decision quality.

## Navigation flow

The existing screen navigation was refactored to support a `mode: "run" | "watch"` discriminator. The cookie-sync-confirm and port-picker screens now route to either `Screen.Testing` or `Screen.Watch` based on this mode, avoiding duplication of the pre-test flow.

## Key design decisions

- **Heuristic-first, agent-second**: The fast heuristic handles clear-cut cases (docs, assets, components) without any LLM call. Only ambiguous "borderline" changes invoke the agent, keeping watch mode fast and cheap.
- **Fingerprint-based dedup**: The SHA-256 fingerprint prevents re-running tests when nothing meaningful changed, even across poll cycles.
- **Single rerun queue**: At most one rerun is queued during an active run, preventing unbounded test pileup from rapid editing.
- **Settle delay**: 2-second debounce prevents triggering on partial saves / auto-formatting cascades.
- **Graceful degradation**: If the assessment agent is unavailable (auth error, usage limit, stream error, parse failure), the system defaults to running the browser test rather than silently skipping.

## Files added/modified

| Area | Key files |
|------|-----------|
| Supervisor engine | `packages/supervisor/src/watch.ts` (687 lines, core service) |
| Supervisor exports | `packages/supervisor/src/index.ts` |
| CLI command | `apps/cli/src/commands/watch.ts`, `apps/cli/src/watch.ts` |
| TUI screen | `apps/cli/src/components/screens/watch-screen.tsx` (477 lines) |
| Navigation | `apps/cli/src/stores/use-navigation.ts` (mode discriminator) |
| Shared prompts | `packages/shared/src/prompts.ts` (assessment prompt builder) |
| Notifications | `apps/cli/src/utils/watch-notifications.ts` |
| Refactors | `apps/cli/src/index.tsx` → `apps/cli/src/program.tsx` (extracted program creation) |
| Refactors | `apps/cli/src/utils/run-test.ts` (extracted `executeHeadlessEffect` for reuse) |
| Refactors | `apps/cli/src/utils/resolve-changes-for.ts` (extracted from index.tsx) |
| Tests | `packages/supervisor/tests/watch.test.ts`, `apps/cli/tests/watch-notifications.test.ts`, `apps/cli/tests/placeholder.test.ts` |
