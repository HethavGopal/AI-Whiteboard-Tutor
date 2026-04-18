import {
  branchPlanSchema,
  type BranchPlan,
} from "@/lib/tutor-core";
import { callK2Chat, parseK2JsonOrThrow } from "@/lib/k2-lesson-service";

export type BranchRequestInput = {
  problem: string;
  currentStepNarration: string;
  snapshot: string;
  lastDrawnLabel: string | null;
  question: string;
};

function buildBranchPrompt(input: BranchRequestInput) {
  return `
You are an AI math tutor mid-lesson. The student just interrupted and asked a question about something currently on the whiteboard. Generate a SHORT branch explanation that highlights or annotates what is already on the board.

Problem being taught:
${input.problem}

Step the tutor was just narrating:
"${input.currentStepNarration}"

Current whiteboard contents (each line is a shape currently visible). The line marked "<- last drawn" is the most recently drawn shape:
${input.snapshot}

Student's question:
"${input.question}"

Return exactly one JSON object with no markdown fences, no commentary, no <think> tags, no extra keys.

Shape:
{
  "id": "string",
  "title": "string (optional, short)",
  "steps": [
    {
      "id": "string",
      "title": "string",
      "narration": "string (1-2 short sentences)",
      "drawActions": [ ... draw actions using the same schema as main lessons ... ]
    }
  ]
}

Allowed draw action types (same as main lessons):
1. create_shape (kinds: text, rect, ellipse, line)
2. highlight   { id, type, semanticLabel, targetLabel, padding? }
3. arrow       { id, type, semanticLabel, fromLabel, toLabel, text? }
4. erase       { id, type, semanticLabel, targetLabels[] }
5. axes, plot_function, tangent_line, point (only if you create a new axes for the branch)

CRITICAL RULES for branches:
- 1 to 3 steps maximum.
- Each step's narration is 1 to 2 short sentences.
- STRONGLY prefer highlight and arrow actions that REFERENCE existing semanticLabels from the snapshot above. The student wants to see what they pointed at, not a new diagram.
- DO NOT emit any erase action that targets a label from the existing board. The client cleans up branch shapes itself.
- If you create new shapes, keep coords inside x in [120, 560], y in [80, 340], and avoid overlapping existing shapes (look at the snapshot positions).
- Use new unique semanticLabels for any new shapes (prefix with "branch_" so they don't collide with main labels).
- The LAST step's narration MUST end with a short check-in question like "Make sense?" or "Want me to keep going?" — the UI will show a Continue button after this audio finishes.
- Output JSON only. No <think> blocks. No markdown fences.

Generate the branch now.
`.trim();
}

export async function generateBranchWithK2(
  input: BranchRequestInput,
): Promise<BranchPlan> {
  const rawContent = await callK2Chat({
    systemPrompt:
      "You generate strict whiteboard branch-explanation JSON for an interactive math tutor. Output JSON only, no commentary, no <think> tags.",
    userPrompt: buildBranchPrompt(input),
    temperature: 0.3,
  });

  return branchPlanSchema.parse(parseK2JsonOrThrow(rawContent));
}
