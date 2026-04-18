# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Hackathon MVP. The typed-problem → K2 lesson → tldraw playback path is wired end-to-end with a mock-lesson fallback. Image upload → problem extraction is live via [app/api/extract/route.ts](app/api/extract/route.ts) (Gemini 2.0 Flash). TTS narration is live via [app/api/tts/route.ts](app/api/tts/route.ts) (ElevenLabs Flash v2.5) and drives step advancement through [lib/use-step-narration.ts](lib/use-step-narration.ts) — `audio.ended` is the clock. Live transcription (STT) is still out of MVP scope. The `notReady` service stubs in [lib/tutor-core.ts](lib/tutor-core.ts) are vestigial — the real integrations live in the API routes and hook instead.

Also read [AGENTS.md](AGENTS.md): **this is Next.js 15 / React 19** — APIs and conventions differ from older training data. When unsure, consult `node_modules/next/dist/docs/`.

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
K2_THINK_API_KEY       # required — bearer for K2 endpoint
K2_THINK_BASE_URL      # optional — defaults to https://openrouter.ai/api/v1
K2_THINK_MODEL         # optional — defaults to MBZUAI-IFM/K2-Think-v2
ELEVENLABS_API_KEY     # required for /api/tts — ElevenLabs Flash v2.5 narration
GEMINI_API_KEY         # required for /api/extract — Gemini 2.0 Flash image→problem extraction
```

[lib/k2-lesson-service.ts:186](lib/k2-lesson-service.ts#L186) guards against the common misconfiguration of pointing `K2_THINK_BASE_URL` at OpenRouter while using an IFM-prefixed key — preserve that check.

`DEEPGRAM_API_KEY` and `FALLBACK_LLM_KEY` from the PRD are still not consumed (STT / fallback LLM are out of MVP scope). Add them alongside the code that needs them, not speculatively.

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

No SSE or streaming yet; `/api/lesson` returns the full plan in one JSON payload. STT and the PRD's two-execution-path model (cached demo vs. live) still do not exist.

### Source layout (what's real)

| File | Role |
|---|---|
| [lib/tutor-core.ts](lib/tutor-core.ts) | Zod schemas (`drawActionSchema`, `stepSchema`, `lessonPlanSchema`), inferred types, the `mockLessonPlan` seed, and service interfaces (`GeminiVisionService`, `ElevenLabsNarrationService`, `DeepgramTranscriptionService`) whose implementations currently throw `notReady`. |
| [lib/tutor-store.ts](lib/tutor-store.ts) | Zustand store: `problemInput`, `lessonPlan`, `currentStepIndex`, `renderRevision`, `appMode`, `recordingState`, `narrationState`, step-nav actions. |
| [lib/k2-lesson-service.ts](lib/k2-lesson-service.ts) | K2 Think client. Builds the JSON-only prompt, calls chat/completions, extracts JSON from reasoning output, validates with Zod. |
| [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) | tldraw bridge. Translates `DrawAction`s into tldraw shape creates/deletes. `playLessonToBoard` is the animated player; `renderLessonToBoard` is the instant variant. Maintains a `LabelMap: semanticLabel → TLShapeId[]` so later actions (highlight/arrow/erase) can reference earlier shapes by name. |
| [components/whiteboard-canvas.tsx](components/whiteboard-canvas.tsx) | Mounts `<Tldraw>`, captures the `Editor` ref, re-runs `playLessonToBoard` whenever `currentStepIndex` or `renderRevision` changes. Exposes an optional `onStepPlaybackComplete` draw-end callback, but the shell no longer passes it — `useStepNarration` drives advancement via `audio.ended` instead. |
| [app/api/tts/route.ts](app/api/tts/route.ts) | POST `{ text, voiceId? }` → `audio/mpeg` via ElevenLabs Flash v2.5. Module-scoped sha1-keyed cache; `runtime = "nodejs"`. |
| [app/api/extract/route.ts](app/api/extract/route.ts) | POST multipart `image` → `{ problemText }` or `{ error: "not_math" }` via Gemini 2.0 Flash with `responseSchema`. |
| [lib/use-step-narration.ts](lib/use-step-narration.ts) | Client hook. Fetches `/api/tts` for the current step, plays audio, calls `nextStep()` on `audio.ended`. Owns the step clock. |
| [components/whiteboard-tutor-shell.tsx](components/whiteboard-tutor-shell.tsx) | Three-pane UI: input panel, whiteboard, step/transcript panel. Calls `/api/lesson`. |
| [app/api/lesson/route.ts](app/api/lesson/route.ts) | Single POST handler. Validates body, calls `generateLessonWithK2`, returns JSON. Not streaming. |
| [app/page.tsx](app/page.tsx), [app/layout.tsx](app/layout.tsx) | Minimal App Router shell. |

### DrawAction model

Seven action shapes live in [lib/tutor-core.ts](lib/tutor-core.ts):

- `create_shape` with `kind` ∈ `text | rect | ellipse | line`
- `highlight` — wraps a semi-transparent yellow rect around shapes matched by `targetLabel`
- `arrow` — connects `fromLabel` → `toLabel` centers
- `erase` — deletes every shape under each `targetLabels` entry

Every action carries a `semanticLabel`. The renderer uses it both as a key in `LabelMap` (many shapes may share a label) **and** as the input to `createShapeId(...)` — so duplicate `semanticLabel`s across `create_shape` actions collide on tldraw shape IDs. Keep labels unique per create; re-use them only in highlight/arrow/erase references.

Coordinates are tldraw page coords. The K2 prompt currently constrains x∈[120, 560], y∈[80, 340] to stay inside a sensible frame — if you widen that range, update the prompt in [lib/k2-lesson-service.ts:81-86](lib/k2-lesson-service.ts#L81-L86) too.

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
