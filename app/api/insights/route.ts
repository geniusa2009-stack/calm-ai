import { setInsightFeedback } from "@/lib/db";
import { route } from "@/lib/http";
import { str, BadRequest } from "@/lib/validate";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  if (![1, -1, 0].includes(b.rating)) throw new BadRequest("rating must be 1, 0 or -1");
  setInsightFeedback(user.id, str(b.key, "key", 120)!, b.rating);
});
