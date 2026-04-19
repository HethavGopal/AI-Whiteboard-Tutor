import { lessonPlanSchema, type LessonPlan } from "@/lib/tutor-core";

// Hardcoded demo lessons for hackathon presentations. Triggered by keyword
// substring match in the student's problem text; on miss the live Gemini → K2
// pipeline runs unchanged.
//
// Layout convention (must match buildLessonPrompt's two-phase recipe):
//   Phase 1 (text) — x: 120, y-slots: 80 / 115 / 160 / 205+30i / 295
//   Phase 2 (graph) — starts with erase, then axes at x:120, y:80, w:300, h:200

export const limitExistsLessonPlan: LessonPlan = lessonPlanSchema.parse({
  id: "limit-exists-hole-in-the-road",
  title: "The Limit Exists: Hole in the Road",
  problem: "Find lim(x→2) of (x² − 4)/(x − 2)",
  objective:
    "Recognize the 0/0 indeterminate form, simplify via factoring, and conclude the two-sided limit equals 4 even though f(2) is undefined.",
  steps: [
    {
      id: "step-1",
      title: "Spot the indeterminate form",
      narration:
        "Plugging in two gives zero over zero, so we need to simplify the expression.",
      drawActions: [
        {
          id: "d1-fn",
          type: "create_shape",
          kind: "text",
          semanticLabel: "fn_def",
          x: 120,
          y: 80,
          text: "f(x) = (x² − 4) / (x − 2)",
        },
        {
          id: "d1-sub",
          type: "create_shape",
          kind: "text",
          semanticLabel: "direct_sub",
          x: 120,
          y: 115,
          text: "Try x = 2:  (4 − 4) / (2 − 2) = 0/0  ⚠ indeterminate",
        },
      ],
    },
    {
      id: "step-2",
      title: "Factor and simplify",
      narration:
        "Factoring shows the expression behaves like x plus two everywhere near two, but not at two itself, so the graph is a line with a hole. That missing point feels suspicious, but the limit only cares about the nearby approach, and both sides still head to four.",
      drawActions: [
        {
          id: "d2-factor",
          type: "create_shape",
          kind: "text",
          semanticLabel: "factor",
          x: 120,
          y: 160,
          text: "Factor: (x − 2)(x + 2) / (x − 2)",
        },
        {
          id: "d2-cancel",
          type: "create_shape",
          kind: "text",
          semanticLabel: "cancel",
          x: 120,
          y: 205,
          text: "Cancel:  f(x) = x + 2,   x ≠ 2",
        },
        {
          id: "d2-conclude",
          type: "create_shape",
          kind: "text",
          semanticLabel: "conclude",
          x: 120,
          y: 250,
          text: "Hole at x = 2, but both sides still approach 4",
        },
      ],
    },
    {
      id: "step-3",
      title: "Visualize: a line with a hole at (2, 4)",
      narration:
        "So the conclusion is this: the function is undefined at the hole, but it still matches the definition of a limit because the left and right sides both approach four.",
      drawActions: [
        {
          id: "d3-erase",
          type: "erase",
          semanticLabel: "phase1_cleanup",
          targetLabels: ["fn_def", "direct_sub", "factor", "cancel", "conclude"],
        },
        {
          id: "d3-axes",
          type: "axes",
          semanticLabel: "main_axes",
          x: 120,
          y: 80,
          width: 300,
          height: 200,
          xMin: -1,
          xMax: 5,
          yMin: -1,
          yMax: 7,
          xLabel: "x",
          yLabel: "y",
        },
        {
          id: "d3-curve",
          type: "plot_function",
          semanticLabel: "fn_curve",
          axesLabel: "main_axes",
          expression: "x + 2",
          xMin: -1,
          xMax: 5,
          color: "black",
        },
        {
          id: "d3-hole",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "hole_at_2_4",
          x: 264,
          y: 149,
          w: 12,
          h: 12,
        },
        {
          id: "d3-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "answer_label",
          x: 360,
          y: 90,
          text: "lim(x→2) f(x) = 4 because the approach is 4",
        },
      ],
    },
  ],
});

