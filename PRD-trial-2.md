# Product Requirements Document: AI Whiteboard Tutor (MVP)

**Author:** Senior PM / Lead Engineer (post-audit)
**Date:** 2026-04-17
**Version:** 2.0 (Hackathon-Hardened)
**Status:** Build spec for 48-hour sprint
**Supersedes:** PRD v1.0

> **What changed from v1:** v1 described the right *product* but the wrong *build plan*. v2 keeps v1's strategic vision, user stories, and success criteria verbatim where they were sound, and replaces the architecture with a hackathon-pragmatic stack (tldraw, sequential sync, demo cache, SSE) that can actually ship by Sunday morning without sacrificing the "magic" of the demo.

---

## 1. Executive Summary & Value Proposition

### 1.1 Summary
**AI Whiteboard Tutor** is a conversational, visual-first AI learning tool that emulates a 1-on-1 human tutor at a whiteboard. Users photograph a problem; the AI responds with a synchronized animated whiteboard walkthrough and voice narration. Critically, users can **interrupt the explanation in real-time** with spoken questions, causing the tutor to pause, re-orient to the user's confusion, and branch the visual explanation.

### 1.2 Value Proposition
| Existing Solution | Gap | Our Wedge |
|---|---|---|
| ChatGPT / Claude (text) | Walls of LaTeX; no spatial reasoning | Visual, drawn-out steps |
| Khan Academy / YouTube | Static, pre-recorded; can't ask questions | Live, personalized, interruptible |
| Photomath | Gives answer, weak pedagogy | Teaches the *reasoning*, conversationally |
| Human tutor | Expensive, not on-demand | Free, instant, infinitely patient |

**Core insight:** Learning is a *dialogue*, not a download. The killer feature is not the drawing — it's the **interruption loop**.

### 1.3 North Star Metric (post-MVP)
% of sessions containing ≥1 user interruption that resolves successfully (proxy for engaged learning vs. passive consumption).

### 1.4 Hackathon Demo Goal
A judge uploads a photo of a quadratic equation, watches it animate, says *"Wait, where did the 4ac come from?"* mid-explanation, and within ~2 seconds sees the AI pause, circle the relevant term, and explain it. **That moment is the demo.**

### 1.5 The One Commandment
**Ship the magic, not the architecture.** Every scope decision below is evaluated against: *"Does this make the 2-minute demo more reliable or more magical?"* If neither — cut it.

---

## 2. Target Audience & Core Use Case

### 2.1 Target Persona (MVP)
**"Maya, 16 — High school sophomore, Algebra II student."** Studying alone at 10pm, stuck on homework. Parents can't help. Teacher unavailable. She has a phone, headphones, and 20 minutes of patience before she gives up.

### 2.2 Subject Matter Scope — MoSCoW

| Priority | Subject | Rationale |
|---|---|---|
| **Must Have** | High-school Algebra (quadratics via factoring and the formula; linear equations) | Tractable visuals, reliable LLM output, strong demo appeal |
| **Should Have** | Systems of 2 linear equations | Natural extension, animates well |
| **Could Have** | Pythagorean theorem on a pre-labeled triangle | Only if Day 2 is ahead of schedule |
| **Won't Have (MVP)** | Calculus, geometry proofs, physics, chemistry, word problems, handwritten cursive, multi-page problems | Out of 48-hour scope |

### 2.3 Core Use Case
A student uploads a photo of a single algebra problem, receives a 30–90 second animated whiteboard explanation with narration, and can interrupt once to ask a clarifying question.

---

## 3. User Stories (Interruption-Focused)

### 3.1 Primary Flow
- **US-1:** As a student, I can upload a photo of a math problem so I don't have to retype it.
- **US-2:** As a student, I see the AI draw and hear it narrate the solution, so it feels like a real teacher.
- **US-3:** As a student, I can stop the explanation by pressing-to-talk, so I retain control.

