# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Hackathon MVP. The typed-problem → K2 lesson → tldraw playback path is wired end-to-end with a mock-lesson fallback. Image upload → problem extraction is live via [app/api/extract/route.ts](app/api/extract/route.ts) (Gemini 2.0 Flash). TTS narration is live via [app/api/tts/route.ts](app/api/tts/route.ts) (ElevenLabs Flash v2.5) and drives step advancement through [lib/use-step-narration.ts](lib/use-step-narration.ts) — `audio.ended` is the clock. **Voice interruption is live**: push-to-talk in [components/mic-button.tsx](components/mic-button.tsx) → STT via [app/api/stt/route.ts](app/api/stt/route.ts) (Deepgram REST) → branch generation via [app/api/branch/route.ts](app/api/branch/route.ts) (K2 Think) → additive-overlay branch playback via `playBranchStepOnTop` in [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) → resume via Continue button or one-shot voice "yes" in [lib/use-resume-voice-window.ts](lib/use-resume-voice-window.ts). The `notReady` service stubs in [lib/tutor-core.ts](lib/tutor-core.ts) are vestigial — real integrations live in the API routes and hooks instead.

**This is Next.js 15 / React 19** — APIs and conventions differ from older training data. When unsure about Next.js behavior, consult `node_modules/next/dist/docs/`. The dev server runs with Turbopack (`next.config.ts`).

## Commands

```bash
npm run dev        # Next.js dev server (App Router)
npm run build      # Production build
npm run start      # Production server (after build)
npm run lint       # ESLint (flat config in eslint.config.mjs)
```

No test runner is configured. The `scripts/` directory referenced in the PRD (`seed-cache.ts`, `spike-k2.ts`) does not exist yet.

## Environment

Currently consumed by the code:

```
K2_THINK_API_KEY       # required — bearer for K2 endpoint (lessons + branches)
K2_THINK_BASE_URL      # optional — defaults to https://openrouter.ai/api/v1
K2_THINK_MODEL         # optional — defaults to MBZUAI-IFM/K2-Think-v2
ELEVENLABS_API_KEY     # required for /api/tts — ElevenLabs Flash v2.5 narration
GEMINI_API_KEY         # required for /api/extract — Gemini 2.0 Flash image→problem extraction
DEEPGRAM_API_KEY       # required for /api/stt — Deepgram nova-2 REST transcription (powers voice interruption)
```

The OpenRouter/IFM-key guardrail in [lib/k2-lesson-service.ts](lib/k2-lesson-service.ts) (inside `callK2Chat`) — preserve that check. `FALLBACK_LLM_KEY` from the PRD is still not consumed; add it alongside the code that needs it, not speculatively.

## Architecture

### Current end-to-end flow

```
User types problem (or uploads a photo → /api/extract → problemText) in WhiteboardTutorShell
  → POST /api/lesson  { problemText }
  → generateLessonWithK2  (OpenAI-compatible chat/completions call)
  → extractJsonObject strips <think>…</think> and ``` fences, grabs last balanced {…}
  → lessonPlanSchema.parse  (Zod validates shape)
  → setLessonPlan in Zustand store bumps renderRevision
  → WhiteboardCanvas effect runs playLessonToBoard, animating step N's drawActions
  → in parallel, useStepNarration fetches /api/tts for step N's narration and plays it
  → on audio.ended, nextStep() advances the store; effect re-fires for step N+1
