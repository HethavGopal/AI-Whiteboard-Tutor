"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useRive,
  useStateMachineInput,
  type StateMachineInput,
} from "@rive-app/react-canvas";

import { useTutorStore } from "@/lib/tutor-store";

type TutorAvatarProps = {
  isGenerating?: boolean;
  variant?: "panel" | "overlay";
};

type AvatarMode = "idle" | "speaking" | "thinking" | "listening";
type MouthState = "mouthClosed" | "mouthHappy";

const AVATAR_SRC = "/avatar.riv";
const AVATAR_ARTBOARD = "Avatar 1";
const AVATAR_STATE_MACHINE = "avatar";

function setRiveInput(input: StateMachineInput | null, active: boolean) {
  if (!input) return;

  const candidate = input as StateMachineInput & {
    value?: unknown;
    fire?: () => void;
  };

  if (typeof candidate.value === "boolean") {
    candidate.value = active;
    return;
  }

  if (typeof candidate.value === "number") {
    candidate.value = active ? 1 : 0;
    return;
  }

  if (active && typeof candidate.fire === "function") {
    candidate.fire();
  }
}

function TutorAvatarFallback({ mode }: { mode: AvatarMode }) {
  const label =
    mode === "speaking"
      ? "Speaking"
      : mode === "thinking"
        ? "Thinking"
        : mode === "listening"
          ? "Listening"
          : "Idle";

  return (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff7f1_0%,#ffe7d4_48%,#ffd3af_100%)]">
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/70 bg-white/70 text-3xl font-bold text-[#ff7a2f] shadow-[0_10px_24px_rgba(255,145,77,0.18)]">
        B
      </div>
      <span className="sr-only">{label} tutor avatar placeholder</span>
    </div>
  );
}

function useNarrationAudioLevel(
  audio: HTMLAudioElement | null,
  enabled: boolean,
) {
  const [level, setLevel] = useState(0);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!enabled || !audio) {
      setLevel(0);
      setIsLive(false);
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextCtor) {
      setLevel(0);
      setIsLive(false);
      return;
    }

    let animationFrame = 0;
    let disposed = false;
    let context: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      context = new AudioContextCtor();
      source = context.createMediaElementSource(audio);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyser.connect(context.destination);
      setIsLive(true);
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
          hypothesisId: "H3",
          location: "components/tutor-avatar.tsx:108",
          message: "Web Audio mouth analyser started",
          data: {
            paused: audio.paused,
            readyState: audio.readyState,
            currentTime: audio.currentTime,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (error) {
      // If Web Audio setup fails, the avatar falls back to a lightweight fake
      // speaking pattern instead of breaking narration playback.
      setLevel(0);
      setIsLive(false);
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
          hypothesisId: "H3",
          location: "components/tutor-avatar.tsx:126",
          message: "Web Audio mouth analyser failed",
          data: {
            error:
              error instanceof Error
                ? error.message
                : "unknown analyser error",
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return;
    }

    const samples = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;

    const sample = () => {
      if (disposed || !analyser) return;

      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        total += centered * centered;
      }
      const rms = Math.sqrt(total / samples.length);
      const normalized = Math.min(rms * 3.2, 1);
      smoothed = smoothed * 0.68 + normalized * 0.32;
      setLevel(smoothed);
      animationFrame = window.requestAnimationFrame(sample);
    };

    void context.resume().catch(() => {
      setIsLive(false);
    });
    sample();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      setLevel(0);
      setIsLive(false);
      analyser?.disconnect();
      source?.disconnect();
      void context?.close().catch(() => {});
    };
  }, [audio, enabled]);

  return { level, isLive };
}

