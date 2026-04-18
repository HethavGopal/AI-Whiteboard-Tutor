"use client";

import { useEffect, useRef, useState } from "react";

import { WhiteboardCanvas } from "@/components/whiteboard-canvas";
import { lessonPlanSchema, type LessonPlan } from "@/lib/tutor-core";
import { useStepNarration } from "@/lib/use-step-narration";
import { useTutorStore } from "@/lib/tutor-store";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const card =
  "overflow-hidden rounded-2xl border border-[#eadfd6] bg-white " +
  "shadow-[0_4px_24px_0_rgba(47,36,31,0.09),0_0_0_1px_rgba(255,145,77,0.05)]";

const btnPrimary =
  "rounded-xl bg-[#ff914d] px-4 py-2 text-sm font-semibold text-white " +
  "shadow-sm transition hover:bg-[#ff7a2f] active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const btnGhost =
  "rounded-xl border border-[#eadfd6] bg-white px-3 py-1.5 text-xs " +
  "font-medium text-[#6f625b] transition " +
  "hover:border-[#ff914d]/50 hover:bg-[#fff1e8] hover:text-[#ff7a2f] " +
  "active:scale-[0.98]";

const btnAccent =
  "rounded-xl border border-[#ff914d]/35 bg-[#fff1e8] px-3 py-1.5 " +
  "text-xs font-semibold text-[#ff7a2f] transition " +
  "hover:bg-[#ffdfc9] active:scale-[0.98]";

const btnNav =
  "rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#6f625b] transition " +
  "hover:bg-[#fff1e8] hover:text-[#ff914d]";

// ─────────────────────────────────────────────────────────────────────────────
// Navbar
// ─────────────────────────────────────────────────────────────────────────────

