# AI Whiteboard Tutor — MVP Work Split (updated after teammate's push)

## Context

48-hour hackathon, two-person team. Sprint scope: **MVP only** — image → animated whiteboard + TTS narration. No interruption, no demo cache, no STT.

Teammate (Hethav) pushed commit `1067ee4 tldraw brdige done` — this built **far more than the declared "bridge + /api/lesson"**. The display/orchestration stack is essentially complete; your remaining scope is narrower and audio-focused.

---

## What teammate already shipped (DO NOT touch)

| File | Purpose |
|---|---|
| [lib/tutor-core.ts](lib/tutor-core.ts) | All Zod schemas (`drawActionSchema`, `stepSchema`, `lessonPlanSchema`), service interfaces (`GeminiVisionService`, `K2LessonService`, `ElevenLabsNarrationService`), a 5-step mock lesson, type exports |
| [lib/tutor-store.ts](lib/tutor-store.ts) | Zustand store: `problemInput`, `lessonPlan`, `currentStepIndex`, `renderRevision`, `appMode`, `recordingState`, `narrationState` + actions |
| [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) | `playLessonToBoard(editor, plan, stepIdx, opts)` — draws one step with 550ms action stagger, abort signals, label-map tracking, warnings, zoom-to-fit |
| [lib/k2-lesson-service.ts](lib/k2-lesson-service.ts) | `generateLessonWithK2({problemText})` — OpenRouter-hosted K2 Think v2, `<think>` stripping, JSON extraction, schema validation |
| [app/api/lesson/route.ts](app/api/lesson/route.ts) | `POST { problemText } → LessonPlan` (plain JSON, **not SSE**) |
| [components/whiteboard-canvas.tsx](components/whiteboard-canvas.tsx) | tldraw wrapper, auto-renders on `currentStepIndex`/`renderRevision` change, calls `onStepPlaybackComplete` when draw animation ends |
| [components/whiteboard-tutor-shell.tsx](components/whiteboard-tutor-shell.tsx) | Full UI: textarea + Generate button + step navigation + inline captions + "Load mock lesson" button |
| [app/page.tsx](app/page.tsx) | Wires `WhiteboardTutorShell` |

**Consequence:** your plan's `lib/store.ts`, `lib/player.ts`, `components/Whiteboard.tsx`, `components/Captions.tsx`, and `app/page.tsx` items are all obsolete. They exist, written by teammate.

---

## Critical architectural issue

