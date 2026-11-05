export type Mode = "everyday" | "study" | "work" | "activity" | "recovery";

export interface CheckIn {
  id: number;
  ts: string; // ISO timestamp
  mood: number; // 1-10, higher = better
  energy: number; // 1-10
  stress: number; // 1-10, higher = more stressed
  focus: number | null; // 1-10
  sleepHours: number | null;
  sleepQuality: number | null; // 1-5
  tags: string[];
  note: string | null;
  mode: Mode;
  source: "manual" | "demo";
}

export type NewCheckIn = Omit<CheckIn, "id" | "source" | "ts"> & { ts?: string };

export type ToolId =
  | "breath-box"
  | "breath-sigh"
  | "breath-478"
  | "grounding"
  | "micro-reset"
  | "soundscape"
  | "reflect"
  | "wind-down";

export interface SupportSession {
  id: number;
  ts: string;
  tool: ToolId;
  preStress: number;
  postStress: number | null;
  helpful: -1 | 0 | 1 | null;
  durationSec: number;
  note: string | null;
}

export type MemoryKind = "note" | "win" | "trigger" | "helped" | "insight";

export interface Memory {
  id: number;
  ts: string;
  kind: MemoryKind;
  text: string;
  pinned: boolean;
  source: "user" | "system";
}

export interface CircleContact {
  id: number;
  name: string;
  relation: string;
  contact: string | null;
  note: string | null;
}

export interface CompanionMessage {
  id: number;
  ts: string;
  role: "user" | "assistant";
  content: string;
  flagged: boolean;
}

export interface Settings {
  mode: Mode;
  onboarded: boolean;
  displayName: string;
  nudgesEnabled: boolean;
  quietStart: number; // hour 0-23
  quietEnd: number;
  companionEnabled: boolean;
  companionUsesContext: boolean;
  region: string; // for crisis resources
}

export const METRICS = ["stress", "mood", "energy", "sleepHours", "focus"] as const;
export type Metric = (typeof METRICS)[number];
