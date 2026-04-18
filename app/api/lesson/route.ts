import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { generateLessonSession } from "@/lib/k2-lesson-service";
import { generateLessonRequestSchema } from "@/lib/tutor-core";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = generateLessonRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Please provide a valid problem text." },
      { status: 400 },
    );
  }

  try {
    const { problemText } = parsedRequest.data;

    const lessonSession = await generateLessonSession({ problemText });

    return NextResponse.json(lessonSession);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues
        .slice(0, 3)
        .map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join(" | ");

      return NextResponse.json(
        {
          error: details
            ? `K2 returned an outline format we could not use. ${details}`
            : "K2 returned an outline format we could not use.",
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Lesson generation failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