### 3.2 The Interruption Loop (Heart of MVP)
- **US-4:** As a student, when I press-and-hold the mic mid-explanation, the audio halts within ~200ms and the drawing freezes, so I feel heard.
- **US-5:** As a student, when I ask *"why did you do that?"*, the AI knows what "that" refers to based on what's currently on the board.
- **US-6:** As a student, the AI's response to my interruption visually references the existing board (highlights, arrows) rather than starting over.
- **US-7:** As a student, after my clarification is answered, the AI asks *"continue?"* and resumes the original lesson.

### 3.3 Cut from v1 (explicit scope reductions)
- **CUT US-8 (recursive interruption):** One level of interruption only. Mic is disabled during branch playback. A recursive interruption engine is ~8 hours we don't have and zero judges will test for it.
- **CUT sub-sentence highlight sync:** We sync at the *step* level, not the word level. Judge will not notice. See §6.3.

### 3.4 Failure / Edge Cases
- **US-9:** If the photo is unreadable, show a clear retry prompt with example photos — not a generic error.
- **US-10:** If the spoken question is unintelligible, the AI says *"I didn't catch that, can you rephrase?"* rather than guessing.

---

## 4. Functional Requirements

### 4.1 Input Processing
| ID | Requirement |
|---|---|
| FR-1.1 | File upload (image: JPG/PNG, ≤10MB). Camera capture via native `<input capture>` on mobile. |
| FR-1.2 | **Gemini 2.5 Flash** vision extracts problem → `{problem_type, latex, given, find, equation_bbox}` — native multimodal; bbox included for tldraw shape placement |
| FR-1.3 | Reject non-math images with friendly message + example photos |
| FR-1.4 | **Demo cache lookup:** extracted LaTeX is normalized and hashed; if match found in `/public/demo-cache/`, use cached plan instead of live generation (see §6.5) |

### 4.2 Lesson Plan Generation
| ID | Requirement |
|---|---|
| FR-2.1 | LLM produces a structured `LessonPlan`: array of `Step` objects |
| FR-2.2 | Each `Step` = `{id, narration_text, draw_actions[]}` — **no per-action timing offsets** (see §6.3) |
| FR-2.3 | `draw_actions` are tldraw-native: `{op: "create_shape" \| "highlight" \| "arrow" \| "erase", shape_props, label?}` |
| FR-2.4 | Plan is streamed as JSONL over SSE so Step 1 renders while Steps 2–N are still generating |

### 4.3 Rendering Pipeline
| ID | Requirement |
|---|---|
| FR-3.1 | Whiteboard = **tldraw** (`@tldraw/tldraw`) in read-only presentation mode |
| FR-3.2 | LaTeX rendered to SVG via **KaTeX**, then placed as a tldraw image/SVG shape (no custom stroke animation) |
| FR-3.3 | "Drawing" effect = tldraw's native shape-create animation + a subtle fade-in transform. The hand-drawn aesthetic is tldraw's default — we get it for free. |
| FR-3.4 | Each shape has `meta: { step_id, semantic_label }` — these labels are the LLM's handles for future interruptions |

### 4.4 TTS & Audio
| ID | Requirement |
|---|---|
| FR-4.1 | ElevenLabs Flash v2.5, one TTS call per Step (not per lesson), returning MP3 blob URLs |
| FR-4.2 | Pre-fetch Step N+1's audio while Step N is playing (single-step lookahead) |
| FR-4.3 | Audio must be instantly cancellable (`audio.pause(); audio.src = ''`) |
| FR-4.4 | Cached demo problems have pre-generated MP3s in `/public/demo-cache/` — zero TTS latency on the demo path |

