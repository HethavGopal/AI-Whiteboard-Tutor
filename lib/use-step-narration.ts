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
  const setActiveNarrationAudio = useTutorStore((s) => s.setActiveNarrationAudio);
  const narrationState = useTutorStore((s) => s.narrationState);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveNarrationAudio(null);

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
  }, [setActiveNarrationAudio]);

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
        // The avatar reads the live audio element from the store so it can
        // derive real mouth movement without owning narration playback itself.
        setActiveNarrationAudio(audio);
        // #region agent log
        fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "7e7d1b",
          },
          body: JSON.stringify({
            sessionId: "7e7d1b",
            runId: "initial",
            hypothesisId: "H1",
            location: "lib/use-step-narration.ts:116",
            message: "Narration audio created for avatar",
            data: {
              lessonMode,
              currentStepIndex,
              branchStepIndex,
              narrationLength: narrationText.length,
              audioReadyState: audio.readyState,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        audio.onended = () => {
          if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
          }
          audioRef.current = null;
          setActiveNarrationAudio(null);
          onComplete();
        };

        audio.onerror = () => {
          setActiveNarrationAudio(null);
          setNarrationState("idle");
        };

        try {
          await audio.play();
          setNarrationState("speaking");
          // #region agent log
          fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "7e7d1b",
            },
            body: JSON.stringify({
              sessionId: "7e7d1b",
              runId: "initial",
              hypothesisId: "H1",
              location: "lib/use-step-narration.ts:147",
              message: "Narration audio playback started",
              data: {
                lessonMode,
                currentStepIndex,
                branchStepIndex,
                paused: audio.paused,
                currentTime: audio.currentTime,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        } catch (err) {
          console.warn("audio.play() blocked:", err);
          setActiveNarrationAudio(null);
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
    setActiveNarrationAudio,
  ]);

  return { narrationState, stop };
}
