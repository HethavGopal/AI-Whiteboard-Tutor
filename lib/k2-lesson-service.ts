import {
  generateLessonRequestSchema,
  generateLessonStepRequestSchema,
  type GenerateLessonStepRequest,
  type Step,
  lessonOutlineSchema,
  lessonPlanSchema,
  lessonSessionSchema,
  stepSchema,
  type LessonOutline,
  type LessonSession,
} from "@/lib/tutor-core";
import { ZodError } from "zod";

const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";
const DEFAULT_K2_BASE_URL = "https://openrouter.ai/api/v1";
const K2_REQUEST_TIMEOUT_MS = 30000;
const OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_REQUEST_TIMEOUT_MS = 30000;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<
            | string
            | {
                type?: string;
                text?: string;
              }
          >
        | null;
    };
  }>;
};

type ChatCompletionContent =
  | string
  | Array<
      | string
      | {
          type?: string;
          text?: string;
        }
    >
  | null
  | undefined;

const WHITEBOARD_LAYOUT = {
  stepStartY: 120,
  stepGapY: 120,
  noteX: 185,
  equationX: 240,
  finalX: 225,
  textXMin: 170,
  textXMax: 410,
  lineXMin: 160,
  lineXMax: 520,
  stepLineGapY: 32,
} as const;

function cleanEnvValue(value: string | undefined) {
  if (!value) return value;
  return value.trim().replace(/^"(.*)"$/, "$1");
}

function getK2Headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "api-key": apiKey,
    "x-api-key": apiKey,
  };
}

function getOpenAIHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeId(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized || fallback;
}

function normalizeLessonType(value: string) {
  return normalizeId(value.toLowerCase(), "general_algebra");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function looksLikeEquation(text: string) {
  return /[=+\-*/^()]/.test(text) || /\d/.test(text);
}

function getTextRole(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (
    normalized.startsWith("solution") ||
    normalized.startsWith("answer") ||
    normalized.includes("solutions:")
  ) {
    return "final";
  }

  return looksLikeEquation(text) ? "equation" : "note";
}

function getStepBandY(targetStepIndex: number, actionIndex = 0) {
  return (
    WHITEBOARD_LAYOUT.stepStartY +
    targetStepIndex * WHITEBOARD_LAYOUT.stepGapY +
    actionIndex * WHITEBOARD_LAYOUT.stepLineGapY
  );
}

function buildOutlinePrompt(problemText: string) {
  return `
You are a patient algebra tutor.

Return exactly one valid JSON object and nothing else.

Shape:
{
  "problemText": "string",
  "lessonType": "string",
  "outlineSteps": [
    { "id": "string", "title": "string" }
  ]
}

Rules:
- Produce only a lightweight lesson outline.
- Do not generate narration paragraphs.
- Do not generate board actions.
- Do not generate coordinates.
- Classify the lesson into a short lessonType string.
- Generate 3 to 6 concise, teacher-like step titles.
- Keep the steps logical and suitable for step-by-step tutoring.
- Keep ids unique strings.
- Output strict JSON only.

Problem:
${problemText}
`.trim();
}

function buildStepPrompt(input: GenerateLessonStepRequest) {
  const currentOutlineStep = input.outlineSteps[input.targetStepIndex];
  const previousContext =
    input.previousSteps.length > 0
      ? input.previousSteps
          .map(
            (step) =>
              `- Step ${step.index + 1}: ${step.title} | narration: ${step.narration} | labels: ${step.labels.join(", ") || "none"}`,
          )
          .join("\n")
      : "- none";
  const outlineContext = input.outlineSteps
    .map((step, index) => `${index + 1}. ${step.title}`)
    .join("\n");
  const baseY = getStepBandY(input.targetStepIndex);

  return `
You are generating exactly one detailed whiteboard tutoring step.

Return exactly one valid JSON object and nothing else.

Shape:
{
  "id": "string",
  "title": "string",
  "narration": "string",
  "drawActions": [
    {
      "id": "string",
      "type": "create_shape",
      "kind": "text",
      "semanticLabel": "string",
      "text": "string",
      "x": ${WHITEBOARD_LAYOUT.equationX},
      "y": ${baseY}
    }
  ]
}

Allowed drawAction shapes:
1. Text shape
{
  "id": "string",
  "type": "create_shape",
  "kind": "text",
  "semanticLabel": "string",
  "text": "string",
  "x": number,
  "y": number
}
2. Highlight
{
  "id": "string",
  "type": "highlight",
  "semanticLabel": "string",
  "targetLabel": "string",
  "padding": number
}
3. Arrow
{
  "id": "string",
  "type": "arrow",
  "semanticLabel": "string",
  "fromLabel": "string",
  "toLabel": "string",
  "text": "string (optional)"
}
4. Erase
{
  "id": "string",
  "type": "erase",
  "semanticLabel": "string",
  "targetLabels": ["string"]
}

Problem: ${input.problemText}
Lesson type: ${input.lessonType}
Target step: ${input.targetStepIndex + 1}. ${currentOutlineStep?.title ?? "Unknown step"}

Full outline:
${outlineContext}

Previously generated steps:
${previousContext}

Rules:
- Generate only this one step.
- Keep narration concise and teacher-like.
- Use 1 to 4 draw actions.
- Prefer create_shape kind="text".
- Use highlight when it helps focus attention.
- Use arrow only when it clearly explains a mapping; avoid decorative arrows.
- Do not use rect, ellipse, or line actions.
- Keep semantic labels consistent with prior labels when referencing earlier board content.
- The board band for this step starts around y ${baseY}. Keep this step's new text near that band.
- Notes should sit near x ${WHITEBOARD_LAYOUT.noteX}.
- Equations should sit near x ${WHITEBOARD_LAYOUT.equationX}.
- Final answer text should sit near x ${WHITEBOARD_LAYOUT.finalX}.
- Every draw action must include all required fields for its chosen type.
- Every create_shape action must be kind="text" and include text, x, and y.
- Every highlight action must include targetLabel.
- Every arrow action must include fromLabel and toLabel.
- Every erase action must include targetLabels.
- Output strict JSON only.
`.trim();
}

function extractBalancedJsonObjects(text: string) {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function extractJsonObject(rawContent: string) {
  const withoutThinkBlock = rawContent.includes("</think>")
    ? rawContent.slice(rawContent.lastIndexOf("</think>") + "</think>".length)
    : rawContent;
  const trimmed = withoutThinkBlock.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const candidates = extractBalancedJsonObjects(trimmed);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("K2 did not return a JSON object.");
}

function normalizeChatCompletionContent(content: ChatCompletionContent) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        return part.text ?? "";
      })
      .join("");
  }

  return "";
}

