# Product Requirements Document: AI Whiteboard Tutor (MVP)

**Author:** Senior PM / Technical Architect
**Date:** 2026-04-17
**Version:** 1.0 (Hackathon MVP)
**Status:** Draft for 48-Hour Build

---

## 1. Executive Summary & Value Proposition

### 1.1 Summary
**AI Whiteboard Tutor** is a conversational, visual-first AI learning tool that emulates the experience of a 1-on-1 human tutor at a whiteboard. Users photograph a problem; the AI responds with a synchronized animated whiteboard walkthrough and voice narration. Critically, users can **interrupt the explanation in real-time** with spoken questions, causing the tutor to pause, re-orient to the user's confusion, and branch the visual explanation.

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

---

## 2. Target Audience & Core Use Case (MoSCoW-Scoped)

### 2.1 Target Persona (MVP)
**"Maya, 16 — High school sophomore, Algebra II student."**
Studying alone at 10pm, stuck on homework. Her parents can't help. Her teacher is unavailable. She has a phone, headphones, and 20 minutes of patience before she gives up.

### 2.2 Subject Matter Scope — MoSCoW

| Priority | Subject | Rationale |
|---|---|---|
| **Must Have** | **High-school Algebra** (linear & quadratic equations, factoring, systems) | Tractable visual representation; LLMs are reliable; clean OCR; strong demo appeal |
| **Should Have** | Basic geometry (triangles, Pythagorean theorem) | Visually rich, demos well |
| **Could Have** | Single-variable calculus (derivatives) | If time permits on day 2 |
| **Won't Have (MVP)** | Physics diagrams, chemistry, proofs, word problems with ambiguous setups, multi-page problems, handwritten cursive | Out of 48-hour scope |

### 2.3 Core Use Case (MVP)
A student uploads a photo of a single algebra problem, receives a 30–90 second animated whiteboard explanation with narration, and can interrupt at any point to ask a clarifying question.

---

## 3. User Stories (Interruption-Focused)

### 3.1 Primary Flow
- **US-1:** As a student, I can take or upload a photo of a math problem so that I don't have to retype it.
- **US-2:** As a student, I see the AI draw and hear it narrate the solution simultaneously, so it feels like a real teacher.
- **US-3:** As a student, I can stop the explanation by tapping a button or pressing-to-talk, so I retain control.

### 3.2 The Interruption Loop (Heart of MVP)
- **US-4:** As a student, when I press-and-hold the mic mid-explanation, the audio halts within ~200ms and the drawing freezes, so I feel heard.
- **US-5:** As a student, when I ask *"why did you do that?"*, the AI knows what "that" refers to based on what's currently on the board.
- **US-6:** As a student, the AI's response to my interruption visually references the existing board (e.g., circles, arrows, highlights) rather than starting over, so context is preserved.
- **US-7:** As a student, after my clarification is answered, I can say *"okay, continue"* and the original lesson resumes from where it paused.
- **US-8:** As a student, I can interrupt the *clarification itself* with another question (recursive interruption).

### 3.3 Failure / Edge Cases
- **US-9:** As a student, if the photo is unreadable, I see a clear retry prompt — not a generic error.
- **US-10:** As a student, if my spoken question is unintelligible, the AI says *"I didn't catch that, can you rephrase?"* rather than guessing.

---

## 4. Functional Requirements

### 4.1 Input Processing
| ID | Requirement |
|---|---|
| FR-1.1 | Camera capture + file upload (image: JPG/PNG, ≤10MB) |
| FR-1.2 | Vision-language model (Claude Sonnet 4.6 or GPT-4o vision) extracts problem statement → structured JSON `{problem_type, latex, given, find}` |
| FR-1.3 | Reject non-math images with friendly message |

### 4.2 Lesson Plan Generation
| ID | Requirement |
|---|---|
| FR-2.1 | LLM produces a **structured lesson plan**: array of `Step` objects |
| FR-2.2 | Each `Step` = `{id, narration_text, draw_actions[], duration_estimate_ms}` |
| FR-2.3 | `draw_actions` are typed primitives: `{type: "write_latex" \| "draw_line" \| "highlight" \| "arrow", coords, content, timing_offset_ms}` |
| FR-2.4 | Lesson plan is **streamed** so first step renders before full plan returns |

