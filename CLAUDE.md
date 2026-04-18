# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Hackathon MVP. The typed-problem → OpenAI lesson → tldraw playback path is wired end-to-end with a mock-lesson fallback. Image upload → problem extraction is live via [app/api/extract/route.ts](app/api/extract/route.ts) (Gemini 2.0 Flash). TTS narration is live via [app/api/tts/route.ts](app/api/tts/route.ts) (ElevenLabs Flash v2.5) and drives step advancement through [lib/use-step-narration.ts](lib/use-step-narration.ts) — `audio.ended` is the clock. Live transcription (STT) is still out of MVP scope. The `notReady` service stubs in [lib/tutor-core.ts](lib/tutor-core.ts) are vestigial — the real integrations live in the API routes and hook instead.

**This is Next.js 15 / React 19** — APIs and conventions differ from older training data. When unsure about Next.js behavior, consult `node_modules/next/dist/docs/`. The dev server runs with Turbopack (`next.config.ts`).

## Commands

```bash
npm run dev        # Next.js dev server (App Router)
npm run build      # Production build
npm run lint       # ESLint (flat config in eslint.config.mjs)
```

No test runner is configured. The `scripts/` directory referenced in the PRD (`seed-cache.ts`, `spike-k2.ts`) does not exist yet.

## Environment

Currently consumed by the code:

```
OPENAI_API_KEY         # required — bearer for OpenAI chat/completions
OPENAI_MODEL           # optional — defaults to gpt-4o
OPENAI_BASE_URL        # optional — defaults to https://api.openai.com/v1
ELEVENLABS_API_KEY     # required for /api/tts — ElevenLabs Flash v2.5 narration
GEMINI_API_KEY         # required for /api/extract — Gemini 2.0 Flash image→problem extraction
```

`DEEPGRAM_API_KEY` and `FALLBACK_LLM_KEY` from the PRD are still not consumed (STT / fallback LLM are out of MVP scope). Add them alongside the code that needs them, not speculatively.

## Architecture

### Current end-to-end flow

```
User types problem (or uploads a photo → /api/extract → problemText) in WhiteboardTutorShell
  → POST /api/lesson  { problemText }
  → generateLesson  (OpenAI chat/completions with response_format: json_object)
  → JSON.parse on the guaranteed-JSON response content
  → lessonPlanSchema.parse  (Zod validates shape)
  → setLessonPlan in Zustand store bumps renderRevision
  → WhiteboardCanvas effect runs playLessonToBoard, animating step N's drawActions
  → in parallel, useStepNarration fetches /api/tts for step N's narration and plays it
  → on audio.ended, nextStep() advances the store; effect re-fires for step N+1
```

No SSE or streaming yet; `/api/lesson` returns the full plan in one JSON payload. STT and the PRD's two-execution-path model (cached demo vs. live) still do not exist.

### Source layout (what's real)