function normalizeLessonOutline(rawOutline: LessonOutline): LessonOutline {
  const usedIds = new Set<string>();

  return lessonOutlineSchema.parse({
    problemText: normalizeWhitespace(rawOutline.problemText),
    lessonType: normalizeLessonType(rawOutline.lessonType),
    outlineSteps: rawOutline.outlineSteps.slice(0, 6).map((step, index) => {
      let id = normalizeId(step.id, `step_${index + 1}`);
      while (usedIds.has(id)) {
        id = `${id}_${index + 1}`;
      }
      usedIds.add(id);

      return {
        id,
        title: normalizeWhitespace(step.title),
      };
    }),
  });
}

function buildPlaceholderLessonPlanFromOutline(outline: LessonOutline) {
  return lessonPlanSchema.parse({
    id: `outline_session_${outline.lessonType}`,
    title: outline.problemText,
    problem: outline.problemText,
    objective:
      "Phase A outline session with placeholder board steps until detailed step generation lands in Phase B.",
    steps: outline.outlineSteps.map((outlineStep, index) => {
      const y = WHITEBOARD_LAYOUT.stepStartY + index * WHITEBOARD_LAYOUT.stepGapY;
      const isFirstStep = index === 0;
      const isLastStep = index === outline.outlineSteps.length - 1;
      const boardText = isFirstStep
        ? outline.problemText
        : isLastStep
          ? `Step ${index + 1}: ${outlineStep.title}`
          : `${index + 1}. ${outlineStep.title}`;

      return {
        id: `placeholder_${outlineStep.id}`,
        title: outlineStep.title,
        narration: isFirstStep
          ? "Start with the problem and follow the outline step by step."
          : `Placeholder step for "${outlineStep.title}". Detailed board actions will be generated just in time in Phase B.`,
        drawActions: [
          {
            id: `placeholder_action_${outlineStep.id}`,
            type: "create_shape" as const,
            kind: "text" as const,
            semanticLabel: `placeholder_${outlineStep.id}`,
            x: isFirstStep
              ? WHITEBOARD_LAYOUT.equationX
              : isLastStep
                ? WHITEBOARD_LAYOUT.finalX
                : WHITEBOARD_LAYOUT.noteX,
            y,
            text: boardText,
          },
        ],
      };
    }),
  });
}