### 4.3 Rendering Pipeline
| ID | Requirement |
|---|---|
| FR-3.1 | Whiteboard = HTML5 Canvas or SVG, 60fps target |
| FR-3.2 | LaTeX rendered via KaTeX/MathJax to SVG, then "drawn" via stroke animation (e.g., `vivus.js`, `motion-canvas`, or hand-rolled `stroke-dasharray`) |
| FR-3.3 | Drawing animation timeline is **driven by audio playback time** (audio is master clock) — see §6.3 |
| FR-3.4 | Each rendered element tagged with `step_id` and a **semantic label** (e.g., `"discriminant"`, `"coefficient_a"`) for later reference during interruptions |

### 4.4 TTS & Audio
| ID | Requirement |
|---|---|
| FR-4.1 | Streaming TTS (ElevenLabs Flash / OpenAI `gpt-4o-mini-tts` / Cartesia) — first audio chunk in <800ms |
| FR-4.2 | Audio playback exposes precise `currentTime` for sync |
| FR-4.3 | Audio must be **instantly cancellable** (cut buffer, not wait for chunk end) |

### 4.5 Interruption Handling
| ID | Requirement |
|---|---|
| FR-5.1 | Push-to-talk button (mobile-first) + optional VAD-based always-listening (stretch) |
| FR-5.2 | On press: cancel audio, freeze canvas animation, capture `pause_state = {step_id, audio_offset_ms, visible_elements[]}` |
| FR-5.3 | Whisper / Deepgram STT for question (streaming) |
| FR-5.4 | Send to LLM: `{original_problem, lesson_plan, pause_state, board_snapshot, user_question}` |
| FR-5.5 | LLM returns a **branch lesson plan** that may reference existing board elements by their semantic labels |
| FR-5.6 | After branch completes, prompt user: *"Continue with the original explanation?"* → resume from `pause_state` |

### 4.6 State Management
| ID | Requirement |
|---|---|
| FR-6.1 | Single source of truth: `SessionState` = `{problem, plans_stack[], current_step, board_elements[], audio_state, mic_state}` |
| FR-6.2 | `plans_stack` enables recursive interruptions (push branch, pop on resume) |
| FR-6.3 | All board elements persist across branches unless explicitly cleared |

---

## 5. Non-Functional Requirements

| Category | Target |
|---|---|
| **Time-to-first-stroke (initial)** | <3s from upload |
| **Interruption response latency** | Audio stops <200ms; new audio begins <2s |
| **Frame rate** | 60fps drawing on mid-tier mobile (iPhone 12+) |
| **UI thread** | Never blocked >50ms; all LLM/TTS work off-main-thread |
| **Mobile-first** | Designed for portrait, single-thumb operation; works on 375px wide |
| **Aesthetic** | Off-white canvas, single accent color, SF Pro / Inter, no chrome, no menus visible during lesson |
| **Accessibility** | Captions toggle; audio is supplement not requirement |

---

## 6. Proposed System Architecture

### 6.1 High-Level Topology

```
┌─────────────────────────────────────────────┐
│  Mobile Web Client (Next.js + React)        │
│  ┌────────────┐  ┌────────────────────────┐ │
│  │ Whiteboard │  │ SessionState (Zustand) │ │
│  │  Canvas    │◄─┤ - plans_stack          │ │
│  │  (60fps)   │  │ - board_elements       │ │
│  └────────────┘  │ - audio clock          │ │
│  ┌────────────┐  └────────────────────────┘ │
│  │ Audio /    │                              │
│  │ Mic (PTT)  │                              │
│  └────────────┘                              │
└──────────────┬──────────────────────────────┘
               │ WebSocket (streaming)
               ▼
┌─────────────────────────────────────────────┐
│  Orchestrator (Node/Bun + Hono)             │
│  - Vision → problem extraction              │
│  - Lesson plan generation (streaming JSON)  │
│  - TTS streaming proxy                      │
│  - Branch generation on interruption        │
└────┬───────────┬────────────┬───────────────┘
     ▼           ▼            ▼
  Claude/GPT  ElevenLabs   Whisper/Deepgram
  (vision +   (TTS)        (STT)
   reasoning)
```

