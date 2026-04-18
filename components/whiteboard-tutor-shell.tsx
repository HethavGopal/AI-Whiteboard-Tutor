"use client";

import { useState } from "react";

import { WhiteboardCanvas } from "@/components/whiteboard-canvas";
import { lessonPlanSchema } from "@/lib/tutor-core";
import { useTutorStore } from "@/lib/tutor-store";

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
      <span className="text-zinc-400">{label}:</span> {value}
    </div>
  );
}

export function WhiteboardTutorShell() {
  const {
    problemInput,
    lessonPlan,
    currentStepIndex,
    renderRevision,
    appMode,
    recordingState,
    narrationState,
    setProblemInput,
    setLessonPlan,
    setAppMode,
    previousStep,
    nextStep,
    resetLessonPlayback,
    replayCurrentStep,
    loadMockLesson,
  } = useTutorStore();
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const currentStep = lessonPlan?.steps[currentStepIndex] ?? null;
  const totalSteps = lessonPlan?.steps.length ?? 0;

  async function handleGenerateLesson() {
    const trimmedProblem = problemInput.trim();
    if (!trimmedProblem) {
      setGenerationError("Enter a problem before generating a lesson.");
      return;
    }

    setIsGeneratingLesson(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ problemText: trimmedProblem }),
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Lesson generation failed.");
      }

      const lessonPlan = lessonPlanSchema.parse(payload);
      setLessonPlan(lessonPlan);
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Lesson generation failed.",
      );
    } finally {
      setIsGeneratingLesson(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#0f172a_0%,_#111827_42%,_#020617_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-sky-300">
                Hackathon MVP Foundation
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                AI Whiteboard Tutor
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300 sm:text-base">
                Bootstrap layer for typed input, lesson state, a live whiteboard
                surface, and future-ready hooks for perception, reasoning, and
                audio.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusPill label="Mode" value={appMode} />
              <StatusPill label="Recording" value={recordingState} />
              <StatusPill label="Narration" value={narrationState} />
              <StatusPill
                label="Step"
                value={
                  totalSteps > 0 ? `${currentStepIndex + 1} / ${totalSteps}` : "0 / 0"
                }
              />
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Problem input</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadMockLesson}
                  className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200 transition hover:border-sky-300 hover:bg-sky-400/20"
                >
                  Load mock lesson
                </button>
              </div>
            </div>

            <p className="mt-2 text-sm text-zinc-300">
              This panel is the eventual entry point for typed questions, image
              uploads, and model-triggering controls.
            </p>

            <label className="mt-5 block text-sm font-medium text-zinc-200">
              Typed problem
            </label>
            <textarea
              value={problemInput}
              onChange={(event) => setProblemInput(event.target.value)}
              placeholder="Type a math problem or question..."
              className="mt-2 min-h-40 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerateLesson}
                disabled={isGeneratingLesson}
                className="rounded-2xl border border-sky-300 bg-sky-300/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-300/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingLesson ? "Generating lesson..." : "Generate Lesson"}
              </button>
            </div>

            {generationError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {generationError}
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-sm font-medium text-zinc-200">Session mode</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["lesson", "follow-up"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAppMode(mode)}
                    className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                      appMode === mode
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    {mode === "lesson" ? "Main lesson" : "Follow-up"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <p className="font-semibold">Lesson generation path</p>
              <p className="mt-1 text-emerald-50/90">
                Typed input now drives lesson generation. Image extraction,
                narration, and interruption handling will plug into this same
                lesson state without replacing the current playback system.
              </p>
            </div>
          </aside>

          <section className="flex min-h-[60vh] flex-col rounded-[28px] border border-white/10 bg-slate-100/95 p-3 text-zinc-900 shadow-2xl shadow-sky-950/20">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-700">
                  Whiteboard
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {lessonPlan?.title ?? "No lesson loaded"}
                </h2>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                Whiteboard renderer bridge active
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <WhiteboardCanvas
                lessonPlan={lessonPlan}
                currentStepIndex={currentStepIndex}
                renderRevision={renderRevision}
                onStepPlaybackComplete={nextStep}
              />
            </div>
          </section>

          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Lesson + transcript
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  Mock lesson content is live now. Transcript space is reserved
                  for future Deepgram events and interruption-aware follow-ups.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                Current step
              </p>
              <p className="mt-2 text-sm font-medium text-sky-200">
                Step {totalSteps > 0 ? currentStepIndex + 1 : 0} of {totalSteps}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {currentStep?.title ?? "No step selected"}
              </h3>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-zinc-500">
                Narration
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {currentStep?.narration ?? "Load a lesson to begin."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={previousStep}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="rounded-2xl border border-sky-400/40 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={resetLessonPlayback}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Reset to step 1
                </button>
                <button
                  type="button"
                  onClick={replayCurrentStep}
                  className="rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25"
                >
                  Replay render
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {lessonPlan?.steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`rounded-3xl border p-4 transition ${
                      isActive
                        ? "border-sky-300/60 bg-sky-400/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                      Step {index + 1}
                    </p>
                    <p className="mt-1 font-medium text-white">{step.title}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      {step.narration}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50">
              <p className="font-semibold">Transcript placeholder</p>
              <p className="mt-1 text-amber-50/90">
                Future live transcription will append utterances here, flag
                interruptions, and switch the app from main lesson mode into
                follow-up mode when needed.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
