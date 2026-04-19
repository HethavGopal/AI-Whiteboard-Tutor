import type { Editor, TLShapeId } from "tldraw";
import { create } from "zustand";

import {
  type AppMode,
  type BranchPlan,
  type LessonMode,
  type LessonPlan,
  type NarrationState,
  type RecordingState,
  branchPlanSchema,
  lessonPlanSchema,
  mockLessonPlan,
} from "@/lib/tutor-core";

export type PauseState = {
  mainStepIndex: number;
  lastDrawnLabel: string | null;
};

type TutorState = {
  problemInput: string;
  lessonPlan: LessonPlan | null;
  currentStepIndex: number;
  renderRevision: number;
  appMode: AppMode;
  recordingState: RecordingState;
  narrationState: NarrationState;

  // Voice-interruption state machine
  lessonMode: LessonMode;
  pauseState: PauseState | null;
  branchPlan: BranchPlan | null;
  branchStepIndex: number;
  branchShapeIds: TLShapeId[];
  lastDrawnLabel: string | null;
  lastTranscript: string | null;
  isThinking: boolean;
  branchError: string | null;

  // Live editor handle (set by WhiteboardCanvas onMount)
  editor: Editor | null;
  activeNarrationAudio: HTMLAudioElement | null;

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

  setEditor: (editor: Editor | null) => void;
  setActiveNarrationAudio: (audio: HTMLAudioElement | null) => void;
  setLastDrawnLabel: (label: string | null) => void;

  beginInterruption: () => void;
  setThinking: (value: boolean) => void;
  setLastTranscript: (value: string | null) => void;
  setBranchError: (value: string | null) => void;
  setBranchPlan: (plan: BranchPlan) => void;
  pushBranchShapeIds: (ids: TLShapeId[]) => void;
  advanceBranchStep: () => void;
  enterAwaitingConfirm: () => void;
  resumeMainLesson: () => void;
  cancelInterruption: () => void;
};

function clampStepIndex(index: number, lessonPlan: LessonPlan | null) {
  if (!lessonPlan) return 0;
  return Math.min(Math.max(index, 0), lessonPlan.steps.length - 1);
}

export const useTutorStore = create<TutorState>((set, get) => ({
  problemInput: "",
  lessonPlan: null,
  currentStepIndex: 0,
  renderRevision: 0,
  appMode: "lesson",
  recordingState: "idle",
  narrationState: "idle",

  lessonMode: "main",
  pauseState: null,
  branchPlan: null,
  branchStepIndex: 0,
  branchShapeIds: [],
  lastDrawnLabel: null,
  lastTranscript: null,
  isThinking: false,
  branchError: null,

  editor: null,
  activeNarrationAudio: null,

  setProblemInput: (value) => set({ problemInput: value }),
  setLessonPlan: (value) => {
    const lessonPlan = lessonPlanSchema.parse(value);
    set({
      lessonPlan,
      currentStepIndex: 0,
      renderRevision: get().renderRevision + 1,
      lessonMode: "main",
      pauseState: null,
      branchPlan: null,
      branchStepIndex: 0,
      branchShapeIds: [],
      lastDrawnLabel: null,
      branchError: null,
    });
  },
  setCurrentStepIndex: (index) =>
    set((state) => ({
      currentStepIndex: clampStepIndex(index, state.lessonPlan),
      renderRevision: state.renderRevision + 1,
      lastDrawnLabel: null,
    })),
  nextStep: () =>
    set((state) => ({
      currentStepIndex: clampStepIndex(
        state.currentStepIndex + 1,
        state.lessonPlan,
      ),
      renderRevision: state.renderRevision + 1,
      lastDrawnLabel: null,
    })),
  previousStep: () =>
    set((state) => ({
      currentStepIndex: clampStepIndex(
        state.currentStepIndex - 1,
        state.lessonPlan,
      ),
      renderRevision: state.renderRevision + 1,
      lastDrawnLabel: null,
    })),
  resetLessonPlayback: () =>
    set((state) => ({
      currentStepIndex: 0,
      renderRevision: state.renderRevision + 1,
      lastDrawnLabel: null,
    })),
  replayCurrentStep: () =>
    set((state) => ({
      renderRevision: state.renderRevision + 1,
      lastDrawnLabel: null,
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
      lessonMode: "main",
      pauseState: null,
      branchPlan: null,
      branchStepIndex: 0,
      branchShapeIds: [],
      lastDrawnLabel: null,
      branchError: null,
    }),

  setEditor: (editor) => set({ editor }),
  setActiveNarrationAudio: (audio) => set({ activeNarrationAudio: audio }),
  setLastDrawnLabel: (label) => set({ lastDrawnLabel: label }),

  beginInterruption: () =>
    set((state) => ({
      lessonMode: "paused",
      pauseState: {
        mainStepIndex: state.currentStepIndex,
        lastDrawnLabel: state.lastDrawnLabel,
      },
      branchError: null,
    })),
  setThinking: (value) => set({ isThinking: value }),
  setLastTranscript: (value) => set({ lastTranscript: value }),
  setBranchError: (value) => set({ branchError: value }),
  setBranchPlan: (plan) => {
    const parsed = branchPlanSchema.parse(plan);
    set({
      branchPlan: parsed,
      branchStepIndex: 0,
      branchShapeIds: [],
      lessonMode: "branch",
      isThinking: false,
      branchError: null,
    });
  },
  pushBranchShapeIds: (ids) =>
    set((state) => ({
      branchShapeIds: [...state.branchShapeIds, ...ids],
    })),
  advanceBranchStep: () =>
    set((state) => {
      if (!state.branchPlan) return state;
      const nextIndex = state.branchStepIndex + 1;
      if (nextIndex >= state.branchPlan.steps.length) {
        return { lessonMode: "awaiting_confirm" };
      }
      return { branchStepIndex: nextIndex };
    }),
  enterAwaitingConfirm: () => set({ lessonMode: "awaiting_confirm" }),
  resumeMainLesson: () =>
    set((state) => ({
      lessonMode: "main",
      branchPlan: null,
      branchStepIndex: 0,
      branchShapeIds: [],
      pauseState: null,
      lastDrawnLabel: null,
      renderRevision: state.renderRevision + 1,
    })),
  cancelInterruption: () =>
    set((state) => ({
      lessonMode: "main",
      branchPlan: null,
      branchStepIndex: 0,
      branchShapeIds: [],
      pauseState: null,
      lastDrawnLabel: null,
      isThinking: false,
      branchError: null,
      renderRevision: state.renderRevision + 1,
    })),
}));
