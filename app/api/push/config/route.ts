import { vapidConfig } from "@/lib/push/send";
import { listSubscriptionsPublic } from "@/lib/push/store";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";
/** The VAPID PUBLIC key (safe to expose) and this user's subscription summary. */
export const GET = route((_req, { user }) => ({ publicKey: vapidConfig()?.publicKey ?? null, subscriptions: listSubscriptionsPublic(user.id) }));
