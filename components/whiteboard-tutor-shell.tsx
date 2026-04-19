"use client";

import { useRef, useState } from "react";

import { MicButton } from "@/components/mic-button";
import { WhiteboardCanvas } from "@/components/whiteboard-canvas";
import { lessonPlanSchema } from "@/lib/tutor-core";
import { useResumeVoiceWindow } from "@/lib/use-resume-voice-window";
import { useStepNarration } from "@/lib/use-step-narration";
import { useTutorStore } from "@/lib/tutor-store";

const btnPrimary =
  "rounded-xl bg-[#ff914d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ff7a2f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "rounded-xl border border-[#eadfd6] bg-white px-3 py-1.5 text-xs font-medium text-[#6f625b] transition hover:border-[#ff914d]/50 hover:bg-[#fff1e8] hover:text-[#ff7a2f] active:scale-[0.98]";
const btnAccent =
  "rounded-xl border border-[#ff914d]/35 bg-[#fff1e8] px-3 py-1.5 text-xs font-semibold text-[#ff7a2f] transition hover:bg-[#ffdfc9] active:scale-[0.98]";
const btnNav =
  "rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#6f625b] transition hover:bg-[#fff1e8] hover:text-[#ff914d]";
const cardBase =
  "overflow-hidden rounded-2xl border border-[#eadfd6] bg-white shadow-[0_4px_24px_0_rgba(47,36,31,0.09),0_0_0_1px_rgba(255,145,77,0.05)]";

type Message = {
  id: string;
  role: "user" | "ai";
  text: string;
};

const SUGGESTIONS = [
  "Solve 2x + 3 = 11",
  "Differentiate x² + 3x",
  "Factorise x² − 5x + 6",
];

export function WhiteboardTutorShell() {
  const {
    problemInput,
    lessonPlan,
    currentStepIndex,
    renderRevision,
    lessonMode,
    isThinking,
    branchError,
    lastTranscript,
    setProblemInput,
    setLessonPlan,
    previousStep,
    nextStep,
    resetLessonPlayback,
    replayCurrentStep,
    loadMockLesson,
    resumeMainLesson,
    cancelInterruption,
  } = useTutorStore();

  useStepNarration();
  useResumeVoiceWindow();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const currentStep = lessonPlan?.steps[currentStepIndex] ?? null;
  const totalSteps = lessonPlan?.steps.length ?? 0;

  function appendMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  async function handleGenerateLesson(overrideText?: string) {
    const trimmedProblem = (overrideText ?? problemInput).trim();
    if (!trimmedProblem) {
      setGenerationError("Enter a problem before generating a lesson.");
      return;
    }

    setIsGeneratingLesson(true);
    setGenerationError(null);

    appendMessage({
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmedProblem,
    });

    try {
      const response = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemText: trimmedProblem }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Lesson generation failed.");
      }

      const plan = lessonPlanSchema.parse(payload);
      setLessonPlan(plan);

      appendMessage({
        id: `a-${Date.now()}`,
        role: "ai",
        text: `I've prepared a ${plan.steps.length}-step lesson on "${plan.title}". Follow along on the whiteboard!`,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Lesson generation failed.";
      setGenerationError(msg);
      appendMessage({
        id: `a-${Date.now()}`,
        role: "ai",
        text: `Sorry, I couldn't generate a lesson: ${msg}`,
      });
    } finally {
      setIsGeneratingLesson(false);
    }
  }

  async function handlePhotoUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractError(null);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const payload = (await res.json()) as {
        problemText?: string;
        error?: string;
      };

      if (payload.error === "not_math") {
        setExtractError("No math detected in that image. Try another photo.");
        return;
      }
      if (!res.ok || !payload.problemText) {
        throw new Error(payload.error ?? "Extraction failed.");
      }
      setProblemInput(payload.problemText);
      await handleGenerateLesson(payload.problemText);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Extraction failed.",
      );
    } finally {
      setIsExtracting(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function handleNew() {
    setMessages([]);
    setProblemInput("");
    setGenerationError(null);
    setExtractError(null);
    resetLessonPlayback();
  }

  function handleTryExample() {
    loadMockLesson();
    setMessages([
      {
        id: `a-${Date.now()}`,
        role: "ai",
        text: 'I\'ve loaded a demo lesson: "Solve 2x + 3 = 11". Follow the steps on the whiteboard!',
      },
    ]);
  }

  const progressPct =
    totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;
  const hasMessages = messages.length > 0;
  const hasLesson = lessonPlan !== null;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: "#fffaf5",
        backgroundImage:
          "radial-gradient(circle, #e8dbd0 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <header
        className="h-[84px] shrink-0 z-20 flex items-center justify-between px-8"
        style={{
          background: "linear-gradient(to bottom, #ffffff, #ffffff, #fffcf9)",
          borderBottom: "1px solid #f0e4d8",
          boxShadow: "0 2px 16px 0 rgba(255,145,77,0.1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/boardlyLogo.svg"
          className="h-[64px] w-auto"
          alt="Boardly"
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleNew} className={btnNav}>
            New
          </button>
          <div className="h-5 w-px bg-[#eadfd6]" />
          <button
            type="button"
            onClick={resetLessonPlayback}
            className={btnNav}
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Main content row ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-4 p-5">

        {/* ── Board Panel ─────────────────────────────────────────── */}
        <div className={`flex flex-1 flex-col min-w-0 ${cardBase}`}>

          {/* Board Header */}
          <div
            className="flex shrink-0 items-center justify-between px-5 py-3"
            style={{
              background: "linear-gradient(to right, #fffaf5, #ffffff)",
              borderBottom: "1px solid #eadfd6",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#ff914d]">
                <span className="text-[10px] font-bold text-white">B</span>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9b8f87]">
                Board
              </span>
              {hasLesson && (
                <>
                  <span className="text-[#e0d4ca] select-none">/</span>
                  <span className="max-w-[260px] truncate text-[13px] text-[#2f241f]">
                    {lessonPlan!.title}
                  </span>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {hasLesson ? (
                <>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-[#eadfd6]">
                    <div
                      className="h-full rounded-full bg-[#ff914d] transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="rounded-full bg-[#fff1e8] px-2.5 py-0.5 text-[11px] font-semibold text-[#ff7a2f]">
                    {currentStepIndex + 1} / {totalSteps}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-[#c9bdb5]">
                  No lesson loaded
                </span>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="min-h-0 flex-1">
            <WhiteboardCanvas
              lessonPlan={lessonPlan}
              currentStepIndex={currentStepIndex}
              renderRevision={renderRevision}
              isGeneratingAvatar={isGeneratingLesson || isExtracting}
            />
          </div>
        </div>

        {/* ── Chat Panel ──────────────────────────────────────────── */}
        <div className={`flex w-[380px] shrink-0 flex-col ${cardBase}`}>

          {/* Panel Header */}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{
              background: "linear-gradient(to right, #fff7f1, #fffcf9)",
              borderBottom: "1px solid #eadfd6",
            }}
          >
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/boardlyLogo.svg"
                className="h-7 opacity-90"
                alt="Boardly"
              />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9b8f87]">
                Tutor
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff914d] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff914d]" />
              </span>
              <span className="text-[11px] text-[#9b8f87]">Ready</span>
            </div>
          </div>

          {/* Scrollable Messages Area */}
          <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-3">

            {/* Awaiting confirm card */}
            {lessonMode === "awaiting_confirm" && (
              <div className="shrink-0 rounded-2xl border border-[#eadfd6] bg-[#fff7f1] p-4">
                <p className="text-sm font-semibold text-[#2f241f]">
                  Ready to continue the lesson?
                </p>
                <p className="mt-1 text-xs text-[#9b8f87]">
                  Say &ldquo;yes&rdquo; or click below. Listening for ~4
                  seconds.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resumeMainLesson}
                    className={btnPrimary}
                  >
                    Continue lesson
                  </button>
                  <button
                    type="button"
                    onClick={cancelInterruption}
                    className={btnGhost}
                  >
                    End here
                  </button>
                </div>
              </div>
            )}

            {/* Voice status indicators */}
            {isThinking && (
              <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700">
                  Generating branch explanation…
                </p>
              </div>
            )}
            {branchError && (
              <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{branchError}</p>
              </div>
            )}
            {lastTranscript && lessonMode !== "main" && (
              <div className="shrink-0 rounded-xl border border-[#eadfd6] bg-[#fff7f1] px-3 py-2">
                <p className="text-[10px] text-[#9b8f87] uppercase tracking-wide mb-1">
                  Your question
                </p>
                <p className="text-xs text-[#2f241f]">
                  &ldquo;{lastTranscript}&rdquo;
                </p>
              </div>
            )}

            {/* Step progress card */}
            {currentStep && (
              <div className="shrink-0 rounded-2xl border border-[#eadfd6] bg-[#fff7f1] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ff914d] text-[10px] font-bold text-white">
                    {currentStepIndex + 1}
                  </span>
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-[#9b8f87]">
                    {lessonPlan?.title}
                  </span>
                </div>
                <p className="text-[13px] font-semibold text-[#2f241f]">
                  Step {currentStepIndex + 1} of {totalSteps}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#6f625b]">
                  {currentStep.narration}
                </p>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#eadfd6]">
                  <div
                    className="h-full rounded-full bg-[#ff914d] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={previousStep}
                    className={btnGhost}
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className={btnAccent}
                  >
                    Next →
                  </button>
                  <button
                    type="button"
                    onClick={resetLessonPlayback}
                    className={btnGhost}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={replayCurrentStep}
                    className={btnGhost}
                  >
                    Replay
                  </button>
                </div>
              </div>
            )}

            {/* Message bubbles — oldest first, newest appended below */}
            {hasMessages &&
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 shrink-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <span className="px-1 text-[10px] font-medium text-[#9b8f87]">
                    {msg.role === "user" ? "You" : "Boardly"}
                  </span>
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#fff1e8] text-[#2f241f]"
                        : "border border-[#eadfd6] bg-white text-[#6f625b]"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

            {/* Empty state — only when no messages and no lesson */}
            {!hasMessages && !hasLesson && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-[20px]"
                  style={{
                    background: "linear-gradient(135deg, #fff1e8, #ffe4cc)",
                    boxShadow: "0 4px 16px 0 rgba(255,145,77,0.22)",
                  }}
                >
                  <span style={{ fontSize: 28 }}>✏️</span>
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-[#2f241f]">
                    What would you like to learn?
                  </p>
                  <p className="mt-1 max-w-[190px] mx-auto text-[13px] text-[#9b8f87]">
                    Type any maths problem below, or snap a photo…
                  </p>
                </div>
                <div className="w-full space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setProblemInput(s)}
                      className="w-full rounded-xl border border-[#eadfd6] bg-[#fff7f1] px-3 py-2 text-left text-sm text-[#2f241f] transition hover:border-[#ff914d]/50 hover:bg-[#fff1e8]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-[#eadfd6]" />
                  <span className="text-[11px] text-[#9b8f87]">
                    ask anything
                  </span>
                  <div className="h-px flex-1 bg-[#eadfd6]" />
                </div>
              </div>
            )}
          </div>

          {/* ── Input Area ─────────────────────────────────────────── */}
          <div className="shrink-0 space-y-2 border-t border-[#eadfd6] bg-[#fff1e8] px-4 py-3">
            {/* Row 1: text input + mic button + Ask */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={problemInput}
                onChange={(e) => setProblemInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isGeneratingLesson && !isExtracting)
                    void handleGenerateLesson();
                }}
                placeholder="e.g. solve 2x + 3 = 11…"
                className="flex-1 rounded-xl border border-[#eadfd6] bg-white px-3 py-2 text-sm text-[#2f241f] outline-none placeholder:text-[#9b8f87] transition focus:border-[#ff914d] focus:ring-2 focus:ring-[#ff914d]/15"
              />
              <MicButton />
              <button
                type="button"
                onClick={() => void handleGenerateLesson()}
                disabled={isGeneratingLesson || isExtracting}
                className={btnPrimary}
              >
                {isGeneratingLesson ? "…" : "Ask"}
              </button>
            </div>

            {/* Row 2: photo upload + try example + error */}
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`cursor-pointer ${btnGhost} ${isExtracting || isGeneratingLesson ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  disabled={isExtracting || isGeneratingLesson}
                  className="sr-only"
                />
                📷 Photo
              </label>
              <button
                type="button"
                onClick={handleTryExample}
                className={btnGhost}
              >
                Try example
              </button>
              {isExtracting && (
                <span className="text-xs text-[#9b8f87]">Extracting…</span>
              )}
              {(generationError ?? extractError) && (
                <span className="text-xs text-red-400">
                  {generationError ?? extractError}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
