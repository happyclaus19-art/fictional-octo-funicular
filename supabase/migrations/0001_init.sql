-- ============================================================
-- 0001_init: 보고 말해요 — 기본 스키마 + 행 단위 보안(RLS)
--
-- 개인정보 원칙
--  * 학생: 실명/이메일 없음. "반 + 번호 + 닉네임"만 저장.
--    학생은 Supabase 익명 로그인(anonymous sign-in)으로 auth.uid() 를 받음.
--  * 교사: 이메일 로그인.
--  * 시도 기록(attempts)·학생 생성은 서버(service role)만 기록 → 점수 조작 불가.
--  * 정답 체크리스트(challenge_answers)는 클라이언트에 절대 노출하지 않음.
--  * 반 데이터는 expires_at 이후 정리 대상(학기 종료 후 삭제).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 테이블 ----------

create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days')
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  seat_number int not null check (seat_number between 1 and 60),
  nickname text not null check (char_length(nickname) between 1 and 12),
  current_level int not null default 1 check (current_level between 1 and 3),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (class_id, seat_number)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  level int not null check (level between 1 and 3),
  sort_order int not null default 0,
  title text not null,
  target_svg text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 정답 체크리스트: 서버(service role)만 읽음. 정책 없음 = 클라이언트 접근 불가.
create table public.challenge_answers (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  checklist jsonb not null,           -- 예: [{"key":"house","label":"집"}, ...]
  pass_score int not null default 70 check (pass_score between 0 and 100)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade, -- 실시간 필터용
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 100),
  generated_svg text,
  score int check (score between 0 and 100),
  feedback text,
  passed boolean not null default false,
  created_at timestamptz not null default now()
);

create index attempts_class_created_idx on public.attempts (class_id, created_at desc);
create index attempts_student_idx on public.attempts (student_id, created_at desc);
create index students_class_idx on public.students (class_id);

-- ---------- RLS 켜기 (모든 테이블) ----------

alter table public.teachers          enable row level security;
alter table public.classes           enable row level security;
alter table public.students          enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_answers enable row level security;
alter table public.attempts          enable row level security;

-- 로그인하지 않은 사용자(anon)는 어떤 테이블도 직접 접근 불가
revoke all on public.teachers, public.classes, public.students,
              public.challenges, public.challenge_answers, public.attempts from anon;
-- 정답표는 로그인 사용자도 접근 불가
revoke all on public.challenge_answers from authenticated;

-- ---------- 헬퍼 함수 (RLS 재귀 방지용 security definer) ----------

create or replace function public.is_class_teacher(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.my_student_class()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.class_id from public.students s where s.auth_user_id = auth.uid();
$$;

revoke all on function public.is_class_teacher(uuid) from public, anon;
revoke all on function public.my_student_class() from public, anon;
grant execute on function public.is_class_teacher(uuid) to authenticated;
grant execute on function public.my_student_class() to authenticated;

-- ---------- 정책: teachers ----------

create policy teachers_select_self on public.teachers
  for select to authenticated using (id = auth.uid());
create policy teachers_insert_self on public.teachers
  for insert to authenticated with check (id = auth.uid());
create policy teachers_update_self on public.teachers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- 정책: classes ----------

create policy classes_teacher_all on public.classes
  for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_student_select on public.classes
  for select to authenticated using (id = public.my_student_class());

-- ---------- 정책: students ----------
-- 생성은 서버(입장 API)가 service role 로 처리. 클라이언트 insert 정책 없음.

create policy students_teacher_select on public.students
  for select to authenticated using (public.is_class_teacher(class_id));
create policy students_teacher_delete on public.students
  for delete to authenticated using (public.is_class_teacher(class_id));
create policy students_self_select on public.students
  for select to authenticated using (auth_user_id = auth.uid());

-- ---------- 정책: challenges (공개 문제 그림만, 정답 제외) ----------

create policy challenges_read_active on public.challenges
  for select to authenticated using (is_active);

-- ---------- 정책: attempts ----------
-- insert/update 는 서버만 (AI 채점 결과를 학생이 위조하지 못하도록)

create policy attempts_teacher_select on public.attempts
  for select to authenticated using (public.is_class_teacher(class_id));
create policy attempts_student_select on public.attempts
  for select to authenticated using (
    student_id in (select s.id from public.students s where s.auth_user_id = auth.uid())
  );

-- ---------- 실시간(Realtime) ----------
-- Realtime 도 RLS 를 따르므로 교사는 자기 반 이벤트만 받음.

alter publication supabase_realtime add table public.attempts, public.students;

-- ---------- 기간 만료 데이터 정리 함수 (스케줄러로 매일 실행 예정) ----------

create or replace function public.purge_expired_classes()
returns int language plpgsql security definer set search_path = '' as $$
declare removed int;
begin
  -- 학생 익명 계정도 함께 삭제 (students 는 cascade 로 삭제됨)
  delete from auth.users u
  using public.students s, public.classes c
  where s.auth_user_id = u.id and s.class_id = c.id and c.expires_at < now();

  delete from public.classes where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_classes() from public, anon, authenticated;
