"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

import type { BranchPlan, LessonPlan } from "@/lib/tutor-core";
import {
  isWhiteboardPlaybackAbortError,
  playBranchStepOnTop,
  playLessonToBoard,
  type LabelMap,
  type WhiteboardPlaybackSnapshot,
} from "@/lib/whiteboard-renderer";
import { useTutorStore } from "@/lib/tutor-store";

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

function lookupLabelForActionId(
  actionId: string | null,
  drawActions: { id: string; semanticLabel?: string }[] | undefined,
): string | null {
  if (!actionId || !drawActions) return null;
  const found = drawActions.find((a) => a.id === actionId);
  return found?.semanticLabel ?? null;
}

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
  const liveLabelMapRef = useRef<LabelMap>({});

  const lessonMode = useTutorStore((s) => s.lessonMode);
  const branchPlan = useTutorStore((s) => s.branchPlan);
  const branchStepIndex = useTutorStore((s) => s.branchStepIndex);
  const setEditor = useTutorStore((s) => s.setEditor);
  const setLastDrawnLabel = useTutorStore((s) => s.setLastDrawnLabel);
  const pushBranchShapeIds = useTutorStore((s) => s.pushBranchShapeIds);

  const currentStep = lessonPlan?.steps[currentStepIndex] ?? null;
  const currentStepActionCount = currentStep?.drawActions.length ?? 0;

  const branchStep: BranchPlan["steps"][number] | null =
    branchPlan?.steps[branchStepIndex] ?? null;
  const branchStepActionCount = branchStep?.drawActions.length ?? 0;

  // Main / paused effect: drives main-step playback, also handles freeze on pause.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isMounted) return;

    if (lessonMode === "branch" || lessonMode === "awaiting_confirm") {
      return;
    }

    if (lessonMode === "paused") {
      // Freeze: don't restart drawing, don't wipe. The pause was triggered
      // by the mic button; we keep whatever is on the board right now.
      return;
    }

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
          liveLabelMapRef.current = snapshot.labelMap;
          const label = lookupLabelForActionId(
            snapshot.activeActionId,
            currentStep?.drawActions,
          );
          if (label) setLastDrawnLabel(label);
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
      });

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
    lessonMode,
    currentStep?.drawActions,
    setLastDrawnLabel,
  ]);

  // Branch effect: plays the current branch step on top of the existing board.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isMounted) return;
    if (lessonMode !== "branch") return;
    if (!branchPlan || !branchStep) return;

    const controller = new AbortController();

    setRenderResult((previous) => ({
      ...previous,
      isAnimating: branchStepActionCount > 0,
      activeActionId: null,
    }));

    void playBranchStepOnTop(editor, branchPlan, branchStepIndex, {
      signal: controller.signal,
      baseLabelMap: liveLabelMapRef.current,
      onUpdate: (snapshot) => {
        if (!controller.signal.aborted) {
          setRenderResult(snapshot);
          liveLabelMapRef.current = snapshot.labelMap;
        }
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.newShapeIds.length) {
          pushBranchShapeIds(result.newShapeIds);
        }
      })
      .catch((error) => {
        if (!isWhiteboardPlaybackAbortError(error)) {
          setRenderResult((previous) => ({
            ...previous,
            isAnimating: false,
            warnings: [...previous.warnings, "Branch playback failed."],
          }));
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    branchPlan,
    branchStep,
    branchStepActionCount,
    branchStepIndex,
    isMounted,
    lessonMode,
    pushBranchShapeIds,
  ]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-sky-950/10">
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor;
          setEditor(editor);
          setIsMounted(true);
        }}
      />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-xs font-medium text-sky-900 shadow-sm backdrop-blur">
          {isMounted
            ? `Canvas ready | Step ${currentStepIndex + 1}${renderResult.isAnimating ? " | Animating..." : ""} | Mode: ${lessonMode}`
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
