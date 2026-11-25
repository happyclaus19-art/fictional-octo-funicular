// 비밀 키 유출 검사 로직 (테스트 가능하도록 순수 함수로 분리)

export const SECRET_PATTERNS = [
  { name: "Anthropic API 키", regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI 형식 API 키", regex: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: "JWT 토큰(서비스 키 가능성)", regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Supabase secret 키", regex: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "개인 키", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

// 클라이언트 번들에 이 이름이 보이면 서버 전용 값을 브라우저 코드에서 참조한 것
export const SERVER_ONLY_NAMES = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"];

/** .env 파일 내용에서 비밀 값(서버 전용, 16자 이상)만 뽑음 */
export function secretValuesFromEnv(envText) {
  const values = [];
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, name, raw] = m;
    const value = raw.replace(/^["']|["']$/g, "");
    if (name.startsWith("NEXT_PUBLIC_")) continue; // 공개 값은 노출돼도 됨
    if (value.length >= 16) values.push({ name, value });
  }
  return values;
}

/**
 * @param {string} text 검사할 내용
 * @param {{ knownSecrets?: {name:string,value:string}[], clientBundle?: boolean }} opts
 * @returns {string[]} 발견된 문제 (비밀 값 자체는 절대 포함하지 않음)
 */
export function scanText(text, opts = {}) {
  const findings = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(text)) findings.push(name);
  }
  for (const { name, value } of opts.knownSecrets ?? []) {
    if (text.includes(value)) findings.push(`.env.local 의 ${name} 실제 값`);
  }
  if (opts.clientBundle) {
    for (const name of SERVER_ONLY_NAMES) {
      if (text.includes(name)) findings.push(`서버 전용 변수 이름 ${name}`);
    }
  }
  return findings;
}