### 4.5 Interruption Handling
| ID | Requirement |
|---|---|
| FR-5.1 | Push-to-talk button only (no VAD, no always-listening) |
| FR-5.2 | On press: cancel audio, freeze scheduled draw actions, capture `pause_state = {step_id, last_drawn_label}` |
| FR-5.3 | Deepgram Nova-3 streaming STT, transcript finalized on mic release |
| FR-5.4 | Send to LLM: flattened semantic board summary (see §6.4) + `pause_state` + `user_question` |
| FR-5.5 | LLM returns a **branch plan** whose draw_actions may reference existing shapes by `semantic_label` |
| FR-5.6 | After branch completes, TTS says *"Want me to continue?"* → yes resumes from `pause_state.step_id + 1`; any other answer ends session gracefully |
| FR-5.7 | Mic is disabled during branch playback (no recursive interruption — see §3.3) |

### 4.6 State Management
| ID | Requirement |
|---|---|
| FR-6.1 | Zustand store: `{problem, main_plan, branch_plan?, current_step_index, mode: "main" \| "branch" \| "paused" \| "idle"}` |
| FR-6.2 | Board shapes persist across branches unless the branch plan explicitly erases them |
| FR-6.3 | **No `plans_stack`.** One main plan + optionally one branch plan. Flat state = fewer bugs. |

---

## 5. Non-Functional Requirements

| Category | Target |
|---|---|
| **Time-to-first-stroke (cached demo path)** | <500ms from upload |
| **Time-to-first-stroke (live path)** | <3s from upload |
| **Interruption response latency** | Audio stops <200ms; new audio begins <2s (live) or <300ms (cached branch) |
| **Frame rate** | 60fps — tldraw handles this; we do not measure it |
| **Mobile-first** | Portrait, single-thumb operation, works at 375px wide |
| **Aesthetic** | Off-white canvas, single accent color (indigo-600), Inter font, no chrome during lesson |
| **Accessibility** | Live captions of narration; audio supplements, never gates, the experience |
| **Demo resilience** | Must function with intermittent Wi-Fi; cached path must be visually indistinguishable from live path |

---

## 6. System Architecture (Hackathon-Sprint)

### 6.1 High-Level Topology

```
┌─────────────────────────────────────────────┐
│  Mobile Web Client (Next.js 15 + React)     │
│  ┌────────────┐  ┌────────────────────────┐ │
│  │  tldraw    │◄─┤ SessionState (Zustand) │ │
│  │  canvas    │  │  - main_plan           │ │
│  │            │  │  - branch_plan?        │ │
│  └────────────┘  │  - current_step_index  │ │
│  ┌────────────┐  │  - mode                │ │
│  │ <audio> +  │  └────────────────────────┘ │
│  │ Mic (PTT)  │                              │
│  └────────────┘                              │
└──────────────┬──────────────────────────────┘
               │ HTTPS + SSE (no WebSocket)
               ▼
┌─────────────────────────────────────────────┐
│  Next.js API routes (serverless, Vercel)    │
│  /api/lesson   — Gemini vision → K2 plan (SSE JSONL) │
│  /api/branch   — interruption → branch plan │
│  /api/tts      — ElevenLabs proxy (cached)  │
│  /api/stt      — Deepgram websocket proxy   │
└────┬───────────┬────────────┬───────────────┘
     ▼           ▼            ▼           ▼
  Gemini      K2 Think    ElevenLabs   Deepgram
  2.5 Flash   V2 (Cerebras) Flash v2.5  Nova-3
  (vision)    (reasoning)
     │
     └── Claude Sonnet 4.6 (fallback if either sponsor endpoint drops)
```

**Deliberately removed from v1:** separate Bun/Hono backend, WebSocket transport, 60fps custom render loop, audio-as-master-clock sync engine, `plans_stack`, recursive interruption.

**Required env vars:**
```
GEMINI_API_KEY=         # Sponsor key — Gemini 2.5 Flash, vision extraction only
K2_THINK_API_KEY=       # Sponsor key — K2 Think V2, all reasoning/plan/routing calls
ELEVENLABS_API_KEY=     # TTS
DEEPGRAM_API_KEY=       # STT
ANTHROPIC_API_KEY=      # Claude Sonnet 4.6 — fallback if either sponsor endpoint drops
```

