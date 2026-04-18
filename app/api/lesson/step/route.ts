import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { generateLessonStep } from "@/lib/k2-lesson-service";
import { generateLessonStepRequestSchema } from "@/lib/tutor-core";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = generateLessonStepRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Please provide a valid lesson step request." },
      { status: 400 },
    );
  }

  try {
    // #region agent log
    void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f55d98",
      },
      body: JSON.stringify({
        sessionId: "f55d98",
        runId: "initial",
        hypothesisId: "B",
        location: "app/api/lesson/step/route.ts:18",
        message: "step route accepted request",
        data: {
          targetStepIndex: parsedRequest.data.targetStepIndex,
          outlineStepsLength: parsedRequest.data.outlineSteps.length,
          previousStepsLength: parsedRequest.data.previousSteps.length,
          lessonType: parsedRequest.data.lessonType,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const step = await generateLessonStep(parsedRequest.data);
    return NextResponse.json(step);
  } catch (error) {
    // #region agent log
    void fetch("http://127.0.0.1:7644/ingest/f39cdcba-cf18-4ba8-931d-27cdc21735e8", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f55d98",
      },
      body: JSON.stringify({
        sessionId: "f55d98",
        runId: "initial",
        hypothesisId: "B",
        location: "app/api/lesson/step/route.ts:21",
        message: "step route failed",
        data: {
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : "unknown",
          isZodError: error instanceof ZodError,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
            ? `K2 returned a step format we could not use. ${details}`
            : "K2 returned a step format we could not use.",
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Step generation failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