```

No SSE or streaming yet; `/api/lesson` returns the full plan in one JSON payload. The PRD's two-execution-path model (cached demo vs. live) still does not exist.

### Voice-interruption flow

```
Student presses-and-holds MicButton in the right panel
  → beginInterruption()  (lessonMode: "main" → "paused"; captures pauseState = {mainStepIndex, lastDrawnLabel})
  → useStepNarration sees mode change, aborts main TTS / audio
  → WhiteboardCanvas freezes (no resetBoard, no re-animate)
  → MediaRecorder captures audio (webm/opus)
  → on pointerup: POST /api/stt (Deepgram nova-2 REST) → {transcript, confidence}
    - if {error: "unclear"} → toast + "Resume lesson" button (cancelInterruption → mode "main", board rebuilds current step)
  → buildSnapshotFromEditor(editor, lastDrawnLabel) walks editor.getCurrentPageShapes() grouped by meta.semanticLabel
  → POST /api/branch  {problem, currentStepNarration, snapshot, lastDrawnLabel, question}
  → generateBranchWithK2 (callK2Chat helper) → branchPlanSchema.parse → BranchPlan {steps[1..3]}
  → setBranchPlan() (mode: "paused" → "branch", branchStepIndex=0)
  → WhiteboardCanvas branch effect calls playBranchStepOnTop(editor, branchPlan, branchStepIndex, {baseLabelMap=liveLabelMap})
    - additive overlay: highlight/arrow can target existing main-lesson labels
    - newly created shape IDs are pushed into branchShapeIds for cleanup
  → useStepNarration plays branch step's TTS; on audio.ended → advanceBranchStep()
  → after final branch step: enterAwaitingConfirm() (mode: "branch" → "awaiting_confirm")
  → Continue button OR useResumeVoiceWindow opens a 4s mic window matching /yes|yeah|sure|continue|go|ok|okay/
  → resumeMainLesson() (mode: "main", clears branchShapeIds, bumps renderRevision)
  → WhiteboardCanvas main effect re-fires: playLessonToBoard wipes board (kills branch shapes for free) and re-animates current main step from action 0
