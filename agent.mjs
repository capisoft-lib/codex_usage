import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_HELP, parseAgentOptions } from "./src/agent-options.mjs";
import { cliText } from "./src/cli-locale.mjs";
import { createUsageCollector } from "./src/usage-collector.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const options = parseAgentOptions(process.argv.slice(2));
if (options.help) {
  console.log(AGENT_HELP);
  process.exit(0);
}
const collector = await createUsageCollector({ root, env: options.env });

if (!collector.meshAgent) {
  throw new Error(cliText("agentNotAssociated"));
}

if (options.once) {
  const data = await collector.refresh();
  await collector.meshAgent.sync(data);
  collector.stop();
  await collector.close();
  console.log(cliText("oneShotComplete", collector.meshAgent.status().alias));
  process.exit(0);
}

collector.start({ unrefTimer: false });
await collector.refresh();
console.log(cliText("agentActive", collector.meshAgent.status().alias));

async function shutdown() {
  collector.stop();
  await collector.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
