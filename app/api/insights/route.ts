import { setInsightFeedback } from "@/lib/db";
import { handle, str, BadRequest } from "@/lib/validate";

export const POST = handle(async (req) => {
  const b = await req.json();
  if (![1, -1, 0].includes(b.rating)) throw new BadRequest("rating must be 1, 0 or -1");
  setInsightFeedback(str(b.key, "key", 120)!, b.rating);
});