### 6.2 The Critical Question: Maintaining Context Across Interruption

**Frontend state is the source of truth.** The LLM is stateless between calls. On interruption, the client assembles and sends:

```json
{
  "original_problem": { "latex": "x² + 5x + 6 = 0", "..." : "..." },
  "full_lesson_plan": ["..."],
  "pause_state": {
    "current_step_id": "step_3",
    "audio_offset_ms": 4200,
    "narration_said_so_far": "...we apply the quadratic formula where a equals 1, b equals 5..."
  },
  "board_snapshot": [
    { "id": "elem_12", "label": "discriminant", "latex": "b²-4ac", "bbox": [120,200,180,40] },
    { "id": "elem_13", "label": "coefficient_a", "latex": "a=1", "bbox": [50,300,80,30] }
  ],
  "user_question": "where did the 4ac come from?"
}
```

The LLM is prompted to:
1. Identify which board element the question refers to (by `label` or position).
2. Return a **branch plan** — a new short lesson plan whose `draw_actions` may reference existing element IDs (e.g., `{type: "highlight", target_id: "elem_12"}`) or add new ones.
3. End the branch with a natural transition cue.

The client **pushes** the branch onto `plans_stack`. When complete, it **pops** and offers to resume the original plan from `pause_state.current_step_id + 1`.

### 6.3 Audio-as-Master-Clock Sync
Audio plays continuously; the rendering loop polls `audioElement.currentTime` each frame and advances draw actions whose `timing_offset_ms` is reached. This guarantees drift-free A/V sync and makes pausing trivial (`audio.pause()` → render loop sees no time advance).

### 6.4 Streaming Strategy
- LLM returns lesson plan as **JSON Lines** (one `Step` per line) — render begins on first step.
- TTS request fires per-step, not per-lesson, to minimize first-audio latency.
- All transports over a single WebSocket for low overhead.

### 6.5 Tech Stack (Hackathon-Pragmatic)
| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 + React | Fast scaffolding, deploys to Vercel in minutes |
| State | Zustand | Minimal boilerplate for `SessionState` |
| Canvas | Konva.js or raw SVG + Framer Motion | LaTeX→SVG via KaTeX, animate with `stroke-dasharray` |
| LLM | Claude Sonnet 4.6 (vision + reasoning) | Best structured output + vision in one model |
| TTS | ElevenLabs Flash v2.5 | <400ms first byte, natural voice |
| STT | Deepgram Nova-3 streaming | Sub-300ms partial transcripts |
| Backend | Bun + Hono on Railway | Zero-config WebSocket |

---

## 7. Out of Scope for MVP

Explicitly **not building** in 48 hours:

- ❌ User accounts, auth, history, saved sessions
- ❌ Multi-problem sessions / homework assignments
- ❌ Subjects beyond high-school algebra
- ❌ Handwriting recognition for messy student input
- ❌ Voice cloning / persona selection
- ❌ Native iOS/Android apps (PWA only)
- ❌ Offline mode
- ❌ Sharing / export of explanations
- ❌ Always-on VAD (push-to-talk only for MVP reliability)
- ❌ Multilingual support (English only)
- ❌ Teacher dashboards, analytics, parental controls
- ❌ Payments / paywalls
- ❌ Content moderation beyond basic image-type checking
- ❌ Rate limiting / abuse prevention (demo-only)

---

## Appendix A: Demo Script (T-minus 48h)

1. **0:00** — Judge opens URL on phone. Sees a clean canvas with one button: "📷 Snap a problem."
2. **0:05** — Snaps photo of `2x² + 7x + 3 = 0`.
3. **0:08** — Whiteboard begins drawing the equation in elegant strokes; calm voice begins explaining factoring.
4. **0:25** — Judge presses-and-holds mic: *"Wait, why did you split the middle term?"*
5. **0:26** — Audio cuts. Animation freezes mid-stroke.
6. **0:28** — A red circle appears around the `7x` term; voice resumes: *"Great question — we split 7x into 6x and x because their product, 6, equals a times c..."*
7. **0:45** — Branch concludes: *"Want me to continue?"* Judge says yes.
8. **0:47** — Original explanation resumes seamlessly.

**That's the pitch.**

---

*End of PRD v1.0*
