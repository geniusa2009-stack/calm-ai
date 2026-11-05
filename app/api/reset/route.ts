import { wipeAll } from "@/lib/db";
import { handle } from "@/lib/validate";
export const POST = handle(() => { wipeAll(false); });