export const limitDneLessonPlan: LessonPlan = lessonPlanSchema.parse({
  id: "limit-dne-teleporter",
  title: "The Limit Does Not Exist: Teleporter",
  problem:
    "Find lim(x→0) f(x) where f(x) = −1 for x < 0 and f(x) = 1 for x ≥ 0",
  objective:
    "Show that when the left-hand and right-hand limits disagree, the two-sided limit does not exist — a jump discontinuity.",
  steps: [
    {
      id: "step-1",
      title: "Check the two sides",
      narration:
        "For a two-sided limit, the left and right sides must match, so that is what we compare.",
      drawActions: [
        {
          id: "d1-fn",
          type: "create_shape",
          kind: "text",
          semanticLabel: "fn_def",
          x: 120,
          y: 80,
          text: "f(x) = −1  if x < 0;    f(x) = 1  if x ≥ 0",
        },
        {
          id: "d1-rule",
          type: "create_shape",
          kind: "text",
          semanticLabel: "rule",
          x: 120,
          y: 115,
          text: "Limit exists  ⇔  left-hand limit = right-hand limit",
        },
      ],
    },
    {
      id: "step-2",
      title: "Compare left and right",
      narration:
        "From the left the function approaches negative one, and from the right it approaches positive one, so the limit does not exist.",
      drawActions: [
        {
          id: "d2-left",
          type: "create_shape",
          kind: "text",
          semanticLabel: "left_limit",
          x: 120,
          y: 160,
          text: "lim(x→0⁻) f(x) = −1",
        },
        {
          id: "d2-right",
          type: "create_shape",
          kind: "text",
          semanticLabel: "right_limit",
          x: 120,
          y: 205,
          text: "lim(x→0⁺) f(x) =  1",
        },
        {
          id: "d2-conclude",
          type: "create_shape",
          kind: "text",
          semanticLabel: "conclusion",
          x: 120,
          y: 250,
          text: "−1 ≠ 1    ∴  limit DNE  (jump discontinuity)",
        },
      ],
    },
    {
      id: "step-3",
      title: "Visualize the jump at x = 0",
      narration:
        "The graph makes the mismatch obvious: the two sides approach different heights, so there is no single limit.",
      drawActions: [
        {
          id: "d3-erase",
          type: "erase",
          semanticLabel: "phase1_cleanup",
          targetLabels: ["fn_def", "rule", "left_limit", "right_limit", "conclusion"],
        },
        {
          id: "d3-axes",
          type: "axes",
          semanticLabel: "main_axes",
          x: 120,
          y: 80,
          width: 300,
          height: 200,
          xMin: -3,
          xMax: 3,
          yMin: -2,
          yMax: 2,
          xLabel: "x",
          yLabel: "y",
        },
        {
          id: "d3-left-piece",
          type: "plot_function",
          semanticLabel: "left_piece",
          axesLabel: "main_axes",
          expression: "-1",
          xMin: -3,
          xMax: -0.01,
          color: "black",
        },
        {
          id: "d3-right-piece",
          type: "plot_function",
          semanticLabel: "right_piece",
          axesLabel: "main_axes",
          expression: "1",
          xMin: 0,
          xMax: 3,
          color: "black",
        },
        {
          id: "d3-open-circle",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "open_at_0_neg1",
          x: 264,
          y: 224,
          w: 12,
          h: 12,
        },
        {
          id: "d3-dot",
          type: "point",
          semanticLabel: "dot_at_0_1",
          axesLabel: "main_axes",
          expression: "1",
          x: 0,
          label: "(0, 1)",
        },
        {
          id: "d3-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "answer_label",
          x: 360,
          y: 90,
          text: "DNE — jump at x = 0",
        },
      ],
    },
  ],
});

