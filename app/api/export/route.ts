import { exportAll } from "@/lib/db";
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(JSON.stringify(exportAll(), null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="calm-ai-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
