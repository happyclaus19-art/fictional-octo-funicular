# 보고 말해요 — 초등 프롬프트 연습 + 실시간 교사 대시보드

그림을 보고 **한국어로 프롬프트**를 써서 AI가 그린 그림과 비교하며 레벨업하는 수업 도구입니다.
교사는 학생들의 연습 과정을 실시간 대시보드로 보고 결과를 내려받을 수 있습니다.

## 기술 스택
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres · Auth · Realtime · RLS)
- Claude API — SVG 그림 생성 · 채점 · 한국어 힌트 (예정)
- Vitest (테스트)

## 시작하기
```powershell
npm install
Copy-Item .env.example .env.local   # 값 채우기 (커밋되지 않음)
npm run dev
```
DB 스키마: Supabase SQL Editor 에서 `supabase/migrations/0001_init.sql` 실행.

## 개인정보·보안 원칙
- 학생은 **반 코드 + 번호 + 닉네임**만 사용합니다. 실명·이메일을 수집하지 않습니다.
- 모든 테이블에 RLS 적용: 교사는 자기 반만, 학생은 자기 기록만 볼 수 있습니다.
- 점수·시도 기록은 서버만 기록합니다(위조 방지). 정답 체크리스트는 클라이언트에 노출되지 않습니다.
- 비밀 키는 `.env.local` 에만 두며 `.gitignore` 로 커밋을 막습니다.
- 빌드할 때마다 커밋 파일과 브라우저 번들에서 비밀 키 유출을 자동 검사합니다.
- 반 데이터는 기본 180일 후 삭제 대상입니다.

## 명령어
| 명령 | 설명 |
|---|---|
| `npm test` | 단위 테스트 (환경변수, .gitignore, 비밀키 검사, DB 보안 규칙) |
| `npm run test:db` | 실제 Supabase 에서 RLS 검증 (`.env.local` 필요) |
| `npm run check:secrets` | 커밋될 파일 비밀 키 검사 |
| `npm run verify` | 린트 + 테스트 + 비밀키 검사 + 빌드 |
