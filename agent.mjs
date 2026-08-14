import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUsageCollector } from "./src/usage-collector.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const collector = await createUsageCollector({ root });

if (!collector.meshAgent) {
  throw new Error("Le mode agent nécessite MESH_HUB_URL afin d’envoyer les données minimisées vers un hub.");
}

collector.start({ unrefTimer: false });
await collector.refresh();
console.log(`Collecteur Codex actif pour ${collector.meshAgent.status().alias}. Aucune interface locale n’est servie.`);

function shutdown() {
  collector.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