| File | Role |
|---|---|
| [lib/tutor-core.ts](lib/tutor-core.ts) | Zod schemas (`drawActionSchema`, `stepSchema`, `lessonPlanSchema`), inferred types, the `mockLessonPlan` seed, and service interfaces (`GeminiVisionService`, `ElevenLabsNarrationService`, `DeepgramTranscriptionService`) whose implementations currently throw `notReady`. |
| [lib/tutor-store.ts](lib/tutor-store.ts) | Zustand store: `problemInput`, `lessonPlan`, `currentStepIndex`, `renderRevision`, `appMode`, `recordingState`, `narrationState`, step-nav actions. |
| [lib/openai-lesson-service.ts](lib/openai-lesson-service.ts) | OpenAI client. Builds the JSON-only prompt, calls chat/completions with `response_format: json_object`, validates with Zod. |
| [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) | tldraw bridge. Translates `DrawAction`s into tldraw shape creates/deletes. `playLessonToBoard` is the animated player; `renderLessonToBoard` is the instant variant. Maintains a `LabelMap: semanticLabel → TLShapeId[]` so later actions (highlight/arrow/erase) can reference earlier shapes by name. |
| [components/whiteboard-canvas.tsx](components/whiteboard-canvas.tsx) | Mounts `<Tldraw>`, captures the `Editor` ref, re-runs `playLessonToBoard` whenever `currentStepIndex` or `renderRevision` changes. Exposes an optional `onStepPlaybackComplete` draw-end callback, but the shell no longer passes it — `useStepNarration` drives advancement via `audio.ended` instead. |
| [app/api/tts/route.ts](app/api/tts/route.ts) | POST `{ text, voiceId? }` → `audio/mpeg` via ElevenLabs Flash v2.5. Module-scoped sha1-keyed cache; `runtime = "nodejs"`. |
| [app/api/extract/route.ts](app/api/extract/route.ts) | POST multipart `image` → `{ problemText }` or `{ error: "not_math" }` via Gemini 2.0 Flash with `responseSchema`. |
| [lib/use-step-narration.ts](lib/use-step-narration.ts) | Client hook. Fetches `/api/tts` for the current step, plays audio, calls `nextStep()` on `audio.ended`. Owns the step clock. |
| [components/whiteboard-tutor-shell.tsx](components/whiteboard-tutor-shell.tsx) | Three-pane UI: input panel, whiteboard, step/transcript panel. Calls `/api/lesson`. |
| [app/api/lesson/route.ts](app/api/lesson/route.ts) | Single POST handler. Validates body, calls `generateLesson`, returns JSON. Not streaming. |
| [app/page.tsx](app/page.tsx), [app/layout.tsx](app/layout.tsx) | Minimal App Router shell. |

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

Coordinates are tldraw page coords. The prompt constrains x∈[120, 560], y∈[60, 500]. If you widen that range, update the prompt in [lib/openai-lesson-service.ts](lib/openai-lesson-service.ts) too (the "SPACING RULES" block and coordinate constraints section).

**Derivative lesson layout convention (wipe-and-draw):** the prompt splits derivative lessons into two phases. Phase 1 (steps 1-4) stacks symbolic narration text on the left column at fixed y-coordinates (80, 125, 175, 225+45×i, 360) with 45px spacing. Phase 2 (step 5) begins with an `erase` action targeting every Phase-1 label, then draws axes + curve + tangents on the full canvas. This prevents narration text and graph shapes from ever occupying the same space. If you add more calculus problem types, follow the same two-phase erase pattern.

### Re-render model

Every mutation that should repaint the board bumps `renderRevision` in the store. `WhiteboardCanvas` watches both `currentStepIndex` and `renderRevision`; on each change it calls `resetBoard` (deletes everything), replays steps `0..currentStepIndex-1` instantly, then animates the current step's actions. **This is a full rebuild per step — it's intentional for correctness, not a perf bug.** Don't try to diff.

The effect creates an `AbortController` and aborts on unmount/change; long delays in `playLessonToBoard` honor the signal via `wait(ms, signal)`. Preserve that when editing the player.

### OpenAI response parsing

`response_format: { type: "json_object" }` is passed on every request, so OpenAI always returns a valid JSON string directly in `choices[0].message.content`. No think-block stripping or fence extraction is needed — the content is fed straight to `JSON.parse`. When debugging malformed lessons, log the raw `rawContent` from the API response before parsing.

## Constraints worth knowing

- **Subject scope:** high-school algebra (quadratics, linear equations, systems).
- **Path alias:** `@/*` → repo root. Use it; don't write relative `../../` paths.
- **Styling:** Tailwind v4 (`@tailwindcss/postcss`). Global styles in [app/globals.css](app/globals.css).
- **Client boundary:** everything under `components/` is `"use client"` because tldraw and Zustand both require it. API handlers and `lib/openai-lesson-service.ts` must stay server-only (they read `process.env` secrets).
- **Git remote:** `https://github.com/HethavGopal/AI-Whiteboard-Tutor`.

## When extending

- Adding a new `DrawAction` variant: update the Zod union in [lib/tutor-core.ts](lib/tutor-core.ts), add a handler in the `applyAction` switch in [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts), and document it in the prompt's "Allowed draw action types" section in [lib/openai-lesson-service.ts](lib/openai-lesson-service.ts). Miss any of the three and you get validation errors, silent drops, or hallucinated actions.
- Wiring up vision/TTS/STT: the interfaces in `tutor-core.ts` are the contract. Replace each `notReady` stub with a real implementation rather than introducing a parallel module.
