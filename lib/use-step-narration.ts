"use client";

import { useCallback, useEffect, useRef } from "react";

import { useTutorStore } from "@/lib/tutor-store";

export function useStepNarration() {
  const lessonPlan = useTutorStore((s) => s.lessonPlan);
  const currentStepIndex = useTutorStore((s) => s.currentStepIndex);
  const nextStep = useTutorStore((s) => s.nextStep);
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
    if (!lessonPlan) return;
    const step = lessonPlan.steps[currentStepIndex];
    if (!step) return;

    const isLastStep = currentStepIndex >= lessonPlan.steps.length - 1;
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    setNarrationState("queued");

    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: step.narration }),
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

          if (isLastStep) {
            setNarrationState("idle");
          } else {
            nextStep();
          }
        };

        audio.onerror = () => {
          setNarrationState("idle");
        };

        try {
          await audio.play();
          setNarrationState("speaking");
        } catch (err) {
          console.warn("audio.play() blocked:", err);
          setNarrationState("idle");
        }

        // TODO (polish): prefetch step N+1 narration here to warm /api/tts cache.
        // const next = lessonPlan.steps[currentStepIndex + 1];
        // if (next) {
        //   void fetch("/api/tts", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({ text: next.narration }),
        //   }).catch(() => {});
        // }
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
    lessonPlan,
    currentStepIndex,
    cleanup,
    nextStep,
    setNarrationState,
  ]);

  return { narrationState, stop };
}
