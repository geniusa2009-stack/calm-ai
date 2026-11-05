import { addCircle, deleteCircle } from "@/lib/db";
import { route } from "@/lib/http";
import { str, BadRequest } from "@/lib/validate";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  addCircle(user.id, { name: str(b.name, "name", 60)!, relation: str(b.relation, "relation", 60, true) ?? "Friend", contact: str(b.contact, "contact", 120, true), note: str(b.note, "note", 200, true) });
});
export const DELETE = route(async (req, { user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  if (!deleteCircle(user.id, id)) throw new BadRequest("Not found");
});
