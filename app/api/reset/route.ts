import { wipeUserData } from "@/lib/db";
import { route } from "@/lib/http";
export const POST = route((_req, { user }) => { wipeUserData(user.id); });
