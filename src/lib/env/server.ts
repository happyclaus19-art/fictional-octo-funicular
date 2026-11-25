import "server-only";
import { parseServerEnv } from "./schema";

let cached: ReturnType<typeof parseServerEnv> | undefined;

/** 서버 코드에서만 호출. 클라이언트 컴포넌트에서 import 하면 빌드가 실패합니다. */
export function serverEnv() {
  cached ??= parseServerEnv(process.env);
  return cached;
}
