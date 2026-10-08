import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import runtimeArtifactPolicy from "./runtime-artifact-policy.cjs";

const { shouldPruneRuntimeArtifact } = runtimeArtifactPolicy;

const source = path.resolve("dist");
const target = path.resolve("dist/desktop-standalone");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await mkdir(path.join(target, "dist"), { recursive: true });
for (const directory of ["server", "client"]) {
  await cp(path.join(source, directory), path.join(target, "dist", directory), { recursive: true });
}
await cp(path.resolve("desktop/standalone-server.mjs"), path.join(target, "server.js"));
await writeFile(path.join(target, "package.json"), '{"private":true,"type":"module"}\n');

const copiedDependencies = new Set();
async function copyRuntimeDependency(name) {
  if (copiedDependencies.has(name)) return;
  copiedDependencies.add(name);

  const segments = name.split("/");
  const dependencySource = path.resolve("node_modules", ...segments);
  const dependencyTarget = path.join(target, "node_modules", ...segments);
  const manifest = JSON.parse(await readFile(path.join(dependencySource, "package.json"), "utf8"));

  await cp(dependencySource, dependencyTarget, { recursive: true, force: true });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    await copyRuntimeDependency(dependency);
  }
}

for (const dependency of ["vinext", "react", "react-dom", "react-server-dom-webpack"]) {
  await copyRuntimeDependency(dependency);
}

await rename(path.join(target, "node_modules"), path.join(target, "modules"));

async function pruneRuntimeArtifacts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await pruneRuntimeArtifacts(entryPath);
    else if (entry.isFile() && shouldPruneRuntimeArtifact(entry.name)) await rm(entryPath);
  }
}

await pruneRuntimeArtifacts(target);
await writeFile(path.join(target, ".runtime-id"), Date.now().toString(36));
