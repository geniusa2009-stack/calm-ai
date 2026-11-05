import { addCircle, deleteCircle } from "@/lib/db";
import { handle, str, BadRequest } from "@/lib/validate";

export const POST = handle(async (req) => {
  const b = await req.json();
  addCircle({ name: str(b.name, "name", 60)!, relation: str(b.relation, "relation", 60) ?? "", contact: str(b.contact, "contact", 120, true), note: str(b.note, "note", 200, true) });
});
export const DELETE = handle(async (req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  deleteCircle(id);
});
