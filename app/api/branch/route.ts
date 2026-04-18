import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { generateBranchWithK2 } from "@/lib/k2-branch-service";

const branchRequestSchema = z.object({
  problem: z.string().min(1).max(500),
  currentStepNarration: z.string().max(2000).default(""),
  snapshot: z.string().min(1).max(8000),
  lastDrawnLabel: z.string().nullable().default(null),
  question: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = branchRequestSchema.parse(body);

    const branchPlan = await generateBranchWithK2(input);

    return NextResponse.json(branchPlan);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid branch request body." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Branch generation failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
