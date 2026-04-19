"use client";

import { useEffect, useRef } from "react";

import { useTutorStore } from "@/lib/tutor-store";

const YES_PATTERN = /\b(yes|yeah|yep|sure|continue|go|ok|okay|please)\b/i;
const WINDOW_MS = 4000;

export function useResumeVoiceWindow() {
  const lessonMode = useTutorStore((s) => s.lessonMode);
  const resumeMainLesson = useTutorStore((s) => s.resumeMainLesson);
  const setLastTranscript = useTutorStore((s) => s.setLastTranscript);
  const setRecordingState = useTutorStore((s) => s.setRecordingState);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (lessonMode !== "awaiting_confirm") return;
    cancelledRef.current = false;
    // This lightweight hook point lets the avatar present a listening pose
    // during the short post-branch voice-confirm window as well.
    setRecordingState("listening");

    let stopTimer: number | undefined;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (cancelledRef.current) return;
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          if (blob.size < 1000) return;
          try {
            const form = new FormData();
            form.append("audio", blob, "resume.webm");
            const res = await fetch("/api/stt", { method: "POST", body: form });
            const payload = (await res.json()) as {
              transcript?: string;
              error?: string;
            };
            if (
              !cancelledRef.current &&
              payload.transcript &&
              YES_PATTERN.test(payload.transcript)
            ) {
              setLastTranscript(payload.transcript);
              resumeMainLesson();
            }
          } catch {
            // silent — button is still available.
          }
        };

        recorder.start();
        stopTimer = window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, WINDOW_MS);
      } catch {
        // mic denied — user can still use the button.
      }
    })();

    return () => {
      cancelledRef.current = true;
      setRecordingState("idle");
      if (stopTimer) window.clearTimeout(stopTimer);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, [lessonMode, resumeMainLesson, setLastTranscript, setRecordingState]);
}
