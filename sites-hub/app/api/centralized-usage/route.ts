import { requireViewer } from "../../../lib/auth";
import { json } from "../../../lib/mesh";
import { aggregateUsageForOwner } from "../../../lib/usage";

export async function GET(request: Request) {
  try {
    return json(await aggregateUsageForOwner(requireViewer(request).id));
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Lecture centralisée impossible." }, 500);
  }
}
