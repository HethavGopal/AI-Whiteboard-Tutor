import { lessonPlanSchema, type LessonPlan } from "@/lib/tutor-core";

// Pre-built tutorial lessons for common math topics. Recognized by keyword
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
      title: "Set up the problem",
      narration:
        "We want to find the limit of f of x equals x squared minus four, over x minus two, as x approaches two. The limit asks what value f approaches, not what f equals at the point.",
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
          id: "d1-goal",
          type: "create_shape",
          kind: "text",
          semanticLabel: "goal",
          x: 120,
          y: 115,
          text: "Goal: find lim(x→2) f(x)",
        },
      ],
    },
    {
      id: "step-2",
      title: "Try direct substitution",
      narration:
        "First, try plugging in x equals two. The numerator becomes four minus four, zero. The denominator becomes two minus two, also zero. Zero over zero is an indeterminate form — a red alert, not an answer.",
      drawActions: [
        {
          id: "d2-sub",
          type: "create_shape",
          kind: "text",
          semanticLabel: "direct_sub",
          x: 120,
          y: 160,
          text: "Try x = 2:  (4 − 4) / (2 − 2) = 0/0  ⚠ indeterminate",
        },
      ],
    },
    {
      id: "step-3",
      title: "Factor and simplify",
      narration:
        "Factor the numerator. x squared minus four is a difference of squares, which factors into x minus two times x plus two. Now the x minus two cancels with the denominator, leaving f of x equals x plus two — valid everywhere except exactly at x equals two, where the original function has a hole.",
      drawActions: [
        {
          id: "d3-factor",
          type: "create_shape",
          kind: "text",
          semanticLabel: "factor",
          x: 120,
          y: 205,
          text: "Factor: (x − 2)(x + 2) / (x − 2)",
        },
        {
          id: "d3-cancel",
          type: "create_shape",
          kind: "text",
          semanticLabel: "cancel",
          x: 120,
          y: 235,
          text: "Cancel (x − 2):  f(x) = x + 2,   x ≠ 2",
        },
      ],
    },
    {
      id: "step-4",
      title: "Check both one-sided limits",
      narration:
        "Now, walking toward x equals two from the left, x plus two approaches four. Walking from the right, also four. Both sides agree, so the limit exists and it equals four.",
      drawActions: [
        {
          id: "d4-conclude",
          type: "create_shape",
          kind: "text",
          semanticLabel: "conclude",
          x: 120,
          y: 295,
          text: "Left → 2: y → 4.   Right → 2: y → 4.   ∴  lim = 4",
        },
      ],
    },
    {
      id: "step-5",
      title: "Visualize: a line with a hole at (2, 4)",
      narration:
        "Let's see it. The graph of f is the line y equals x plus two, but with a single hole punched out at the point two, four. From either side of x equals two, the curve approaches y equals four. The limit lives in the neighborhood around the point, not at the point.",
      drawActions: [
        {
          id: "d5-erase",
          type: "erase",
          semanticLabel: "phase1_cleanup",
          targetLabels: ["fn_def", "goal", "direct_sub", "factor", "cancel", "conclude"],
        },
        {
          id: "d5-axes",
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
          id: "d5-curve",
          type: "plot_function",
          semanticLabel: "fn_curve",
          axesLabel: "main_axes",
          expression: "x + 2",
          xMin: -1,
          xMax: 5,
          color: "black",
        },
        {
          id: "d5-hole",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "hole_at_2_4",
          x: 264,
          y: 149,
          w: 12,
          h: 12,
        },
        {
          id: "d5-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "answer_label",
          x: 360,
          y: 90,
          text: "lim(x→2) f(x) = 4",
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
      title: "Set up the piecewise function",
      narration:
        "Here's a piecewise function. f of x equals negative one for every x less than zero, and f of x equals positive one for every x greater than or equal to zero. We want the limit as x approaches zero.",
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
          id: "d1-goal",
          type: "create_shape",
          kind: "text",
          semanticLabel: "goal",
          x: 120,
          y: 115,
          text: "Goal: find lim(x→0) f(x)",
        },
      ],
    },
    {
      id: "step-2",
      title: "Recall the existence rule",
      narration:
        "For a two-sided limit to exist, the left-hand limit and the right-hand limit must agree. If they disagree, the limit does not exist.",
      drawActions: [
        {
          id: "d2-rule",
          type: "create_shape",
          kind: "text",
          semanticLabel: "rule",
          x: 120,
          y: 160,
          text: "Limit exists  ⇔  left-hand limit = right-hand limit",
        },
      ],
    },
    {
      id: "step-3",
      title: "Compute both one-sided limits",
      narration:
        "Approach zero from the left — every x less than zero gives f of x equals negative one, so the left limit is negative one. Approach from the right — every x at or above zero gives f of x equals one, so the right limit is one.",
      drawActions: [
        {
          id: "d3-left",
          type: "create_shape",
          kind: "text",
          semanticLabel: "left_limit",
          x: 120,
          y: 205,
          text: "lim(x→0⁻) f(x) = −1",
        },
        {
          id: "d3-right",
          type: "create_shape",
          kind: "text",
          semanticLabel: "right_limit",
          x: 120,
          y: 235,
          text: "lim(x→0⁺) f(x) =  1",
        },
      ],
    },
    {
      id: "step-4",
      title: "Conclude: the limit does not exist",
      narration:
        "Negative one is not equal to one, so the two sides disagree. The limit does not exist — we call this a jump discontinuity.",
      drawActions: [
        {
          id: "d4-conclude",
          type: "create_shape",
          kind: "text",
          semanticLabel: "conclusion",
          x: 120,
          y: 295,
          text: "−1 ≠ 1    ∴  limit DNE  (jump discontinuity)",
        },
      ],
    },
    {
      id: "step-5",
      title: "Visualize the jump at x = 0",
      narration:
        "Here's the picture. On the left, the flat line sits at negative one. On the right, it jumps up to positive one. The open circle at zero, negative one shows that point is not included, while the filled dot at zero, one shows the right piece starts there. The function teleports — no single value to approach.",
      drawActions: [
        {
          id: "d5-erase",
          type: "erase",
          semanticLabel: "phase1_cleanup",
          targetLabels: [
            "fn_def",
            "goal",
            "rule",
            "left_limit",
            "right_limit",
            "conclusion",
          ],
        },
        {
          id: "d5-axes",
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
          id: "d5-left-piece",
          type: "plot_function",
          semanticLabel: "left_piece",
          axesLabel: "main_axes",
          expression: "-1",
          xMin: -3,
          xMax: -0.01,
          color: "black",
        },
        {
          id: "d5-right-piece",
          type: "plot_function",
          semanticLabel: "right_piece",
          axesLabel: "main_axes",
          expression: "1",
          xMin: 0,
          xMax: 3,
          color: "black",
        },
        {
          id: "d5-open-circle",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "open_at_0_neg1",
          x: 264,
          y: 224,
          w: 12,
          h: 12,
        },
        {
          id: "d5-dot",
          type: "point",
          semanticLabel: "dot_at_0_1",
          axesLabel: "main_axes",
          expression: "1",
          x: 0,
          label: "(0, 1)",
        },
        {
          id: "d5-answer",
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
// like "explain limits to me".
export const limitsOverviewLessonPlan: LessonPlan = lessonPlanSchema.parse({
  id: "limits-overview-full-tour",
  title: "Limits: A Complete Tour",
  problem: "Explain limits to me",
  objective:
    "Build intuition for limits from the formal definition, then cement it with a contrasting pair of examples — one where the limit exists (a removable hole) and one where it doesn't (a jump discontinuity).",
  steps: [
    {
      id: "ov-step-1",
      title: "The formal definition",
      narration:
        "Let's start at the foundation. In calculus, we say the limit of f of x as x approaches a is L, if we can make f of x arbitrarily close to L — by taking x sufficiently close to a.",
      drawActions: [
        {
          id: "ovs1-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "def_title",
          x: 120,
          y: 80,
          text: "Definition of a Limit",
        },
        {
          id: "ovs1-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "def_statement",
          x: 120,
          y: 115,
          text: "lim(x→a) f(x) = L   means:",
        },
        {
          id: "ovs1-d3",
          type: "create_shape",
          kind: "text",
          semanticLabel: "def_body_1",
          x: 120,
          y: 160,
          text: "f(x) can be made arbitrarily close to L …",
        },
        {
          id: "ovs1-d4",
          type: "create_shape",
          kind: "text",
          semanticLabel: "def_body_2",
          x: 120,
          y: 205,
          text: "… when x is sufficiently close to a.",
        },
      ],
    },
    {
      id: "ov-step-2",
      title: "The key insight",
      narration:
        "The most important thing to remember: the limit doesn't care about the point itself. The function could be undefined at a, or have a completely different value there — the limit is still L, as long as both sides agree on the approach. Let's see this in action with two examples.",
      drawActions: [
        {
          id: "ovs2-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "insight_1",
          x: 120,
          y: 235,
          text: "Key: the limit doesn't care about f(a).",
        },
        {
          id: "ovs2-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "insight_2",
          x: 120,
          y: 265,
          text: "Only how f behaves near a matters —",
        },
        {
          id: "ovs2-d3",
          type: "create_shape",
          kind: "text",
          semanticLabel: "insight_3",
          x: 120,
          y: 295,
          text: "from the LEFT and from the RIGHT.",
        },
      ],
    },
    {
      id: "ov-step-3",
      title: "Example 1: a function with a hole",
      narration:
        "First example — what happens when a function has a hole in its graph? Take f of x equals x squared minus four, divided by x minus two. We want the limit as x approaches two.",
      drawActions: [
        {
          id: "ovs3-erase",
          type: "erase",
          semanticLabel: "wipe_concept",
          targetLabels: [
            "def_title",
            "def_statement",
            "def_body_1",
            "def_body_2",
            "insight_1",
            "insight_2",
            "insight_3",
          ],
        },
        {
          id: "ovs3-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_fn",
          x: 120,
          y: 80,
          text: "Example 1:  f(x) = (x² − 4) / (x − 2)",
        },
        {
          id: "ovs3-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_goal",
          x: 120,
          y: 115,
          text: "Goal:  find  lim(x→2) f(x)",
        },
      ],
    },
    {
      id: "ov-step-4",
      title: "Factor and simplify",
      narration:
        "Plug in x equals two, and the numerator and denominator both become zero — that's indeterminate, no answer yet. But the numerator factors: x squared minus four equals x minus two, times x plus two. The x minus two cancels, leaving f of x equals x plus two, everywhere except at x equals two itself. Both sides approach four, so the limit is four.",
      drawActions: [
        {
          id: "ovs4-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_sub",
          x: 120,
          y: 160,
          text: "Try x = 2:  (4 − 4) / (2 − 2) = 0/0  ⚠ indeterminate",
        },
        {
          id: "ovs4-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_factor",
          x: 120,
          y: 205,
          text: "Factor:  (x − 2)(x + 2) / (x − 2)",
        },
        {
          id: "ovs4-d3",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_cancel",
          x: 120,
          y: 235,
          text: "Cancel (x − 2):   f(x) = x + 2,   x ≠ 2",
        },
        {
          id: "ovs4-d4",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_conclude",
          x: 120,
          y: 295,
          text: "Left → 4,  Right → 4   ∴   lim = 4",
        },
      ],
    },
    {
      id: "ov-step-5",
      title: "Visualize: a line with a hole at (2, 4)",
      narration:
        "Here's the picture — a straight line, y equals x plus two, with a single hole punched out at the point two, four. Even though f is undefined at exactly x equals two, the curve approaches four from both sides. Limit exists, equals four. Now, a contrasting case.",
      drawActions: [
        {
          id: "ovs5-erase",
          type: "erase",
          semanticLabel: "wipe_ex1_text",
          targetLabels: [
            "ex1_fn",
            "ex1_goal",
            "ex1_sub",
            "ex1_factor",
            "ex1_cancel",
            "ex1_conclude",
          ],
        },
        {
          id: "ovs5-axes",
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
          id: "ovs5-curve",
          type: "plot_function",
          semanticLabel: "ex1_curve",
          axesLabel: "ex1_axes",
          expression: "x + 2",
          xMin: -1,
          xMax: 5,
          color: "black",
        },
        {
          id: "ovs5-hole",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "ex1_hole",
          x: 264,
          y: 149,
          w: 12,
          h: 12,
        },
        {
          id: "ovs5-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex1_answer",
          x: 360,
          y: 90,
          text: "lim(x→2) f(x) = 4",
        },
      ],
    },
    {
      id: "ov-step-6",
      title: "Example 2: a jump discontinuity",
      narration:
        "Consider a piecewise function that jumps at zero. f equals negative one when x is less than zero, and f equals one when x is greater than or equal to zero. We want the limit as x approaches zero.",
      drawActions: [
        {
          id: "ovs6-erase",
          type: "erase",
          semanticLabel: "wipe_ex1_graph",
          targetLabels: ["ex1_axes", "ex1_curve", "ex1_hole", "ex1_answer"],
        },
        {
          id: "ovs6-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_fn",
          x: 120,
          y: 80,
          text: "Example 2:  f(x) = −1 if x < 0;   f(x) = 1 if x ≥ 0",
        },
        {
          id: "ovs6-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_goal",
          x: 120,
          y: 115,
          text: "Goal:  find  lim(x→0) f(x)",
        },
      ],
    },
    {
      id: "ov-step-7",
      title: "Compute both one-sided limits",
      narration:
        "For a limit to exist, the left-hand and right-hand limits must agree. Here, the left limit is negative one, and the right limit is one. Negative one is not equal to one — they disagree. The limit does not exist. This is a jump discontinuity.",
      drawActions: [
        {
          id: "ovs7-d1",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_rule",
          x: 120,
          y: 160,
          text: "Limit exists  ⇔  left-hand limit = right-hand limit",
        },
        {
          id: "ovs7-d2",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_left",
          x: 120,
          y: 205,
          text: "lim(x→0⁻) f(x) = −1",
        },
        {
          id: "ovs7-d3",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_right",
          x: 120,
          y: 235,
          text: "lim(x→0⁺) f(x) =  1",
        },
        {
          id: "ovs7-d4",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_conclude",
          x: 120,
          y: 295,
          text: "−1 ≠ 1    ∴   limit DNE  (jump discontinuity)",
        },
      ],
    },
    {
      id: "ov-step-8",
      title: "Visualize the jump at x = 0",
      narration:
        "Here's how it looks. The left piece sits flat at negative one, with an open circle at zero, negative one showing that point is not included. The right piece jumps up to one, with a solid dot. The function teleports at x equals zero — no single value to approach, so the limit does not exist. That's the full picture: a limit lives in the approach, not at the point.",
      drawActions: [
        {
          id: "ovs8-erase",
          type: "erase",
          semanticLabel: "wipe_ex2_text",
          targetLabels: [
            "ex2_fn",
            "ex2_goal",
            "ex2_rule",
            "ex2_left",
            "ex2_right",
            "ex2_conclude",
          ],
        },
        {
          id: "ovs8-axes",
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
          id: "ovs8-left",
          type: "plot_function",
          semanticLabel: "ex2_left_piece",
          axesLabel: "ex2_axes",
          expression: "-1",
          xMin: -3,
          xMax: -0.01,
          color: "black",
        },
        {
          id: "ovs8-right",
          type: "plot_function",
          semanticLabel: "ex2_right_piece",
          axesLabel: "ex2_axes",
          expression: "1",
          xMin: 0,
          xMax: 3,
          color: "black",
        },
        {
          id: "ovs8-open",
          type: "create_shape",
          kind: "ellipse",
          semanticLabel: "ex2_open",
          x: 264,
          y: 224,
          w: 12,
          h: 12,
        },
        {
          id: "ovs8-dot",
          type: "point",
          semanticLabel: "ex2_dot",
          axesLabel: "ex2_axes",
          expression: "1",
          x: 0,
          label: "(0, 1)",
        },
        {
          id: "ovs8-answer",
          type: "create_shape",
          kind: "text",
          semanticLabel: "ex2_answer",
          x: 360,
          y: 90,
          text: "DNE — jump at x = 0",
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
// the full 8-step overview instead of the focused 5-step standalone.
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

export function getTutorialLesson(problemText: string): LessonPlan | null {
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
