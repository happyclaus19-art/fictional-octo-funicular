import { describe, expect, it } from "vitest";
import { findLeakedPublicSecrets, parseServerEnv } from "@/lib/env/schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-0123456789abcdef",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-0123456789abcdef",
};

describe("환경 변수 검증", () => {
  it("올바른 값이면 통과하고 기본 사용량 제한을 채운다", () => {
    const env = parseServerEnv(valid);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(5);
  });

  it("비밀 키에 NEXT_PUBLIC_ 이 붙으면 거부한다", () => {
    expect(findLeakedPublicSecrets({ NEXT_PUBLIC_ANTHROPIC_API_KEY: "x" })).toEqual([
      "NEXT_PUBLIC_ANTHROPIC_API_KEY",
    ]);
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_SERVICE_ROLE_KEY: "x" })).toThrow(/NEXT_PUBLIC_/);
  });

  it("오류 메시지에 비밀 값 자체를 출력하지 않는다", () => {
    // 스캐너에 걸리지 않도록 실행 중에 조립한 가짜 키
    const secret = ["sk", "ant", "THIS-SHOULD-NEVER-BE-PRINTED"].join("-");
    try {
      parseServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "short", ANTHROPIC_API_KEY: secret });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect((e as Error).message).not.toContain("short");
    }
  });

  it("Anthropic 키 형식이 아니면 거부한다", () => {
    expect(() => parseServerEnv({ ...valid, ANTHROPIC_API_KEY: "wrong-format" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