export function TutorAvatar({
  isGenerating = false,
  variant = "panel",
}: TutorAvatarProps) {
  const narrationState = useTutorStore((s) => s.narrationState);
  const recordingState = useTutorStore((s) => s.recordingState);
  const lessonMode = useTutorStore((s) => s.lessonMode);
  const currentStepIndex = useTutorStore((s) => s.currentStepIndex);
  const branchStepIndex = useTutorStore((s) => s.branchStepIndex);
  const activeNarrationAudio = useTutorStore((s) => s.activeNarrationAudio);
  const isThinking = useTutorStore((s) => s.isThinking);

  const [assetState, setAssetState] = useState<"checking" | "ready" | "failed">(
    "checking",
  );
  const [mouthState, setMouthState] = useState<MouthState>("mouthClosed");
  const [riveReady, setRiveReady] = useState(false);
  const [isNodding, setIsNodding] = useState(false);
  const lastStepKeyRef = useRef<string | null>(null);
  const lastLoggedMouthStateRef = useRef<MouthState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(AVATAR_SRC, { cache: "force-cache" })
      .then((response) => {
        if (!cancelled) {
          setAssetState(response.ok ? "ready" : "failed");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { rive, RiveComponent } = useRive(
    assetState === "ready"
      ? {
          src: AVATAR_SRC,
          artboard: AVATAR_ARTBOARD,
          stateMachines: AVATAR_STATE_MACHINE,
          autoplay: true,
          shouldDisableRiveListeners: true,
          onRiveReady: () => {
            setRiveReady(true);
          },
        }
      : null,
    {
      shouldResizeCanvasToContainer: true,
    },
  );

  useEffect(() => {
    if (assetState !== "ready") {
      setRiveReady(false);
    }
  }, [assetState]);

  const isListening = recordingState === "listening";
  const isSpeaking =
    narrationState === "speaking" && Boolean(activeNarrationAudio);

  const avatarMode = useMemo<AvatarMode>(() => {
    if (isListening) return "listening";
    if (isSpeaking) return "speaking";
    if (isGenerating || isThinking) return "thinking";
    return "idle";
  }, [isGenerating, isListening, isSpeaking, isThinking]);

  const { level: audioLevel, isLive: hasLiveAudioLevel } =
    useNarrationAudioLevel(activeNarrationAudio, avatarMode === "speaking");

  const thinkingInput = useStateMachineInput(
    rive,
    AVATAR_STATE_MACHINE,
    "sad",
  );
  const idleInput = useStateMachineInput(rive, AVATAR_STATE_MACHINE, "idle");

  const mouthClosedInput = useStateMachineInput(
    rive,
    AVATAR_STATE_MACHINE,
    "mouthClosed",
  );
  const mouthHappyInput = useStateMachineInput(
    rive,
    AVATAR_STATE_MACHINE,
    "mouthHappy",
  );
  const mouthSadInput = useStateMachineInput(
    rive,
    AVATAR_STATE_MACHINE,
    "mouthSad",
  );

  const hasModeInputs = Boolean(idleInput || thinkingInput);

  useEffect(() => {
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
        hypothesisId: "H2-H4",
        location: "components/tutor-avatar.tsx:258",
        message: "Avatar state snapshot",
        data: {
          assetState,
          riveReady,
          avatarMode,
          narrationState,
          hasActiveNarrationAudio: Boolean(activeNarrationAudio),
          hasLiveAudioLevel,
          mouthState,
          inputs: {
            idle: Boolean(idleInput),
            thinking: Boolean(thinkingInput),
            mouthClosed: Boolean(mouthClosedInput),
            mouthHappy: Boolean(mouthHappyInput),
            mouthSad: Boolean(mouthSadInput),
          },
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [
    activeNarrationAudio,
    assetState,
    avatarMode,
    hasLiveAudioLevel,
    idleInput,
    mouthClosedInput,
    mouthHappyInput,
    mouthSadInput,
    mouthState,
    narrationState,
    riveReady,
    thinkingInput,
  ]);

  useEffect(() => {
    if (avatarMode !== "speaking" || hasLiveAudioLevel) return;

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
        hypothesisId: "H3",
        location: "components/tutor-avatar.tsx:287",
        message: "Starting fallback mouth animation",
        data: {
          avatarMode,
          hasLiveAudioLevel,
          hasActiveNarrationAudio: Boolean(activeNarrationAudio),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // If precise amplitude analysis is unavailable, keep a tiny timer-based
    // fallback so the hackathon demo still feels alive.
    const interval = window.setInterval(() => {
      setMouthState((current) =>
        current === "mouthClosed" ? "mouthHappy" : "mouthClosed",
      );
    }, 170);

    return () => {
      window.clearInterval(interval);
    };
  }, [avatarMode, hasLiveAudioLevel]);

  useEffect(() => {
    if (avatarMode !== "speaking") {
      setMouthState("mouthClosed");
      return;
    }
    if (!hasLiveAudioLevel) return;

    // Real lip sync can later map phonemes or blend-shapes here; for now we
    // lightly smooth amplitude into discrete mouth states from the Rive asset.
    setMouthState((current) => {
      const nextState =
        audioLevel < 0.05
          ? "mouthClosed"
          : audioLevel > 0.09
            ? "mouthHappy"
            : current;

      if (nextState !== current) {
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
            hypothesisId: "H3-H4",
            location: "components/tutor-avatar.tsx:320",
            message: "Mouth state changed from live audio",
            data: {
              audioLevel,
              previousState: current,
              nextState,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }

      return nextState;
    });
  }, [audioLevel, avatarMode, hasLiveAudioLevel]);

  useEffect(() => {
    const useIdlePose = avatarMode !== "thinking";
    setRiveInput(idleInput, useIdlePose);
    setRiveInput(thinkingInput, avatarMode === "thinking");
  }, [avatarMode, idleInput, thinkingInput]);

  useEffect(() => {
    setRiveInput(mouthClosedInput, mouthState === "mouthClosed");
    setRiveInput(mouthHappyInput, mouthState === "mouthHappy");
    setRiveInput(mouthSadInput, avatarMode === "thinking");
  }, [
    avatarMode,
    mouthClosedInput,
    mouthHappyInput,
    mouthSadInput,
    mouthState,
  ]);

  useEffect(() => {
    if (lastLoggedMouthStateRef.current === mouthState) return;
    lastLoggedMouthStateRef.current = mouthState;

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
        hypothesisId: "H4",
        location: "components/tutor-avatar.tsx:355",
        message: "Applied mouth state to Rive inputs",
        data: {
          mouthState,
          avatarMode,
          mouthClosedInputReady: Boolean(mouthClosedInput),
          mouthHappyInputReady: Boolean(mouthHappyInput),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [avatarMode, mouthClosedInput, mouthHappyInput, mouthState]);

  useEffect(() => {
    if (!rive || hasModeInputs) return;

    const animationName =
      avatarMode === "speaking"
        ? "happy"
        : avatarMode === "thinking"
          ? "sad"
          : "idle";

    const runtime = rive as {
      stop?: (animationNames?: string | string[]) => void;
      play?: (animationNames?: string | string[]) => void;
    };

    runtime.stop?.();
    runtime.play?.(animationName);
  }, [avatarMode, hasModeInputs, rive]);

  const activeStepKey =
    lessonMode === "branch"
      ? `branch:${branchStepIndex}`
      : lessonMode === "main" || lessonMode === "paused"
        ? `main:${currentStepIndex}`
        : null;

  useEffect(() => {
    if (!activeStepKey) return;
    if (lastStepKeyRef.current === null) {
      lastStepKeyRef.current = activeStepKey;
      return;
    }
    if (lastStepKeyRef.current === activeStepKey) return;

    // A small one-shot nod makes the avatar react when the lesson advances.
    lastStepKeyRef.current = activeStepKey;
    setIsNodding(true);
    const timeout = window.setTimeout(() => {
      setIsNodding(false);
    }, 560);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeStepKey]);

  const presenceStyle =
    avatarMode === "speaking"
      ? { animation: "avatar-speaking-bounce 0.95s ease-in-out infinite" }
      : avatarMode === "listening"
        ? { animation: "avatar-listening-focus 1.8s ease-in-out infinite" }
        : avatarMode === "idle"
          ? { animation: "avatar-idle-float 4.5s ease-in-out infinite" }
          : undefined;

  const nodStyle = isNodding
    ? { animation: "avatar-step-nod 560ms cubic-bezier(0.22, 1, 0.36, 1)" }
    : undefined;

  const showRive = assetState === "ready" && Boolean(RiveComponent);
  const isOverlay = variant === "overlay";

  if (isOverlay) {
    return (
      <div
        className={`pointer-events-none flex h-34 w-34 items-center justify-center rounded-full border bg-white/92 backdrop-blur ${
          avatarMode === "listening"
            ? "border-[#ffb27d] shadow-[0_0_0_8px_rgba(255,145,77,0.12),0_18px_38px_rgba(47,36,31,0.18)]"
            : "border-white/75 shadow-[0_16px_36px_rgba(47,36,31,0.16)]"
        }`}
        style={nodStyle}
      >
        <div className="relative flex h-[122px] w-[122px] items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_25%,#fffdfb_0%,#fff1e8_42%,#ffd7b8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="absolute inset-[6px] rounded-full border border-white/70" />
          <div
            className="relative h-[102px] w-[102px] transition-transform duration-300"
            style={presenceStyle}
          >
            {showRive && RiveComponent ? (
              <RiveComponent
                className={`h-full w-full transition-opacity duration-300 ${
                  riveReady ? "opacity-100" : "opacity-0"
                }`}
                aria-label="Tutor avatar animation"
              />
            ) : assetState === "failed" ? (
              <TutorAvatarFallback mode={avatarMode} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff7f1_0%,#ffe7d4_48%,#ffd3af_100%)]">
                <div className="h-7 w-7 rounded-full border-2 border-[#ff914d]/25 border-t-[#ff914d] animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className="rounded-[28px] border border-[#eadfd6] bg-[linear-gradient(135deg,#fff8f2_0%,#fff1e8_42%,#ffffff_100%)] p-4 shadow-[0_10px_32px_rgba(255,145,77,0.12)]"
      style={nodStyle}
    >
      <div className="mt-4 flex items-center gap-4">
        <div className="relative flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-[32px] border border-white/60 bg-[radial-gradient(circle_at_30%_25%,#fffdfb_0%,#fff1e8_42%,#ffd7b8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_16px_30px_rgba(255,145,77,0.18)]">
          <div className="absolute inset-2 rounded-[26px] border border-white/65" />
          <div
            className="relative h-28 w-28 transition-transform duration-300"
            style={presenceStyle}
          >
            {showRive && RiveComponent ? (
              <RiveComponent
                className={`h-full w-full transition-opacity duration-300 ${
                  riveReady ? "opacity-100" : "opacity-0"
                }`}
                aria-label="Tutor avatar animation"
              />
            ) : assetState === "failed" ? (
              <TutorAvatarFallback mode={avatarMode} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[26px] bg-[radial-gradient(circle_at_35%_30%,#fff7f1_0%,#ffe7d4_48%,#ffd3af_100%)]">
                <div className="h-8 w-8 rounded-full border-2 border-[#ff914d]/25 border-t-[#ff914d] animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
