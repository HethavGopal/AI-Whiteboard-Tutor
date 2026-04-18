import { NextRequest } from "next/server";

export const runtime = "nodejs";

const MIN_CONFIDENCE = 0.4;

type DeepgramAlternative = {
  transcript?: string;
  confidence?: number;
};

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: DeepgramAlternative[];
    }>;
  };
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "missing DEEPGRAM_API_KEY" },
        { status: 500 },
      );
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "audio blob required" }, { status: 400 });
    }

    const contentType = file.type || "audio/webm";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length < 800) {
      return Response.json({ error: "unclear" }, { status: 200 });
    }

    const url =
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true";

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: buffer,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return Response.json(
        { error: `Deepgram ${upstream.status}: ${detail.slice(0, 200)}` },
        { status: 500 },
      );
    }

    const data = (await upstream.json()) as DeepgramResponse;
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript?.trim() ?? "";
    const confidence = alt?.confidence ?? 0;

    if (!transcript || confidence < MIN_CONFIDENCE) {
      return Response.json({ error: "unclear", transcript, confidence });
    }

    return Response.json({ transcript, confidence });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "stt failed" },
      { status: 500 },
    );
  }
}
