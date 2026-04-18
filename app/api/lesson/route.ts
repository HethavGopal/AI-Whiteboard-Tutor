import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { generateLessonWithK2 } from "@/lib/k2-lesson-service";
import { generateLessonRequestSchema } from "@/lib/tutor-core";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { problemText } = generateLessonRequestSchema.parse(body);

    const lessonPlan = await generateLessonWithK2({ problemText });

    return NextResponse.json(lessonPlan);
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