function normalizeGeneratedStep(rawStep: Step, targetStepIndex: number): Step {
  const usedActionIds = new Set<string>();

  return stepSchema.parse({
    id: normalizeId(rawStep.id, `step_${targetStepIndex + 1}`),
    title: normalizeWhitespace(rawStep.title),
    narration: normalizeWhitespace(rawStep.narration),
    drawActions: rawStep.drawActions.slice(0, 4).map((action, actionIndex) => {
      let actionId = normalizeId(
        action.id,
        `step_${targetStepIndex + 1}_action_${actionIndex + 1}`,
      );
      while (usedActionIds.has(actionId)) {
        actionId = `${actionId}_${actionIndex + 1}`;
      }
      usedActionIds.add(actionId);

      switch (action.type) {
        case "create_shape":
          if (action.kind === "text") {
            const role = getTextRole(action.text);

            return {
              ...action,
              id: actionId,
              semanticLabel: normalizeId(
                action.semanticLabel,
                `step_${targetStepIndex + 1}_label_${actionIndex + 1}`,
              ),
              x:
                role === "note"
                  ? WHITEBOARD_LAYOUT.noteX
                  : role === "final"
                    ? WHITEBOARD_LAYOUT.finalX
                    : WHITEBOARD_LAYOUT.equationX,
              y: getStepBandY(targetStepIndex, actionIndex),
              text: normalizeWhitespace(action.text),
            };
          }

          if (action.kind === "line") {
            const y = getStepBandY(targetStepIndex, actionIndex) + 10;

            return {
              ...action,
              id: actionId,
              semanticLabel: normalizeId(
                action.semanticLabel,
                `step_${targetStepIndex + 1}_line_${actionIndex + 1}`,
              ),
              x1: clamp(action.x1, WHITEBOARD_LAYOUT.lineXMin, WHITEBOARD_LAYOUT.lineXMax),
              x2: clamp(action.x2, WHITEBOARD_LAYOUT.lineXMin, WHITEBOARD_LAYOUT.lineXMax),
              y1: y,
              y2: y,
            };
          }

          return {
            ...action,
            id: actionId,
            semanticLabel: normalizeId(
              action.semanticLabel,
              `step_${targetStepIndex + 1}_shape_${actionIndex + 1}`,
            ),
            x: clamp(action.x, WHITEBOARD_LAYOUT.textXMin, WHITEBOARD_LAYOUT.textXMax),
            y: getStepBandY(targetStepIndex, actionIndex),
          };

        case "highlight":
          return {
            ...action,
            id: actionId,
            semanticLabel: normalizeId(
              action.semanticLabel,
              `step_${targetStepIndex + 1}_highlight_${actionIndex + 1}`,
            ),
            padding: clamp(action.padding ?? 20, 10, 24),
          };

        case "arrow":
          return {
            ...action,
            id: actionId,
            semanticLabel: normalizeId(
              action.semanticLabel,
              `step_${targetStepIndex + 1}_arrow_${actionIndex + 1}`,
            ),
            text: action.text ? normalizeWhitespace(action.text) : action.text,
          };

        case "erase":
          return {
            ...action,
            id: actionId,
            semanticLabel: normalizeId(
              action.semanticLabel,
              `step_${targetStepIndex + 1}_erase_${actionIndex + 1}`,
            ),
          };
      }
    }),
  });
}

