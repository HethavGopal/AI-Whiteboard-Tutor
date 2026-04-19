"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTutorStore } from "@/lib/tutor-store";
import { buildSnapshotFromEditor } from "@/lib/whiteboard-renderer";

type LocalState = "idle" | "recording" | "transcribing" | "thinking" | "error";

function MicIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

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
    lessonMode,
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

  const title = (() => {
    if (localState === "recording") return "Listening… release to send";
    if (localState === "transcribing") return "Transcribing…";
    if (localState === "thinking") return "Thinking…";
    if (disabled) return "Mic disabled during branch";
    return "Hold to ask a question";
  })();

  const buttonClass = (() => {
    const base =
      "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border transition";
    if (disabled) {
      return `${base} cursor-not-allowed border-[#eadfd6] bg-[#f5f0eb] text-[#9b8f87]`;
    }
    if (localState === "recording") {
      return `${base} animate-pulse border-red-300 bg-red-100 text-red-500`;
    }
    if (localState === "transcribing" || localState === "thinking") {
      return `${base} cursor-wait border-amber-300 bg-amber-50 text-amber-500`;
    }
    if (localState === "error") {
      return `${base} border-red-300 bg-red-50 text-red-400`;
    }
    return `${base} border-[#ff914d]/40 bg-[#fff1e8] text-[#ff7a2f] hover:bg-[#ffdfc9] active:scale-95`;
  })();

  const icon = (() => {
    if (localState === "recording") return <StopIcon />;
    if (localState === "transcribing" || localState === "thinking")
      return <SpinnerIcon />;
    return <MicIcon />;
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={
          disabled ||
          localState === "transcribing" ||
          localState === "thinking"
        }
        onPointerDown={handleStart}
        onPointerUp={handleStop}
        onPointerLeave={() => {
          if (localState === "recording") void handleStop();
        }}
        title={title}
        aria-label={title}
        className={buttonClass}
      >
        {icon}
      </button>

      {errorText && (
        <p className="max-w-[200px] text-[10px] leading-tight text-red-400">
          {errorText}
        </p>
      )}

      {showResume && (
        <button
          type="button"
          onClick={handleResume}
          className="rounded-lg border border-[#eadfd6] bg-white px-2 py-1 text-[10px] font-medium text-[#6f625b] transition hover:bg-[#fff1e8] hover:text-[#ff7a2f] whitespace-nowrap"
        >
          Resume lesson
        </button>
      )}
    </div>
  );
}
