import { addMemory, deleteMemory, updateMemory } from "@/lib/db";
import { route } from "@/lib/http";
import { oneOf, str, BadRequest } from "@/lib/validate";
import type { MemoryKind } from "@/lib/types";

const KINDS: MemoryKind[] = ["note", "win", "trigger", "helped", "insight"];

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  return { memory: addMemory(user.id, oneOf(b.kind, "kind", KINDS), str(b.text, "text", 1000)!) };
});
export const PATCH = route(async (req, { user }) => {
  const b = await req.json();
  if (!Number.isInteger(b.id)) throw new BadRequest("id required");
  const ok = updateMemory(user.id, b.id, { pinned: typeof b.pinned === "boolean" ? b.pinned : undefined, text: str(b.text, "text", 1000, true) ?? undefined });
  if (!ok) throw new BadRequest("Not found");
});
export const DELETE = route(async (req, { user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  if (!deleteMemory(user.id, id)) throw new BadRequest("Not found");
});
