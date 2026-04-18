import { create } from "zustand";

import {
  type AppMode,
  type LessonPlan,
  type NarrationState,
  type RecordingState,
  lessonPlanSchema,
  mockLessonPlan,
} from "@/lib/tutor-core";

type TutorState = {
  problemInput: string;
  lessonPlan: LessonPlan | null;
  currentStepIndex: number;
  renderRevision: number;
  appMode: AppMode;
  recordingState: RecordingState;
  narrationState: NarrationState;
  setProblemInput: (value: string) => void;
  setLessonPlan: (value: LessonPlan) => void;
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

export const useTutorStore = create<TutorState>((set, get) => ({
  problemInput: mockLessonPlan.problem,
  lessonPlan: mockLessonPlan,
  currentStepIndex: 0,
  renderRevision: 0,
  appMode: "lesson",
  recordingState: "idle",
  narrationState: "idle",
  setProblemInput: (value) => set({ problemInput: value }),
  setLessonPlan: (value) => {
    const lessonPlan = lessonPlanSchema.parse(value);
    set({
      lessonPlan,
      currentStepIndex: 0,
      renderRevision: get().renderRevision + 1,
    });
  },
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
      lessonPlan: mockLessonPlan,
      currentStepIndex: 0,
      renderRevision: get().renderRevision + 1,
    }),
}));
