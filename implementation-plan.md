# AI Whiteboard Tutor — Implementation Plan (48-hour Sprint)

## Context

The repo currently contains only `PRD-trial-1.md` and `PRD-trial-2.md` — no code. This plan turns PRD v2.0 into a concrete build sequence for a Next.js 15 + tldraw + SSE app that ships the §Appendix A demo: photo → animated whiteboard + narration → mid-lesson voice interruption → branch explanation → resume.

The guiding constraint from the PRD is §1.5 **"Ship the magic, not the architecture."** Every phase below gates on a demoable deliverable; if a phase slips, scope is cut from the *next* phase, never from Rehearse & Freeze.

Two non-negotiables drive the architecture:
1. **Demo cache is the primary path** (§6.5). Live pipeline exists, but the judge sees cached plans + pre-generated MP3s.
2. **Sequential step-level sync** (§6.3). No audio-as-master-clock; `audio.ended` advances the step. Zero drift by construction.

---

## Repository Layout (to create in Phase 0)

```
/app
  /api
    /lesson/route.ts          # POST: image → SSE JSONL of Step objects
    /branch/route.ts          # POST: board state + question → SSE branch plan
    /tts/route.ts             # POST: {text, step_id} → mp3 (ElevenLabs proxy, cached by hash)
    /stt/route.ts             # WS-style proxy to Deepgram (or client-direct w/ signed token)
    /route-question/route.ts  # POST: question → cached-branch-id | null (K2 Think tiny prompt)
  /page.tsx                   # Main single-page UI
  /layout.tsx
/components
  Whiteboard.tsx              # tldraw wrapper, read-only, exposes imperative API
  UploadButton.tsx            # <input capture> + drag/drop
  MicButton.tsx               # push-to-talk
  Captions.tsx                # live narration text
  ErrorBoundary.tsx
/lib
  store.ts                    # Zustand: {problem, main_plan, branch_plan?, current_step_index, mode}
  player.ts                   # orchestrator: runs step loop, fires draw actions, plays audio
  tldrawBridge.ts             # draw_action → editor.createShapes/animateShape; shape registry by semantic_label
  katex.ts                    # latex → SVG string (sync)
  latexHash.ts                # normalize + hash LaTeX for cache lookup
  demoCache.ts                # client-side manifest loader + fuzzy matcher
  schemas.ts                  # zod: LessonPlan, Step, DrawAction, BranchPlan
  llm/k2think.ts              # OpenAI-compatible client, strips <think> traces
  llm/claudeVision.ts         # Anthropic SDK, vision extraction
  llm/prompts.ts              # system prompts for plan, branch, router
  sse.ts                      # server-side SSE writer + client-side JSONL reader
  audio.ts                    # cancellable audio player wrapper
/public
  /demo-cache
    manifest.json             # {latex_hash: filename}
    <hash>.json               # {lesson_plan, step_audio_urls, anticipated_branches}
    /audio/<hash>/step_N.mp3
    /audio/<hash>/branch_<qid>_N.mp3
/scripts
  seed-cache.ts               # Node script: for each demo problem, call live pipeline, save JSON + MP3s
```

Critical files to author first: `lib/schemas.ts`, `lib/store.ts`, `lib/player.ts`, `lib/tldrawBridge.ts`, `app/api/lesson/route.ts`.

---

## Core Data Contracts (authored in Phase 0, frozen before Phase 1)

```ts
// lib/schemas.ts
type DrawAction =
  | { op: "create_shape"; label: string; kind: "latex"|"text"|"rect"|"ellipse"|"line";
      latex?: string; text?: string; x: number; y: number; w?: number; h?: number; color?: string }
  | { op: "highlight"; target_label: string; color: "red"|"yellow"|"green" }
  | { op: "arrow"; from_label: string; to_label: string; label?: string }
  | { op: "erase"; target_label: string };

type Step = { id: string; narration_text: string; draw_actions: DrawAction[] };
type LessonPlan = { problem_latex: string; steps: Step[] };
type BranchPlan = { target_label: string; steps: Step[] };
```

