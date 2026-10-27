// Compare APK versions against the security database for the image's own branch.
// Scout can incorrectly compare stable package releases against Alpine edge.
import { execFileSync } from "node:child_process";
const image = process.argv[2] || "codex-usage-dashboard:ci";
const platform = process.argv[3] || "linux/amd64";
const inspect = source => JSON.parse(execFileSync("docker", ["run", "--rm", "--platform", platform,
  "--network", "none", "--read-only", "--entrypoint", "node", "-i", image, "--input-type=module"],
{ input: source, encoding: "utf8", timeout: 60_000 }));
const inventory = inspect(`import {readFileSync,existsSync} from 'node:fs';
const packages=readFileSync('/lib/apk/db/installed','utf8').trim().split(/\\n\\n/).map(block=>Object.fromEntries(block.split('\\n').map(line=>[line.slice(0,1),line.slice(2)])));
console.log(JSON.stringify({node:process.version,alpine:readFileSync('/etc/alpine-release','utf8').trim(),packages:packages.map(p=>({name:p.P,origin:p.o||p.P,version:p.V})),npmInstalled:existsSync('/usr/local/lib/node_modules/npm')}));`);
const branch = `v${inventory.alpine.split(".").slice(0, 2).join(".")}`;
const checks = [];
const databases = [];
for (const repository of ["main", "community"]) {
  const url = `https://secdb.alpinelinux.org/${branch}/${repository}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Alpine security database unavailable: HTTP ${response.status}`);
  databases.push(url);
  const data = await response.json();
  for (const { pkg } of data.packages) for (const installed of inventory.packages.filter(p => p.origin === pkg.name)) {
    for (const [fixedVersion, cves] of Object.entries(pkg.secfixes || {})) checks.push({ ...installed, fixedVersion, cves });
  }
}
const affected = inspect(`import {execFileSync} from 'node:child_process';
const checks=${JSON.stringify(checks)};
console.log(JSON.stringify(checks.filter(c=>execFileSync('apk',['version','-t',c.version,c.fixedVersion],{encoding:'utf8'}).trim()==='<')));`);
console.log(JSON.stringify({ image, platform, checkedAt: new Date().toISOString(), node: inventory.node,
  alpine: inventory.alpine, npmInstalled: inventory.npmInstalled, packages: inventory.packages.length,
  securityComparisons: checks.length, databases, affected }, null, 2));
if (affected.length || inventory.npmInstalled) process.exitCode = 1;