### 6.2 The Buy-vs-Build Call: Why tldraw

v1 proposed Konva.js or raw SVG + Framer Motion + hand-rolled `stroke-dasharray`. That path is a 12–18 hour swamp of coordinate math, z-indexing, and stroke-extraction bugs that would leave us with a 3am Saturday whiteboard that looks like a ransom note.

**tldraw gives us, for free:**
- Hand-drawn aesthetic (Perfect Freehand under the hood)
- Programmatic shape creation/animation (`editor.createShapes`, `editor.animateShape`)
- Shape IDs + `meta` fields → perfect interruption handles
- Pan/zoom/hit-testing/persistence
- A UI that looks more professional than anything we'd hand-roll

**Fallback** if tldraw's license becomes an issue: **Excalidraw** (`@excalidraw/excalidraw`, MIT). Swap in a day.

### 6.3 Sync Model: Sequential, Not Continuous

v1 proposed audio-as-master-clock with per-frame `currentTime` polling. Elegant on paper, fragile in practice: audio buffering hiccups → visual stutter; any timing_offset miscalculation → permanent drift.

**v2 sync is sequential at the step level:**
1. Play Step N's TTS audio.
2. Simultaneously fire Step N's `draw_actions` (they complete in ~1–3s, always shorter than narration).
3. On `audio.ended`, advance to Step N+1.
4. Repeat.

Zero drift possible because there is no parallel timeline to drift from. We lose sub-sentence highlighting — the *"as I say 'discriminant' the word lights up"* flourish. **Judge will not notice.** We saved a custom timing engine.

### 6.4 State Snapshotting: Semantic Flat Text

v1's interruption payload shipped bboxes, element IDs, full LaTeX strings. Verbose; the LLM ignored half of it. v2 sends a flat semantic summary:

```
PROBLEM: 2x² + 7x + 3 = 0
BOARD STATE (most recent last):
  [a_coef]       a = 2
  [b_coef]       b = 7
  [c_coef]       c = 3
  [middle_split] 7x = 6x + x     ← last drawn
PAUSED DURING NARRATION: "...and we split the middle term into..."
USER ASKED: "why did you split the middle term?"
```

~150–250 tokens. LLM returns:
```json
{
  "target_id": "middle_split",
  "branch_plan": [
    { "id": "branch_1", "narration_text": "Great question...",
      "draw_actions": [
        { "op": "highlight", "target_label": "middle_split", "color": "red" },
        { "op": "create_shape", "label": "factor_product", "latex": "2 × 3 = 6" }
      ]}
  ]
}
```

No bbox math. No serialization acrobatics. The LLM sees exactly what a human tutor would see.

### 6.5 The Demo Cache (non-negotiable)

> **This is the single most important decision in the PRD.** A live pipeline across Vision → LLM → TTS → STT on conference Wi-Fi is how demos die. We build *both* paths; the judge sees the cached one.

**Structure:** `/public/demo-cache/{latex_hash}.json` containing `{lesson_plan, step_audio_urls[], anticipated_branches: { question_hash → branch_plan + branch_audio_urls }}`.

**Seeding (Day 1 evening):**
- 3 problems: `2x² + 7x + 3 = 0` (primary demo), `x² + 5x + 6 = 0` (backup 1), `3x + 5 = 14` (backup 2, linear, shortest)
- For each: 3 anticipated interruption questions pre-rendered as full branch plans + audio

**Lookup (client-side, after vision extraction):**
1. Normalize extracted LaTeX (strip whitespace, canonicalize operators).
2. Hash → lookup in cache manifest.
3. Hit → play cached plan immediately. No LLM or TTS calls.
4. Miss → live pipeline (slower, but still works).

