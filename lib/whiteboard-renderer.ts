import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapeId,
} from "@tldraw/editor";

import type { DrawAction, LessonPlan } from "@/lib/tutor-core";

type ShapeBatch = Parameters<Editor["createShapes"]>[0];
type ShapePartial = NonNullable<ShapeBatch>[number];
export type LabelMap = Record<string, TLShapeId[]>;

export type WhiteboardRenderResult = {
  labelMap: LabelMap;
  renderedActionIds: string[];
  warnings: string[];
};

export type WhiteboardPlaybackSnapshot = WhiteboardRenderResult & {
  isAnimating: boolean;
  activeActionId: string | null;
};

type RenderContext = {
  editor: Editor;
  labelMap: LabelMap;
  renderedActionIds: string[];
  warnings: string[];
};

export const whiteboardPlaybackConfig = {
  defaultActionDelayMs: 550,
} as const;

export type WhiteboardPlaybackOptions = {
  actionDelayMs?: number;
  signal?: AbortSignal;
  onUpdate?: (snapshot: WhiteboardPlaybackSnapshot) => void;
};

function appendLabel(labelMap: LabelMap, label: string, shapeIds: TLShapeId[]) {
  labelMap[label] = [...(labelMap[label] ?? []), ...shapeIds];
}

function removeLabelTargets(labelMap: LabelMap, labels: string[]) {
  for (const label of labels) {
    delete labelMap[label];
  }
}

function getShapeIdsForLabel(labelMap: LabelMap, label: string) {
  return labelMap[label] ?? [];
}

function cloneLabelMap(labelMap: LabelMap): LabelMap {
  return Object.fromEntries(
    Object.entries(labelMap).map(([label, shapeIds]) => [label, [...shapeIds]]),
  );
}

function createAbortError() {
  const error = new Error("Whiteboard playback aborted.");
  error.name = "AbortError";
  return error;
}

export function isWhiteboardPlaybackAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function wait(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      cleanup();
      reject(createAbortError());
    }

    function cleanup() {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRenderContext(editor: Editor): RenderContext {
  return {
    editor,
    labelMap: {},
    renderedActionIds: [],
    warnings: [],
  };
}

function getRenderResult(context: RenderContext): WhiteboardRenderResult {
  return {
    labelMap: cloneLabelMap(context.labelMap),
    renderedActionIds: [...context.renderedActionIds],
    warnings: [...context.warnings],
  };
}

function getPlaybackSnapshot(
  context: RenderContext,
  isAnimating: boolean,
  activeActionId: string | null,
): WhiteboardPlaybackSnapshot {
  return {
    ...getRenderResult(context),
    isAnimating,
    activeActionId,
  };
}

function resetBoard(editor: Editor) {
  editor.selectNone();
  editor.deleteShapes(editor.getCurrentPageShapes());
}

function zoomBoardToContent(editor: Editor) {
  if (editor.getCurrentPageShapes().length > 0) {
    editor.zoomToFit({ immediate: true });
  }
}

function getBoundsForLabel(editor: Editor, labelMap: LabelMap, label: string) {
  const shapeIds = getShapeIdsForLabel(labelMap, label);
  const bounds = shapeIds
    .map((shapeId) => editor.getShapePageBounds(shapeId))
    .filter((bound): bound is NonNullable<typeof bound> => Boolean(bound));

  if (bounds.length === 0) {
    return null;
  }

  const minX = Math.min(...bounds.map((bound) => bound.minX));
  const minY = Math.min(...bounds.map((bound) => bound.minY));
  const maxX = Math.max(...bounds.map((bound) => bound.maxX));
  const maxY = Math.max(...bounds.map((bound) => bound.maxY));

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function createTextShape(action: Extract<DrawAction, { type: "create_shape"; kind: "text" }>): ShapePartial {
  return {
    id: createShapeId(action.semanticLabel),
    type: "text",
    x: action.x,
    y: action.y,
    meta: {
      semanticLabel: action.semanticLabel,
      actionId: action.id,
    },
    props: {
      color: "black",
      scale: 1,
      richText: toRichText(action.text),
      textAlign: "middle",
    },
  };
}

function createGeoShape(
  action: Extract<
    DrawAction,
    { type: "create_shape"; kind: "rect" | "ellipse" }
  >,
): ShapePartial {
  return {
    id: createShapeId(action.semanticLabel),
    type: "geo",
    x: action.x,
    y: action.y,
    meta: {
      semanticLabel: action.semanticLabel,
      actionId: action.id,
    },
    props: {
      geo: action.kind === "rect" ? "rectangle" : "ellipse",
      w: action.w,
      h: action.h,
      color: "black",
      fill: "none",
      dash: "draw",
      size: "m",
      url: "",
      growY: 0,
      scale: 1,
      labelColor: "black",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      richText: toRichText(action.text ?? ""),
    },
  };
}

function createLineShape(action: Extract<DrawAction, { type: "create_shape"; kind: "line" }>): ShapePartial {
  return {
    id: createShapeId(action.semanticLabel),
    type: "line",
    x: action.x1,
    y: action.y1,
    meta: {
      semanticLabel: action.semanticLabel,
      actionId: action.id,
    },
    props: {
      color: "black",
      dash: "draw",
      size: "m",
      spline: "line",
      scale: 1,
      points: {
        a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
        a2: {
          id: "a2",
          index: "a2" as never,
          x: action.x2 - action.x1,
          y: action.y2 - action.y1,
        },
      },
    },
  };
}

function applyCreateShapeAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "create_shape" }>,
) {
  const shape =
    action.kind === "text"
      ? createTextShape(action)
      : action.kind === "line"
        ? createLineShape(action)
        : createGeoShape(action);

  context.editor.createShapes([shape]);
  appendLabel(context.labelMap, action.semanticLabel, [shape.id as TLShapeId]);
}

function applyHighlightAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "highlight" }>,
) {
  const bounds = getBoundsForLabel(context.editor, context.labelMap, action.targetLabel);
  if (!bounds) {
    context.warnings.push(
      `Highlight "${action.semanticLabel}" could not find target "${action.targetLabel}".`,
    );
    return;
  }

  const shape: ShapePartial = {
    id: createShapeId(action.semanticLabel),
    type: "geo",
    x: bounds.x - action.padding,
    y: bounds.y - action.padding,
    meta: {
      semanticLabel: action.semanticLabel,
      actionId: action.id,
      targetLabel: action.targetLabel,
    },
    props: {
      geo: "rectangle",
      w: bounds.w + action.padding * 2,
      h: bounds.h + action.padding * 2,
      color: "yellow",
      fill: "semi",
      dash: "solid",
      size: "m",
      url: "",
      growY: 0,
      scale: 1,
      labelColor: "yellow",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      richText: toRichText(""),
    },
    opacity: 0.35,
  };

  context.editor.createShapes([shape]);
  appendLabel(context.labelMap, action.semanticLabel, [shape.id as TLShapeId]);
}

function applyArrowAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "arrow" }>,
) {
  const fromBounds = getBoundsForLabel(context.editor, context.labelMap, action.fromLabel);
  const toBounds = getBoundsForLabel(context.editor, context.labelMap, action.toLabel);

  if (!fromBounds || !toBounds) {
    context.warnings.push(
      `Arrow "${action.semanticLabel}" could not resolve "${action.fromLabel}" -> "${action.toLabel}".`,
    );
    return;
  }

  const shape: ShapePartial = {
    id: createShapeId(action.semanticLabel),
    type: "arrow",
    x: fromBounds.centerX,
    y: fromBounds.centerY,
    meta: {
      semanticLabel: action.semanticLabel,
      actionId: action.id,
      fromLabel: action.fromLabel,
      toLabel: action.toLabel,
    },
    props: {
      kind: "arc",
      labelColor: "blue",
      color: "blue",
      fill: "none",
      dash: "solid",
      size: "m",
      font: "draw",
      bend: 0,
      richText: toRichText(action.text ?? ""),
      start: { x: 0, y: 0 },
      end: {
        x: toBounds.centerX - fromBounds.centerX,
        y: toBounds.centerY - fromBounds.centerY,
      },
      arrowheadStart: "none",
      arrowheadEnd: "arrow",
    },
  };

  context.editor.createShapes([shape]);
  appendLabel(context.labelMap, action.semanticLabel, [shape.id as TLShapeId]);
}

function applyEraseAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "erase" }>,
) {
  const shapeIds = action.targetLabels.flatMap((label) => getShapeIdsForLabel(context.labelMap, label));

  if (shapeIds.length === 0) {
    context.warnings.push(
      `Erase "${action.semanticLabel}" found no targets: ${action.targetLabels.join(", ")}.`,
    );
    return;
  }

  context.editor.deleteShapes(shapeIds);
  removeLabelTargets(context.labelMap, action.targetLabels);
}

function applyAction(context: RenderContext, action: DrawAction) {
  switch (action.type) {
    case "create_shape":
      applyCreateShapeAction(context, action);
      break;
    case "highlight":
      applyHighlightAction(context, action);
      break;
    case "arrow":
      applyArrowAction(context, action);
      break;
    case "erase":
      applyEraseAction(context, action);
      break;
  }

  context.renderedActionIds.push(action.id);
}

function renderStepsImmediately(
  context: RenderContext,
  lessonPlan: LessonPlan | null,
  startStepIndex: number,
  endStepIndex: number,
) {
  if (!lessonPlan || startStepIndex > endStepIndex) return;

  const safeStart = Math.max(0, startStepIndex);
  const safeEnd = Math.min(endStepIndex, lessonPlan.steps.length - 1);
  if (safeStart > safeEnd) return;

  for (const step of lessonPlan.steps.slice(safeStart, safeEnd + 1)) {
    for (const action of step.drawActions) {
      applyAction(context, action);
    }
  }
}

function emitSnapshot(
  context: RenderContext,
  options: WhiteboardPlaybackOptions,
  isAnimating: boolean,
  activeActionId: string | null,
) {
  options.onUpdate?.(getPlaybackSnapshot(context, isAnimating, activeActionId));
}

export async function playLessonToBoard(
  editor: Editor,
  lessonPlan: LessonPlan | null,
  currentStepIndex: number,
  options: WhiteboardPlaybackOptions = {},
): Promise<WhiteboardPlaybackSnapshot> {
  resetBoard(editor);

  const context = createRenderContext(editor);
  const actionDelayMs =
    options.actionDelayMs ?? whiteboardPlaybackConfig.defaultActionDelayMs;

  if (!lessonPlan) {
    return getPlaybackSnapshot(context, false, null);
  }

  const currentStep = lessonPlan.steps[currentStepIndex];
  if (!currentStep) {
    return getPlaybackSnapshot(context, false, null);
  }

  renderStepsImmediately(context, lessonPlan, 0, currentStepIndex - 1);
  zoomBoardToContent(editor);

  const shouldAnimate = currentStep.drawActions.length > 0;
  emitSnapshot(context, options, shouldAnimate, null);

  for (let index = 0; index < currentStep.drawActions.length; index += 1) {
    const action = currentStep.drawActions[index];

    throwIfAborted(options.signal);

    // Future narration sync can hook in right before an action begins so
    // board events and spoken narration stay on the same timeline.
    applyAction(context, action);
    zoomBoardToContent(editor);
    emitSnapshot(context, options, true, action.id);

    if (index < currentStep.drawActions.length - 1) {
      await wait(actionDelayMs, options.signal);
    }
  }

  const finalSnapshot = getPlaybackSnapshot(context, false, null);
  options.onUpdate?.(finalSnapshot);
  return finalSnapshot;
}

export function renderLessonToBoard(
  editor: Editor,
  lessonPlan: LessonPlan | null,
  currentStepIndex: number,
): WhiteboardRenderResult {
  resetBoard(editor);

  const context = createRenderContext(editor);

  renderStepsImmediately(context, lessonPlan, 0, currentStepIndex);
  zoomBoardToContent(editor);

  return getRenderResult(context);
}
