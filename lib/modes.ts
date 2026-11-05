import type { Mode, ToolId } from "./types";

export interface ModeConfig {
  id: Mode;
  label: string;
  description: string;
  suggestedTags: string[];
  preferredTools: ToolId[];
  nudgesPerDay: number;
  radarSensitivity: number; // 1 = default; <1 calmer, >1 more sensitive
  tone: string; // used by companion and copy
  showFocus: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  everyday: {
    id: "everyday", label: "Everyday", description: "Balanced support for ordinary life.",
    suggestedTags: ["exercise", "time-outside", "social", "caffeine", "late-screens", "alcohol", "conflict", "travel"],
    preferredTools: [], nudgesPerDay: 2, radarSensitivity: 1, tone: "warm and plain", showFocus: false,
  },
  study: {
    id: "study", label: "Study", description: "Exam seasons and heavy learning. Tracks focus and protects sleep.",
    suggestedTags: ["exam", "deadline", "long-study", "all-nighter", "exercise", "caffeine", "late-screens", "social"],
    preferredTools: ["breath-box", "micro-reset", "wind-down"], nudgesPerDay: 2, radarSensitivity: 1.1,
    tone: "encouraging and practical, aware of exams and study load", showFocus: true,
  },
  work: {
    id: "work", label: "Work", description: "Deadlines, meetings and recovery between them.",
    suggestedTags: ["deadline", "meetings", "overtime", "commute", "conflict", "exercise", "caffeine", "time-outside"],
    preferredTools: ["breath-sigh", "micro-reset", "grounding"], nudgesPerDay: 2, radarSensitivity: 1,
    tone: "concise and respectful of limited time", showFocus: true,
  },
  activity: {
    id: "activity", label: "Activity", description: "Training, sport and physical load. Watches energy and recovery.",
    suggestedTags: ["training", "rest-day", "competition", "soreness", "exercise", "poor-sleep", "time-outside"],
    preferredTools: ["breath-478", "soundscape", "wind-down"], nudgesPerDay: 2, radarSensitivity: 1,
    tone: "grounded, like a thoughtful coach", showFocus: false,
  },
  recovery: {
    id: "recovery", label: "Recovery", description: "A gentler mode for hard periods: fewer prompts, softer language, rest first.",
    suggestedTags: ["rest", "sick", "time-outside", "social", "poor-sleep", "therapy", "medication-change"],
    preferredTools: ["soundscape", "grounding", "breath-478"], nudgesPerDay: 1, radarSensitivity: 0.85,
    tone: "very gentle, unhurried, no pressure", showFocus: false,
  },
};
