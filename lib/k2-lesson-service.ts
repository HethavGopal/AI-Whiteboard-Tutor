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

Rules:
- Generate 3 to 6 steps.
- Keep narration concise, 1 to 2 sentences.
- Make the lesson visual and whiteboard-friendly.
- Use semantic labels consistently so later actions can reference earlier shapes.
- Only use coordinates that fit a simple whiteboard layout:
  - x between 120 and 560
  - y between 80 and 340
  - widths between 40 and 240
  - heights between 40 and 140
- Prefer simple algebra-friendly layouts.
- Avoid unsupported actions.
- Ensure all ids are unique strings.
- Ensure the JSON is valid.

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