```

`lessonMode` is the single source of truth for the mode machine; everything else (mic disabled state, narration target, canvas effect path) keys off it.

### Source layout (what's real)

| File | Role |
|---|---|
| [lib/tutor-core.ts](lib/tutor-core.ts) | Zod schemas (`drawActionSchema`, `stepSchema`, `lessonPlanSchema`, `branchPlanSchema`), inferred types (incl. `LessonMode`), the `mockLessonPlan` seed, and service interfaces (`GeminiVisionService`, `ElevenLabsNarrationService`, `DeepgramTranscriptionService`) whose implementations throw `notReady`. |
| [lib/tutor-store.ts](lib/tutor-store.ts) | Zustand store: lesson state + the voice-interruption state machine (`lessonMode`, `pauseState`, `branchPlan`, `branchStepIndex`, `branchShapeIds`, `lastDrawnLabel`, `lastTranscript`, `isThinking`, `branchError`, live `editor` ref) and all transition actions. |
| [lib/k2-lesson-service.ts](lib/k2-lesson-service.ts) | K2 Think lesson client. Exports `callK2Chat` and `parseK2JsonOrThrow` shared helpers used by both lesson and branch services; `generateLessonWithK2` keeps the lesson-specific prompt + Zod validation. |
| [lib/k2-branch-service.ts](lib/k2-branch-service.ts) | Branch generation. `generateBranchWithK2({problem, currentStepNarration, snapshot, lastDrawnLabel, question})` calls K2 with the branch prompt and validates against `branchPlanSchema`. The branch prompt strongly biases toward `highlight`/`arrow` references over new shapes and forbids `erase` of main-lesson labels. |
| [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) | tldraw bridge. `playLessonToBoard` (full rebuild, animated), `renderLessonToBoard` (instant), `playBranchStepOnTop` (additive overlay using a base `LabelMap`, returns `newShapeIds`), `buildBoardSnapshot` and `buildSnapshotFromEditor` (LLM-readable text snapshot of the live board, marks `<- last drawn`), `eraseShapeIds`. Maintains a `LabelMap: semanticLabel → TLShapeId[]`. |
| [components/whiteboard-canvas.tsx](components/whiteboard-canvas.tsx) | Mounts `<Tldraw>`, pushes the `Editor` into the store on mount, runs two effects: a main effect (mode `main`/`paused`) that calls `playLessonToBoard` or freezes; a branch effect (mode `branch`) that calls `playBranchStepOnTop` and pushes returned `newShapeIds` into the store. Also derives `lastDrawnLabel` from the live `activeActionId` and pushes it to the store. |
| [components/mic-button.tsx](components/mic-button.tsx) | Push-to-talk. Pointerdown → `beginInterruption()` + `MediaRecorder` start. Pointerup → POST blob to `/api/stt` → on success build snapshot and POST to `/api/branch` → `setBranchPlan()`. Renders an inline "Resume lesson" button if STT/branch fails. Disabled during `branch`/`awaiting_confirm`. |
| [lib/use-resume-voice-window.ts](lib/use-resume-voice-window.ts) | Hook. When `lessonMode === "awaiting_confirm"` opens a 4-second mic window, posts to `/api/stt`, and calls `resumeMainLesson()` if the transcript matches `/yes\|yeah\|yep\|sure\|continue\|go\|ok\|okay\|please/i`. Bonus polish — Continue button is the primary path. |
| [app/api/tts/route.ts](app/api/tts/route.ts) | POST `{ text, voiceId? }` → `audio/mpeg` via ElevenLabs Flash v2.5. Module-scoped sha1-keyed cache; `runtime = "nodejs"`. |
| [app/api/extract/route.ts](app/api/extract/route.ts) | POST multipart `image` → `{ problemText }` or `{ error: "not_math" }` via Gemini 2.0 Flash with `responseSchema`. |
| [app/api/stt/route.ts](app/api/stt/route.ts) | POST multipart `audio` → forwards to Deepgram REST `/v1/listen?model=nova-2&smart_format=true`. Returns `{transcript, confidence}` or `{error: "unclear"}` when transcript empty / confidence < 0.4. `runtime = "nodejs"`. |
| [app/api/branch/route.ts](app/api/branch/route.ts) | POST `{problem, currentStepNarration, snapshot, lastDrawnLabel, question}` → `generateBranchWithK2` → `BranchPlan` JSON. |
| [lib/use-step-narration.ts](lib/use-step-narration.ts) | Client hook. Mode-aware: in `main` plays main-step TTS and advances on `audio.ended`; in `branch` plays branch-step TTS and calls `advanceBranchStep()`; in `paused`/`awaiting_confirm` aborts and stays silent. Guards `audio.ended` callbacks against stale modes. |
| [components/whiteboard-tutor-shell.tsx](components/whiteboard-tutor-shell.tsx) | Three-pane UI: input panel, whiteboard, lesson/transcript panel. Mounts `<MicButton/>`, `useStepNarration()`, `useResumeVoiceWindow()`, and the Continue/End UI for `awaiting_confirm`. |
| [app/api/lesson/route.ts](app/api/lesson/route.ts) | Single POST handler. Validates body, calls `generateLessonWithK2`, returns JSON. Not streaming. |
| [app/page.tsx](app/page.tsx), [app/layout.tsx](app/layout.tsx) | Minimal App Router shell. |
| `app/api/question/`, `app/api/correct/`, `app/api/analyze/` | Empty stub directories — no `route.ts` exists yet. Do not reference them until implemented. |

### DrawAction model

Eleven action shapes live in [lib/tutor-core.ts](lib/tutor-core.ts):

- `create_shape` with `kind` ∈ `text | rect | ellipse | line`
- `highlight` — wraps a semi-transparent yellow rect around shapes matched by `targetLabel`
- `arrow` — connects `fromLabel` → `toLabel` centers
- `erase` — deletes every shape under each `targetLabels` entry
- `axes` — draws a coordinate system (axes, ticks, labels) and stores an `AxesTransform` in `RenderContext.axesMap[semanticLabel]`; fields: `x, y, width, height, xMin, xMax, yMin, yMax`, optional `xLabel, yLabel`. Emits multiple sub-shapes all mapped under the same `semanticLabel` in `LabelMap` so a single `erase` clears the whole coord system.
- `plot_function` — samples a polynomial and draws a polyline curve; fields: `axesLabel, expression`, optional `xMin, xMax, samples, color`. Requires a prior `axes` action with matching `axesLabel`.
- `tangent_line` — draws a tangent segment at `x=a`; fields: `axesLabel, expression, x`, optional `length` (math-domain, default 4), `color` (default "red"). Slope computed via `derivativePolynomial`.
- `point` — places a filled dot + optional text label at `(a, f(a))`; fields: `axesLabel, expression, x`, optional `label`.

Every action carries a `semanticLabel`. The renderer uses it both as a key in `LabelMap` (many shapes may share a label) **and** as the input to `createShapeId(...)` — so duplicate `semanticLabel`s across `create_shape` actions collide on tldraw shape IDs. Keep labels unique per create; re-use them only in highlight/arrow/erase references.

For the four calculus actions, `axes` must appear before any `plot_function`, `tangent_line`, or `point` action that references its `semanticLabel`. Sub-shapes from `axes` use derived IDs (e.g. `${semanticLabel}__xaxis`, `${semanticLabel}__xtick_0`) to avoid collisions while still being grouped under the parent label in `LabelMap`.

The polynomial evaluator lives in [lib/poly-math.ts](lib/poly-math.ts) (`parsePolynomial`, `evaluatePolynomial`, `derivativePolynomial`). Hard limit: polynomial degree ≤ 4 (`MAX_DEGREE`). Unsupported expressions throw and the renderer pushes a warning — the rest of the lesson still plays.

**Composite actions that emit multiple shapes** (e.g. a hypothetical `axes` action emitting axis lines + ticks + axis-label texts) must keep shape IDs and LabelMap keys decoupled: derive a unique tldraw ID per sub-shape (e.g. `createShapeId(\`${semanticLabel}__xtick_${i}\`)`), but append *all* of those IDs into `labelMap[semanticLabel]` via `appendLabel` so a single `erase` on the action's `semanticLabel` clears the whole group. Don't try to re-use one `semanticLabel` as-is across multiple `createShapes` calls — the second call will silently drop on ID collision.

