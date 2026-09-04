import { parseArgs } from "node:util";
import {
  preserveExistingAgentState,
  writeWindowsSupervisor,
} from "../src/windows-agent-supervision.mjs";

const { values } = parseArgs({
  options: {
    "launcher-path": { type: "string" },
    "headless-host-path": { type: "string" },
    "repo-root": { type: "string" },
    "state-path": { type: "string" },
    "state-source": { type: "string" },
    "node-path": { type: "string" },
    "log-path": { type: "string" },
    "task-name": { type: "string", default: "CodexUsageMesh" },
    "restart-delay-seconds": { type: "string", default: "30" },
    "project-mode": { type: "string", default: "hash" },
    "include-titles": { type: "boolean", default: false },
  },
  strict: true,
});

for (const name of ["launcher-path", "repo-root", "state-path", "node-path", "log-path"]) {
  if (!values[name]) throw new Error(`--${name} is required.`);
}

const state = await preserveExistingAgentState({
  sourcePath: values["state-source"],
  destinationPath: values["state-path"],
});
await writeWindowsSupervisor(values["launcher-path"], {
  repoRoot: values["repo-root"],
  statePath: values["state-path"],
  nodePath: values["node-path"],
  logPath: values["log-path"],
  headlessHostPath: values["headless-host-path"],
  taskName: values["task-name"],
  restartDelaySeconds: Number(values["restart-delay-seconds"]),
  projectMode: values["project-mode"],
  includeTitles: values["include-titles"],
});

console.log(JSON.stringify({ state: state.status, launcherPath: values["launcher-path"] }));
