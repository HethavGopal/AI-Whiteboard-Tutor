"use client";

import { useCallback, useEffect, useRef } from "react";

import { useTutorStore } from "@/lib/tutor-store";

export function useStepNarration() {
  const lessonPlan = useTutorStore((s) => s.lessonPlan);
  const currentStepIndex = useTutorStore((s) => s.currentStepIndex);
  const lessonMode = useTutorStore((s) => s.lessonMode);
  const branchPlan = useTutorStore((s) => s.branchPlan);
  const branchStepIndex = useTutorStore((s) => s.branchStepIndex);
  const nextStep = useTutorStore((s) => s.nextStep);
  const advanceBranchStep = useTutorStore((s) => s.advanceBranchStep);
  const setNarrationState = useTutorStore((s) => s.setNarrationState);
  const narrationState = useTutorStore((s) => s.narrationState);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setNarrationState("idle");
  }, [cleanup, setNarrationState]);

  useEffect(() => {
    if (lessonMode === "paused" || lessonMode === "awaiting_confirm") {
      cleanup();
      setNarrationState("idle");
      return;
    }

    let narrationText: string | null = null;
    let isLastChunk = false;
    let onComplete: () => void = () => {};

    if (lessonMode === "main") {
      if (!lessonPlan) return;
      const step = lessonPlan.steps[currentStepIndex];
      if (!step) return;
      narrationText = step.narration;
      isLastChunk = currentStepIndex >= lessonPlan.steps.length - 1;
      onComplete = () => {
        // Guard: only advance if we're still in main mode by the time audio ends.
        if (useTutorStore.getState().lessonMode !== "main") return;
        if (isLastChunk) {
          setNarrationState("idle");
        } else {
          nextStep();
        }
      };
    } else if (lessonMode === "branch") {
      if (!branchPlan) return;
      const step = branchPlan.steps[branchStepIndex];
      if (!step) return;
      narrationText = step.narration;
      onComplete = () => {
        if (useTutorStore.getState().lessonMode !== "branch") return;
        advanceBranchStep();
      };
    }

    if (!narrationText) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    setNarrationState("queued");

    // #region agent log
    fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "line-delay-debug", hypothesisId: "H7", location: "lib/use-step-narration.ts:90", message: "narration queued for step", data: { lessonMode, currentStepIndex, branchStepIndex, narrationLength: narrationText.length, preview: narrationText.slice(0, 80) }, timestamp: Date.now() }) }).catch(() => {});
    console.info("[debug69a9ec]", "narration queued for step", {
      lessonMode,
      currentStepIndex,
      branchStepIndex,
      narrationLength: narrationText.length,
      preview: narrationText.slice(0, 80),
    });
    // #endregion

    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: narrationText }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);

        const blob = await res.blob();
        if (controller.signal.aborted || cancelled) return;

        const url = URL.createObjectURL(blob);
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
          }
          audioRef.current = null;
          onComplete();
        };

        audio.onerror = () => {
          setNarrationState("idle");
        };

        try {
          await audio.play();
          setNarrationState("speaking");
          // #region agent log
          fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "line-delay-debug", hypothesisId: "H7", location: "lib/use-step-narration.ts:126", message: "narration audio started", data: { lessonMode, currentStepIndex, branchStepIndex, narrationLength: narrationText.length }, timestamp: Date.now() }) }).catch(() => {});
          console.info("[debug69a9ec]", "narration audio started", {
            lessonMode,
            currentStepIndex,
            branchStepIndex,
            narrationLength: narrationText.length,
          });
          // #endregion
        } catch (err) {
          console.warn("audio.play() blocked:", err);
          setNarrationState("idle");
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("narration failed:", err);
        setNarrationState("idle");
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    lessonMode,
    lessonPlan,
    currentStepIndex,
    branchPlan,
    branchStepIndex,
    cleanup,
    nextStep,
    advanceBranchStep,
    setNarrationState,
  ]);

  return { narrationState, stop };
}