Coordinates are tldraw page coords. The K2 prompt currently constrains x∈[120, 560], y∈[80, 340] to stay inside a sensible frame — if you widen that range, update the prompt in [lib/k2-lesson-service.ts:81-86](lib/k2-lesson-service.ts#L81-L86) too.

**Derivative lesson layout convention (wipe-and-draw):** the K2 prompt splits derivative lessons into two phases. Phase 1 (steps 1-4) stacks symbolic narration text on the left column at fixed y-coordinates (80, 115, 160, 205+, 295). Phase 2 (step 5) begins with an `erase` action targeting every Phase-1 label, then draws axes + curve + tangents on the full canvas. This prevents narration text and graph shapes from ever occupying the same space. If you add more calculus problem types, follow the same two-phase erase pattern.

### Re-render model

Every mutation that should repaint the board bumps `renderRevision` in the store. `WhiteboardCanvas` watches both `currentStepIndex` and `renderRevision`; on each change it calls `resetBoard` (deletes everything), replays steps `0..currentStepIndex-1` instantly, then animates the current step's actions. **This is a full rebuild per step — it's intentional for correctness, not a perf bug.** Don't try to diff.

The effect creates an `AbortController` and aborts on unmount/change; long delays in `playLessonToBoard` honor the signal via `wait(ms, signal)`. Preserve that when editing the player.

### K2 response parsing

K2-Think v2 emits reasoning inside `<think>…</think>` plus occasional markdown fences. `extractJsonObject` handles both: drop everything up to the last `</think>`, try fenced ```json blocks, fall back to the last balanced `{…}` object in the string. When debugging malformed lessons, log the raw `rawContent` *before* `extractJsonObject`, not after.

## Constraints worth knowing

- **Subject scope:** high-school algebra (quadratics, linear equations, systems).
- **Path alias:** `@/*` → repo root. Use it; don't write relative `../../` paths.
- **Styling:** Tailwind v4 (`@tailwindcss/postcss`). Global styles in [app/globals.css](app/globals.css).
- **Client boundary:** everything under `components/` is `"use client"` because tldraw and Zustand both require it. API handlers and `lib/k2-lesson-service.ts` must stay server-only (they read `process.env` secrets).
- **Git remote:** `https://github.com/HethavGopal/AI-Whiteboard-Tutor`.

## When extending

- Adding a new `DrawAction` variant: update the Zod union in [lib/tutor-core.ts](lib/tutor-core.ts), add a handler in the `applyAction` switch in [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts), and document it in the K2 prompt's "Allowed draw action types" section. Miss any of the three and you get validation errors, silent drops, or hallucinated actions.
- Wiring up vision/TTS/STT: the interfaces in `tutor-core.ts` are the contract. Replace each `notReady` stub with a real implementation rather than introducing a parallel module.
