import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2"; // Alice (premade; works on free tier with eleven_flash_v2_5)
const MODEL_ID = "eleven_flash_v2_5";

const ttsCache = new Map<string, ArrayBuffer>();

function cacheKey(voiceId: string, text: string) {
  return createHash("sha1").update(`${voiceId}:${text}`).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId } = (await req.json()) as {
      text?: string;
      voiceId?: string;
    };

    if (!text || typeof text !== "string") {
      return Response.json({ error: "text required" }, { status: 400 });
    }

    const resolvedVoiceId = voiceId ?? DEFAULT_VOICE_ID;
    const key = cacheKey(resolvedVoiceId, text);

    const cached = ttsCache.get(key);
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Cache": "HIT",
        },
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "missing ELEVENLABS_API_KEY" },
        { status: 500 },
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/stream?output_format=mp3_44100_128`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return Response.json(
        {
          error: `ElevenLabs ${upstream.status}: ${detail.slice(0, 200)}`,
        },
        { status: 500 },
      );
    }

    const buffer = await upstream.arrayBuffer();
    ttsCache.set(key, buffer);

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "tts failed" },
      { status: 500 },
    );
  }
}