**Interruption matching:**
1. STT transcript → normalize → semantic hash (tiny prompt to **K2 Think**: *"match this question to one of: [list]; return index or null"*, ~200ms at Cerebras speed).
2. Hit → cached branch. Miss → live branch call.

**Why this is not cheating:** every production system has a warm path / CDN cache. The live path is fully functional; we just weight the demo toward the well-lit alley. If a judge asks *"is this real?"* — show them a fourth, uncached problem. The live path works. It just takes 3 seconds instead of 500ms.

### 6.6 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 | Vercel deploy in minutes; SSE native |
| Whiteboard | **tldraw** | Saves 15+ hours; better-looking than hand-roll |
| State | Zustand | Minimal boilerplate |
| LaTeX | KaTeX → SVG → tldraw shape | Synchronous, zero network |
| Vision LLM | **Gemini 2.5 Flash (sponsor API)** | Native multimodal; returns bbox + structured JSON natively; better math OCR than Claude; one call extracts problem + spatial layout |
| Reasoning LLM | **K2 Think V2 (sponsor API — `MBZUAI-IFM/K2-Think-v2`)** | Math is its specialty; Cerebras backend at ~2000 tok/s means near-instant lesson plan streaming; OpenAI-compatible endpoint (`https://api.k2think.ai/v1/chat/completions`) |
| Question routing | K2 Think V2 (same key, tiny prompt) | Speed makes a separate router unnecessary; one API key to manage |
| Fallback LLM | Claude Sonnet 4.6 | Full vision + reasoning fallback if either sponsor endpoint drops; one env var swap |
| TTS | ElevenLabs Flash v2.5 | <400ms first byte |
| STT | Deepgram Nova-3 streaming | Sub-300ms partial transcripts |
| Transport | HTTPS + SSE | Survives corporate/venue proxies; no reconnection logic |
| Backend | **Next.js API routes on Vercel** | No separate server to deploy or monitor |
| Auth | None | Out of scope |

---

## 7. Out of Scope for MVP

Explicitly **not building** in 48 hours:

- ❌ User accounts, auth, history, saved sessions
- ❌ Recursive interruption (one level only)
- ❌ Always-on VAD / wake-word activation
- ❌ Sub-sentence audio-visual sync
- ❌ Multi-problem sessions / homework queues
- ❌ Subjects beyond high-school algebra
- ❌ Handwriting recognition
- ❌ Voice cloning / persona selection
- ❌ Native iOS/Android apps (mobile web only)
- ❌ Offline mode
- ❌ Sharing / export
- ❌ Multilingual (English only)
- ❌ Teacher dashboards, analytics, parental controls
- ❌ Payments
- ❌ Content moderation beyond image-type validation
- ❌ Rate limiting / abuse prevention (demo-only)

---

## 8. 48-Hour Build Plan

Milestone gates: each block must be demoable before proceeding. If a block slips, cut scope from the next one — **never** from "Rehearse & Freeze."

