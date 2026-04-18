"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTutorStore } from "@/lib/tutor-store";
import { buildSnapshotFromEditor } from "@/lib/whiteboard-renderer";

type LocalState = "idle" | "recording" | "transcribing" | "thinking" | "error";

export function MicButton() {
  const lessonMode = useTutorStore((s) => s.lessonMode);
  const lessonPlan = useTutorStore((s) => s.lessonPlan);
  const currentStepIndex = useTutorStore((s) => s.currentStepIndex);
  const editor = useTutorStore((s) => s.editor);
  const beginInterruption = useTutorStore((s) => s.beginInterruption);
  const cancelInterruption = useTutorStore((s) => s.cancelInterruption);
  const setBranchPlan = useTutorStore((s) => s.setBranchPlan);
  const setThinking = useTutorStore((s) => s.setThinking);
  const setLastTranscript = useTutorStore((s) => s.setLastTranscript);
  const setBranchError = useTutorStore((s) => s.setBranchError);
  const setRecordingState = useTutorStore((s) => s.setRecordingState);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [localState, setLocalState] = useState<LocalState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const disabled =
    lessonMode === "branch" || lessonMode === "awaiting_confirm";

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const handleStop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setLocalState("idle");
      setRecordingState("idle");
      return;
    }

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolve(blob);
      };
    });

    recorder.stop();
    const audioBlob = await stopped;
    cleanupStream();
    setRecordingState("idle");

    setLocalState("transcribing");
    setThinking(true);

    try {
      const sttForm = new FormData();
      sttForm.append("audio", audioBlob, "utterance.webm");
      const sttRes = await fetch("/api/stt", {
        method: "POST",
        body: sttForm,
      });
      const sttPayload = (await sttRes.json()) as {
        transcript?: string;
        confidence?: number;
        error?: string;
      };

      if (sttPayload.error === "unclear" || !sttPayload.transcript) {
        setErrorText("I didn't catch that. Try again or hit Resume.");
        setLocalState("error");
        setThinking(false);
        return;
      }
      setLastTranscript(sttPayload.transcript);

      if (!editor || !lessonPlan) {
        setErrorText("Whiteboard not ready.");
        setLocalState("error");
        setThinking(false);
        return;
      }

      const { pauseState } = useTutorStore.getState();
      const snapshot = buildSnapshotFromEditor(
        editor,
        pauseState?.lastDrawnLabel ?? null,
      );

      setLocalState("thinking");

      const branchRes = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: lessonPlan.problem,
          currentStepNarration:
            lessonPlan.steps[currentStepIndex]?.narration ?? "",
          snapshot,
          lastDrawnLabel: pauseState?.lastDrawnLabel ?? null,
          question: sttPayload.transcript,
        }),
      });

      const branchPayload = (await branchRes.json()) as Record<string, unknown>;
      if (!branchRes.ok) {
        const message =
          typeof branchPayload.error === "string"
            ? branchPayload.error
            : "Branch generation failed.";
        setBranchError(message);
        setErrorText(message);
        setLocalState("error");
        setThinking(false);
        return;
      }

      setBranchPlan(branchPayload as Parameters<typeof setBranchPlan>[0]);
      setThinking(false);
      setLocalState("idle");
      setErrorText(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Voice question failed.";
      setBranchError(msg);
      setErrorText(msg);
      setLocalState("error");
      setThinking(false);
    }
  }, [
    cleanupStream,
    editor,
    lessonPlan,
    currentStepIndex,
    setBranchError,
    setBranchPlan,
    setLastTranscript,
    setRecordingState,
    setThinking,
  ]);

  const handleStart = useCallback(async () => {
    if (disabled) return;
    setErrorText(null);
    setBranchError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      beginInterruption();
      setRecordingState("listening");
      setLocalState("recording");
      recorder.start();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone unavailable.";
      setErrorText(msg);
      setLocalState("error");
      cleanupStream();
    }
  }, [
    beginInterruption,
    cleanupStream,
    disabled,
    setBranchError,
    setRecordingState,
  ]);

  // Cleanup on unmount.
  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const handleResume = () => {
    setErrorText(null);
    setLocalState("idle");
    setThinking(false);
    cancelInterruption();
  };

  const showResume =
    lessonMode === "paused" &&
    (localState === "idle" || localState === "error");

  const buttonLabel = (() => {
    if (localState === "recording") return "Listening...";
    if (localState === "transcribing") return "Transcribing...";
    if (localState === "thinking") return "Thinking...";
    if (disabled) return "Mic disabled";
    return "Hold to ask";
  })();

  const buttonClass = (() => {
    const base =
      "select-none rounded-2xl border px-4 py-2 text-sm font-medium transition";
    if (disabled) {
      return `${base} cursor-not-allowed border-white/10 bg-white/5 text-zinc-500`;
    }
    if (localState === "recording") {
      return `${base} border-rose-300 bg-rose-300/20 text-rose-100 animate-pulse`;
    }
    if (localState === "transcribing" || localState === "thinking") {
      return `${base} cursor-wait border-amber-300/50 bg-amber-300/15 text-amber-100`;
    }
    return `${base} border-emerald-300/50 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25`;
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || localState === "transcribing" || localState === "thinking"}
          onPointerDown={handleStart}
          onPointerUp={handleStop}
          onPointerLeave={() => {
            if (localState === "recording") void handleStop();
          }}
          className={buttonClass}
        >
          {buttonLabel}
        </button>

        {showResume ? (
          <button
            type="button"
            onClick={handleResume}
            className="rounded-2xl border border-sky-400/40 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25"
          >
            Resume lesson
          </button>
        ) : null}
      </div>
      {errorText ? (
        <p className="text-xs text-rose-200">{errorText}</p>
      ) : null}
    </div>
  );
}
