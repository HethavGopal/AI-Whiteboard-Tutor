# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This is a **pre-code hackathon project**. All documentation is complete; implementation has not started. The full PRD is in [PRD-trial-2.md](PRD-trial-2.md) and the 48-hour build plan is in [implementation-plan.md](implementation-plan.md).

## Commands

Once bootstrapped with `npx create-next-app@latest`:

```bash
npm run dev        # Next.js dev server
npm run build      # Production build
npm run lint       # ESLint

# Utility scripts (to be created under /scripts)
npx ts-node scripts/seed-cache.ts    # Pre-bake demo cache (3 problems × 3 questions)
npx ts-node scripts/spike-k2.ts      # Verify K2 Think output format
```

## Required Environment Variables

```
VISION_API_KEY        # Anthropic (Claude Sonnet 4.6 vision)
K2_THINK_API_KEY      # K2 Think / Cerebras (plan generation)
ELEVENLABS_API_KEY    # TTS
DEEPGRAM_API_KEY      # STT
FALLBACK_LLM_KEY      # Anthropic backup if K2 endpoint fails
```

## Architecture

**Mobile-first web app**: user photographs a math problem → AI generates a voiced whiteboard lesson → user can interrupt mid-lesson to ask questions.

### Two Execution Paths

- **Cached path (primary / demo):** `<500ms` response. Pre-baked JSON + MP3s from `/public/demo-cache/` served directly. This is the default for 3 known problems × 3 anticipated questions.
- **Live path (fallback):** Vision → plan generation → TTS, ~3s latency.

### Request Flow (live path)

```
Image upload
  → POST /api/lesson  (Claude Sonnet 4.6 vision: extract LaTeX)
  → K2 Think V2:      stream lesson plan as SSE JSONL
  → POST /api/tts     (ElevenLabs Flash v2.5 per step)
  → Client player:    sequential step loop (audio → draw → advance)

User interrupts via PTT
  → Deepgram Nova-3 STT
  → POST /api/branch  (K2 Think: generate branch explanation)
  → Merge back into main plan after branch completes
```

### Step-Level Sync (§6.3 of PRD)

**No audio-as-master-clock.** Each step plays audio, fires draw actions, then waits for `audio.ended` before advancing. This eliminates drift entirely. All timing logic lives in `lib/player.ts`.

### Key Source Files to Author First

| File | Purpose |
|---|---|
| `lib/schemas.ts` | Zod types: `LessonPlan`, `Step`, `DrawAction`, `BranchPlan` |
| `lib/store.ts` | Zustand: `{problem, main_plan, branch_plan?, current_step_index, mode}` |
| `lib/player.ts` | Step loop orchestrator |
| `lib/tldrawBridge.ts` | `DrawAction` → tldraw programmatic API |
| `app/api/lesson/route.ts` | Vision + plan generation SSE endpoint |
| `lib/llm/k2think.ts` | K2 Think client; must strip `<redacted_thinking>…</think>` tags before parsing |

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/lesson` | POST | Image → SSE JSONL stream of lesson steps |
| `/api/branch` | POST | Board snapshot + question → branch plan |
| `/api/tts` | POST | ElevenLabs proxy |
| `/api/stt` | POST | Deepgram proxy |
| `/api/route-question` | POST | Map question to cached-branch-id |

### Demo Cache Layout

```
/public/demo-cache/
  manifest.json                    # { latex_hash: filename }
  *.json                           # { lesson_plan, audio_urls, anticipated_branches }
  /audio/{hash}/step_N.mp3
  /audio/{hash}/branch_*.mp3
```

Cache keys are deterministic LaTeX hashes (see `lib/latexHash.ts`).

### Technology Choices

| Layer | Tech | Why |
|---|---|---|
| Framework | Next.js 15 + React 19 | App Router, API routes, SSE |
| Whiteboard | tldraw | Hand-drawn aesthetic + programmatic shape API (saves ~15h vs custom canvas) |
| State | Zustand | Flat session state, minimal boilerplate |
| LLM (vision) | Claude Sonnet 4.6 | Single call per upload |
| LLM (reasoning) | K2 Think V2 (Cerebras) | ~2000 tok/s streaming; sponsor API |
| TTS | ElevenLabs Flash v2.5 | <400ms first byte |
| STT | Deepgram Nova-3 | <300ms partials; push-to-talk only |
| Transport | HTTPS + SSE | No WebSockets (proxy compatibility) |
| LaTeX | KaTeX → SVG → tldraw image | Synchronous, zero network cost |
| Validation | Zod | All LLM JSON output validated at API boundary |

### Constraints

- **Subject scope:** High-school algebra only (quadratics, linear equations, systems of equations).
- **No recursive interruption:** Mic disabled during a branch; one interrupt level only.
- **Board snapshot format:** Flat semantic (~150–250 tokens) rather than verbose bounding boxes.
- **Git remote:** `https://github.com/HethavGopal/AI-Whiteboard-Tutor`
