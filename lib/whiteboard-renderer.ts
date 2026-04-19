import {
  createShapeId,
  getIndices,
  toRichText,
  type Editor,
  type IndexKey,
  type TLShapeId,
} from "tldraw";

import type { BranchPlan, DrawAction, LessonPlan } from "@/lib/tutor-core";
import {
  parsePolynomial,
  evaluatePolynomial,
  derivativePolynomial,
} from "@/lib/poly-math";

type ShapeBatch = Parameters<Editor["createShapes"]>[0];
type ShapePartial = NonNullable<ShapeBatch>[number];
export type LabelMap = Record<string, TLShapeId[]>;

type AxesTransform = {
  toScreenX: (mx: number) => number;
  toScreenY: (my: number) => number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  box: { x: number; y: number; w: number; h: number };
};

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
  axesMap: Record<string, AxesTransform>;
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
    axesMap: {},
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

function createPolylineShape(
  semanticLabel: string,
  actionId: string,
  screenPoints: { x: number; y: number }[],
  color: string,
): ShapePartial {
  const origin = screenPoints[0];
  const indices = getIndices(screenPoints.length);
  const points: Record<string, { id: string; index: IndexKey; x: number; y: number }> = {};
  for (let i = 0; i < screenPoints.length; i++) {
    const key = indices[i];
    points[key] = {
      id: key,
      index: key,
      x: screenPoints[i].x - origin.x,
      y: screenPoints[i].y - origin.y,
    };
  }
  return {
    id: createShapeId(semanticLabel),
    type: "line",
    x: origin.x,
    y: origin.y,
    meta: { semanticLabel, actionId },
    props: {
      color: color as never,
      dash: "draw",
      size: "m",
      spline: "line",
      scale: 1,
      points,
    },
  };
}

function applyAxesAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "axes" }>,
) {
  const { semanticLabel, x, y, width, height, xMin, xMax, yMin, yMax } = action;

  const toScreenX = (mx: number) => x + ((mx - xMin) / (xMax - xMin)) * width;
  const toScreenY = (my: number) => y + height - ((my - yMin) / (yMax - yMin)) * height;

  context.axesMap[semanticLabel] = {
    toScreenX,
    toScreenY,
    xMin,
    xMax,
    yMin,
    yMax,
    box: { x, y, w: width, h: height },
  };

  const shapes: ShapePartial[] = [];
  const allShapeIds: TLShapeId[] = [];

  function addShape(shape: ShapePartial) {
    shapes.push(shape);
    allShapeIds.push(shape.id as TLShapeId);
  }

  const xAxisY = yMin <= 0 && 0 <= yMax ? toScreenY(0) : yMin > 0 ? y + height : y;
  const yAxisX = xMin <= 0 && 0 <= xMax ? toScreenX(0) : xMin > 0 ? x : x + width;

  addShape({
    id: createShapeId(`${semanticLabel}__xaxis`),
    type: "line",
    x,
    y: xAxisY,
    meta: { semanticLabel, actionId: action.id },
    props: {
      color: "black" as never,
      dash: "solid",
      size: "s",
      spline: "line",
      scale: 1,
      points: {
        a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
        a2: { id: "a2", index: "a2" as never, x: width, y: 0 },
      },
    },
  });

  addShape({
    id: createShapeId(`${semanticLabel}__yaxis`),
    type: "line",
    x: yAxisX,
    y,
    meta: { semanticLabel, actionId: action.id },
    props: {
      color: "black" as never,
      dash: "solid",
      size: "s",
      spline: "line",
      scale: 1,
      points: {
        a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
        a2: { id: "a2", index: "a2" as never, x: 0, y: height },
      },
    },
  });

  const tickLen = 4;
  const xTickStep = Math.max(1, Math.round((xMax - xMin) / 8));
  const yTickStep = Math.max(1, Math.round((yMax - yMin) / 8));

  let xTickVal = Math.ceil(xMin / xTickStep) * xTickStep;
  let xTickCount = 0;
  while (xTickVal <= xMax) {
    if (Math.abs(xTickVal) > 0.0001) {
      const sx = toScreenX(xTickVal);
      addShape({
        id: createShapeId(`${semanticLabel}__xtick_${xTickCount}`),
        type: "line",
        x: sx,
        y: xAxisY - tickLen,
        meta: { semanticLabel, actionId: action.id },
        props: {
          color: "black" as never,
          dash: "solid",
          size: "s",
          spline: "line",
          scale: 1,
          points: {
            a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
            a2: { id: "a2", index: "a2" as never, x: 0, y: tickLen * 2 },
          },
        },
      });
      addShape({
        id: createShapeId(`${semanticLabel}__xtlabel_${xTickCount}`),
        type: "text",
        x: sx - 6,
        y: xAxisY + tickLen + 2,
        meta: { semanticLabel, actionId: action.id },
        props: {
          color: "black",
          scale: 0.5,
          richText: toRichText(String(xTickVal)),
          textAlign: "middle",
        },
      });
    }
    xTickVal += xTickStep;
    xTickCount++;
  }

  let yTickVal = Math.ceil(yMin / yTickStep) * yTickStep;
  let yTickCount = 0;
  while (yTickVal <= yMax) {
    if (Math.abs(yTickVal) > 0.0001) {
      const sy = toScreenY(yTickVal);
      addShape({
        id: createShapeId(`${semanticLabel}__ytick_${yTickCount}`),
        type: "line",
        x: yAxisX - tickLen,
        y: sy,
        meta: { semanticLabel, actionId: action.id },
        props: {
          color: "black" as never,
          dash: "solid",
          size: "s",
          spline: "line",
          scale: 1,
          points: {
            a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
            a2: { id: "a2", index: "a2" as never, x: tickLen * 2, y: 0 },
          },
        },
      });
      addShape({
        id: createShapeId(`${semanticLabel}__ytlabel_${yTickCount}`),
        type: "text",
        x: yAxisX - tickLen - 22,
        y: sy - 7,
        meta: { semanticLabel, actionId: action.id },
        props: {
          color: "black",
          scale: 0.5,
          richText: toRichText(String(yTickVal)),
          textAlign: "end",
        },
      });
    }
    yTickVal += yTickStep;
    yTickCount++;
  }

  if (action.xLabel) {
    addShape({
      id: createShapeId(`${semanticLabel}__xlabel`),
      type: "text",
      x: x + width - 10,
      y: xAxisY + tickLen + 2,
      meta: { semanticLabel, actionId: action.id },
      props: {
        color: "black",
        scale: 0.6,
        richText: toRichText(action.xLabel),
        textAlign: "start",
      },
    });
  }

  if (action.yLabel) {
    addShape({
      id: createShapeId(`${semanticLabel}__ylabel`),
      type: "text",
      x: yAxisX + 5,
      y: y + 5,
      meta: { semanticLabel, actionId: action.id },
      props: {
        color: "black",
        scale: 0.6,
        richText: toRichText(action.yLabel),
        textAlign: "start",
      },
    });
  }

  context.editor.createShapes(shapes);
  appendLabel(context.labelMap, semanticLabel, allShapeIds);
}

function applyPlotFunctionAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "plot_function" }>,
) {
  const transform = context.axesMap[action.axesLabel];
  if (!transform) {
    context.warnings.push(
      `plot_function "${action.semanticLabel}": axes "${action.axesLabel}" not found.`,
    );
    return;
  }

  let poly;
  try {
    poly = parsePolynomial(action.expression);
  } catch (e) {
    context.warnings.push(
      `plot_function "${action.semanticLabel}": ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const xMin = action.xMin ?? transform.xMin;
  const xMax = action.xMax ?? transform.xMax;
  const samples = action.samples ?? 80;

  const screenPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const mx = xMin + (i / (samples - 1)) * (xMax - xMin);
    screenPoints.push({
      x: transform.toScreenX(mx),
      y: transform.toScreenY(evaluatePolynomial(poly, mx)),
    });
  }

  const shape = createPolylineShape(
    action.semanticLabel,
    action.id,
    screenPoints,
    action.color ?? "black",
  );
  context.editor.createShapes([shape]);
  appendLabel(context.labelMap, action.semanticLabel, [shape.id as TLShapeId]);
}

function applyTangentLineAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "tangent_line" }>,
) {
  const transform = context.axesMap[action.axesLabel];
  if (!transform) {
    context.warnings.push(
      `tangent_line "${action.semanticLabel}": axes "${action.axesLabel}" not found.`,
    );
    return;
  }

  let poly;
  try {
    poly = parsePolynomial(action.expression);
  } catch (e) {
    context.warnings.push(
      `tangent_line "${action.semanticLabel}": ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const a = action.x;
  const y0 = evaluatePolynomial(poly, a);
  const m = evaluatePolynomial(derivativePolynomial(poly), a);
  const L = action.length ?? 4;

  const sx1 = transform.toScreenX(a - L / 2);
  const sy1 = transform.toScreenY(y0 - (m * L) / 2);
  const sx2 = transform.toScreenX(a + L / 2);
  const sy2 = transform.toScreenY(y0 + (m * L) / 2);

  const shapeId = createShapeId(action.semanticLabel);
  context.editor.createShapes([
    {
      id: shapeId,
      type: "line",
      x: sx1,
      y: sy1,
      meta: { semanticLabel: action.semanticLabel, actionId: action.id },
      props: {
        color: (action.color ?? "red") as never,
        dash: "draw",
        size: "m",
        spline: "line",
        scale: 1,
        points: {
          a1: { id: "a1", index: "a1" as never, x: 0, y: 0 },
          a2: { id: "a2", index: "a2" as never, x: sx2 - sx1, y: sy2 - sy1 },
        },
      },
    },
  ]);
  appendLabel(context.labelMap, action.semanticLabel, [shapeId]);
}

function applyPointAction(
  context: RenderContext,
  action: Extract<DrawAction, { type: "point" }>,
) {
  const transform = context.axesMap[action.axesLabel];
  if (!transform) {
    context.warnings.push(
      `point "${action.semanticLabel}": axes "${action.axesLabel}" not found.`,
    );
    return;
  }

  let poly;
  try {
    poly = parsePolynomial(action.expression);
  } catch (e) {
    context.warnings.push(
      `point "${action.semanticLabel}": ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const mx = action.x;
  const sx = transform.toScreenX(mx);
  const sy = transform.toScreenY(evaluatePolynomial(poly, mx));
  const dotSize = 8;

  const dotId = createShapeId(`${action.semanticLabel}__dot`);
  const allShapeIds: TLShapeId[] = [dotId];
  const shapes: ShapePartial[] = [
    {
      id: dotId,
      type: "geo",
      x: sx - dotSize / 2,
      y: sy - dotSize / 2,
      meta: { semanticLabel: action.semanticLabel, actionId: action.id },
      props: {
        geo: "ellipse",
        w: dotSize,
        h: dotSize,
        color: "red",
        fill: "solid",
        dash: "solid",
        size: "s",
        url: "",
        growY: 0,
        scale: 1,
        labelColor: "black",
        font: "draw",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(""),
      },
    },
  ];

  if (action.label) {
    const textId = createShapeId(`${action.semanticLabel}__label`);
    allShapeIds.push(textId);
    shapes.push({
      id: textId,
      type: "text",
      x: sx + dotSize,
      y: sy - dotSize,
      meta: { semanticLabel: action.semanticLabel, actionId: action.id },
      props: {
        color: "black",
        scale: 0.6,
        richText: toRichText(action.label),
        textAlign: "start",
      },
    });
  }

  context.editor.createShapes(shapes);
  appendLabel(context.labelMap, action.semanticLabel, allShapeIds);
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
    case "axes":
      applyAxesAction(context, action);
      break;
    case "plot_function":
      applyPlotFunctionAction(context, action);
      break;
    case "tangent_line":
      applyTangentLineAction(context, action);
      break;
    case "point":
      applyPointAction(context, action);
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

  // #region agent log
  fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "line-delay-debug", hypothesisId: "H5", location: "lib/whiteboard-renderer.ts:841", message: "rebuilding previous steps immediately", data: { lessonId: lessonPlan.id, startStepIndex: safeStart, endStepIndex: safeEnd, stepIds: lessonPlan.steps.slice(safeStart, safeEnd + 1).map((step) => step.id) }, timestamp: Date.now() }) }).catch(() => {});
  console.info("[debug69a9ec]", "rebuilding previous steps immediately", {
    lessonId: lessonPlan.id,
    startStepIndex: safeStart,
    endStepIndex: safeEnd,
    stepIds: lessonPlan.steps.slice(safeStart, safeEnd + 1).map((step) => step.id),
  });
  // #endregion

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

  // #region agent log
  fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "line-delay-debug", hypothesisId: "H6", location: "lib/whiteboard-renderer.ts:887", message: "animating current step", data: { lessonId: lessonPlan.id, currentStepIndex, stepId: currentStep.id, actionDelayMs, actionIds: currentStep.drawActions.map((action) => action.id) }, timestamp: Date.now() }) }).catch(() => {});
  console.info("[debug69a9ec]", "animating current step", {
    lessonId: lessonPlan.id,
    currentStepIndex,
    stepId: currentStep.id,
    actionDelayMs,
    actionIds: currentStep.drawActions.map((action) => action.id),
  });
  // #endregion

  for (let index = 0; index < currentStep.drawActions.length; index += 1) {
    const action = currentStep.drawActions[index];

    throwIfAborted(options.signal);

    // Future narration sync can hook in right before an action begins so
    // board events and spoken narration stay on the same timeline.
    applyAction(context, action);
    // #region agent log
    fetch("http://127.0.0.1:7316/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "69a9ec" }, body: JSON.stringify({ sessionId: "69a9ec", runId: "line-delay-debug", hypothesisId: "H6", location: "lib/whiteboard-renderer.ts:901", message: "applied current-step action", data: { lessonId: lessonPlan.id, currentStepIndex, stepId: currentStep.id, actionId: action.id, actionIndex: index, actionType: action.type }, timestamp: Date.now() }) }).catch(() => {});
    console.info("[debug69a9ec]", "applied current-step action", {
      lessonId: lessonPlan.id,
      currentStepIndex,
      stepId: currentStep.id,
      actionId: action.id,
      actionIndex: index,
      actionType: action.type,
    });
    // #endregion
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

function describeShapeForSnapshot(editor: Editor, shapeId: TLShapeId): string {
  const shape = editor.getShape(shapeId);
  if (!shape) return "<missing>";

  const bounds = editor.getShapePageBounds(shapeId);
  const pos = bounds
    ? `@(${Math.round(bounds.minX)},${Math.round(bounds.minY)})`
    : "";

  const props = shape.props as Record<string, unknown>;

  if (shape.type === "text") {
    const rich = props.richText as { text?: string } | undefined;
    const text = (rich as unknown as { content?: { content?: { text?: string }[] }[] })?.content?.[0]
      ?.content?.[0]?.text;
    return `text ${pos} "${text ?? rich?.text ?? ""}"`;
  }
  if (shape.type === "geo") {
    const geo = (props.geo as string) ?? "geo";
    const rich = props.richText as { text?: string } | undefined;
    const text = (rich as unknown as { content?: { content?: { text?: string }[] }[] })?.content?.[0]
      ?.content?.[0]?.text;
    const w = bounds ? Math.round(bounds.width) : "?";
    const h = bounds ? Math.round(bounds.height) : "?";
    return `${geo} ${pos} ${w}x${h}${text ? ` "${text}"` : ""}`;
  }
  if (shape.type === "line") {
    return `line ${pos}`;
  }
  if (shape.type === "arrow") {
    const meta = shape.meta as Record<string, unknown>;
    return `arrow ${meta.fromLabel ?? "?"} -> ${meta.toLabel ?? "?"}`;
  }
  return `${shape.type} ${pos}`;
}

export function buildSnapshotFromEditor(
  editor: Editor,
  lastDrawnLabel: string | null,
): string {
  const shapes = editor.getCurrentPageShapes();
  const groups: Record<string, TLShapeId[]> = {};
  for (const shape of shapes) {
    const label = (shape.meta as Record<string, unknown> | undefined)
      ?.semanticLabel as string | undefined;
    if (!label) continue;
    groups[label] = groups[label] ?? [];
    groups[label].push(shape.id as TLShapeId);
  }
  return buildBoardSnapshot(editor, groups, lastDrawnLabel);
}

export function buildBoardSnapshot(
  editor: Editor,
  labelMap: LabelMap,
  lastDrawnLabel: string | null,
): string {
  const lines: string[] = [];
  for (const [label, shapeIds] of Object.entries(labelMap)) {
    if (!shapeIds.length) continue;
    const liveIds = shapeIds.filter((id) => editor.getShape(id));
    if (!liveIds.length) continue;
    const description = describeShapeForSnapshot(editor, liveIds[0]);
    const groupSuffix =
      liveIds.length > 1 ? ` (+${liveIds.length - 1} sub-shapes)` : "";
    const marker = label === lastDrawnLabel ? "  <- last drawn" : "";
    lines.push(`- ${label}: ${description}${groupSuffix}${marker}`);
  }
  if (!lines.length) return "(board is empty)";
  return lines.join("\n");
}

export function eraseShapeIds(editor: Editor, shapeIds: TLShapeId[]) {
  if (!shapeIds.length) return;
  const live = shapeIds.filter((id) => editor.getShape(id));
  if (!live.length) return;
  editor.deleteShapes(live);
}

export type BranchPlaybackResult = WhiteboardRenderResult & {
  newShapeIds: TLShapeId[];
};

export type BranchPlaybackOptions = WhiteboardPlaybackOptions & {
  baseLabelMap: LabelMap;
};

export async function playBranchStepOnTop(
  editor: Editor,
  branchPlan: BranchPlan | null,
  branchStepIndex: number,
  options: BranchPlaybackOptions,
): Promise<BranchPlaybackResult> {
  const context: RenderContext = {
    editor,
    labelMap: cloneLabelMap(options.baseLabelMap),
    renderedActionIds: [],
    warnings: [],
    axesMap: {},
  };

  if (!branchPlan) {
    return { ...getRenderResult(context), newShapeIds: [] };
  }
  const step = branchPlan.steps[branchStepIndex];
  if (!step) {
    return { ...getRenderResult(context), newShapeIds: [] };
  }

  const idsBefore = new Set(
    Object.values(context.labelMap).flat().map((id) => id as string),
  );
  const newShapeIds: TLShapeId[] = [];

  const actionDelayMs =
    options.actionDelayMs ?? whiteboardPlaybackConfig.defaultActionDelayMs;

  emitSnapshot(context, options, step.drawActions.length > 0, null);

  for (let index = 0; index < step.drawActions.length; index += 1) {
    const action = step.drawActions[index];
    throwIfAborted(options.signal);

    applyAction(context, action);

    for (const ids of Object.values(context.labelMap)) {
      for (const id of ids) {
        if (!idsBefore.has(id as string)) {
          idsBefore.add(id as string);
          newShapeIds.push(id);
        }
      }
    }

    emitSnapshot(context, options, true, action.id);

    if (index < step.drawActions.length - 1) {
      await wait(actionDelayMs, options.signal);
    }
  }

  emitSnapshot(context, options, false, null);
  return { ...getRenderResult(context), newShapeIds };
}