| Hours | Phase | Deliverable (must be working, not polished) |
|---|---|---|
| **0–8** | **Skeleton** | tldraw shell, photo upload, **Gemini vision → LaTeX + bbox**, K2 Think → lesson plan JSON via SSE, sequential step playback with live ElevenLabs TTS. Non-interruptible. End-to-end happy path on one problem. **Spike first (hour 0–1):** (a) confirm Gemini returns clean structured JSON from a test photo; (b) confirm K2 Think streams JSONL without `<think>` bleed-through. Both must pass before building downstream. |
| **8–16** | **Interruption** | PTT mic, Deepgram streaming, `/api/branch` endpoint, highlight-existing-shape draw op, one-level interruption flow, "continue?" resume. |
| **16–24** | **Demo Cache** | Cache manifest, 3 problems × 3 questions pre-baked, client-side fuzzy match, K2 Think-based question router (single tiny prompt). Cached path indistinguishable from live path visually. |
| **24–32** | **Polish** | Fonts, colors, transitions, mic-button feel, loading states, non-math photo rejection UI, captions toggle. Mobile-first QA on actual phone. |
| **32–42** | **Rehearse** | Run the demo script 20+ times. Fix every bug that surfaces. Add 4th cached backup problem. Confirm every failure mode degrades gracefully. |
| **42–48** | **Freeze** | Code freeze. Bug fixes only. **Record a backup video** of the full demo running perfectly — if venue Wi-Fi fails, we play the video and talk over it. |

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Venue Wi-Fi unreliable | High | Fatal | Demo cache (§6.5) + backup video (§8 Freeze) |
| Gemini misreads photo | Medium | High | Curated demo photos with good lighting; Gemini's bbox output lets us show a "confirm this problem?" UI step before generating the plan |
| ElevenLabs rate-limit or outage | Low | Fatal on live path | Cached MP3s on demo path make this irrelevant for the pitch |
| tldraw API friction (undocumented edge case) | Medium | Medium | Budget 2h spike in Phase 1; Excalidraw is the swap |
| Audio/draw desync on slow phone | Low | Medium | Sequential sync model (§6.3) makes this structurally impossible |
| Judge asks unanticipated interruption question | High | Low | Live branch path works; K2 Think speed means ~1–2s latency is likely |
| K2 Think streams `<think>` traces into JSON output | Medium | High | Strip reasoning traces in SSE parser before passing to app; test in hour 0–1 spike |
| Either sponsor endpoint (Gemini or K2) drops | Low | High | `ANTHROPIC_API_KEY` in env — Claude Sonnet 4.6 handles both vision and reasoning as a full fallback; one-line swap per API route |
| Team member sleeps through Saturday | Medium | High | Pair schedule; no solo phases after hour 24 |

---

## Appendix A: Demo Script (the 120 seconds that matter)

1. **0:00** — Judge opens URL on phone. Sees a clean canvas with one button: *"📷 Snap a problem."*
2. **0:05** — Snaps photo of `2x² + 7x + 3 = 0`. Vision call fires; in parallel, LaTeX hashes and hits the demo cache.
3. **0:06** — Whiteboard begins rendering the equation in tldraw's hand-drawn style; calm voice begins: *"Let's factor this quadratic..."*
4. **0:25** — Judge presses-and-holds mic: *"Wait, why did you split the middle term?"*
5. **0:26** — Audio cuts. Scheduled draw actions freeze.
6. **0:27** — K2 Think routes question → cached branch hit. Red highlight appears on `7x`; voice resumes: *"Great question — we split 7x into 6x and x because their product, 6, equals a times c..."*
7. **0:45** — Branch concludes: *"Want me to continue?"* Judge says *"yes."*
8. **0:47** — Original explanation resumes from the next step, seamlessly.
9. **2:00** — Final answer written, circled. Voice: *"So x equals negative three or negative one-half."*

**That's the pitch.**

---

## Appendix B: What We Kept From v1, and What We Killed

**Kept (these were right):**
- Strategic positioning & wedge analysis (§1.2)
- Persona, subject MoSCoW, use case (§2)
- User stories US-1 through US-7, US-9, US-10 (§3)
- Frontend-as-source-of-truth principle (§6.4, generalized)
- Streaming lesson plan generation (§4.2)
- Per-step TTS (§4.4)

**Killed (these would have sunk us):**
- Konva.js / raw SVG / hand-rolled stroke animation → **tldraw**
- Audio-as-master-clock with per-frame polling → **sequential step sync**
- WebSocket transport → **SSE**
- Separate Bun/Hono backend → **Next.js API routes**
- `plans_stack` + recursive interruption (US-8) → **flat main + branch**
- Verbose JSON board snapshot with bboxes → **flat semantic text**
- No demo cache → **cache is the primary demo path**
- 60fps as a measured requirement → **trust tldraw**

---

*End of PRD v2.0 — Hackathon-Hardened*
