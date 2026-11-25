import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function isIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", path]);
    return true; // 종료 코드 0 = 무시됨
  } catch {
    return false;
  }
}

describe(".gitignore 보안 규칙", () => {
  it.each([".env", ".env.local", ".env.production", "secrets/key.json", "exports/6-6반.csv", "결과.zip", "server.pem"])(
    "%s 는 커밋되지 않는다",
    (p) => expect(isIgnored(p)).toBe(true),
  );

  it(".env.example 은 커밋된다", () => {
    expect(isIgnored(".env.example")).toBe(false);
  });
});