// Combined "Explain Limits" showcase lesson: Core Concept + Example 1 (hole)
// + Example 2 (teleporter) woven into one 8-step tour with graph visualizations
// for both the exists and DNE cases. Triggered by natural-language prompts
// like "explain limits to me" — the primary demo path.
export const limitsOverviewLessonPlan: LessonPlan = lessonPlanSchema.parse({
  id: "limits-overview-full-tour",
  title: "Limits: A Complete Tour",
  problem: "Explain limits to me",
  objective:
    "Build intuition for limits from the formal definition, then cement it with a contrasting pair of examples — one where the limit exists (a removable hole) and one where it doesn't (a jump discontinuity).",
  steps: [
    {
      id: "ov-step-1",
      title: "What a limit asks",
      narration:
        "A limit asks what value a function approaches as x gets close to a point, and it exists when the left-hand and right-hand approaches match.",
      drawActions: [
        {
          id: "ovs1-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "overview_title",
          x: 120,
          y: 80,
          text: "Limits look at nearby behavior",
        },
        {
          id: "ovs1-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "overview_rule",
          x: 120,
          y: 115,
          text: "lim(x→a⁻) f(x) = lim(x→a⁺) f(x)",
        },
      ],
    },
    {
      id: "ov-step-2",
      title: "Example 1: a hole can still have a limit",
      narration:
        "Let's look at an example. Start with f of x equals x squared minus four over x minus two. After factoring, it behaves like x plus two except at x equals two, so there is a hole, but that still fits the definition of a limit because the nearby values approach four from both sides.",
      drawActions: [
        {
          id: "ovs2-erase",
          type: "erase",
          semanticLabel: "wipe_ex1_text",
          targetLabels: ["overview_title", "overview_rule"],
        },
        {
          id: "ovs2-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_fn",
          x: 120,
          y: 80,
          text: "f(x) = (x² − 4) / (x − 2)",
        },
        {
          id: "ovs2-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_factor",
          x: 120,
          y: 115,
          text: "Factor: (x − 2)(x + 2) / (x − 2)",
        },
        {
          id: "ovs2-d3",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_cancel",
          x: 120,
          y: 160,
          text: "So near x = 2, it behaves like x + 2, but with a hole",
        },
        {
          id: "ovs2-d4",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_conclude",
          x: 120,
          y: 205,
          text: "That looks odd, but both sides still approach 4",
        },
      ],
    },
    {
      id: "ov-step-3",
      title: "Visualize the hole",
      narration:
        "Now you can see the intuition clearly: the point is missing, but the graph still heads to the same height from both directions, so the limit exists.",
      drawActions: [
        {
          id: "ovs3-erase",
          type: "erase",
          semanticLabel: "wipe_ex1_graph",
          targetLabels: ["ex1_fn", "ex1_factor", "ex1_cancel", "ex1_conclude"],
        },
        {
          id: "ovs3-axes",
          type: "axes",
          semanticLabel: "ex1_axes",
          x: 120,
          y: 80,
          width: 300,
          height: 200,
          xMin: -1,
          xMax: 5,
          yMin: -1,
          yMax: 7,
          xLabel: "x",
          yLabel: "y",
        },
        {
          id: "ovs3-curve",
          type: "plot_function",
          semanticLabel: "ex1_curve",
          axesLabel: "ex1_axes",
          expression: "x + 2",
          xMin: -1,
          xMax: 5,
          color: "black",
        },
        {
          id: "ovs3-hole",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "ex1_hole",
          x: 264,
          y: 149,
          w: 12,
          h: 12,
        },
        {
          id: "ovs3-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_answer",
          x: 360,
          y: 90,
          text: "Hole at (2,4), but the limit still exists",
        },
      ],
    },
    {
      id: "ov-step-4",
      title: "Visualize the jump at x = 0",
      narration:
        "Compare that with a jump: here the left side approaches negative one and the right side approaches positive one, so this one fails the definition. That is the takeaway: limits are about the approach, not the value at the point, so a hole can still have a limit but disagreeing sides cannot.",
      drawActions: [
        {
          id: "ovs4-erase",
          type: "erase",
          semanticLabel: "wipe_ex2_text",
          targetLabels: ["ex1_axes", "ex1_curve", "ex1_hole", "ex1_answer"],
        },
        {
          id: "ovs4-axes",
          type: "axes",
          semanticLabel: "ex2_axes",
          x: 120,
          y: 80,
          width: 300,
          height: 200,
          xMin: -3,
          xMax: 3,
          yMin: -2,
          yMax: 2,
          xLabel: "x",
          yLabel: "y",
        },
        {
          id: "ovs4-left",
          type: "plot_function",
          semanticLabel: "ex2_left_piece",
          axesLabel: "ex2_axes",
          expression: "-1",
          xMin: -3,
          xMax: -0.01,
          color: "black",
        },
        {
          id: "ovs4-right",
          type: "plot_function",
          semanticLabel: "ex2_right_piece",
          axesLabel: "ex2_axes",
          expression: "1",
          xMin: 0,
          xMax: 3,
          color: "black",
        },
        {
          id: "ovs4-open",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "ex2_open",
          x: 264,
          y: 224,
          w: 12,
          h: 12,
        },
        {
          id: "ovs4-dot",
          type: "point",
          semanticLabel: "ex2_dot",
          axesLabel: "ex2_axes",
          expression: "1",
          x: 0,
          label: "(0, 1)",
        },
        {
          id: "ovs4-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_answer",
          x: 360,
          y: 90,
          text: "DNE because left and right do not match",
        },
      ],
    },
  ],
});

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

// Highest-priority triggers — natural-language "explain limits" prompts.
// Checked FIRST so that phrases like "explain the limit exists case" route to
// the full 6-step overview instead of the focused 5-step standalone.
const limitsOverviewTriggers = [
  "explain limits",
  "explain limit",
  "explain the limit",
  "what is a limit",
  "what's a limit",
  "what are limits",
  "define limit",
  "definition of a limit",
  "definition of limit",
  "teach me limits",
  "teach me about limits",
  "intro to limits",
  "introduction to limits",
  "core concept",
  "limits concept",
  "limit concept",
  "tell me about limits",
  "how do limits work",
];

const limitExistsTriggers = [
  "(x^2-4)/(x-2)",
  "(x^2 - 4)/(x - 2)",
  "(x²-4)/(x-2)",
  "(x² - 4)/(x - 2)",
  "hole in the road",
  "limit exists",
];

const limitDneTriggers = [
  "limit does not exist",
  "limit dne",
  "teleporter",
  "jump discontinuity",
];

export function getHardcodedLessonPlan(problemText: string): LessonPlan | null {
  const key = normalize(problemText);
  if (!key) return null;

  if (limitsOverviewTriggers.some((t) => key.includes(normalize(t)))) {
    return limitsOverviewLessonPlan;
  }

  if (limitExistsTriggers.some((t) => key.includes(normalize(t)))) {
    return limitExistsLessonPlan;
  }

  if (limitDneTriggers.some((t) => key.includes(normalize(t)))) {
    return limitDneLessonPlan;
  }

  // Conjunctive fallback: "piecewise" + "limit" both present
  if (key.includes("piecewise") && key.includes("limit")) {
    return limitDneLessonPlan;
  }

  return null;
}
