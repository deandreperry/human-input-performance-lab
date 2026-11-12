import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ study: string }> },
) {
  const { study } = await params;
  if (!["pointing", "precision", "distance"].includes(study))
    return new Response("Unknown reference study", { status: 404 });
  const rows: Record<string, unknown>[] = JSON.parse(
    gunzipSync(
      await readFile(path.join(process.cwd(), "data", study + ".json.gz")),
    ).toString(),
  );
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const cols = Object.keys(
    rows[0] ?? { source: "", study_id: "", trial_id: "" },
  );
  const quote = (value: unknown) =>
    '"' +
    String(
      typeof value === "object" ? JSON.stringify(value) : (value ?? ""),
    ).replaceAll('"', '""') +
    '"';
  return new Response(
    csv
      ? [
          cols.join(","),
          ...rows.map((r) => cols.map((c) => quote(r[c])).join(",")),
        ].join("\r\n")
      : JSON.stringify(rows),
    {
      headers: {
        "Content-Type": csv ? "text/csv" : "application/json",
        "Content-Disposition":
          'attachment; filename="synthetic-' +
          study +
          "." +
          (csv ? "csv" : "json") +
          '"',
      },
    },
  );
}
