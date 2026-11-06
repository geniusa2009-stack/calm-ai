import Anthropic from "@anthropic-ai/sdk";
import { addCompanion, getSettings, listCheckIns, listCompanion, listMemories, listSessions, type UserId } from "./db";
import { buildSummary } from "./summary";
import { CRISIS_MESSAGE, crisisResources, detectCrisis, type Resource } from "./safety";
import { MODES } from "./modes";
import { resolveTimeZone } from "./time";

export const COMPANION_MODEL = process.env.CALM_COMPANION_MODEL || "claude-opus-5-5";

export function companionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// Stable guardrail prompt — kept byte-identical across requests so it caches.
const GUARDRAILS = `You are the optional companion inside Calm AI, a personal wellbeing app. Calm learns a person's own baseline from short check-ins (stress, mood, energy, sleep, tags) and notices when they drift from it.

Your role: a warm, grounded presence who helps the person reflect and pick one small, practical next step. You are not a therapist, doctor, or crisis service, and you never present yourself as one.

How to respond:
- Keep replies short: usually 2–5 sentences. Plain, human language. No headings or bullet lists unless asked.
- Reflect what you hear before suggesting anything. Ask at most one gentle question per reply.
- When it fits, connect to their own patterns from the context below ("you've mentioned walks helped before"), but don't recite data at them, and don't overstate certainty — patterns are associations, not causes.
- Suggest at most one concrete step, ideally one of Calm's tools: physiological sigh, box breathing, 4-7-8 breathing, 5-4-3-2-1 grounding, two-minute reset, soundscape, wind-down, quick reflection, or reaching out to someone in their trusted circle.
- Respect autonomy. Never pressure, guilt, or moralize.

Boundaries:
- Do not diagnose, label conditions, or interpret symptoms clinically. Do not give medication, dosing, or treatment advice.
- If they describe persistent difficulty (weeks, not days), affecting sleep, work or relationships, gently encourage talking to a professional or someone they trust, without alarm.
- If there is any sign of risk of harm to themselves or others, stop coaching: say you're concerned, encourage contacting local emergency services or a crisis line right now, and keep it brief and kind.
- Don't claim to remember things beyond the context you're given. Don't invent data.`;

export interface CompanionReply { content: string; flagged: boolean; resources?: Resource[]; configured: boolean }

export async function companionReply(uid: UserId, userText: string): Promise<CompanionReply> {
  const text = userText.trim().slice(0, 4000);
  const settings = getSettings(uid);

  // 1. Deterministic safety check — always runs, before and independent of any model.
  if (detectCrisis(text)) {
    addCompanion(uid, "user", text, true);
    addCompanion(uid, "assistant", CRISIS_MESSAGE, true);
    return { content: CRISIS_MESSAGE, flagged: true, resources: crisisResources(settings.region), configured: companionConfigured() };
  }

  addCompanion(uid, "user", text);

  // 2. No credentials: be explicit rather than pretending.
  if (!companionConfigured()) {
    const msg = "The AI companion isn't switched on for this installation yet — the server has no ANTHROPIC_API_KEY set. " +
      "Everything else in Calm (your pulse, radar, patterns and support tools) works without it. " +
      "If you'd like something right now, a two-minute reset or box breathing from the Support tab is a good place to start.";
    addCompanion(uid, "assistant", msg);
    return { content: msg, flagged: false, configured: false };
  }

  // 3. Build context (only if the person allowed it in settings).
  let context = `Current mode: ${MODES[settings.mode].label}. Tone: ${MODES[settings.mode].tone}.`;
  if (settings.companionUsesContext) {
    const s = buildSummary(listCheckIns(uid, 60), listSessions(uid, 90), listMemories(uid), new Date(), resolveTimeZone(settings.timezone));
    context += `\n\nWhat Calm currently knows about this person (from their own check-ins):\n${s.text}`;
  } else {
    context += "\n\nThe person has chosen not to share their wellbeing data with the companion. Don't refer to patterns.";
  }
  if (settings.displayName) context += `\nThey'd like to be called ${settings.displayName}.`;

  const history = listCompanion(uid, 20)
    .filter((m) => !m.flagged)
    .map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam);
  // The API requires the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();

  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: COMPANION_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [
        { type: "text", text: GUARDRAILS, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      messages: history,
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      const content = "I'm not able to help with that one here. If things feel heavy, the Support tab or someone in your trusted circle might be a better next step.";
      addCompanion(uid, "assistant", content);
      return { content, flagged: false, configured: true };
    }
    const content = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() ||
      "I'm here. Want to tell me a little more?";
    addCompanion(uid, "assistant", content);
    return { content, flagged: false, configured: true };
  } catch (err) {
    let content = "The companion couldn't respond just now. Your support tools are still available in the Support tab.";
    if (err instanceof Anthropic.AuthenticationError) content = "The companion's API key was rejected by the server, so it can't respond. Everything else in Calm still works.";
    else if (err instanceof Anthropic.RateLimitError) content = "The companion is getting too many requests right now — try again in a minute.";
    else if (err instanceof Anthropic.APIConnectionError) content = "The companion couldn't reach the AI service (network issue). Try again shortly.";
    console.error("[companion]", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
    addCompanion(uid, "assistant", content);
    return { content, flagged: false, configured: true };
  }
}
