import { SchemaType, type ResponseSchema } from "@google/generative-ai";

import { getGeminiModel } from "@/lib/gemini-client";
import {
  buildBranchPrompt,
  type BranchRequestInput,
} from "@/lib/k2-branch-service";
import { branchPlanSchema, type BranchPlan } from "@/lib/tutor-core";

const GEMINI_BRANCH_MODEL = "gemini-2.0-flash";

const BRANCH_SYSTEM_PROMPT =
  "You generate strict whiteboard branch-explanation JSON for an interactive math tutor. Output JSON only, no commentary.";

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

const branchResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    id: { type: SchemaType.STRING },
    title: { type: SchemaType.STRING, nullable: true },
    steps: {
      type: SchemaType.ARRAY,
      items: stepResponseSchema,
    },
  },
  required: ["id", "steps"],
};

export async function generateBranchWithGemini(
  input: BranchRequestInput,
): Promise<BranchPlan> {
  const model = getGeminiModel({
    model: GEMINI_BRANCH_MODEL,
    responseSchema: branchResponseSchema,
    temperature: 0.3,
  });

  const result = await model.generateContent([
    { text: BRANCH_SYSTEM_PROMPT },
    { text: buildBranchPrompt(input) },
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

  return branchPlanSchema.parse(parsed);
}
