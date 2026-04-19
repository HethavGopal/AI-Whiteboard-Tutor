import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { generateLessonStream } from "@/lib/k2-lesson-service";
import { generateLessonRequestSchema } from "@/lib/tutor-core";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { problemText } = generateLessonRequestSchema.parse(body);

    const stream = await generateLessonStream({ problemText });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Please provide a valid problem text." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Lesson generation failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
