#!/usr/bin/env node
// 사용법
//   node scripts/check-secrets.mjs           → 커밋될 파일 검사
//   node scripts/check-secrets.mjs --bundle  → 빌드된 브라우저 번들(.next/static)도 검사
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanText, secretValuesFromEnv } from "./secret-scan-lib.mjs";

const root = process.cwd();
const knownSecrets = existsSync(join(root, ".env.local"))
  ? secretValuesFromEnv(readFileSync(join(root, ".env.local"), "utf8"))
  : [];

const problems = [];

// 1) git 이 커밋할 수 있는 파일 (추적 중 + 무시되지 않은 새 파일)
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
  .filter((f) => !f.endsWith("package-lock.json"));

for (const file of files) {
  const full = join(root, file);
  if (!existsSync(full) || statSync(full).size > 2_000_000) continue;
  for (const f of scanText(readFileSync(full, "utf8"), { knownSecrets })) problems.push(`${file}: ${f}`);
}

// 2) 브라우저로 내려가는 번들
if (process.argv.includes("--bundle")) {
  const dir = join(root, ".next", "static");
  if (!existsSync(dir)) {
    console.error("✖ .next/static 이 없습니다. 먼저 npm run build 를 실행하세요.");
    process.exit(1);
  }
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  for (const file of walk(dir).filter((f) => /\.(js|css|html|json|map)$/.test(f))) {
    for (const f of scanText(readFileSync(file, "utf8"), { knownSecrets, clientBundle: true })) {
      problems.push(`${file.slice(root.length + 1)}: ${f}`);
    }
  }
}

if (problems.length) {
  console.error("✖ 비밀 정보 유출 가능성이 발견되었습니다:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✔ 비밀 정보 검사 통과 (파일 ${files.length}개${process.argv.includes("--bundle") ? " + 브라우저 번들" : ""})`);
