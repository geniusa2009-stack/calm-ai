import { wipeUserData } from "@/lib/db";
import { route } from "@/lib/http";
/** Delete all of the caller's wellbeing data, keeping the account. */
export const POST = route((_req, { user }) => { wipeUserData(user.id); });
