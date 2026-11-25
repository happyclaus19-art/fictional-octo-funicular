import { z } from "zod";

/** 브라우저에 노출돼도 되는 값만 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

/** 서버 전용 비밀 값 */
export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(5),
});

/** 비밀 값 이름에 NEXT_PUBLIC_ 이 붙어 있으면 실수로 브라우저에 노출된 것 */
const SECRET_NAME_HINTS = ["SERVICE_ROLE", "API_KEY", "SECRET", "PASSWORD", "PRIVATE"];

export function findLeakedPublicSecrets(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter(
    (name) =>
      name.startsWith("NEXT_PUBLIC_") && SECRET_NAME_HINTS.some((hint) => name.includes(hint)),
  );
}

export function parseServerEnv(env: Record<string, string | undefined>) {
  const leaked = findLeakedPublicSecrets(env);
  if (leaked.length > 0) {
    throw new Error(
      `비밀 값이 NEXT_PUBLIC_ 으로 노출되어 있습니다: ${leaked.join(", ")} — 이름에서 NEXT_PUBLIC_ 을 제거하세요.`,
    );
  }
  const result = serverEnvSchema.extend(publicEnvSchema.shape).safeParse(env);
  if (!result.success) {
    // 값 자체는 출력하지 않고, 어떤 변수가 문제인지만 알려줌
    const names = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`.env.local 설정 오류: ${names} 값을 확인하세요 (.env.example 참고).`);
  }
  return result.data;
}
