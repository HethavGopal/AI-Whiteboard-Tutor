import { NextRequest } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const runtime = "nodejs";

const MODEL = "gemini-2.0-flash";

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    problemText: { type: SchemaType.STRING, nullable: true },
    error: { type: SchemaType.STRING, nullable: true },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "missing GEMINI_API_KEY" },
        { status: 500 },
      );
    }

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "image field required" },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const result = await model.generateContent([
      {
        text:
          "Extract the math problem as plain text. " +
          "Return JSON {problemText: string}. " +
          "If the image contains no math, return {error: 'not_math'}.",
      },
      { inlineData: { data: base64, mimeType } },
    ]);

    const raw = result.response.text();
    const parsed = JSON.parse(raw) as {
      problemText?: string;
      error?: string;
    };

    if (parsed.error === "not_math") {
      return Response.json({ error: "not_math" }, { status: 200 });
    }
    if (!parsed.problemText) {
      return Response.json({ error: "empty_extraction" }, { status: 500 });
    }
    return Response.json({ problemText: parsed.problemText });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "extract failed" },
      { status: 500 },
    );
  }
}
