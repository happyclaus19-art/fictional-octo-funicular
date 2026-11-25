import { publicEnvSchema } from "./schema";

/**
 * 브라우저에서도 쓰는 공개 값.
 * Next.js 는 process.env.NEXT_PUBLIC_* 를 "글자 그대로" 써야 빌드 시 치환하므로 하나씩 적습니다.
 */
export function publicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