[components/whiteboard-canvas.tsx:63-69](components/whiteboard-canvas.tsx#L63-L69) auto-advances `nextStep` as soon as the **draw animation** finishes (550ms × N actions). This **violates PRD §6.3** ("audio.ended gates advance"). When you add TTS, audio must become the clock.

**Decision (recommended):** in [whiteboard-tutor-shell.tsx:217](components/whiteboard-tutor-shell.tsx#L217), stop passing `onStepPlaybackComplete={nextStep}`. Drive `nextStep` from your new `useStepNarration` hook instead, on `audio.ended`. This is a one-line edit to teammate's file; negotiate or just do it.

---

## Your remaining scope

### 1. Install dependencies

```bash
npm install @google/generative-ai @anthropic-ai/sdk
```

(No ElevenLabs SDK — use `fetch`. No Deepgram yet — interruption is out of MVP scope. No `katex` — teammate's K2 prompt emits plain text for equations.)

### 2. `.env.local` (create)

```
K2_THINK_API_KEY=...
K2_THINK_BASE_URL=https://openrouter.ai/api/v1   # optional, matches k2-lesson-service default
K2_THINK_MODEL=MBZUAI-IFM/K2-Think-v2            # optional, matches default
ELEVENLABS_API_KEY=...
GEMINI_API_KEY=...                               # if using Gemini for vision
ANTHROPIC_API_KEY=...                            # if using Claude Sonnet vision instead
```

Update [CLAUDE.md](CLAUDE.md)'s Environment Variables section — it still lists obsolete `VISION_API_KEY` / `FALLBACK_LLM_KEY`.

### 3. `app/api/tts/route.ts` (NEW)

- `POST { text: string, voiceId?: string } → audio/mpeg` via ElevenLabs Flash v2.5 REST (`https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream?output_format=mp3_44100_128`).
- In-memory `Map<sha1(text), ArrayBuffer>` cache keyed by text (survives module lifetime, good enough for dev).
- On error: return 500 with `{ error: string }`.

### 4. `lib/use-step-narration.ts` (NEW hook)

Consumed by `WhiteboardTutorShell`. Responsibilities:

- Watches `currentStepIndex` + `lessonPlan` from the store.
- On change: `POST /api/tts` with `step.narration` → `new Audio(blobUrl)` → `audio.play()`.
- `audio.addEventListener('ended', () => store.nextStep())` — this is the step-advance clock.
- Exposes `{ narrationState: 'idle'|'loading'|'playing', stop() }`.
- Aborts in-flight fetch + pauses audio on unmount or step change.
- **Lookahead (optional polish):** when step N starts playing, prefetch step N+1 TTS in the background.

### 5. `app/api/extract/route.ts` (NEW)

- `POST` multipart image → `{ problemText: string }` or `{ error: 'not_math' }`.
- Use Gemini 2.5 Flash with `responseSchema` (structured output), OR Claude Sonnet 4.6 vision with tool-use JSON forcing. Pick whichever key you already have.
- Prompt (terse): *"Extract the math problem as plain text. Return `{problemText}`. If the image contains no math, return `{error:'not_math'}`."*

### 6. Upload UI in the existing shell

Edit [components/whiteboard-tutor-shell.tsx:140-159](components/whiteboard-tutor-shell.tsx#L140-L159) — add `<input type="file" accept="image/*" capture="environment">` below the textarea. On file select:
1. `POST /api/extract` → `problemText`.
2. Call the existing `setProblemInput(problemText)` + `handleGenerateLesson()` (which already hits `/api/lesson`).

Do NOT build a separate `UploadButton` component; inline it in the shell to avoid churn.

### 7. Wire audio as the clock

At [whiteboard-tutor-shell.tsx:217](components/whiteboard-tutor-shell.tsx#L217), change:
```tsx
onStepPlaybackComplete={nextStep}
```
to:
```tsx
// onStepPlaybackComplete omitted — audio drives step advancement via useStepNarration
```
Then call `useStepNarration()` at the top of the shell component body.

---

## Integration checkpoints

| Checkpoint | Verify |
|---|---|
| `npm install` succeeds; `npm run dev` loads the existing "Load mock lesson" flow | You see the 5-step mock playing on the tldraw canvas with manual Next/Previous |
| `/api/tts` returns an MP3 when POSTed `{text: "hello"}` | `curl` or fetch from DevTools; play in the browser |
| `useStepNarration` drives auto-advance | Load mock lesson → each step plays audio → advances when `audio.ended` fires, not on 550ms draw stagger |
| `/api/extract` returns `problemText` from a real photo | Upload a clean shot of `2x² + 7x + 3 = 0`; expect `{problemText: "2x^2 + 7x + 3 = 0"}` or similar |
| End-to-end | Phone → upload photo → lesson generates (3–8s) → each step animates + narrates → auto-advances on audio end |

---

## Critical files (status after teammate's push)

| File | Who | Status |
|---|---|---|
| [lib/tutor-core.ts](lib/tutor-core.ts) | Teammate | ✅ Done |
| [lib/tutor-store.ts](lib/tutor-store.ts) | Teammate | ✅ Done |
| [lib/whiteboard-renderer.ts](lib/whiteboard-renderer.ts) | Teammate | ✅ Done |
| [lib/k2-lesson-service.ts](lib/k2-lesson-service.ts) | Teammate | ✅ Done |
| [app/api/lesson/route.ts](app/api/lesson/route.ts) | Teammate | ✅ Done |
| [components/whiteboard-canvas.tsx](components/whiteboard-canvas.tsx) | Teammate | ✅ Done |
| [components/whiteboard-tutor-shell.tsx](components/whiteboard-tutor-shell.tsx) | Teammate | ✅ Done (you make 1 edit: drop `onStepPlaybackComplete`, add `useStepNarration` hook call) |
| [app/api/tts/route.ts](app/api/tts/route.ts) | You | Not started |
| [lib/use-step-narration.ts](lib/use-step-narration.ts) | You | Not started |
| [app/api/extract/route.ts](app/api/extract/route.ts) | You | Not started |
| [.env.local](.env.local) | You | Not started |

---

## Risks

- **Teammate's canvas auto-advance fights your audio clock.** Mitigation: drop `onStepPlaybackComplete` prop (see §7 above). If teammate pushes it back, use `Math.max(drawEnd, audioEnd)` gating inside `useStepNarration` instead.
- **ElevenLabs first-byte latency ≥ draw animation length.** Acceptable for MVP — audio just starts slightly after draw. Polish with step-N+1 prefetch later.
- **Vision returns garbage for a non-math photo.** Handle `{error:'not_math'}` in the upload onChange — show a simple inline error above the textarea.
- **Env var drift between CLAUDE.md and actual code.** Fix CLAUDE.md's env section while you're there; don't let future-you get burned.
- **Equation rendering looks bad (no LaTeX).** Accepted trade-off — K2 emits plain text. If time permits post-MVP, add a `kind:"latex"` variant to `drawActionSchema` + KaTeX rendering in `whiteboard-renderer.ts` — but that's a teammate-side change.