function Navbar({
  onNew,
  onReset,
}: {
  onNew: () => void;
  onReset: () => void;
}) {
  return (
    <nav
      className="relative z-20 flex h-[84px] shrink-0 items-center justify-between
        border-b border-[#f0e4d8]
        bg-gradient-to-b from-white via-white to-[#fffcf9]
        px-6 shadow-[0_2px_16px_0_rgba(255,145,77,0.1)]"
    >
      {/* Logo — large, fully contained */}
      <img
        src="/Boardly.svg"
        alt="Boardly"
        className="h-[64px] w-auto"
      />

      {/* Right side */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onNew} className={btnNav}>
          New
        </button>
        <div className="h-4 w-px bg-[#eadfd6]" />
        <button type="button" onClick={onReset} className={btnNav}>
          Reset
        </button>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Board panel header  (sits above the tldraw canvas)
// ─────────────────────────────────────────────────────────────────────────────

function BoardHeader({
  lessonTitle,
  currentStepIndex,
  totalSteps,
}: {
  lessonTitle: string | null;
  currentStepIndex: number;
  totalSteps: number;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-[#eadfd6] bg-gradient-to-r from-[#fffaf5] to-white px-5 py-3">
      {/* Left — identity */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#ff914d] text-[10px] font-bold text-white shadow-sm">
          B
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9b8f87]">
          Board
        </span>
        {lessonTitle && (
          <>
            <span className="text-[#e0d4ca]">/</span>
            <span className="max-w-[260px] truncate text-xs font-medium text-[#6f625b]">
              {lessonTitle}
            </span>
          </>
        )}
      </div>

      {/* Right — step pill */}
      {totalSteps > 0 ? (
        <div className="flex items-center gap-2">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-[#eadfd6]">
            <div
              className="h-full rounded-full bg-[#ff914d] transition-all duration-500"
              style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <span className="rounded-full bg-[#fff1e8] px-2.5 py-0.5 text-[11px] font-semibold text-[#ff7a2f]">
            {currentStepIndex + 1} / {totalSteps}
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-[#c9bdb5]">No lesson loaded</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat panel
// ─────────────────────────────────────────────────────────────────────────────

function ChatPanel({
  messages,
  inputValue,
  onInputChange,
  onSend,
  onPhotoUpload,
  isLoading,
  isExtracting,
  error,
  photoInputRef,
  lessonPlan,
  currentStepIndex,
  totalSteps,
  onPrevious,
  onNext,
  onResetPlayback,
  onReplay,
  onLoadMock,
}: {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  isExtracting: boolean;
  error: string | null;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  lessonPlan: LessonPlan | null;
  currentStepIndex: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onResetPlayback: () => void;
  onReplay: () => void;
  onLoadMock: () => void;
}) {
  const currentStep = lessonPlan?.steps[currentStepIndex] ?? null;
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = 0;
  }, [messages.length]);

  return (
    <div className={`flex h-full flex-col ${card}`}>

      {/* ── Panel header ── */}
      <div className="shrink-0 border-b border-[#eadfd6] bg-gradient-to-r from-[#fff7f1] to-[#fffcf9] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/Boardly.svg" alt="Boardly" className="h-7 w-auto opacity-90" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9b8f87]">
              Tutor
            </span>
          </div>
          {/* Status dot */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff914d] opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff914d]" />
            </span>
            <span className="text-[11px] font-medium text-[#9b8f87]">Ready</span>
          </div>
        </div>
      </div>

      {/* ── Scrollable messages ── */}
      <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto p-4">

        {/* Step progress card */}
        {lessonPlan && (
          <div className="rounded-2xl border border-[#eadfd6] bg-[#fff7f1] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ff914d] text-[10px] font-bold text-white">
                {totalSteps > 0 ? currentStepIndex + 1 : "·"}
              </span>
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-[#9b8f87]">
                {lessonPlan.title}
              </p>
            </div>

            <p className="mt-2 text-sm font-semibold text-[#2f241f]">
              Step {totalSteps > 0 ? currentStepIndex + 1 : 0}
              <span className="font-normal text-[#9b8f87]"> of {totalSteps}</span>
            </p>

            {currentStep && (
              <p className="mt-1.5 text-xs leading-relaxed text-[#6f625b]">
                {currentStep.narration}
              </p>
            )}

            {totalSteps > 0 && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#eadfd6]">
                <div
                  className="h-full rounded-full bg-[#ff914d] transition-all duration-300"
                  style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={onPrevious} className={btnGhost}>← Prev</button>
              <button type="button" onClick={onNext} className={btnAccent}>Next →</button>
              <button type="button" onClick={onResetPlayback} className={btnGhost}>Reset</button>
              <button type="button" onClick={onReplay} className={btnGhost}>Replay</button>
            </div>
          </div>
        )}

        {/* Messages — newest at top */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <span className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9b8f87]">
              {msg.role === "user" ? "You" : "Boardly"}
            </span>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#fff1e8] text-[#2f241f]"
                  : "border border-[#eadfd6] bg-white text-[#6f625b]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {messages.length === 0 && !lessonPlan && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            {/* Floating icon badge */}
            <div className="relative mb-5">
              <div className="h-16 w-16 rounded-[20px] bg-gradient-to-br from-[#fff1e8] to-[#ffe4cc] shadow-[0_4px_16px_0_rgba(255,145,77,0.22)]" />
              <span className="absolute inset-0 flex items-center justify-center text-[28px]">✏️</span>
            </div>
            <p className="text-[15px] font-semibold text-[#2f241f]">
              What would you like to learn?
            </p>
            <p className="mt-2 max-w-[190px] text-xs leading-relaxed text-[#9b8f87]">
              Type any maths problem below, or snap a photo of your notes to get started.
            </p>
            {/* Suggestion chips */}
            <div className="mt-5 flex flex-col gap-2 w-full px-2">
              {[
                "Solve 2x + 3 = 11",
                "Differentiate x² + 3x",
                "Factorise x² − 5x + 6",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onInputChange(suggestion)}
                  className="w-full rounded-xl border border-[#eadfd6] bg-[#fffaf5] px-3 py-2 text-left text-xs text-[#6f625b] transition hover:border-[#ff914d]/50 hover:bg-[#fff1e8] hover:text-[#ff7a2f]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px w-10 bg-[#eadfd6]" />
              <span className="text-[11px] text-[#c9bdb5]">ask anything</span>
              <div className="h-px w-10 bg-[#eadfd6]" />
            </div>
          </div>
        )}
      </div>

      {/* ── Input area — bottom ── */}
      <div className="shrink-0 border-t border-[#eadfd6] bg-[#fff7f1] px-4 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="e.g. solve 2x + 3 = 11…"
            className="min-w-0 flex-1 rounded-xl border border-[#eadfd6] bg-white px-3.5 py-2.5 text-sm
              text-[#2f241f] outline-none transition placeholder:text-[#9b8f87]
              focus:border-[#ff914d] focus:ring-2 focus:ring-[#ff914d]/15"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || isExtracting}
            className={btnPrimary}
          >
            {isLoading ? "…" : "Ask"}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <label className={`${btnGhost} cursor-pointer`}>
            {isExtracting ? "Reading…" : "📷 Photo"}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhotoUpload}
              disabled={isExtracting || isLoading}
              className="sr-only"
            />
          </label>
          <button type="button" onClick={onLoadMock} className={btnGhost}>
            Try example
          </button>
          {error && <p className="ml-1 truncate text-[11px] text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main shell
// ─────────────────────────────────────────────────────────────────────────────

export function WhiteboardTutorShell() {
  const {
    problemInput,
    lessonPlan,
    currentStepIndex,
    renderRevision,
    setProblemInput,
    setLessonPlan,
    previousStep,
    nextStep,
    resetLessonPlayback,
    replayCurrentStep,
    loadMockLesson,
  } = useTutorStore();

  useStepNarration();

  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const totalSteps = lessonPlan?.steps.length ?? 0;

  function pushMessage(msg: Omit<ChatMessage, "id">) {
    setMessages((prev) => [
      { ...msg, id: `${Date.now()}-${Math.random()}` },
      ...prev,
    ]);
  }

  async function handleGenerateLesson(overrideText?: string) {
    const trimmedProblem = (overrideText ?? problemInput).trim();
    if (!trimmedProblem) {
      setGenerationError("Enter a problem before generating a lesson.");
      return;
    }

    setIsGeneratingLesson(true);
    setGenerationError(null);
    pushMessage({ role: "user", content: trimmedProblem });

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
      pushMessage({
        role: "ai",
        content: `Lesson ready: "${plan.title}" — ${plan.steps.length} steps. Follow along on the board.`,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Lesson generation failed.";
      setGenerationError(msg);
      pushMessage({ role: "ai", content: `Error: ${msg}` });
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
    setProblemInput("");
    setGenerationError(null);
    setExtractError(null);
    setMessages([]);
    resetLessonPlayback();
  }

  const combinedError = generationError ?? extractError;

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        backgroundColor: "#fffaf5",
        backgroundImage: "radial-gradient(circle, #e8dbd0 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <Navbar onNew={handleNew} onReset={resetLessonPlayback} />

      <div className="flex min-h-0 flex-1 gap-4 p-5">

        {/* Board — primary writing surface */}
        <div className={`flex min-w-0 flex-1 flex-col ${card}`}>
          <BoardHeader
            lessonTitle={lessonPlan?.title ?? null}
            currentStepIndex={currentStepIndex}
            totalSteps={totalSteps}
          />
          <div className="min-h-0 flex-1">
            <WhiteboardCanvas
              lessonPlan={lessonPlan}
              currentStepIndex={currentStepIndex}
              renderRevision={renderRevision}
            />
          </div>
        </div>

        {/* Chat — side companion */}
        <div className="w-[380px] shrink-0">
          <ChatPanel
            messages={messages}
            inputValue={problemInput}
            onInputChange={setProblemInput}
            onSend={() => handleGenerateLesson()}
            onPhotoUpload={handlePhotoUpload}
            isLoading={isGeneratingLesson}
            isExtracting={isExtracting}
            error={combinedError}
            photoInputRef={photoInputRef}
            lessonPlan={lessonPlan}
            currentStepIndex={currentStepIndex}
            totalSteps={totalSteps}
            onPrevious={previousStep}
            onNext={nextStep}
            onResetPlayback={resetLessonPlayback}
            onReplay={replayCurrentStep}
            onLoadMock={loadMockLesson}
          />
        </div>
      </div>
    </div>
  );
}
