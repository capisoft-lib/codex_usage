import { requireViewer } from "../../../lib/auth";
import { json } from "../../../lib/mesh";
import { aggregateUsageForOwner } from "../../../lib/usage";

export async function GET(request: Request) {
  try {
    const source = new URL(request.url).searchParams.get("source") || "centralized";
    if (source !== "centralized") return json({ error: "Seule la source centralisée est disponible sur ce Site.", code: "invalid_usage_source" }, 400);
    return json(await aggregateUsageForOwner(requireViewer(request).id));
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Lecture centralisée impossible." }, 500);
  }
}