async function requestK2Outline(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  problemText: string;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getK2Headers(input.apiKey),
    signal: AbortSignal.timeout(K2_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate strict lesson outline JSON for a tutoring app. Output JSON only.",
        },
        {
          role: "user",
          content: buildOutlinePrompt(input.problemText),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    const canRetryWithoutJsonMode =
      /(response_format|json_object|unsupported|invalid.*response)/i.test(
        errorText,
      );

    if (canRetryWithoutJsonMode) {
      return requestK2OutlineWithoutJsonMode(input);
    }

    throw new Error(`K2 outline request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

async function requestK2OutlineWithoutJsonMode(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  problemText: string;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getK2Headers(input.apiKey),
    signal: AbortSignal.timeout(K2_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You generate strict lesson outline JSON for a tutoring app. Output JSON only.",
        },
        {
          role: "user",
          content: buildOutlinePrompt(input.problemText),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`K2 outline request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

function parseOutlineResponse(rawContent: string) {
  const parsed = JSON.parse(extractJsonObject(rawContent));
  return normalizeLessonOutline(lessonOutlineSchema.parse(parsed));
}

async function requestK2Step(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  request: GenerateLessonStepRequest;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getK2Headers(input.apiKey),
    signal: AbortSignal.timeout(K2_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate exactly one strict whiteboard lesson step in JSON. Output JSON only.",
        },
        {
          role: "user",
          content: buildStepPrompt(input.request),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    const canRetryWithoutJsonMode =
      /(response_format|json_object|unsupported|invalid.*response)/i.test(
        errorText,
      );

    if (canRetryWithoutJsonMode) {
      return requestK2StepWithoutJsonMode(input);
    }

    throw new Error(`K2 step request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

async function requestK2StepWithoutJsonMode(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  request: GenerateLessonStepRequest;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getK2Headers(input.apiKey),
    signal: AbortSignal.timeout(K2_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You generate exactly one strict whiteboard lesson step in JSON. Output JSON only.",
        },
        {
          role: "user",
          content: buildStepPrompt(input.request),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`K2 step request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

function parseGeneratedStepResponse(
  rawContent: string,
  targetStepIndex: number,
) {
  const parsed = JSON.parse(extractJsonObject(rawContent));
  return normalizeGeneratedStep(stepSchema.parse(parsed), targetStepIndex);
}

async function requestOpenAIOutline(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  problemText: string;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getOpenAIHeaders(input.apiKey),
    signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate strict lesson outline JSON for a tutoring app. Output JSON only.",
        },
        {
          role: "user",
          content: buildOutlinePrompt(input.problemText),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI outline request failed: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

async function requestOpenAIStep(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  request: GenerateLessonStepRequest;
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getOpenAIHeaders(input.apiKey),
    signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate exactly one strict whiteboard lesson step in JSON. Output JSON only.",
        },
        {
          role: "user",
          content: buildStepPrompt(input.request),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI step request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return normalizeChatCompletionContent(data.choices?.[0]?.message?.content);
}

export async function generateLessonSessionWithK2(input: {
  problemText: string;
}): Promise<LessonSession> {
  const { problemText } = generateLessonRequestSchema.parse(input);

  const apiKey = cleanEnvValue(process.env.K2_THINK_API_KEY);
  if (!apiKey) {
    throw new Error("Missing K2_THINK_API_KEY.");
  }

  const baseUrl =
    cleanEnvValue(process.env.K2_THINK_BASE_URL) ?? DEFAULT_K2_BASE_URL;
  const model = cleanEnvValue(process.env.K2_THINK_MODEL) ?? K2_MODEL;

  if (baseUrl.includes("openrouter.ai") && apiKey.startsWith("IFM-")) {
    throw new Error(
      "K2_THINK_BASE_URL is pointing at OpenRouter, but your K2_THINK_API_KEY looks like an IFM/K2 key. Use an OpenRouter key with OpenRouter, or change K2_THINK_BASE_URL to your official K2-compatible endpoint.",
    );
  }

  const rawContent = await requestK2Outline({
    apiKey,
    baseUrl,
    model,
    problemText,
  });

  if (!rawContent) {
    throw new Error("K2 returned an empty outline response.");
  }

  let outline: LessonOutline;

  try {
    outline = parseOutlineResponse(rawContent);
  } catch {
    throw new Error("K2 returned invalid outline JSON.");
  }

  return lessonSessionSchema.parse({
    outline,
    lessonPlan: buildPlaceholderLessonPlanFromOutline(outline),
  });
}

export async function generateLessonStepWithK2(
  input: GenerateLessonStepRequest,
): Promise<Step> {
  const request = generateLessonStepRequestSchema.parse(input);

  const apiKey = cleanEnvValue(process.env.K2_THINK_API_KEY);
  if (!apiKey) {
    throw new Error("Missing K2_THINK_API_KEY.");
  }

  const baseUrl =
    cleanEnvValue(process.env.K2_THINK_BASE_URL) ?? DEFAULT_K2_BASE_URL;
  const model = cleanEnvValue(process.env.K2_THINK_MODEL) ?? K2_MODEL;

  if (baseUrl.includes("openrouter.ai") && apiKey.startsWith("IFM-")) {
    throw new Error(
      "K2_THINK_BASE_URL is pointing at OpenRouter, but your K2_THINK_API_KEY looks like an IFM/K2 key. Use an OpenRouter key with OpenRouter, or change K2_THINK_BASE_URL to your official K2-compatible endpoint.",
    );
  }

  const requestStartedAt = Date.now();
  let rawContent: string;

  // #region agent log
  void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "f55d98",
    },
    body: JSON.stringify({
      sessionId: "f55d98",
      runId: "initial",
      hypothesisId: "C",
      location: "lib/k2-lesson-service.ts:814",
      message: "k2 step request starting",
      data: {
        targetStepIndex: request.targetStepIndex,
        previousStepsLength: request.previousSteps.length,
        baseUrl,
        model,
        timeoutMs: K2_REQUEST_TIMEOUT_MS,
      },
      timestamp: requestStartedAt,
    }),
  }).catch(() => {});
  // #endregion

  try {
    rawContent = await requestK2Step({
      apiKey,
      baseUrl,
      model,
      request,
    });
  } catch (error) {
    // #region agent log
    void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f55d98",
      },
      body: JSON.stringify({
        sessionId: "f55d98",
        runId: "initial",
        hypothesisId: "C",
        location: "lib/k2-lesson-service.ts:820",
        message: "k2 step request failed",
        data: {
          targetStepIndex: request.targetStepIndex,
          elapsedMs: Date.now() - requestStartedAt,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : "unknown",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw error;
  }

  // #region agent log
  void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "f55d98",
    },
    body: JSON.stringify({
      sessionId: "f55d98",
      runId: "initial",
      hypothesisId: "C",
      location: "lib/k2-lesson-service.ts:827",
      message: "k2 step request returned content",
      data: {
        targetStepIndex: request.targetStepIndex,
        elapsedMs: Date.now() - requestStartedAt,
        rawLength: rawContent.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!rawContent) {
    throw new Error("K2 returned an empty step response.");
  }

  try {
    return parseGeneratedStepResponse(rawContent, request.targetStepIndex);
  } catch (error) {
    // #region agent log
    void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f55d98",
      },
      body: JSON.stringify({
        sessionId: "f55d98",
        runId: "initial",
        hypothesisId: "D",
        location: "lib/k2-lesson-service.ts:835",
        message: "k2 step response parse failed",
        data: {
          targetStepIndex: request.targetStepIndex,
          rawLength: rawContent.length,
          rawPreview: rawContent.slice(0, 240),
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : "unknown",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error(
      `[lesson-service] step parse failed step=${request.targetStepIndex}`,
      rawContent.slice(0, 800),
      error,
    );
    if (error instanceof ZodError) {
      throw error;
    }
    throw new Error("K2 returned invalid step JSON.");
  }
}

export async function generateLessonSession(input: {
  problemText: string;
}): Promise<LessonSession> {
  const { problemText } = generateLessonRequestSchema.parse(input);
  const openAiApiKey = cleanEnvValue(process.env.OPENAI_API_KEY);
  const openAiBaseUrl =
    cleanEnvValue(process.env.OPENAI_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL;
  const openAiModel = cleanEnvValue(process.env.OPENAI_MODEL) ?? OPENAI_MODEL;

  if (openAiApiKey) {
    try {
      const rawContent = await requestOpenAIOutline({
        apiKey: openAiApiKey,
        baseUrl: openAiBaseUrl,
        model: openAiModel,
        problemText,
      });

      if (!rawContent) {
        throw new Error("OpenAI returned an empty outline response.");
      }

      const outline = parseOutlineResponse(rawContent);
      console.info("[lesson-service] outline provider=openai");

      return lessonSessionSchema.parse({
        outline,
        lessonPlan: buildPlaceholderLessonPlanFromOutline(outline),
      });
    } catch (error) {
      console.warn(
        "[lesson-service] outline provider=openai failed, falling back to K2",
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.warn(
      "[lesson-service] outline provider=openai unavailable, falling back to K2",
    );
  }

  const lessonSession = await generateLessonSessionWithK2({ problemText });
  console.info("[lesson-service] outline provider=k2");
  return lessonSession;
}

export async function generateLessonStep(
  input: GenerateLessonStepRequest,
): Promise<Step> {
  const request = generateLessonStepRequestSchema.parse(input);
  const openAiApiKey = cleanEnvValue(process.env.OPENAI_API_KEY);
  const openAiBaseUrl =
    cleanEnvValue(process.env.OPENAI_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL;
  const openAiModel = cleanEnvValue(process.env.OPENAI_MODEL) ?? OPENAI_MODEL;

  if (openAiApiKey) {
    try {
      const rawContent = await requestOpenAIStep({
        apiKey: openAiApiKey,
        baseUrl: openAiBaseUrl,
        model: openAiModel,
        request,
      });

      if (!rawContent) {
        throw new Error("OpenAI returned an empty step response.");
      }

      const step = parseGeneratedStepResponse(rawContent, request.targetStepIndex);
      console.info(
        `[lesson-service] step provider=openai step=${request.targetStepIndex}`,
      );
      return step;
    } catch (error) {
      console.warn(
        `[lesson-service] step provider=openai failed for step=${request.targetStepIndex}, falling back to K2`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.warn(
      `[lesson-service] step provider=openai unavailable for step=${request.targetStepIndex}, falling back to K2`,
    );
  }

  const step = await generateLessonStepWithK2(request);
  console.info(`[lesson-service] step provider=k2 step=${request.targetStepIndex}`);
  return step;
}
