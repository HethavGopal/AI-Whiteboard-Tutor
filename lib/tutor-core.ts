import { z } from "zod";

const createTextShapeActionSchema = z.object({
  id: z.string(),
  type: z.literal("create_shape"),
  kind: z.literal("text"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  x: z.number(),
  y: z.number(),
  text: z.string().min(1),
});

const createRectShapeActionSchema = z.object({
  id: z.string(),
  type: z.literal("create_shape"),
  kind: z.literal("rect"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().optional(),
});

const createEllipseShapeActionSchema = z.object({
  id: z.string(),
  type: z.literal("create_shape"),
  kind: z.literal("ellipse"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().optional(),
});

const createLineShapeActionSchema = z.object({
  id: z.string(),
  type: z.literal("create_shape"),
  kind: z.literal("line"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

const highlightActionSchema = z.object({
  id: z.string(),
  type: z.literal("highlight"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  targetLabel: z.string().min(1),
  padding: z.number().default(24),
});

const arrowActionSchema = z.object({
  id: z.string(),
  type: z.literal("arrow"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  fromLabel: z.string().min(1),
  toLabel: z.string().min(1),
  text: z.string().optional(),
});

const eraseActionSchema = z.object({
  id: z.string(),
  type: z.literal("erase"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  targetLabels: z.array(z.string().min(1)).min(1),
});

const axesActionSchema = z.object({
  id: z.string(),
  type: z.literal("axes"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(300),
  height: z.number().positive().max(200),
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

const plotFunctionActionSchema = z.object({
  id: z.string(),
  type: z.literal("plot_function"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  axesLabel: z.string().min(1),
  expression: z.string().min(1),
  xMin: z.number().optional(),
  xMax: z.number().optional(),
  samples: z.number().int().positive().optional(),
  color: z.string().optional(),
});

const tangentLineActionSchema = z.object({
  id: z.string(),
  type: z.literal("tangent_line"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  axesLabel: z.string().min(1),
  expression: z.string().min(1),
  x: z.number(),
  length: z.number().optional(),
  color: z.string().optional(),
});

const pointActionSchema = z.object({
  id: z.string(),
  type: z.literal("point"),
  semanticLabel: z.string().min(1),
  description: z.string().optional(),
  axesLabel: z.string().min(1),
  expression: z.string().min(1),
  x: z.number(),
  label: z.string().optional(),
});

export const drawActionSchema = z.union([
  createTextShapeActionSchema,
  createRectShapeActionSchema,
  createEllipseShapeActionSchema,
  createLineShapeActionSchema,
  highlightActionSchema,
  arrowActionSchema,
  eraseActionSchema,
  axesActionSchema,
  plotFunctionActionSchema,
  tangentLineActionSchema,
  pointActionSchema,
]);

export const stepSchema = z.object({
  id: z.string(),
  title: z.string(),
  narration: z.string(),
  drawActions: z.array(drawActionSchema),
});

export const lessonPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  problem: z.string(),
  objective: z.string(),
  steps: z.array(stepSchema).min(1),
});

export const branchPlanSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  steps: z.array(stepSchema).min(1).max(3),
});

export const generateLessonRequestSchema = z.object({
  problemText: z.string().trim().min(1).max(500),
});

export const extractedProblemSchema = z.object({
  source: z.enum(["text", "image"]),
  prompt: z.string(),
  mathExpression: z.string().optional(),
  contextNotes: z.array(z.string()).default([]),
});

export const narrationChunkSchema = z.object({
  stepId: z.string(),
  text: z.string(),
});

export const transcriptionEventSchema = z.object({
  transcript: z.string(),
  isFinal: z.boolean(),
  interrupted: z.boolean().default(false),
});

export type DrawAction = z.infer<typeof drawActionSchema>;
export type Step = z.infer<typeof stepSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type BranchPlan = z.infer<typeof branchPlanSchema>;
export type GenerateLessonRequest = z.infer<typeof generateLessonRequestSchema>;
export type ExtractedProblem = z.infer<typeof extractedProblemSchema>;
export type NarrationChunk = z.infer<typeof narrationChunkSchema>;
export type TranscriptionEvent = z.infer<typeof transcriptionEventSchema>;

export type AppMode = "lesson" | "follow-up";
export type RecordingState = "idle" | "listening" | "paused";
export type NarrationState = "idle" | "queued" | "speaking";
export type LessonMode = "main" | "paused" | "branch" | "awaiting_confirm";

export const mockLessonPlan = lessonPlanSchema.parse({
  id: "solve-linear-equation-1",
  title: "Solve 2x + 3 = 11",
  problem: "Solve 2x + 3 = 11",
  objective: "Isolate x by undoing addition first, then division.",
  steps: [
    {
      id: "step-1",
      title: "Start with the original equation",
      narration:
        "Start by writing the original equation clearly in the center of the board.",
      drawActions: [
        {
          id: "draw-1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "original_equation",
          description: "Place the starting equation in the center of the board.",
          x: 240,
          y: 140,
          text: "2x + 3 = 11",
        },
        {
          id: "draw-2",
          type: "create_shape",
          kind: "line",
          semanticLabel: "equation_baseline",
          description: "Add a guide line under the equation.",
          x1: 220,
          y1: 220,
          x2: 470,
          y2: 220,
        },
      ],
    },
    {
      id: "step-2",
      title: "Subtract 3 from both sides",
      narration:
        "Undo the plus 3 by subtracting 3 from both sides of the equation.",
      drawActions: [
        {
          id: "draw-3",
          type: "highlight",
          semanticLabel: "original_equation_highlight",
          description: "Highlight the original equation as the active teaching focus.",
          targetLabel: "original_equation",
          padding: 28,
        },
        {
          id: "draw-4",
          type: "create_shape",
          kind: "text",
          semanticLabel: "subtract_3_note",
          description: "Show the subtract 3 annotation below the equation.",
          x: 255,
          y: 255,
          text: "- 3                    - 3",
        },
        {
          id: "draw-5",
          type: "arrow",
          semanticLabel: "subtract_3_arrow",
          description: "Point from the subtract annotation to the original equation.",
          fromLabel: "subtract_3_note",
          toLabel: "original_equation",
        },
      ],
    },
    {
      id: "step-3",
      title: "Simplify after subtracting",
      narration:
        "After subtracting 3 from both sides, the equation simplifies to 2x equals 8.",
      drawActions: [
        {
          id: "draw-6",
          type: "erase",
          semanticLabel: "cleanup_before_simplify",
          description: "Remove the original setup before showing the simplified equation.",
          targetLabels: [
            "original_equation",
            "equation_baseline",
            "original_equation_highlight",
            "subtract_3_note",
            "subtract_3_arrow",
          ],
        },
        {
          id: "draw-7",
          type: "create_shape",
          kind: "text",
          semanticLabel: "simplified_equation",
          description: "Render the simplified equation.",
          x: 295,
          y: 165,
          text: "2x = 8",
        },
        {
          id: "draw-8",
          type: "highlight",
          semanticLabel: "simplified_equation_highlight",
          description: "Emphasize the simplified equation before dividing by 2.",
          targetLabel: "simplified_equation",
          padding: 28,
        },
      ],
    },
    {
      id: "step-4",
      title: "Divide both sides by 2",
      narration:
        "Now divide both sides by 2 so that x is isolated on the left side.",
      drawActions: [
        {
          id: "draw-9",
          type: "create_shape",
          kind: "text",
          semanticLabel: "divide_2_note",
          description: "Show the divide by 2 note beneath the simplified equation.",
          x: 275,
          y: 275,
          text: "2x / 2 = 8 / 2",
        },
        {
          id: "draw-10",
          type: "arrow",
          semanticLabel: "divide_2_arrow",
          description: "Connect the division note to the simplified equation.",
          fromLabel: "divide_2_note",
          toLabel: "simplified_equation",
          text: "divide by 2",
        },
      ],
    },
    {
      id: "step-5",
      title: "Reveal the final answer",
      narration:
        "After dividing both sides by 2, we are left with x equals 4.",
      drawActions: [
        {
          id: "draw-11",
          type: "erase",
          semanticLabel: "cleanup_before_answer",
          description: "Clear the division setup before showing the final answer.",
          targetLabels: [
            "simplified_equation",
            "simplified_equation_highlight",
            "divide_2_note",
            "divide_2_arrow",
          ],
        },
        {
          id: "draw-12",
          type: "create_shape",
          kind: "text",
          semanticLabel: "final_answer",
          description: "Render the final solved answer.",
          x: 320,
          y: 180,
          text: "x = 4",
        },
        {
          id: "draw-13",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "final_answer_ring",
          description: "Circle the final answer for emphasis.",
          x: 280,
          y: 150,
          w: 170,
          h: 90,
        },
        {
          id: "draw-14",
          type: "create_shape",
          kind: "rect",
          semanticLabel: "answer_check_box",
          description: "Add a small visual check marker beside the answer.",
          x: 470,
          y: 165,
          w: 54,
          h: 54,
          text: "OK",
        },
      ],
    },
  ],
});

function notReady(name: string): never {
  throw new Error(`${name} is not wired yet.`);
}

export interface GeminiVisionService {
  extractProblemFromImage(input: {
    imageBase64: string;
    mimeType: string;
  }): Promise<ExtractedProblem>;
}

export interface K2LessonService {
  generateLessonPlan(input: {
    problem: ExtractedProblem;
  }): Promise<LessonPlan>;
}

export interface ElevenLabsNarrationService {
  synthesizeStepNarration(input: NarrationChunk): Promise<{
    audioUrl?: string;
  }>;
}

export interface DeepgramTranscriptionService {
  startLiveTranscription(): Promise<void>;
  stopLiveTranscription(): Promise<void>;
  onTranscript(handler: (event: TranscriptionEvent) => void): () => void;
}

export const geminiVisionService: GeminiVisionService = {
  async extractProblemFromImage() {
    // Future Gemini Vision live integration plugs in here.
    return notReady("Gemini Vision extraction");
  },
};

export const k2LessonService: K2LessonService = {
  async generateLessonPlan() {
    return notReady("K2 lesson generation");
  },
};

export const elevenLabsNarrationService: ElevenLabsNarrationService = {
  async synthesizeStepNarration() {
    // Future ElevenLabs streaming/audio buffering plugs in here.
    return notReady("ElevenLabs narration");
  },
};

export const deepgramTranscriptionService: DeepgramTranscriptionService = {
  async startLiveTranscription() {
    // Future microphone session + interruption-aware transcription plugs in here.
    return notReady("Deepgram transcription start");
  },
  async stopLiveTranscription() {
    return notReady("Deepgram transcription stop");
  },
  onTranscript() {
    return () => {};
  },
};
