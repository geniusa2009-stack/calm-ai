import { addMemory, deleteMemory, updateMemory } from "@/lib/db";
import { handle, oneOf, str, BadRequest } from "@/lib/validate";
import type { MemoryKind } from "@/lib/types";

const KINDS: MemoryKind[] = ["note", "win", "trigger", "helped", "insight"];

export const POST = handle(async (req) => {
  const b = await req.json();
  return { memory: addMemory(oneOf(b.kind, "kind", KINDS), str(b.text, "text", 1000)!) };
});
export const PATCH = handle(async (req) => {
  const b = await req.json();
  if (!Number.isInteger(b.id)) throw new BadRequest("id required");
  updateMemory(b.id, { pinned: typeof b.pinned === "boolean" ? b.pinned : undefined, text: str(b.text, "text", 1000, true) ?? undefined });
});
export const DELETE = handle(async (req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  deleteMemory(id);
});
