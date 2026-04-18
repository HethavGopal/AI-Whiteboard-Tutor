import {
  generateLessonRequestSchema,
  lessonPlanSchema,
  type LessonPlan,
} from "@/lib/tutor-core";

const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";
const DEFAULT_K2_BASE_URL = "https://openrouter.ai/api/v1";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

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

function buildK2Prompt(problemText: string) {
  return `
You are an AI math tutor teaching on a whiteboard.

Return exactly one JSON object with no markdown fences, no commentary, and no extra keys.

Your JSON must match this shape:
{
  "id": "string",
  "title": "string",
  "problem": "string",
  "objective": "string",
  "steps": [
    {
      "id": "string",
      "title": "string",
      "narration": "string",
      "drawActions": [
        {
          "id": "string",
          "type": "create_shape",
          "kind": "text" | "rect" | "ellipse" | "line",
          "semanticLabel": "string",
          "description": "string",
          "... renderer fields ...": "required by the chosen kind"
        }
      ]
    }
  ]
}

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
   - Recommended box: x:120, y:80, width:420, height:260; adjust xMin/xMax/yMin/yMax to the function's range
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
  - widths between 40 and 440 (axes boxes may use up to 420)
  - heights between 40 and 260 (axes boxes may use up to 260)
- Prefer simple algebra-friendly layouts.
- Avoid unsupported actions.
- Ensure all ids are unique strings.
- Ensure the JSON is valid.
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
  2. axes          semanticLabel:"main_axes", x:120, y:80, width:420, height:260,
                   xMin:<adjusted>, xMax:<adjusted>, yMin:<adjusted>, yMax:<adjusted>
  3. plot_function axesLabel:"main_axes", expression:"<f(x)>"

Steps 6+: 2-3 tangent visualisations. For each slot i = 0, 1, 2:
  - Choose x-values spread at least 2 math-units apart (e.g. -3, 0, 3) so point labels don't cluster.
  - point        semanticLabel:"tangent_<i>_pt",   axesLabel:"main_axes", expression:"<f(x)>", x:<xi>, label:"(<xi>, <f(xi)>)"
  - tangent_line semanticLabel:"tangent_<i>_line", axesLabel:"main_axes", expression:"<f(x)>", x:<xi>
  - create_shape kind:"text", semanticLabel:"tangent_<i>_slope", x:360, y:90 + 28*i, text:"f'(<xi>) = <slope>"

Coordinate rules for derivative lessons:
- Phase 1 text: x in [120, 340], y in [80, 310] (the fixed slots above stay within this).
- Phase 2 axes box: x:120 y:80 width:420 height:260.
- Phase 2 slope labels: x:360, y values 90, 118, 146 for slots 0, 1, 2 respectively.

Problem to teach:
${problemText}
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

export async function generateLessonWithK2(input: {
  problemText: string;
}): Promise<LessonPlan> {
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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getK2Headers(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You generate strict whiteboard lesson JSON for a tutoring app. Output JSON only.",
        },
        {
          role: "user",
          content: buildK2Prompt(problemText),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`K2 request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("K2 returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawContent));
  } catch {
    throw new Error("K2 returned invalid JSON.");
  }

  return lessonPlanSchema.parse(parsed);
}
