import { SchemaType, type ResponseSchema } from "@google/generative-ai";

import { getGeminiModel } from "@/lib/gemini-client";
import { lessonPlanSchema, type LessonPlan } from "@/lib/tutor-core";

const GEMINI_LESSON_MODEL = "gemini-2.5-flash-preview-04-17";

const GEMINI_SYSTEM_PROMPT =
  "You are an expert math tutor. Generate a structured whiteboard lesson as JSON only.";

const drawActionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    id: { type: SchemaType.STRING },
    type: { type: SchemaType.STRING },
  },
  required: ["id", "type"],
};

const stepResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    id: { type: SchemaType.STRING },
    title: { type: SchemaType.STRING },
    narration: { type: SchemaType.STRING },
    drawActions: {
      type: SchemaType.ARRAY,
      items: drawActionSchema,
    },
  },
  required: ["id", "title", "narration", "drawActions"],
};

const lessonResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    id: { type: SchemaType.STRING },
    title: { type: SchemaType.STRING },
    problem: { type: SchemaType.STRING },
    objective: { type: SchemaType.STRING },
    steps: {
      type: SchemaType.ARRAY,
      items: stepResponseSchema,
    },
  },
  required: ["id", "title", "problem", "objective", "steps"],
};

/**
 * Gemini-optimized prompt. Omits the K2-specific "no markdown fences" and inline
 * JSON shape block — Gemini enforces structure via responseMimeType + responseSchema.
 * The canonical K2 prompt (buildLessonPrompt in k2-lesson-service.ts) remains the
 * fallback path's source of truth.
 */
