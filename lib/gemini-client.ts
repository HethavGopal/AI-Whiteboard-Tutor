import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type ResponseSchema,
} from "@google/generative-ai";

function cleanEnvValue(value: string | undefined) {
  if (!value) return value;
  return value.trim().replace(/^"(.*)"$/, "$1");
}

type GetGeminiModelInput = {
  model: string;
  responseSchema?: ResponseSchema;
  temperature?: number;
};

export function getGeminiModel({
  model,
  responseSchema,
  temperature,
}: GetGeminiModelInput): GenerativeModel {
  const apiKey = cleanEnvValue(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    },
  });
}
