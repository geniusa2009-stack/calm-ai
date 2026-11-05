/**
 * Safety layer. Calm AI is not a crisis service or a clinical tool.
 * This runs deterministically BEFORE any model call and on every note,
 * so the safety response never depends on an API key or a model.
 */

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm|cut)\s+(myself|me)\b/i,
  /\b(suicid(e|al)|end\s+(my|it\s+all)\s*(life)?|take\s+my\s+(own\s+)?life)\b/i,
  /\b(want|wish|going)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|live|exist|wake\s+up)\b/i,
  /\b(no\s+reason\s+to\s+live|better\s+off\s+(dead|without\s+me))\b/i,
  /\bself[-\s]?harm(ing)?\b/i,
  /\boverdos(e|ing)\b/i,
];

export function detectCrisis(text: string | null | undefined): boolean {
  if (!text) return false;
  return CRISIS_PATTERNS.some((r) => r.test(text));
}

export interface Resource { name: string; contact: string; detail: string; href?: string }

const RESOURCES: Record<string, Resource[]> = {
  US: [
    { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988", detail: "Free, confidential, 24/7", href: "tel:988" },
    { name: "Crisis Text Line", contact: "Text HOME to 741741", detail: "24/7 text support", href: "sms:741741" },
  ],
  CA: [{ name: "9-8-8 Suicide Crisis Helpline", contact: "Call or text 988", detail: "24/7, English & French", href: "tel:988" }],
  GB: [
    { name: "Samaritans", contact: "Call 116 123", detail: "Free, 24/7", href: "tel:116123" },
    { name: "Shout", contact: "Text SHOUT to 85258", detail: "24/7 text support", href: "sms:85258" },
  ],
  IE: [{ name: "Samaritans Ireland", contact: "Call 116 123", detail: "Free, 24/7", href: "tel:116123" }],
  AU: [{ name: "Lifeline", contact: "Call 13 11 14", detail: "24/7 crisis support", href: "tel:131114" }],
  NZ: [{ name: "Need to talk?", contact: "Call or text 1737", detail: "Free, 24/7", href: "tel:1737" }],
  IN: [{ name: "Tele-MANAS", contact: "Call 14416", detail: "Free, 24/7 mental health support", href: "tel:14416" }],
};

const INTERNATIONAL: Resource = { name: "Find a helpline", contact: "findahelpline.com", detail: "Free, confidential helplines in 130+ countries", href: "https://findahelpline.com" };

export function crisisResources(region: string): Resource[] {
  return [...(RESOURCES[region] ?? []), INTERNATIONAL];
}

export const REGIONS = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"],
  ["AU", "Australia"], ["NZ", "New Zealand"], ["IN", "India"], ["OTHER", "Somewhere else"],
] as const;

export const CRISIS_MESSAGE =
  "It sounds like you might be going through something really painful right now. You deserve support from a person, not an app. " +
  "If you're in immediate danger, please call your local emergency number. You can also reach a trained crisis counsellor right now — it's free and confidential.";