Every shape created on the tldraw canvas carries `meta: { step_id, semantic_label }` — the `semantic_label` is the only handle the LLM uses to refer to existing shapes (§6.4). `tldrawBridge` maintains a `Map<semantic_label, tldrawShapeId>`.

---

## Phase 0 — Project bootstrap + risk spike (Hour 0–2)

**Deliverable:** `npm run dev` shows a Next.js page with tldraw canvas, and a standalone script has confirmed K2 Think streams clean JSON.

1. `npx create-next-app@latest` (App Router, TS, Tailwind).
2. Install: `@tldraw/tldraw`, `zustand`, `katex`, `zod`, `@anthropic-ai/sdk`, `openai` (for K2 Think's OpenAI-compatible endpoint), `@deepgram/sdk`.
3. Create `.env.local` with the 5 env vars from PRD §6.1.
4. **Risk spike (PRD §8 "Spike first"):** write `scripts/spike-k2.ts` that hits K2 Think with the lesson-plan system prompt for `2x² + 7x + 3 = 0` and streams the response. Verify:
   - JSONL comes out clean OR `<think>...</think>` prefix is present and strippable.
   - Build the `<think>` stripper in `lib/llm/k2think.ts` now so every downstream call is safe.
5. Render empty read-only tldraw canvas in `app/page.tsx`.

**Gate:** K2 Think returns parseable `Step` objects. If it doesn't after 1.5h, flip to `FALLBACK_LLM_KEY` (Claude Sonnet 4.6) for reasoning and continue.

---

## Phase 1 — Skeleton: end-to-end happy path (Hour 2–8)

**Deliverable (PRD §8 row 1):** upload photo → animated whiteboard + live ElevenLabs narration on one problem, non-interruptible.

### 1.1 Upload + vision extraction
- `UploadButton` uses `<input type="file" accept="image/*" capture="environment">`.
- `POST /api/lesson` receives multipart image, calls Claude Sonnet 4.6 vision with prompt: *"Extract the math problem. Return strict JSON: `{problem_type, latex, given, find}`. Refuse non-math with `{error:'not_math'}`."*
- On `not_math` or vision failure → client shows the retry UI with 3 example photos (FR-1.3, US-9).

### 1.2 Lesson plan generation (SSE JSONL)
- After vision extraction, the *same* `/api/lesson` route pipes the LaTeX into K2 Think with the lesson-plan system prompt. System prompt explicitly forbids `<think>` in output JSON; the server-side `k2think.ts` also strips it defensively.
- Stream responses as SSE: one `data: <Step JSON>\n\n` per completed step. End with `data: [DONE]`.
- Client `lib/sse.ts` reads the stream, zod-validates each Step, pushes to `store.main_plan.steps`.

### 1.3 tldraw bridge
- `tldrawBridge.apply(action)` maps each `DrawAction` to tldraw editor calls:
  - `create_shape` kind `latex`: render KaTeX → SVG data URL → `editor.createShape({ type:'image', props:{ url, w, h }, meta:{ step_id, semantic_label } })`.
  - `highlight`: look up shape id by label, `editor.animateShape(id, { props:{ color } }, { duration: 300 })`, plus a pulsing stroke.
  - `arrow`: `editor.createShape({ type:'arrow', ... })` bound to from/to shape ids.
  - `erase`: `editor.deleteShapes([id])`.
- Coordinates: the LLM emits abstract grid coords (x,y ∈ 0..1000 on an 800-tall canvas); bridge rescales to current viewport.

### 1.4 Player orchestrator
- `player.ts` runs the loop in §6.3:
  1. Fetch TTS for Step N (or read from `step_audio_urls` on cached path).
  2. Start `audio.play()` and simultaneously iterate `draw_actions` with ~150ms staggers.
  3. `audio.addEventListener('ended', () => advance(N+1))`.
- Lookahead: when Step N starts playing, kick off `fetch('/api/tts', Step N+1)` in the background (FR-4.2).
- Exposes: `start(plan)`, `stop()`, `pause()`, `resumeFromStep(i)`.

### 1.5 TTS proxy
- `/api/tts` POST `{text, voice_id?}` → ElevenLabs Flash v2.5 → MP3 blob. Cache by SHA1(text) under `/tmp` at runtime to avoid duplicate calls during dev.

**Gate:** hit the server from a phone, watch the quadratic animate with narration. If tldraw API friction eats >2h, swap to Excalidraw per §6.2 fallback.

---

## Phase 2 — Interruption loop (Hour 8–16)

**Deliverable (PRD §8 row 2):** PTT mic, streaming STT, `/api/branch`, highlight-existing-shape, "continue?" resume.

### 2.1 PTT mic
- `MicButton` uses `pointerdown`/`pointerup` (works on touch + mouse). On press:
  1. `player.pause()` → calls `audio.pause(); audio.src=''` (FR-5.2, <200ms target).
  2. Freeze remaining `draw_actions` in the current step.
  3. Capture `pause_state = { step_id, last_drawn_label }` from `tldrawBridge` (last shape inserted).
  4. Open `MediaRecorder` → stream to Deepgram.
- Mic is **disabled** while `mode === 'branch'` (FR-5.7).

### 2.2 STT
- Option A (preferred): client opens Deepgram WebSocket directly using a short-lived token minted by `/api/stt` (avoids proxying audio through Vercel function timeouts).
- On `pointerup`, finalize transcript. If empty or confidence < 0.4 → US-10 "I didn't catch that".

### 2.3 Board snapshot builder
- `lib/tldrawBridge.snapshot()` walks the shape registry in insertion order and emits the flat semantic text of PRD §6.4 (~150–250 tokens). Marks `← last drawn` next to `pause_state.last_drawn_label`.

### 2.4 `/api/branch`
- POST `{ snapshot, pause_state, user_question }` → K2 Think with branch system prompt (PRD §6.4 JSON example shape). Returns `BranchPlan` (strict JSON, no stream needed — branches are small).
- `player.playBranch(plan)`: runs same step loop; after last step, appends a synthetic Step whose narration is *"Want me to continue?"* and waits for voice answer.

### 2.5 Resume
- After "continue?" narration, re-enable mic for a single short STT window. If intent=yes (simple keyword match: "yes"/"yeah"/"sure"/"continue"), call `player.resumeFromStep(pause_state.step_id + 1)`. Otherwise show graceful end state (FR-5.6).

**Gate:** interrupt the live demo, get a contextually correct highlight+explanation, resume cleanly.

---

## Phase 3 — Demo cache (Hour 16–24)

**Deliverable (PRD §8 row 3):** 3 problems × 3 questions pre-baked, client-side match, router, cached path visually indistinguishable from live.

### 3.1 Seed script
- `scripts/seed-cache.ts`: for each of the 3 problems (PRD §6.5), call the *actual* live pipeline end-to-end, save the returned `LessonPlan`, pre-synthesize every step's MP3 via ElevenLabs, write `{hash}.json` + `/public/demo-cache/audio/{hash}/step_N.mp3`.
- For each problem, enumerate 3 anticipated questions (e.g. for quadratic: *"why did you split the middle term?"*, *"where did 4ac come from?"*, *"what's the discriminant?"*). Call `/api/branch` with a synthetic snapshot at the most likely pause point and persist each `BranchPlan` + its audio.
- Write `manifest.json`: `{ latex_hash: filename }` and, inside each file, `anticipated_branches: { question_hash: {branch_plan, audio_urls} }`.

### 3.2 Client lookup
- After vision extraction, `lib/latexHash.ts` normalizes (strip whitespace, canonicalize `^2` vs `**2`, lowercase, sort equality sides by convention) and SHA1s.
- On hit: skip `/api/lesson`, hydrate `store.main_plan` from the cached JSON, swap `tts` calls for static URLs. Time-to-first-stroke target <500ms (NFR §5).
- On miss: live path, unchanged.

### 3.3 Question router
- After STT finalizes, `POST /api/route-question` with `{question, candidates: [cached_questions_for_current_problem]}`. K2 Think prompt: *"Return the index of the best match or null."* ~200ms.
- Hit → swap `/api/branch` for cached branch + cached audio. Miss → live `/api/branch`.

**Gate:** toggle a `?live=1` query flag — the cached run and live run of the same problem should look identical to a third-party observer.

---

## Phase 4 — Polish (Hour 24–32)

- Typography: Inter via `next/font`, off-white canvas `#FAFAF7`, accent `indigo-600` (NFR §5).
- Loading states: skeleton during vision; mic ring pulse while recording; captions fade in/out.
- Non-math rejection UI (FR-1.3): 3 example photo thumbnails + "try again".
- Captions toggle (accessibility, NFR §5).
- Mobile QA on a real phone at 375px; portrait; one-thumb operation.
- Error boundary catches any tldraw exception → soft reset to idle.

---

## Phase 5 — Rehearse (Hour 32–42)

- Run the §Appendix A script 20+ times on the demo device.
- Add a 4th cached backup problem (systems of linear equations if time, else another quadratic).
- Fix every bug surfaced; log each failure mode and confirm graceful degradation.
- Stress test: toggle airplane mode mid-lesson; confirm cached path still completes.

---

## Phase 6 — Freeze (Hour 42–48)

- Code freeze; bug-fix-only branch.
- **Record backup video** of full demo running perfectly (PRD §8 Freeze row) — local screen recording + phone mic. If venue Wi-Fi dies, play the video and narrate live.
- Deploy final build to Vercel; verify from a cellular connection (not office Wi-Fi).

---

## Reused Libraries (nothing to invent)

| Library | Usage |
|---|---|
| `@tldraw/tldraw` | Hand-drawn look, `editor.createShape`, `editor.animateShape`, `meta` field for `semantic_label` |
| `katex` | `renderToString` → SVG data URL (synchronous, zero network) |
| `@deepgram/sdk` | `liveClient` for streaming STT |
| `openai` | K2 Think client via `baseURL: 'https://api.k2think.ai/v1'` (OpenAI-compatible) |
| `@anthropic-ai/sdk` | Claude Sonnet 4.6 vision extraction only |
| `zustand` | Flat session state store |
| `zod` | Schema validation of all LLM JSON output |
| `HTMLAudioElement` | Cancellable audio — `pause(); src=''` is sufficient (FR-4.3) |

---

## Verification Checklist

1. **Local dev happy path:** `npm run dev`, upload `2x² + 7x + 3 = 0` photo, watch full lesson play with narration.
2. **Interruption:** press mic at ~15s, say *"why did you split the middle term?"*, confirm audio stops <200ms, branch highlights `middle_split` within 2s (live) or 300ms (cached), answers "continue?", resumes from next step.
3. **Cached vs live parity:** run with `?live=1` on same problem; visually identical.
4. **Uncached problem:** upload a 4th problem the cache doesn't know; confirm live path completes (target <3s to first stroke).
5. **Failure modes:** upload a cat photo → friendly retry. Cover the mic → "I didn't catch that". Airplane-mode mid-lesson on cached path → still completes.
6. **Mobile:** test on actual phone at 375px portrait; PTT responds to touch; captions readable.

---

## Risks to Monitor During Build

| Risk | Mitigation |
|---|---|
| K2 Think `<think>` bleed-through | Stripper in `lib/llm/k2think.ts` — verify at hour 1 and re-verify after any prompt change |
| tldraw API surprises | 2h spike budgeted in Phase 0/1; Excalidraw is the known escape hatch |
| ElevenLabs outage | Cached MP3s make demo path immune; live path falls back to captions-only |
| Venue Wi-Fi failure | Demo cache + backup video recording in Phase 6 |
| K2 Think endpoint down | `FALLBACK_LLM_KEY` (Claude Sonnet 4.6) — one-line swap in API route |
