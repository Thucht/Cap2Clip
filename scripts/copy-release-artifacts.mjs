import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(repoRoot, "releases");
const artifacts = [
  ["src-tauri/target/release/cap2clip.exe", "Cap2Clip.exe"],
  [
    "src-tauri/target/release/bundle/nsis/Cap2Clip_1.0.0_x64-setup.exe",
    "Cap2Clip_1.0.0_x64-setup.exe",
  ],
  [
    "src-tauri/target/release/bundle/msi/Cap2Clip_1.0.0_x64_en-US.msi",
    "Cap2Clip_1.0.0_x64_en-US.msi",
  ],
];

for (const [source] of artifacts) {
  const sourcePath = resolve(repoRoot, source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing build artifact: ${sourcePath}`);
  }
}

mkdirSync(outputDir, { recursive: true });
for (const [source, filename] of artifacts) {
  const destination = resolve(outputDir, filename);
  cpSync(resolve(repoRoot, source), destination);
  console.log(`${destination} ${statSync(destination).size} bytes`);
}
