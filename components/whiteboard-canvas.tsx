"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

import type { LessonPlan } from "@/lib/tutor-core";
import {
  isWhiteboardPlaybackAbortError,
  playLessonToBoard,
  type WhiteboardPlaybackSnapshot,
} from "@/lib/whiteboard-renderer";

type WhiteboardCanvasProps = {
  lessonPlan: LessonPlan | null;
  currentStepIndex: number;
  renderRevision: number;
  onStepPlaybackComplete?: () => void;
};

const emptyRenderResult: WhiteboardPlaybackSnapshot = {
  labelMap: {},
  renderedActionIds: [],
  warnings: [],
  isAnimating: false,
  activeActionId: null,
};

export function WhiteboardCanvas({
  lessonPlan,
  currentStepIndex,
  renderRevision,
  onStepPlaybackComplete,
}: WhiteboardCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [renderResult, setRenderResult] =
    useState<WhiteboardPlaybackSnapshot>(emptyRenderResult);

  const currentStep = lessonPlan?.steps[currentStepIndex] ?? null;
  const currentStepActionCount = currentStep?.drawActions.length ?? 0;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isMounted) return;

    const controller = new AbortController();

    setRenderResult((previous) => ({
      ...previous,
      isAnimating: currentStepActionCount > 0,
      activeActionId: null,
    }));

    void playLessonToBoard(editor, lessonPlan, currentStepIndex, {
      signal: controller.signal,
      onUpdate: (snapshot) => {
        if (!controller.signal.aborted) {
          setRenderResult(snapshot);
        }
      },
    })
      .then(() => {
        const isLastStep =
          !lessonPlan || currentStepIndex >= lessonPlan.steps.length - 1;

        if (!controller.signal.aborted && !isLastStep) {
          onStepPlaybackComplete?.();
        }
      })
      .catch((error) => {
        if (!isWhiteboardPlaybackAbortError(error)) {
          setRenderResult((previous) => ({
            ...previous,
            isAnimating: false,
            warnings: [...previous.warnings, "Playback failed."],
          }));
        }
      }
    );

    return () => {
      controller.abort();
    };
  }, [
    currentStepActionCount,
    currentStepIndex,
    isMounted,
    lessonPlan,
    onStepPlaybackComplete,
    renderRevision,
  ]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-sky-950/10">
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor;
          setIsMounted(true);
        }}
      />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-xs font-medium text-sky-900 shadow-sm backdrop-blur">
          {isMounted
            ? `Canvas ready | Step ${currentStepIndex + 1}${renderResult.isAnimating ? " | Animating..." : ""}`
            : "Mounting canvas..."}
        </div>

        {currentStep ? (
          <div className="max-w-full rounded-2xl border border-zinc-200 bg-white/90 px-3 py-2 text-xs text-zinc-700 shadow-sm backdrop-blur">
            <p className="font-semibold text-zinc-900">{currentStep.title}</p>
            <p className="mt-1">
              Labels tracked:{" "}
              {Object.keys(renderResult.labelMap).join(", ") || "none"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-2xl border border-zinc-200 bg-white/92 px-3 py-2 text-xs text-zinc-700 shadow-sm backdrop-blur">
        <p className="font-semibold text-zinc-900">
          Rendered actions: {renderResult.renderedActionIds.length}
        </p>
        <p className="mt-1">
          Rebuild strategy: steps 1 through {Math.max(currentStepIndex + 1, 0)}
        </p>
        {renderResult.activeActionId ? (
          <p className="mt-1 text-sky-700">
            Active action: {renderResult.activeActionId}
          </p>
        ) : null}
        {renderResult.warnings.length > 0 ? (
          <p className="mt-1 text-amber-700">
            Warnings: {renderResult.warnings.join(" | ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
