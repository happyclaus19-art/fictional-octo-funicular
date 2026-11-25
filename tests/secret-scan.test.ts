import { describe, expect, it } from "vitest";
import { scanText, secretValuesFromEnv } from "../scripts/secret-scan-lib.mjs";

// 가짜 키는 실행 중에 조립 → 이 테스트 파일 자체는 비밀 정보 검사에 걸리지 않음
const FAKE_ANTHROPIC = ["sk", "ant", "api03", "x".repeat(26)].join("-");
const FAKE_JWT = ["ey" + "JhbGciOiJIUzI1NiJ9", "ey" + "Jyb2xlIjoic2VydmljZV9yb2xlIn0", "abcdefghijklmn"].join(".");

describe("비밀 정보 스캐너", () => {
  it("Anthropic 키를 찾아낸다", () => {
    expect(scanText(`const k = '${FAKE_ANTHROPIC}'`)).toContain("Anthropic API 키");
  });

  it("Supabase 신형 secret 키를 찾아낸다", () => {
    expect(scanText("sb_" + "secret_" + "a".repeat(30))).toContain("Supabase secret 키");
  });

  it("JWT 형식 서비스 키를 찾아낸다", () => {
    const jwt = FAKE_JWT;
    expect(scanText(jwt)).toContain("JWT 토큰(서비스 키 가능성)");
  });

  it(".env.local 의 실제 값이 파일에 들어 있으면 찾아낸다 (공개 값은 제외)", () => {
    const known = secretValuesFromEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-value-123456\nSUPABASE_SERVICE_ROLE_KEY=my-very-secret-value-123\n",
    );
    expect(known.map((k: { name: string }) => k.name)).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(scanText("x my-very-secret-value-123 x", { knownSecrets: known })).toHaveLength(1);
    expect(scanText("x public-anon-value-123456 x", { knownSecrets: known })).toHaveLength(0);
  });

  it("브라우저 번들에서 서버 전용 변수 이름을 찾아낸다", () => {
    expect(scanText("process.env.ANTHROPIC_API_KEY", { clientBundle: true })).toHaveLength(1);
  });

  it("깨끗한 코드는 통과한다", () => {
    expect(scanText("export const greeting = '안녕하세요';", { clientBundle: true })).toEqual([]);
  });
});
