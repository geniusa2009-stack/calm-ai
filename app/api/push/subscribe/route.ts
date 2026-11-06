import { PushError, removeSubscription, saveSubscription, validateSubscription } from "@/lib/push/store";
import { vapidConfig } from "@/lib/push/send";
import { json, route } from "@/lib/http";

const MAX_BODY = 4096;
async function body(req: Request) {
  const t = await req.text();
  if (t.length > MAX_BODY) throw new PushError("Request too large", 413);
  return JSON.parse(t);
}
const fail = (e: unknown) => { if (e instanceof PushError) return json({ error: e.message }, { status: e.status }); throw e; };

export const POST = route(async (req, { user }) => {
  if (!vapidConfig()) return json({ error: "Push isn't configured on this server." }, { status: 503 });
  try { saveSubscription(user.id, validateSubscription((await body(req)).subscription), req.headers.get("user-agent")); return { ok: true }; }
  catch (e) { return fail(e); }
});

export const DELETE = route(async (req, { user }) => {
  try {
    const b = await body(req);
    if (typeof b.endpoint !== "string") throw new PushError("endpoint required");
    return { ok: true, removed: removeSubscription(user.id, b.endpoint) };
  } catch (e) { return fail(e); }
});
