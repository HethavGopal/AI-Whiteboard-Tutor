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

    // #region agent log
    fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "lesson-source-debug", hypothesisId: "H4", location: "components/whiteboard-canvas.tsx:89", message: "canvas starting lesson playback", data: { lessonId: lessonPlan?.id ?? null, title: lessonPlan?.title ?? null, stepCount: lessonPlan?.steps.length ?? 0, currentStepIndex, currentStepTitle: currentStep?.title ?? null, renderRevision, lessonMode }, timestamp: Date.now() }) }).catch(() => {});
    console.info("[debug69a9ec]", "canvas starting lesson playback", {
      lessonId: lessonPlan?.id ?? null,
      title: lessonPlan?.title ?? null,
      stepCount: lessonPlan?.steps.length ?? 0,
      currentStepIndex,
      currentStepTitle: currentStep?.title ?? null,
      renderRevision,
      lessonMode,
    });
    // #endregion

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

      {/* Top-left status badge */}
      <div className="pointer-events-none absolute left-4 top-4">
        <div className="rounded-full border border-[#eadfd6] bg-white/90 px-3 py-1 text-xs font-medium text-[#6f625b] shadow-sm backdrop-blur">
          {isMounted
            ? `Canvas ready | Step ${currentStepIndex + 1}${renderResult.isAnimating ? " | Animating…" : ""}`
            : "Mounting canvas…"}
        </div>
      </div>

      {/* Top-right step info */}
      {currentStep ? (
        <div className="pointer-events-none absolute right-4 top-4 max-w-[220px]">
          <div className="rounded-2xl border border-[#eadfd6] bg-white/90 px-3 py-2 text-xs text-[#6f625b] shadow-sm backdrop-blur">
            <p className="font-semibold text-[#2f241f]">{currentStep.title}</p>
            <p className="mt-1 text-[#9b8f87]">
              Labels tracked:{" "}
              {Object.keys(renderResult.labelMap).join(", ") || "none"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Bottom-left render info */}
      <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm">
        <div className="rounded-2xl border border-[#eadfd6] bg-white/90 px-3 py-2 text-xs text-[#6f625b] shadow-sm backdrop-blur">
          <p className="font-semibold text-[#2f241f]">
            Rendered actions: {renderResult.renderedActionIds.length}
          </p>
          <p className="mt-1">
            Rebuild strategy: steps 1 through{" "}
            {Math.max(currentStepIndex + 1, 0)}
          </p>
          {renderResult.activeActionId ? (
            <p className="mt-1 text-[#ff7a2f]">
              Active action: {renderResult.activeActionId}
            </p>
          ) : null}
          {renderResult.warnings.length > 0 ? (
            <p className="mt-1 text-amber-600">
              Warnings: {renderResult.warnings.join(" | ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
