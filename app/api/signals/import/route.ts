import { fileImportProvider } from "@/lib/signals/providers";
import { ingest, MAX_BATCH } from "@/lib/signals/store";
import { route } from "@/lib/http";
import { BadRequest } from "@/lib/validate";

const MAX_BYTES = 2_000_000;

/** Push endpoint for user-supplied exports. Every reading is validated; nothing is trusted. */
export const POST = route(async (req, { user }) => {
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new BadRequest("File too large (max 2 MB). Split it into smaller imports.");
  const body = JSON.parse(text);
  const readings = Array.isArray(body) ? body : body?.readings;
  if (!Array.isArray(readings)) throw new BadRequest("Expected { \"readings\": [...] }");
  if (readings.length > MAX_BATCH) throw new BadRequest(`Too many readings (max ${MAX_BATCH} per import).`);
  const report = ingest(user.id, fileImportProvider.id, readings);
  return { report: { ...report, rejected: report.rejected.slice(0, 50) } };
});
