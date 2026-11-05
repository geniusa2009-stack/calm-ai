import type { Mode, SupportSession, ToolId } from "../types";
import { MODES } from "../modes";
import type { PulseState } from "./pulse";
import { round } from "./stats";

export interface Tool {
  id: ToolId;
  name: string;
  minutes: number;
  kind: "breathing" | "grounding" | "reset" | "audio" | "reflection";
  summary: string;
  bestFor: string;
  fits: Partial<Record<PulseState, number>>; // 0-1
  evening?: boolean;
}

export const TOOLS: Tool[] = [
  { id: "breath-sigh", name: "Physiological sigh", minutes: 1, kind: "breathing",
    summary: "Two inhales through the nose, one long exhale. The fastest way to take the edge off.",
    bestFor: "Spikes of stress, before a hard moment", fits: { strained: 1, stretched: 0.9, steady: 0.4 } },
  { id: "breath-box", name: "Box breathing", minutes: 3, kind: "breathing",
    summary: "In 4, hold 4, out 4, hold 4. Steady and focusing.",
    bestFor: "Settling before focus work", fits: { stretched: 0.9, strained: 0.7, steady: 0.6, bright: 0.3 } },
  { id: "breath-478", name: "4-7-8 breathing", minutes: 3, kind: "breathing",
    summary: "In 4, hold 7, out 8. Long exhales slow things right down.",
    bestFor: "Winding down, racing thoughts", fits: { strained: 0.8, stretched: 0.7, "running-low": 0.5 }, evening: true },
  { id: "grounding", name: "5-4-3-2-1 grounding", minutes: 3, kind: "grounding",
    summary: "Name what you can see, hear, feel, smell and taste. Brings you back to the room.",
    bestFor: "Overwhelm, spiralling thoughts", fits: { strained: 1, stretched: 0.6, recovering: 0.5 } },
  { id: "micro-reset", name: "Two-minute reset", minutes: 2, kind: "reset",
    summary: "Shoulders, jaw, eyes, breath, one intention. A clean break between tasks.",
    bestFor: "Between meetings or study blocks", fits: { stretched: 0.9, "running-low": 0.7, steady: 0.7, bright: 0.4 } },
  { id: "soundscape", name: "Calm soundscape", minutes: 10, kind: "audio",
    summary: "Soft generated sound to rest your attention on. Eyes optional.",
    bestFor: "Low energy, rest, background calm", fits: { "running-low": 1, recovering: 0.8, strained: 0.5, steady: 0.4 }, evening: true },
  { id: "wind-down", name: "Wind-down", minutes: 5, kind: "reset",
    summary: "A short sequence to close the day: unload, slow breath, soften.",
    bestFor: "Evenings, protecting sleep", fits: { "running-low": 0.8, stretched: 0.6, recovering: 0.7 }, evening: true },
  { id: "reflect", name: "Quick reflection", minutes: 3, kind: "reflection",
    summary: "Three short prompts to untangle what's going on.",
    bestFor: "When something specific is bothering you", fits: { stretched: 0.7, steady: 0.5, recovering: 0.6, bright: 0.6 } },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

export interface Efficacy { tool: ToolId; sessions: number; avgDrop: number | null; score: number; helpfulRate: number | null }

/** Personal effectiveness per tool, shrunk toward a modest prior so one session can't dominate. */
export function toolEfficacy(sessions: SupportSession[]): Record<string, Efficacy> {
  const PRIOR_DROP = 1, PRIOR_N = 2;
  const out: Record<string, Efficacy> = {};
  for (const t of TOOLS) {
    const ss = sessions.filter((s) => s.tool === t.id);
    const rated = ss.filter((s) => s.postStress != null);
    const drops = rated.map((s) => s.preStress - (s.postStress as number));
    const helpful = ss.filter((s) => s.helpful != null);
    const helpfulRate = helpful.length ? helpful.filter((s) => s.helpful === 1).length / helpful.length : null;
    const notHelpful = helpful.filter((s) => s.helpful === -1).length;
    const score = (drops.reduce((a, b) => a + b, 0) + PRIOR_DROP * PRIOR_N) / (drops.length + PRIOR_N)
      + 0.4 * (helpful.length - 2 * notHelpful) / (helpful.length + 2);
    out[t.id] = { tool: t.id, sessions: ss.length, avgDrop: drops.length ? round(drops.reduce((a, b) => a + b, 0) / drops.length) : null, score: round(score, 2), helpfulRate };
  }
  return out;
}

export interface Recommendation { tool: Tool; score: number; reason: string; personal: Efficacy }

export function recommend(state: PulseState, sessions: SupportSession[], mode: Mode, now = new Date()): Recommendation[] {
  const eff = toolEfficacy(sessions);
  const hour = now.getHours();
  const evening = hour >= 20 || hour < 4;
  const preferred = MODES[mode].preferredTools;
  const key: PulseState = state === "learning" ? "steady" : state;

  return TOOLS.map((tool) => {
    const fit = tool.fits[key] ?? 0.2;
    const e = eff[tool.id];
    const timeFit = tool.evening ? (evening ? 0.35 : -0.15) : evening && tool.kind === "breathing" && tool.id !== "breath-478" ? -0.05 : 0;
    const modeFit = preferred.includes(tool.id) ? 0.15 : 0;
    const explore = e.sessions === 0 ? 0.12 : 0;
    const score = 1.2 * fit + 0.45 * e.score + timeFit + modeFit + explore;

    let reason: string;
    if (e.sessions >= 2 && e.avgDrop != null && e.avgDrop >= 1) reason = `It's lowered your stress by ~${e.avgDrop} points on average (${e.sessions} times).`;
    else if (e.sessions >= 2 && e.helpfulRate != null && e.helpfulRate >= 0.6) reason = `You've found this helpful before.`;
    else if (e.sessions >= 2 && e.score < 0.6) reason = `Hasn't done much for you so far — included for variety.`;
    else if (tool.evening && evening) reason = "Good fit for this time of night.";
    else if (e.sessions === 0) reason = `Not tried yet. ${tool.bestFor}.`;
    else reason = tool.bestFor + ".";
    return { tool, score: round(score, 2), reason, personal: e };
  }).sort((a, b) => b.score - a.score);
}
