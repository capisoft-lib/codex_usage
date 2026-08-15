import { requireViewer } from "../../../lib/auth";
import { hostedDashboardCapabilities } from "../../../lib/dashboard-contract";
import { json } from "../../../lib/mesh";

export async function GET(request: Request) {
  try {
    requireViewer(request);
    return json(hostedDashboardCapabilities());
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Lecture des capacités impossible." }, 500);
  }
}
