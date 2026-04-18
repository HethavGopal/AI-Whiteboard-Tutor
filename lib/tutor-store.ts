import { create } from "zustand";

import {
  type AppMode,
  buildLessonOutlineFromPlan,
  type LessonOutline,
  type LessonPlan,
  type LessonSession,
  type NarrationState,
  type RecordingState,
  type Step,
  lessonPlanSchema,
  mockLessonPlan,
} from "@/lib/tutor-core";

type TutorState = {
  problemInput: string;
  lessonOutline: LessonOutline | null;
  lessonType: string | null;
  // Phase B will fill this incrementally instead of loading all steps at once.
  generatedStepsByIndex: Record<number, Step>;
  lessonPlan: LessonPlan | null;
  currentStepIndex: number;
  renderRevision: number;
  appMode: AppMode;
  recordingState: RecordingState;
  narrationState: NarrationState;
  setProblemInput: (value: string) => void;
  setLessonSession: (value: LessonSession) => void;
  setGeneratedStep: (index: number, step: Step) => void;
  setCurrentStepIndex: (index: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  resetLessonPlayback: () => void;
  replayCurrentStep: () => void;
  setAppMode: (mode: AppMode) => void;
  setRecordingState: (state: RecordingState) => void;
  setNarrationState: (state: NarrationState) => void;
  loadMockLesson: () => void;
};

function clampStepIndex(index: number, lessonPlan: LessonPlan | null) {
  if (!lessonPlan) return 0;
  return Math.min(Math.max(index, 0), lessonPlan.steps.length - 1);
}

function buildGeneratedStepsByIndex(lessonPlan: LessonPlan) {
  return Object.fromEntries(
    lessonPlan.steps.map((step, index) => [index, step]),
  ) as Record<number, Step>;
}

export const useTutorStore = create<TutorState>((set, get) => ({
  problemInput: mockLessonPlan.problem,
  lessonOutline: buildLessonOutlineFromPlan(mockLessonPlan),
  lessonType: "mock_lesson",
  generatedStepsByIndex: buildGeneratedStepsByIndex(mockLessonPlan),
  lessonPlan: mockLessonPlan,
  currentStepIndex: 0,
  renderRevision: 0,
  appMode: "lesson",
  recordingState: "idle",
  narrationState: "idle",
  setProblemInput: (value) => set({ problemInput: value }),
  setLessonSession: (value) => {
    const lessonPlan = lessonPlanSchema.parse(value.lessonPlan);
    set({
      problemInput: value.outline.problemText,
      lessonOutline: value.outline,
      lessonType: value.outline.lessonType,
      generatedStepsByIndex: {},
      lessonPlan,
      currentStepIndex: 0,
      renderRevision: get().renderRevision + 1,
    });
  },
  setGeneratedStep: (index, step) =>
    set((state) => {
      const nextGeneratedStepsByIndex = {
        ...state.generatedStepsByIndex,
        [index]: step,
      };

      return {
        generatedStepsByIndex: nextGeneratedStepsByIndex,
      };
    }),
  setCurrentStepIndex: (index) =>
    set((state) => ({
      currentStepIndex: clampStepIndex(index, state.lessonPlan),
      renderRevision: state.renderRevision + 1,
    })),
  nextStep: () =>
    set((state) => ({
      currentStepIndex: clampStepIndex(
        state.currentStepIndex + 1,
        state.lessonPlan,
      ),
      renderRevision: state.renderRevision + 1,
    })),
  previousStep: () =>
    set((state) => ({
      currentStepIndex: clampStepIndex(
        state.currentStepIndex - 1,
        state.lessonPlan,
      ),
      renderRevision: state.renderRevision + 1,
    })),
  resetLessonPlayback: () =>
    set((state) => ({
      currentStepIndex: 0,
      renderRevision: state.renderRevision + 1,
    })),
  replayCurrentStep: () =>
    set((state) => ({
      renderRevision: state.renderRevision + 1,
    })),
  setAppMode: (mode) => set({ appMode: mode }),
  setRecordingState: (state) => set({ recordingState: state }),
  setNarrationState: (state) => set({ narrationState: state }),
  loadMockLesson: () =>
    set({
      problemInput: mockLessonPlan.problem,
      lessonOutline: buildLessonOutlineFromPlan(mockLessonPlan),
      lessonType: "mock_lesson",
      generatedStepsByIndex: buildGeneratedStepsByIndex(mockLessonPlan),
      lessonPlan: mockLessonPlan,
      currentStepIndex: 0,
      renderRevision: get().renderRevision + 1,
    }),
}));
