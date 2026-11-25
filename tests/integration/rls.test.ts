/**
 * 실제 Supabase DB 에서 RLS(행 단위 보안)가 정말 막는지 확인하는 테스트.
 * .env.local 이 없으면 자동으로 건너뜁니다.   실행: npm run test:db
 *
 * - 테스트용 가짜 계정(@example.test)을 만들고, 끝나면 모두 삭제합니다.
 * - 관리자 API로 만들기 때문에 실제 이메일은 발송되지 않습니다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

nextEnv.loadEnvConfig(process.cwd());
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const run = randomBytes(4).toString("hex");
const createdUserIds: string[] = [];

let admin: SupabaseClient;

async function makeUser(label: string) {
  const email = `rls-${label}-${run}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`테스트 계정 생성 실패(${label}): ${error.message}`);
  createdUserIds.push(data.user.id);
  const client = createClient(URL!, ANON!, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`테스트 로그인 실패(${label}): ${signInError.message}`);
  return { id: data.user.id, client };
}

const joinCode = () => randomBytes(3).toString("hex").toUpperCase();

describe.skipIf(!configured)("RLS — 실제 Supabase", () => {
  let teacherA: Awaited<ReturnType<typeof makeUser>>;
  let teacherB: Awaited<ReturnType<typeof makeUser>>;
  let studentA: Awaited<ReturnType<typeof makeUser>>;
  let studentB: Awaited<ReturnType<typeof makeUser>>;
  let classA: string, classB: string, challengeId: string;
  let studentARow: string;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, opts);
    [teacherA, teacherB, studentA, studentB] = await Promise.all(
      ["teacherA", "teacherB", "studentA", "studentB"].map(makeUser),
    );

    // 교사는 자기 프로필과 반을 직접 만들 수 있어야 함 (RLS 허용 경로)
    for (const [t, name] of [[teacherA, "A선생님"], [teacherB, "B선생님"]] as const) {
      const { error } = await t.client.from("teachers").insert({ id: t.id, display_name: name });
      expect(error).toBeNull();
    }
    const a = await teacherA.client.from("classes").insert({ teacher_id: teacherA.id, name: "A반", join_code: joinCode() }).select("id").single();
    const b = await teacherB.client.from("classes").insert({ teacher_id: teacherB.id, name: "B반", join_code: joinCode() }).select("id").single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    classA = a.data!.id;
    classB = b.data!.id;

    // 문제·학생·시도 기록은 서버(service role)만 생성
    const ch = await admin.from("challenges").insert({ level: 1, title: `테스트-${run}`, target_svg: "<svg/>" }).select("id").single();
    expect(ch.error).toBeNull();
    challengeId = ch.data!.id;
    await admin.from("challenge_answers").insert({ challenge_id: challengeId, checklist: [{ key: "x", label: "비밀정답" }] });

    const sA = await admin.from("students").insert({ class_id: classA, auth_user_id: studentA.id, seat_number: 1, nickname: "가" }).select("id").single();
    const sB = await admin.from("students").insert({ class_id: classB, auth_user_id: studentB.id, seat_number: 1, nickname: "나" }).select("id").single();
    expect(sA.error).toBeNull();
    expect(sB.error).toBeNull();
    studentARow = sA.data!.id;

    const at = await admin.from("attempts").insert([
      { student_id: studentARow, class_id: classA, challenge_id: challengeId, prompt: "빨간 집", score: 50 },
      { student_id: sB.data!.id, class_id: classB, challenge_id: challengeId, prompt: "노란 해", score: 80 },
    ]);
    expect(at.error).toBeNull();
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (challengeId) await admin.from("challenges").delete().eq("id", challengeId);
    // 계정 삭제 → teachers/classes/students/attempts 는 cascade 로 함께 삭제
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  it("로그인하지 않은 사용자는 시도 기록을 볼 수 없다", async () => {
    const anon = createClient(URL!, ANON!, opts);
    const { data } = await anon.from("attempts").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("학생은 자기 기록만 보고, 다른 반 학생 기록은 못 본다", async () => {
    const { data, error } = await studentA.client.from("attempts").select("prompt");
    expect(error).toBeNull();
    expect(data!.map((r) => r.prompt)).toEqual(["빨간 집"]);
  });

  it("학생은 시도 기록·점수를 직접 쓸 수 없다 (점수 위조 방지)", async () => {
    const { error } = await studentA.client.from("attempts").insert({
      id: randomUUID(), student_id: studentARow, class_id: classA, challenge_id: challengeId, prompt: "위조", score: 100,
    });
    expect(error).not.toBeNull();
  });

  it("학생은 자기 레벨을 직접 올릴 수 없다", async () => {
    await studentA.client.from("students").update({ current_level: 3 }).eq("id", studentARow);
    const { data } = await admin.from("students").select("current_level").eq("id", studentARow).single();
    expect(data!.current_level).toBe(1);
  });

  it("누구도 클라이언트에서 정답 체크리스트를 읽을 수 없다", async () => {
    for (const c of [studentA.client, teacherA.client]) {
      const { data } = await c.from("challenge_answers").select("checklist");
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("교사는 자기 반 기록만 본다", async () => {
    const { data } = await teacherA.client.from("attempts").select("class_id");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.class_id === classA)).toBe(true);
  });

  it("교사는 다른 반 학생 명단을 볼 수 없다", async () => {
    const { data } = await teacherB.client.from("students").select("id").eq("class_id", classA);
    expect(data ?? []).toHaveLength(0);
  });

  it("교사는 다른 교사의 반을 수정할 수 없다", async () => {
    await teacherB.client.from("classes").update({ name: "탈취" }).eq("id", classA);
    const { data } = await admin.from("classes").select("name").eq("id", classA).single();
    expect(data!.name).toBe("A반");
  });
});
