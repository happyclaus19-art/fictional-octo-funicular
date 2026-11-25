import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

describe("DB 마이그레이션 보안 규칙", () => {
  it("테이블이 정의되어 있다", () => {
    expect(tables).toEqual(
      expect.arrayContaining(["teachers", "classes", "students", "challenges", "challenge_answers", "attempts"]),
    );
  });

  it.each(tables)("%s 테이블에 RLS 가 켜져 있다", (t) => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
  });

  it("정답 체크리스트는 어떤 클라이언트 정책도 없다", () => {
    expect(sql).not.toMatch(/on public\.challenge_answers\s+for/);
    expect(sql).toMatch(/revoke all on public\.challenge_answers from authenticated/);
  });

  it("학생/클라이언트가 시도 기록을 직접 쓸 수 없다 (점수 위조 방지)", () => {
    expect(sql).not.toMatch(/on public\.attempts\s+for (insert|update|all)/);
    expect(sql).not.toMatch(/on public\.students\s+for (insert|update|all)/);
  });

  it("학생 테이블에 실명·이메일 컬럼이 없다", () => {
    const studentsDef = sql.match(/create table public\.students \(([\s\S]*?)\n\);/)![1];
    expect(studentsDef).not.toMatch(/\b(email|real_name|full_name|phone|birth)\b/);
  });
});