export function buildGeminiLessonPrompt(problemText: string): string {
  return `
You are an AI math tutor teaching on a whiteboard.

Allowed draw action types only:
1. create_shape
   - kind=text requires: x, y, text
   - kind=rect requires: x, y, w, h, optional text
   - kind=ellipse requires: x, y, w, h, optional text
   - kind=line requires: x1, y1, x2, y2
2. highlight
   - requires: id, type, semanticLabel, targetLabel, optional description, optional padding
3. arrow
   - requires: id, type, semanticLabel, fromLabel, toLabel, optional text, optional description
4. erase
   - requires: id, type, semanticLabel, targetLabels, optional description
5. axes
   - requires: id, type="axes", semanticLabel, x, y, width, height, xMin, xMax, yMin, yMax
   - optional: xLabel, yLabel, description
   - Recommended box: x:120, y:80, width:300, height:200; adjust xMin/xMax/yMin/yMax to the function's range
6. plot_function
   - requires: id, type="plot_function", semanticLabel, axesLabel, expression
   - optional: xMin, xMax (defaults to axes range), samples (default 80), color (default "black"), description
   - expression must be a polynomial string, e.g. "x^2 + 3x - 1"
   - axesLabel must match the semanticLabel of a previously declared axes action
7. tangent_line
   - requires: id, type="tangent_line", semanticLabel, axesLabel, expression, x
   - optional: length (math-domain length, default 4), color (default "red"), description
   - axesLabel must match the semanticLabel of a previously declared axes action
8. point
   - requires: id, type="point", semanticLabel, axesLabel, expression, x
   - optional: label (text to show next to the point), description
   - axesLabel must match the semanticLabel of a previously declared axes action

Rules:
- Generate 3 to 6 steps.
- Keep narration concise, 1 to 2 sentences.
- Make the lesson visual and whiteboard-friendly.
- Use semantic labels consistently so later actions can reference earlier shapes.
- Only use coordinates that fit a simple whiteboard layout:
  - x between 120 and 560
  - y between 80 and 340
  - widths between 40 and 440 (axes boxes may use up to 300)
  - heights between 40 and 260 (axes boxes may use up to 200)
- Prefer simple algebra-friendly layouts.
- Avoid unsupported actions.
- Ensure all ids are unique strings.
- ACTION ORDERING: an axes action MUST appear before any plot_function, tangent_line, or point action that references its semanticLabel — either in an earlier step, or earlier in the same step's drawActions array. Out-of-order references will push a warning and the shape will not render.

If the problem is a derivative (d/dx, "differentiate", "find the derivative"):

Function constraints:
- The function MUST be a polynomial in x with integer or simple decimal coefficients
  and every power must be a non-negative integer <= 4. No sin/cos/exp/ln/sqrt/division-by-x.
  If violated, fall back to an algebra-style explanation without any axes/plot actions.

PHASE 1 — symbolic derivation (steps 1-4). Text shapes only, no graph shapes.
Stack all text down the left side using these fixed y-coordinates so lines never overlap:
- Step 1:
    { type:"create_shape", kind:"text", x:120, y:80,  text:"f(x) = <polynomial>", semanticLabel:"fn_def" }
    { type:"create_shape", kind:"text", x:120, y:115, text:"Goal: find f'(x)",    semanticLabel:"goal"   }
- Step 2:
    { type:"create_shape", kind:"text", x:120, y:160, text:"Power rule: d/dx[x^n] = n*x^(n-1)", semanticLabel:"power_rule" }
- Step 3: one shape per term (termIndex = 0, 1, 2 …):
    { type:"create_shape", kind:"text", x:120, y:205 + 30*termIndex, text:"d/dx[<term>] = <result>", semanticLabel:"term_<termIndex>_deriv" }
- Step 4:
    { type:"create_shape", kind:"text", x:120, y:295, text:"f'(x) = <derivative>", semanticLabel:"fprime" }

Remember EVERY semanticLabel emitted in Phase 1 — you will list them all in the Phase 2 erase.

PHASE 2 — graph (steps 5+). Wipe the board first so the graph owns the full canvas.
Step 5 drawActions MUST appear in exactly this order:
  1. erase         targetLabels: [<every Phase-1 semanticLabel: "fn_def","goal","power_rule","term_0_deriv",…,"fprime">]
  2. axes          semanticLabel:"main_axes", x:120, y:80, width:300, height:200,
                   xMin:<adjusted>, xMax:<adjusted>, yMin:<adjusted>, yMax:<adjusted>
  3. plot_function axesLabel:"main_axes", expression:"<f(x)>"

Steps 6+: 2-3 tangent visualisations. For each slot i = 0, 1, 2:
  - Choose x-values spread at least 2 math-units apart (e.g. -3, 0, 3) so point labels don't cluster.
  - point        semanticLabel:"tangent_<i>_pt",   axesLabel:"main_axes", expression:"<f(x)>", x:<xi>, label:"(<xi>, <f(xi)>)"
  - tangent_line semanticLabel:"tangent_<i>_line", axesLabel:"main_axes", expression:"<f(x)>", x:<xi>
  - create_shape kind:"text", semanticLabel:"tangent_<i>_slope", x:360, y:90 + 28*i, text:"f'(<xi>) = <slope>"

Coordinate rules for derivative lessons:
- Phase 1 text: x in [120, 340], y in [80, 310] (the fixed slots above stay within this).
- Phase 2 axes box: x:120 y:80 width:300 height:200.
- Phase 2 slope labels: x:360, y values 90, 118, 146 for slots 0, 1, 2 respectively.

Problem to teach:
${problemText}
`.trim();
}

export async function generateLessonStreamWithGemini(input: {
  problemText: string;
}): Promise<ReadableStream<Uint8Array>> {
  const model = getGeminiModel({
    model: GEMINI_LESSON_MODEL,
    responseSchema: lessonResponseSchema,
    temperature: 0.2,
  });

  const result = await model.generateContentStream([
    { text: GEMINI_SYSTEM_PROMPT },
    { text: buildGeminiLessonPrompt(input.problemText) },
  ]);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// Kept for any code paths that need the full plan synchronously (e.g. branch service tests).
export async function generateLessonWithGemini(input: {
  problemText: string;
}): Promise<LessonPlan> {
  const model = getGeminiModel({
    model: GEMINI_LESSON_MODEL,
    responseSchema: lessonResponseSchema,
    temperature: 0.2,
  });

  const result = await model.generateContent([
    { text: GEMINI_SYSTEM_PROMPT },
    { text: buildGeminiLessonPrompt(input.problemText) },
  ]);

  const raw = result.response.text();
  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  return lessonPlanSchema.parse(parsed);
}
