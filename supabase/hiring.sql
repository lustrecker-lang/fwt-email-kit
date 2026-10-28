-- FWT Hiring Kit — backend schema.
-- Paste this whole file into the Supabase SQL Editor and run it once, in the
-- same project as the email tool. Safe to re-run: every statement is guarded.
--
-- THE SHAPE OF IT
--
--   A job has an ordered list of steps. A step is some content (words and an
--   optional video the staff uploaded) plus zero or more fields the applicant
--   fills in. That one shape covers everything the funnel needs:
--
--       welcome note       body only
--       questionnaire      fields only
--       case study         body + video_url + fields
--
--   An applicant works through the steps in order. When the last one is saved
--   they are marked 'submitted', and from there the interview is arranged by hand
--   from the staff side.
--
-- WHO CAN DO WHAT
--
--   Signed-in staff    everything, on every table.
--   The public         read an OPEN job, and an outline of its steps through
--                      hiring_outline(). Steps are NOT readable as a table: a
--                      timed step's brief must not be available before the
--                      applicant starts the clock.
--   Applicants         no table access at all. They hold an unguessable token
--                      (applicants.token) and act only through the functions
--                      below, each of which checks it. That is what lets an
--                      anonymous person write their own answers without ever
--                      being able to read anybody else's.
--
-- TIMED STEPS
--
--   A step can carry time_limit_hours (a case study that must come back within
--   48 hours). The clock starts when the applicant presses Start, which records a
--   deadline in hiring_step_starts. The deadline is stored, not recomputed, so
--   changing a step's limit later never moves a clock that is already running.
--   hiring_save_step refuses a timed step that was never started or that is past
--   its deadline, so the countdown on the page is a courtesy and this is the rule.
--
-- SOURCING
--
--   A role can also go looking for people instead of waiting for them. The
--   tables at the end of this file hold that side: who was found (prospects),
--   where, how well they match the role's criteria, what staff decided on the
--   swipe screen, and the outreach that followed. A prospect becomes an applicant
--   when they open their personal link (apply.html?job=<slug>&ref=<token>) and
--   start, and hiring_apply joins the two. None of it is public.
--
-- RE-RUNNING THIS FILE on a database that already has an earlier version is
-- safe and brings it up to date: it adds the time limit column and table, closes
-- the public read on steps, and replaces the functions.
--
-- This is the opposite of the email tool, whose tables are readable by anyone.
-- Nothing in the applicant tables may ever get a public select policy.

-- Same definition as supabase/schema.sql, so either file can be run first.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

-- ===================================================================== jobs

create table if not exists hiring_jobs (
    id          uuid primary key default gen_random_uuid(),
    -- The public address: apply.html?job=<slug>. Lower-case words and hyphens, so
    -- it survives being put in a URL without escaping.
    slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
    title       text not null,
    team        text,                          -- 'Design', 'Engineering'
    summary     text,                          -- one line for the top of the page
    description text not null default '',      -- the job description itself
    -- draft: staff only. open: public link works. closed: link stops accepting.
    status      text not null default 'draft'
                check (status in ('draft', 'open', 'closed')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists hiring_jobs_status_idx on hiring_jobs (status);

-- ==================================================================== steps

create table if not exists hiring_steps (
    id          uuid primary key default gen_random_uuid(),
    job_id      uuid not null references hiring_jobs (id) on delete cascade,
    -- Order in the funnel. Keep these distinct within a job: the server refuses a
    -- step until every step with a lower position has an answer.
    position    integer not null default 0,
    title       text not null,
    body        text not null default '',
    -- A video the staff uploaded to the hiring-media bucket, played above the
    -- fields. Holds that file's public address, so https only.
    video_url   text check (video_url is null or video_url ~* '^https://'),
    -- What the applicant fills in, as a JSON array of
    --   { "id": "q1", "label": "...", "hint": "...",
    --     "type": "text|longtext|choice|url|github|video|file",
    --     "required": true, "options": ["..."] }
    -- url and github answers are text. file and video answers are an object,
    -- { "path": "<token>/<file>", "name": "...", "size": 123 }, pointing at what
    -- the applicant uploaded (hiring-uploads for file, hiring-videos for video).
    -- `id` is the key the answer is stored under, so it must stay stable once an
    -- applicant has answered it. `options` is only read for type "choice".
    fields      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(fields) = 'array'),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- How long an applicant has once they press Start. Null means no limit. Added
-- separately because `create table if not exists` skips an existing table.
alter table hiring_steps add column if not exists time_limit_hours integer;

-- What a timed step says on its start screen, before the clock runs: what is
-- coming, what to have ready. Public as soon as the role is open (see
-- hiring_outline), unlike `body`, which is only released once the clock starts.
-- Null means the start screen shows only the time allowed.
alter table hiring_steps add column if not exists intro text;
alter table hiring_steps drop constraint if exists hiring_steps_intro_check;
alter table hiring_steps add constraint hiring_steps_intro_check
    check (intro is null or length(intro) <= 5000);
alter table hiring_steps drop constraint if exists hiring_steps_time_limit_check;
alter table hiring_steps add constraint hiring_steps_time_limit_check
    check (time_limit_hours is null or time_limit_hours between 1 and 720);

create index if not exists hiring_steps_job_idx on hiring_steps (job_id, position);

-- ================================================================ applicants

create table if not exists hiring_applicants (
    id           uuid primary key default gen_random_uuid(),
    -- Restrict, not cascade: deleting a role never takes its applicants by
    -- accident. The app does delete a role with applicants, after asking, by
    -- removing the applicants (and their files) first and then the role.
    job_id       uuid not null references hiring_jobs (id) on delete restrict,
    -- The applicant's only credential. It lives in their link, never in a list.
    token        uuid not null unique default gen_random_uuid(),
    name         text not null,
    email        text not null,
    -- in_progress -> submitted happens by itself when the last step is saved.
    -- Everything after that is moved by hand.
    status       text not null default 'in_progress'
                 check (status in ('in_progress', 'submitted', 'shortlisted',
                                   'interview', 'hired', 'rejected')),
    notes        text not null default '',
    interview_at timestamptz,
    submitted_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- One application per person per job, whatever case they typed their email in.
create unique index if not exists hiring_applicants_job_email_idx
    on hiring_applicants (job_id, lower(email));

create index if not exists hiring_applicants_job_status_idx
    on hiring_applicants (job_id, status);

-- ================================================================== emails
-- Emails to applicants are sent by the hiring-email Edge Function
-- (supabase/functions/hiring-email), which holds the Resend key. Nothing here
-- sends anything; these tables are what the app edits and what it remembers.

-- The wording, one per kind of email, shared by every role rather than saved
-- again for each one — a rejection reads the same whichever role it is for.
-- `kind` names which email: only 'rejected' for now, so a later "invite to
-- interview" is a new row, not a new table. The app fills {{first_name}},
-- {{name}} and {{role}} in before showing it for sending.
create table if not exists hiring_templates (
    kind       text not null check (kind in ('rejected')),
    subject    text not null check (length(subject) between 1 and 200),
    body       text not null check (length(body) between 1 and 10000),
    updated_at timestamptz not null default now(),
    primary key (kind)
);

-- Earlier versions keyed this per role (job_id, kind). Collapsing to one row
-- per kind: keep the most recently edited copy of each kind and drop the
-- column. A fresh database has no job_id column, so this is a no-op for it.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'hiring_templates' and column_name = 'job_id'
    ) then
        create temporary table hiring_templates_migrate on commit drop as
        select distinct on (kind) kind, subject, body, updated_at
        from hiring_templates
        order by kind, updated_at desc;

        delete from hiring_templates;
        alter table hiring_templates drop constraint if exists hiring_templates_pkey;
        alter table hiring_templates drop column job_id;
        alter table hiring_templates add primary key (kind);

        insert into hiring_templates (kind, subject, body, updated_at)
        select kind, subject, body, updated_at from hiring_templates_migrate;
    end if;
end $$;

-- What was actually sent, to whom and by whom. Kept so nobody is emailed twice
-- by accident, and so the applicant's record says it happened. Goes with the
-- applicant when they are deleted.
create table if not exists hiring_email_log (
    id           uuid primary key default gen_random_uuid(),
    applicant_id uuid not null references hiring_applicants (id) on delete cascade,
    kind         text not null check (kind in ('rejected')),
    recipient    text not null,
    subject      text not null,
    provider_id  text,                 -- Resend's id for the message
    sent_by      text,                 -- email of the signed-in member of staff
    sent_at      timestamptz not null default now()
);

create index if not exists hiring_email_log_applicant_idx on hiring_email_log (applicant_id);

-- The applicant's own two emails, sent by the hiring-notify Edge Function:
-- 'started' when they begin an application, 'submitted' when they finish it.
-- Staff never send these. The apply page asks for them, so each is allowed once
-- per applicant and no more; the unique index is what makes that hold even when
-- two requests arrive together. 'rejected' is left out of it on purpose, since
-- staff can choose to send that one again.
alter table hiring_email_log drop constraint if exists hiring_email_log_kind_check;
alter table hiring_email_log add constraint hiring_email_log_kind_check
    check (kind in ('rejected', 'started', 'submitted'));

create unique index if not exists hiring_email_log_once_idx
    on hiring_email_log (applicant_id, kind)
    where kind in ('started', 'submitted');

-- =============================================================== responses

create table if not exists hiring_responses (
    id           uuid primary key default gen_random_uuid(),
    applicant_id uuid not null references hiring_applicants (id) on delete cascade,
    -- Restrict: removing a step that people have already answered would delete
    -- their answers. Close the job, or leave the step, instead.
    step_id      uuid not null references hiring_steps (id) on delete restrict,
    -- { "<field id>": value } — only keys that exist on the step are kept.
    -- A file or video field holds an object with the storage path.
    answers      jsonb not null check (jsonb_typeof(answers) = 'object'),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (applicant_id, step_id)
);

create index if not exists hiring_responses_step_idx on hiring_responses (step_id);

-- ================================================================ step clocks

-- One row per applicant per timed step, created when they press Start.
create table if not exists hiring_step_starts (
    id           uuid primary key default gen_random_uuid(),
    applicant_id uuid not null references hiring_applicants (id) on delete cascade,
    -- Cascade, unlike responses: a start holds no answer, so a step that was
    -- started and never answered can still be removed.
    step_id      uuid not null references hiring_steps (id) on delete cascade,
    started_at   timestamptz not null default now(),
    -- Fixed when the clock starts. Staff can move it (to grant more time).
    deadline_at  timestamptz not null,
    unique (applicant_id, step_id)
);

create index if not exists hiring_step_starts_step_idx on hiring_step_starts (step_id);

-- ================================================================= triggers

drop trigger if exists hiring_jobs_set_updated_at on hiring_jobs;
create trigger hiring_jobs_set_updated_at
    before update on hiring_jobs
    for each row execute function set_updated_at();

drop trigger if exists hiring_steps_set_updated_at on hiring_steps;
create trigger hiring_steps_set_updated_at
    before update on hiring_steps
    for each row execute function set_updated_at();

drop trigger if exists hiring_applicants_set_updated_at on hiring_applicants;
create trigger hiring_applicants_set_updated_at
    before update on hiring_applicants
    for each row execute function set_updated_at();

drop trigger if exists hiring_responses_set_updated_at on hiring_responses;
create trigger hiring_responses_set_updated_at
    before update on hiring_responses
    for each row execute function set_updated_at();

-- ===================================================================== RLS

alter table hiring_jobs       enable row level security;
alter table hiring_steps      enable row level security;
alter table hiring_applicants enable row level security;
alter table hiring_responses  enable row level security;
alter table hiring_step_starts enable row level security;

-- Belt and braces: even if a policy were added by mistake, the anonymous role
-- has no privilege on applicant data to begin with. Steps are on the list too:
-- their content reaches the public only through hiring_outline() and
-- hiring_open_step().
revoke all on hiring_applicants  from anon;
revoke all on hiring_responses   from anon;
revoke all on hiring_step_starts from anon;
revoke all on hiring_steps       from anon;
revoke all on hiring_templates   from anon;
revoke all on hiring_email_log   from anon;

alter table hiring_templates enable row level security;
alter table hiring_email_log enable row level security;

drop trigger if exists hiring_templates_set_updated_at on hiring_templates;
create trigger hiring_templates_set_updated_at
    before update on hiring_templates
    for each row execute function set_updated_at();

-- ---- emails: staff only. The log has no update or delete policy: what was
-- sent stays as it was sent, and it is removed only with the applicant.

drop policy if exists "Signed-in users can read templates" on hiring_templates;
create policy "Signed-in users can read templates"
    on hiring_templates for select to authenticated using (true);

drop policy if exists "Signed-in users can write templates" on hiring_templates;
create policy "Signed-in users can write templates"
    on hiring_templates for insert to authenticated with check (true);

drop policy if exists "Signed-in users can update templates" on hiring_templates;
create policy "Signed-in users can update templates"
    on hiring_templates for update to authenticated using (true) with check (true);

drop policy if exists "Signed-in users can read the email log" on hiring_email_log;
create policy "Signed-in users can read the email log"
    on hiring_email_log for select to authenticated using (true);

drop policy if exists "Signed-in users can add to the email log" on hiring_email_log;
create policy "Signed-in users can add to the email log"
    on hiring_email_log for insert to authenticated with check (true);

-- ---- jobs: the public sees open ones, staff see all

drop policy if exists "Anyone can read open jobs" on hiring_jobs;
create policy "Anyone can read open jobs"
    on hiring_jobs for select to anon, authenticated
    using (status = 'open');

drop policy if exists "Signed-in users can read all jobs" on hiring_jobs;
create policy "Signed-in users can read all jobs"
    on hiring_jobs for select to authenticated
    using (true);

drop policy if exists "Signed-in users can insert jobs" on hiring_jobs;
create policy "Signed-in users can insert jobs"
    on hiring_jobs for insert to authenticated
    with check (true);

drop policy if exists "Signed-in users can update jobs" on hiring_jobs;
create policy "Signed-in users can update jobs"
    on hiring_jobs for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete jobs" on hiring_jobs;
create policy "Signed-in users can delete jobs"
    on hiring_jobs for delete to authenticated
    using (true);

-- ---- steps: staff only. An earlier version let the public read the steps of an
-- open job directly; that would expose a timed case study's brief before the
-- clock starts, so it is removed here (and the revoke above makes it final).

drop policy if exists "Anyone can read steps of open jobs" on hiring_steps;

drop policy if exists "Signed-in users can read all steps" on hiring_steps;
create policy "Signed-in users can read all steps"
    on hiring_steps for select to authenticated
    using (true);

drop policy if exists "Signed-in users can insert steps" on hiring_steps;
create policy "Signed-in users can insert steps"
    on hiring_steps for insert to authenticated
    with check (true);

drop policy if exists "Signed-in users can update steps" on hiring_steps;
create policy "Signed-in users can update steps"
    on hiring_steps for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete steps" on hiring_steps;
create policy "Signed-in users can delete steps"
    on hiring_steps for delete to authenticated
    using (true);

-- ---- applicants and responses: staff only
-- There is no insert policy on purpose. Rows are created by hiring_apply() and
-- hiring_save_step(), which run with their own rights and check the token.

drop policy if exists "Signed-in users can read applicants" on hiring_applicants;
create policy "Signed-in users can read applicants"
    on hiring_applicants for select to authenticated
    using (true);

drop policy if exists "Signed-in users can update applicants" on hiring_applicants;
create policy "Signed-in users can update applicants"
    on hiring_applicants for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete applicants" on hiring_applicants;
create policy "Signed-in users can delete applicants"
    on hiring_applicants for delete to authenticated
    using (true);

drop policy if exists "Signed-in users can read responses" on hiring_responses;
create policy "Signed-in users can read responses"
    on hiring_responses for select to authenticated
    using (true);

-- Delete exists so a person's data can be removed on request. Staff do not
-- edit an applicant's answers, so there is no update policy.
drop policy if exists "Signed-in users can delete responses" on hiring_responses;
create policy "Signed-in users can delete responses"
    on hiring_responses for delete to authenticated
    using (true);

-- ---- step clocks: staff can read them and move a deadline; only the functions
-- below ever create one.

drop policy if exists "Signed-in users can read step starts" on hiring_step_starts;
create policy "Signed-in users can read step starts"
    on hiring_step_starts for select to authenticated
    using (true);

drop policy if exists "Signed-in users can update step starts" on hiring_step_starts;
create policy "Signed-in users can update step starts"
    on hiring_step_starts for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete step starts" on hiring_step_starts;
create policy "Signed-in users can delete step starts"
    on hiring_step_starts for delete to authenticated
    using (true);

-- ============================================================== applicant API
-- security definer: these run with the owner's rights, which is how an anonymous
-- caller can write rows they are not allowed to touch directly. In exchange each
-- one must check everything itself, and pin search_path so nothing can be
-- shadowed. Errors are plain sentences because the apply page shows them as is.

-- Start an application. Returns the token the applicant keeps for the rest of
-- the process; put it in their link.
--
-- A second application from the same email is refused rather than resumed.
-- Resuming would hand someone else's progress to anybody who typed their address,
-- so continuing is only possible with the token. The cost is that this message
-- confirms an address has applied to this job.
--
-- p_ref is the token from a sourced person's personal link. When it matches a
-- prospect on this role who has not applied yet, the two are joined and the
-- prospect is marked applied. A ref that matches nothing is ignored without a
-- word, so the link cannot be used to test whether a token exists.
--
-- The three-argument version is dropped first: left in place beside this one,
-- a call naming only the first three arguments would match both.
drop function if exists hiring_apply(text, text, text);

create or replace function hiring_apply(p_slug text, p_name text, p_email text, p_ref uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job   hiring_jobs%rowtype;
    v_name  text := btrim(coalesce(p_name, ''));
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_id    uuid;
    v_token uuid;
begin
    select * into v_job from hiring_jobs where slug = p_slug and status = 'open';
    if not found then
        raise exception 'This position is not open.';
    end if;

    if length(v_name) < 1 or length(v_name) > 200 then
        raise exception 'Please enter your name.';
    end if;
    if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Please enter a valid email address.';
    end if;

    -- A ceiling, so a script cannot fill the table. Raise it if a role is ever
    -- genuinely this popular.
    if (select count(*) from hiring_applicants where job_id = v_job.id) >= 1000 then
        raise exception 'This position is no longer accepting applications.';
    end if;

    begin
        insert into hiring_applicants (job_id, name, email)
        values (v_job.id, v_name, v_email)
        returning id, token into v_id, v_token;
    exception when unique_violation then
        raise exception 'This email has already applied. Use the link you were given to continue.';
    end;

    if p_ref is not null then
        update hiring_prospects
        set applicant_id = v_id, stage = 'applied'
        where token = p_ref and job_id = v_job.id and applicant_id is null;
    end if;

    return v_token;
end $$;

-- The steps of an open role as the public may see them: order, titles, and which
-- are timed. The content of a TIMED step (text, video, questions) is left out;
-- it comes from hiring_open_step() once the applicant starts the clock. Untimed
-- steps are included in full, since there is nothing to protect.
--
-- `intro` is the exception, and the reason it is a separate column from `body`:
-- it is written to be read BEFORE the clock starts, on the start screen, so it is
-- always included.
create or replace function hiring_outline(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',               s.id,
        'position',         s.position,
        'title',            s.title,
        'time_limit_hours', s.time_limit_hours,
        'intro',            s.intro,
        'body',             case when s.time_limit_hours is null then s.body end,
        'video_url',        case when s.time_limit_hours is null then s.video_url end,
        'fields',           case when s.time_limit_hours is null then s.fields else '[]'::jsonb end
    ) order by s.position), '[]'::jsonb)
    from hiring_steps s
    join hiring_jobs j on j.id = s.job_id
    where j.slug = p_slug and j.status = 'open';
$$;

-- Where an applicant is: their status, every answer they have saved keyed by step
-- id, and the clock on every timed step they have started. `now` is the server's
-- time, so the page counts down against the same clock the deadline is judged by.
create or replace function hiring_progress(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_app hiring_applicants%rowtype;
    v_slug text;
begin
    select * into v_app from hiring_applicants where token = p_token;
    if not found then
        raise exception 'We could not find that application.';
    end if;

    select slug into v_slug from hiring_jobs where id = v_app.job_id;

    return jsonb_build_object(
        'name',   v_app.name,
        'status', v_app.status,
        'job',    v_slug,
        'now',    now(),
        'answers', coalesce((
            select jsonb_object_agg(r.step_id::text, r.answers)
            from hiring_responses r
            where r.applicant_id = v_app.id
        ), '{}'::jsonb),
        'starts', coalesce((
            select jsonb_object_agg(st.step_id::text, jsonb_build_object(
                'started_at', st.started_at, 'deadline_at', st.deadline_at))
            from hiring_step_starts st
            where st.applicant_id = v_app.id
        ), '{}'::jsonb)
    );
end $$;

-- Open one step: returns its full content, and for a timed step the clock.
--
-- With p_start = true a timed step that has not been started is started now, and
-- its deadline is fixed from this moment. Without it, asking for a timed step
-- that has not been started is an error, so the brief cannot be read early. Asking
-- again later returns the same deadline, whatever the step's limit has since
-- become.
create or replace function hiring_open_step(p_token uuid, p_step uuid, p_start boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_app   hiring_applicants%rowtype;
    v_step  hiring_steps%rowtype;
    v_start hiring_step_starts%rowtype;
begin
    select * into v_app from hiring_applicants where token = p_token;
    if not found then
        raise exception 'We could not find that application.';
    end if;
    if v_app.status <> 'in_progress' then
        raise exception 'This application has already been submitted.';
    end if;
    if not exists (select 1 from hiring_jobs where id = v_app.job_id and status = 'open') then
        raise exception 'This position is no longer open.';
    end if;

    select * into v_step from hiring_steps where id = p_step and job_id = v_app.job_id;
    if not found then
        raise exception 'That step is not part of this application.';
    end if;

    if exists (
        select 1 from hiring_steps s
        where s.job_id = v_app.job_id
          and s.position < v_step.position
          and not exists (
              select 1 from hiring_responses r
              where r.applicant_id = v_app.id and r.step_id = s.id
          )
    ) then
        raise exception 'Please finish the earlier steps first.';
    end if;

    if v_step.time_limit_hours is not null then
        select * into v_start from hiring_step_starts
        where applicant_id = v_app.id and step_id = v_step.id;

        if not found then
            if not coalesce(p_start, false) then
                raise exception 'This step has not been started.';
            end if;
            insert into hiring_step_starts (applicant_id, step_id, deadline_at)
            values (v_app.id, v_step.id, now() + make_interval(hours => v_step.time_limit_hours))
            on conflict (applicant_id, step_id) do nothing;
            select * into v_start from hiring_step_starts
            where applicant_id = v_app.id and step_id = v_step.id;
        end if;
    end if;

    return jsonb_build_object(
        'body',             v_step.body,
        'video_url',        v_step.video_url,
        'fields',           v_step.fields,
        'time_limit_hours', v_step.time_limit_hours,
        'started_at',       v_start.started_at,
        'deadline_at',      v_start.deadline_at,
        'now',              now()
    );
end $$;

-- Save one step's answers (again, if they are going back to change them).
-- Returns the applicant's status afterwards, which becomes 'submitted' when this
-- was the last step.
--
-- A timed step must have been started, and is refused once its deadline has
-- passed. Two minutes of grace are allowed so that a file which was uploading as
-- the clock ran out is not thrown away over the network.
create or replace function hiring_save_step(p_token uuid, p_step uuid, p_answers jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_app   hiring_applicants%rowtype;
    v_step  hiring_steps%rowtype;
    v_start hiring_step_starts%rowtype;
    v_field jsonb;
    v_type  text;
    v_label text;
    v_val   jsonb;
    v_text  text;
    v_clean jsonb;
    v_total integer;
    v_done  integer;
begin
    select * into v_app from hiring_applicants where token = p_token;
    if not found then
        raise exception 'We could not find that application.';
    end if;
    if v_app.status <> 'in_progress' then
        raise exception 'This application has already been submitted.';
    end if;
    if not exists (select 1 from hiring_jobs where id = v_app.job_id and status = 'open') then
        raise exception 'This position is no longer open.';
    end if;

    select * into v_step from hiring_steps where id = p_step and job_id = v_app.job_id;
    if not found then
        raise exception 'That step is not part of this application.';
    end if;

    if v_step.time_limit_hours is not null then
        select * into v_start from hiring_step_starts
        where applicant_id = v_app.id and step_id = v_step.id;
        if not found then
            raise exception 'Please start this step first.';
        end if;
        if now() > v_start.deadline_at + interval '2 minutes' then
            raise exception 'Time is up for this step.';
        end if;
    end if;

    if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
        raise exception 'Those answers could not be read.';
    end if;
    if octet_length(p_answers::text) > 50000 then
        raise exception 'That is too long. Please shorten your answers.';
    end if;

    -- The funnel is a sequence: nothing is accepted until everything before it
    -- has an answer, so the questionnaire cannot be skipped to reach the case study.
    if exists (
        select 1 from hiring_steps s
        where s.job_id = v_app.job_id
          and s.position < v_step.position
          and not exists (
              select 1 from hiring_responses r
              where r.applicant_id = v_app.id and r.step_id = s.id
          )
    ) then
        raise exception 'Please finish the earlier steps first.';
    end if;

    for v_field in select f from jsonb_array_elements(v_step.fields) f loop
        v_type  := v_field ->> 'type';
        v_label := coalesce(v_field ->> 'label', 'a question');
        v_val   := p_answers -> (v_field ->> 'id');
        v_text  := case when v_val is null or jsonb_typeof(v_val) <> 'string' then null else btrim(v_val #>> '{}') end;

        if v_field -> 'required' = 'true'::jsonb then
            if v_val is null or v_val = 'null'::jsonb or btrim(v_val #>> '{}') = '' then
                raise exception 'Please answer: %', v_label;
            end if;
        end if;

        -- Links. The applicant may type google.com, www.google.com/work or a full
        -- https:// address; what matters is that it is shaped like a web address.
        -- Anything with another scheme (javascript:, data:, ftp:) does not match,
        -- because the host part cannot contain a colon-then-text. The staff page
        -- adds https:// when opening one that has none.
        if v_type in ('url', 'github') and v_text is not null and v_text <> '' then
            if v_type = 'github' then
                if v_text !~* '^(https?://)?(www\.)?github\.com/[a-z0-9_.-]+/[a-z0-9_.-]+(/[^[:space:]]*)?$' then
                    raise exception '%: please link a GitHub repository, like github.com/name/project', v_label;
                end if;
            elsif v_text !~* '^(https?://)?([[:alnum:]]([[:alnum:]-]*[[:alnum:]])?\.)+[[:alpha:]]{2,}(:[0-9]{1,5})?([/?#][^[:space:]<>"]*)?$' then
                raise exception '%: that does not look like a web address, for example example.com', v_label;
            end if;
        end if;

        -- Uploads. An answer must point at a file inside the applicant's OWN
        -- folder, so nobody can name somebody else's upload as theirs.
        if v_type in ('file', 'video') and v_val is not null and v_val <> 'null'::jsonb
           and not (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '') then
            if jsonb_typeof(v_val) <> 'object'
               or coalesce(v_val ->> 'path', '') not like p_token::text || '/%'
               or position('..' in coalesce(v_val ->> 'path', '')) > 0 then
                raise exception '%: please upload a file', v_label;
            end if;
        end if;
    end loop;

    -- Keep only keys that are fields on this step, so nobody can park arbitrary
    -- data in the table.
    select coalesce(jsonb_object_agg(f ->> 'id', p_answers -> (f ->> 'id')), '{}'::jsonb)
    into v_clean
    from jsonb_array_elements(v_step.fields) f
    where f ? 'id' and p_answers ? (f ->> 'id');

    insert into hiring_responses (applicant_id, step_id, answers)
    values (v_app.id, v_step.id, v_clean)
    on conflict (applicant_id, step_id) do update set answers = excluded.answers;

    select count(*) into v_total from hiring_steps where job_id = v_app.job_id;
    select count(*) into v_done
    from hiring_responses r join hiring_steps s on s.id = r.step_id
    where r.applicant_id = v_app.id and s.job_id = v_app.job_id;

    if v_done >= v_total then
        update hiring_applicants
        set status = 'submitted', submitted_at = now()
        where id = v_app.id;
        return 'submitted';
    end if;
    return 'in_progress';
end $$;

-- Is this the folder name of an applicant who may still upload? Used by the
-- storage policy below, which cannot read hiring_applicants itself.
create or replace function hiring_valid_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from hiring_applicants
        where token::text = p_token and status = 'in_progress'
    );
$$;

-- Functions are executable by everyone unless told otherwise.
revoke execute on function hiring_apply(text, text, text, uuid)  from public;
revoke execute on function hiring_outline(text)                 from public;
revoke execute on function hiring_progress(uuid)                 from public;
revoke execute on function hiring_open_step(uuid, uuid, boolean) from public;
revoke execute on function hiring_save_step(uuid, uuid, jsonb)   from public;
revoke execute on function hiring_valid_token(text)              from public;

grant execute on function hiring_apply(text, text, text, uuid)   to anon, authenticated;
grant execute on function hiring_outline(text)                  to anon, authenticated;
grant execute on function hiring_progress(uuid)                  to anon, authenticated;
grant execute on function hiring_open_step(uuid, uuid, boolean)  to anon, authenticated;
grant execute on function hiring_save_step(uuid, uuid, jsonb)    to anon, authenticated;
grant execute on function hiring_valid_token(text)               to anon, authenticated;

-- ================================================================== storage
-- Three buckets.
--
--   hiring-uploads  PRIVATE. Applicants' documents: CVs, portfolios, files.
--   hiring-videos   PRIVATE. Applicants' video answers.
--   hiring-media    PUBLIC.  Videos staff upload as a step's brief.
--
-- An applicant uploads into a folder named after their token:
--     hiring-uploads/<token>/<file>
-- and the policy checks that folder against a live, unsubmitted application, so
-- an anonymous caller can only write inside their own. There is no anonymous
-- select, update or delete, so nothing can be listed, read back or overwritten.
-- Staff open private files through short-lived signed links.
--
-- hiring-media is public so the applicant's browser can play a brief, but a timed
-- step's brief is never mentioned until the clock starts, and the file names are
-- random, so the address cannot be guessed. Nothing lets the public list it.
--
-- FILE SIZE. Each bucket has its own limit, but Supabase also applies a project-
-- wide one (Dashboard > Storage > Settings), and the smaller of the two wins. Free
-- projects cannot go above 50 MB; paid plans can. The 50 MB below is the free-plan
-- ceiling. On a paid plan, raise the project limit first, then the numbers here
-- and VIDEO_MAX in shared/backend.js.
--
-- Unlike email-assets these buckets DO allow staff to delete. Nothing outside
-- points at these files, and a person's data has to be removable on request.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
(
    'hiring-uploads', 'hiring-uploads', false,
    10485760,                                    -- 10 MB
    array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/zip',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp'
    ]
),
(
    'hiring-videos', 'hiring-videos', false,
    52428800,                                    -- 50 MB
    array['video/mp4', 'video/quicktime', 'video/webm']
),
(
    'hiring-media', 'hiring-media', true,
    52428800,                                    -- 50 MB
    array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Applicants can upload into their own folder" on storage.objects;
create policy "Applicants can upload into their own folder"
    on storage.objects for insert to anon, authenticated
    with check (
        bucket_id in ('hiring-uploads', 'hiring-videos')
        and hiring_valid_token((storage.foldername(name))[1])
    );

drop policy if exists "Signed-in users can read hiring uploads" on storage.objects;
create policy "Signed-in users can read hiring uploads"
    on storage.objects for select to authenticated
    using (bucket_id in ('hiring-uploads', 'hiring-videos'));

drop policy if exists "Signed-in users can delete hiring uploads" on storage.objects;
create policy "Signed-in users can delete hiring uploads"
    on storage.objects for delete to authenticated
    using (bucket_id in ('hiring-uploads', 'hiring-videos'));

-- Staff put brief videos into hiring-media. No select policy on purpose: a public
-- bucket serves a file to anyone who has its address without one, and without one
-- the bucket cannot be listed.
drop policy if exists "Signed-in users can upload hiring media" on storage.objects;
create policy "Signed-in users can upload hiring media"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'hiring-media');

-- ================================================================= SOURCING
-- Finding people for a role, rather than waiting for them to apply.
--
--   hiring_settings          one row: what every role shares (about the company,
--                            pass reasons, who may switch sourcing on, limits)
--   hiring_sourcing          one row per role: where to look, what the card shows,
--                            who swipes, the outreach message, the weekly budget
--   hiring_criteria          what a good match is for a role, versioned: every
--                            edit is a new row, so old scores keep their meaning
--   hiring_agent_runs        one row per search run, so every prospect can say
--                            which run found it
--   hiring_prospects         a person found for a role, and where they stand
--   hiring_prospect_sources  how a prospect was found (a person can be found by
--                            more than one search)
--   hiring_prospect_scores   a prospect scored against one version of the criteria
--   hiring_decisions         what staff decided on the swipe screen, and why
--   hiring_outreach          the message to a prospect and whether it went
--
-- The settings live in their own tables and not as columns on hiring_jobs on
-- purpose: an open job is readable by the public, column for column.
--
-- A PROSPECT'S STAGE moves forward like this:
--
--     discovered -> enriched -> scored -> queued        (the search agent)
--     queued -> passed | maybe | reach_out              (the swipe screen)
--     reach_out -> contacted -> replied | declined      (outreach)
--     any of the above -> applied                       (hiring_apply, via the link)
--
-- Decisions and outreach move it through triggers below, so the stage cannot
-- drift from what was actually recorded. Once someone applies, the applicant row
-- takes over and the prospect's stage stays 'applied'.
--
-- WHO IS THE SAME PERSON. Every prospect has its own id. The LinkedIn handle, the
-- GitHub username and the portfolio address are cleaned into key columns that the
-- database derives itself, and each is unique within a role, so the same person
-- cannot be added to a role twice whichever of their links is found first.
--
-- Files (photos and screenshots of work) go in the private hiring-prospects
-- bucket under a folder named after the prospect's id, and staff open them
-- through signed links.

create table if not exists hiring_settings (
    -- Always true: there is exactly one row.
    id               boolean primary key default true check (id),
    company          text not null default '' check (length(company) <= 120),
    -- What the company does, in a few paragraphs. Every role's search and scoring
    -- reads it, so nobody has to write it into each job description.
    about            text not null default '' check (length(about) <= 5000),
    signature        text not null default '' check (length(signature) <= 1000),
    pass_reasons     text[] not null default array[
                         'Visual taste', 'Not a builder', 'Too junior', 'Too senior',
                         'Agency or brand only', 'Big-company only', 'Concept work, not shipped',
                         'Wrong region or timezone'
                     ],
    -- Emails of the people who may switch sourcing on for a role and change the
    -- limits below. Empty means any signed-in member of staff.
    sourcing_admins  text[] not null default '{}',
    -- The most people the search agent may check in a month, across every role.
    monthly_limit    integer not null default 400 check (monthly_limit between 0 and 10000),
    -- Passed and dropped prospects are cleared after this many days.
    keep_passed_days integer not null default 180 check (keep_passed_days between 30 and 730),
    updated_at       timestamptz not null default now()
);

insert into hiring_settings (id) values (true) on conflict (id) do nothing;

create table if not exists hiring_sourcing (
    job_id         uuid primary key references hiring_jobs (id) on delete cascade,
    enabled        boolean not null default false,
    cards_per_week integer not null default 12 check (cards_per_week between 1 and 50),
    -- How many people the agent may check for this role in a week. Most are
    -- dropped; the best cards_per_week reach the swipe screen.
    weekly_budget  integer not null default 60 check (weekly_budget between 5 and 500),
    -- The kinds of people to look for, in words: "design engineers at startups".
    -- Drafted from the description with the criteria, then edited by hand.
    archetypes     text[] not null default '{}',
    -- Real people or portfolios that show what good (or bad) looks like:
    -- [{ "url": "...", "kind": "ideal" | "avoid", "note": "..." }]
    examples       jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array'),
    regions        text[] not null default '{}',
    base_timezone  text not null default '' check (length(base_timezone) <= 40),
    overlap_hours  integer not null default 0 check (overlap_hours between 0 and 12),
    -- Where to search: linkedin (profiles through search results), github,
    -- portfolio (personal sites), similar (people like those swiped right).
    sources        text[] not null default array['linkedin', 'github', 'portfolio'],
    -- Companies or people never to bring back: clients, our own staff.
    skip           text[] not null default '{}',
    -- What the card leads with: screenshots, github, writing.
    card_shows     text[] not null default array['screenshots'],
    swipers        text[] not null default '{}',    -- emails
    outreach_by    text[] not null default '{}',    -- emails
    -- The first message, with {{first_name}}, {{personal_line}}, {{role}},
    -- {{company}}, {{apply_link}} and {{signature}} filled in per person.
    message        text not null default '' check (length(message) <= 5000),
    updated_by     text,
    updated_at     timestamptz not null default now()
);

create table if not exists hiring_criteria (
    id                   uuid primary key default gen_random_uuid(),
    job_id               uuid not null references hiring_jobs (id) on delete cascade,
    version              integer not null check (version >= 1),
    -- Fail one and the prospect never reaches the swipe screen:
    -- [{ "key": "years", "label": "8+ years of craft experience" }]
    must_haves           jsonb not null default '[]'::jsonb check (jsonb_typeof(must_haves) = 'array'),
    -- What the bars on the card show, weights adding up to 100:
    -- [{ "key": "prototypes", "label": "...", "weight": 25, "hint": "what counts as evidence" }]
    criteria             jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
    -- The description these were written against, so the app can say when the
    -- description has changed since.
    description_snapshot text not null default '',
    created_by           text,
    created_at           timestamptz not null default now(),
    unique (job_id, version)
);

create table if not exists hiring_agent_runs (
    id          uuid primary key default gen_random_uuid(),
    job_id      uuid not null references hiring_jobs (id) on delete cascade,
    kind        text not null default 'weekly' check (kind in ('weekly', 'manual')),
    status      text not null default 'running' check (status in ('running', 'done', 'failed')),
    criteria_id uuid references hiring_criteria (id) on delete set null,
    -- Counts the run keeps as it goes: { "searched": 40, "found": 31, "queued": 12 }
    stats       jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
    note        text,
    started_at  timestamptz not null default now(),
    finished_at timestamptz
);

create index if not exists hiring_agent_runs_job_idx on hiring_agent_runs (job_id, started_at desc);

-- The keys a person is matched on, cleaned out of their links. immutable so the
-- database can store them as generated columns and index them.
create or replace function hiring_linkedin_key(u text)
returns text language sql immutable as $$
    select nullif(lower((regexp_match(coalesce(u, ''), 'linkedin\.com/in/([^/?#[:space:]]+)', 'i'))[1]), '');
$$;

create or replace function hiring_github_key(u text)
returns text language sql immutable as $$
    select nullif(lower((regexp_match(coalesce(u, ''), 'github\.com/([a-z0-9][a-z0-9-]*)', 'i'))[1]), '');
$$;

-- A portfolio is its host without www: maria.design, maria.framer.website. On a
-- host many people share (behance.net/maria), the first part of the path is the
-- person, so it is kept.
create or replace function hiring_portfolio_key(u text)
returns text language sql immutable as $$
    select case
        when m is null then null
        when m[1] in ('behance.net', 'dribbble.com', 'read.cv', 'medium.com', 'notion.so', 'notion.site',
                      'linktr.ee', 'x.com', 'twitter.com', 'instagram.com', 'github.com', 'linkedin.com',
                      'cargo.site', 'contra.com', 'layers.to', 'substack.com')
             then case when m[2] is null then null else m[1] || '/' || m[2] end
        else m[1]
    end
    from (select regexp_match(lower(btrim(coalesce(u, ''))),
        '^(?:https?://)?(?:www\.)?([^/?#:[:space:]]+\.[^/?#:[:space:]]+)(?::[0-9]+)?(?:/([^/?#[:space:]]+))?') as m) x;
$$;

create table if not exists hiring_prospects (
    id               uuid primary key default gen_random_uuid(),
    job_id           uuid not null references hiring_jobs (id) on delete cascade,
    name             text not null check (length(name) between 1 and 200),
    headline         text check (length(headline) <= 200),     -- current title
    company          text check (length(company) <= 200),
    location         text check (length(location) <= 200),
    timezone         text check (length(timezone) <= 40),
    years_experience integer check (years_experience between 0 and 60),
    summary          text check (length(summary) <= 2000),
    -- [{ "title": "...", "company": "...", "start": "2018", "end": "now" }], newest first
    experience       jsonb not null default '[]'::jsonb check (jsonb_typeof(experience) = 'array'),
    tags             text[] not null default '{}',
    -- One sentence about their work, for the opening line of the outreach message.
    personal_line    text check (length(personal_line) <= 500),
    photo_path       text,
    -- [{ "path": "<prospect id>/<file>", "url": "page it shows", "caption": "..." }], up to three
    screenshots      jsonb not null default '[]'::jsonb check (jsonb_typeof(screenshots) = 'array'),
    linkedin_url     text check (linkedin_url is null or linkedin_url ~* '^https://'),
    portfolio_url    text check (portfolio_url is null or portfolio_url ~* '^https://'),
    github_url       text check (github_url is null or github_url ~* '^https://'),
    product_url      text check (product_url is null or product_url ~* '^https://'),
    stage            text not null default 'discovered'
                     check (stage in ('discovered', 'enriched', 'scored', 'queued', 'passed', 'maybe',
                                      'reach_out', 'contacted', 'replied', 'declined', 'applied', 'dropped')),
    -- What goes in their personal link. Like an applicant's token, it is never
    -- shown in a list.
    token            uuid not null unique default gen_random_uuid(),
    applicant_id     uuid references hiring_applicants (id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- Whether the portfolio lets itself be shown inside another page. The search
-- checks it; false sends the swipe screen's portfolio button straight to a new
-- tab, and null (not checked) tries the sheet first.
alter table hiring_prospects add column if not exists portfolio_embeds boolean;

alter table hiring_prospects add column if not exists linkedin_key text
    generated always as (hiring_linkedin_key(linkedin_url)) stored;
alter table hiring_prospects add column if not exists github_key text
    generated always as (hiring_github_key(github_url)) stored;
alter table hiring_prospects add column if not exists portfolio_key text
    generated always as (hiring_portfolio_key(portfolio_url)) stored;

create unique index if not exists hiring_prospects_linkedin_idx
    on hiring_prospects (job_id, linkedin_key) where linkedin_key is not null;
create unique index if not exists hiring_prospects_github_idx
    on hiring_prospects (job_id, github_key) where github_key is not null;
create unique index if not exists hiring_prospects_portfolio_idx
    on hiring_prospects (job_id, portfolio_key) where portfolio_key is not null;
create index if not exists hiring_prospects_job_stage_idx on hiring_prospects (job_id, stage);

create table if not exists hiring_prospect_sources (
    id          uuid primary key default gen_random_uuid(),
    prospect_id uuid not null references hiring_prospects (id) on delete cascade,
    run_id      uuid references hiring_agent_runs (id) on delete set null,
    source      text not null check (source in ('linkedin', 'github', 'portfolio', 'similar', 'web', 'manual', 'inbound')),
    query       text check (length(query) <= 1000),
    found_at    timestamptz not null default now()
);

create index if not exists hiring_prospect_sources_prospect_idx on hiring_prospect_sources (prospect_id);

create table if not exists hiring_prospect_scores (
    id          uuid primary key default gen_random_uuid(),
    prospect_id uuid not null references hiring_prospects (id) on delete cascade,
    criteria_id uuid not null references hiring_criteria (id) on delete cascade,
    match       integer not null check (match between 0 and 100),
    -- [{ "key": "years", "pass": true, "evidence": "11 years, 2014 to now" }]
    must_haves  jsonb not null default '[]'::jsonb check (jsonb_typeof(must_haves) = 'array'),
    -- [{ "key": "prototypes", "score": 9, "evidence": "...", "source_url": "https://..." }]
    scores      jsonb not null default '[]'::jsonb check (jsonb_typeof(scores) = 'array'),
    weakest     text check (length(weakest) <= 500),
    model       text,
    created_at  timestamptz not null default now(),
    unique (prospect_id, criteria_id)
);

create table if not exists hiring_decisions (
    id          uuid primary key default gen_random_uuid(),
    prospect_id uuid not null references hiring_prospects (id) on delete cascade,
    decision    text not null check (decision in ('pass', 'maybe', 'reach_out')),
    reasons     text[] not null default '{}',
    note        text check (length(note) <= 1000),
    decided_by  text,
    decided_at  timestamptz not null default now()
);

create index if not exists hiring_decisions_prospect_idx on hiring_decisions (prospect_id, decided_at desc);

create table if not exists hiring_outreach (
    prospect_id uuid primary key references hiring_prospects (id) on delete cascade,
    message     text not null default '' check (length(message) <= 5000),
    channel     text check (channel in ('linkedin', 'email', 'other')),
    status      text not null default 'ready' check (status in ('ready', 'sent', 'replied', 'declined')),
    sent_by     text,
    sent_at     timestamptz,
    replied_at  timestamptz,
    updated_at  timestamptz not null default now()
);

-- ---- keeping the stage honest

-- A decision moves the prospect, but only while they are still on the swipe
-- side. Someone already contacted or applied stays where they are.
create or replace function hiring_stage_from_decisions()
returns trigger language plpgsql as $$
declare
    v_pid  uuid := coalesce(new.prospect_id, old.prospect_id);
    v_last text;
begin
    select decision into v_last from hiring_decisions
    where prospect_id = v_pid order by decided_at desc limit 1;

    update hiring_prospects
    set stage = case v_last when 'pass' then 'passed' when 'maybe' then 'maybe'
                            when 'reach_out' then 'reach_out' else 'queued' end
    where id = v_pid and stage in ('scored', 'queued', 'passed', 'maybe', 'reach_out');
    return null;
end $$;

drop trigger if exists hiring_decisions_stage on hiring_decisions;
create trigger hiring_decisions_stage
    after insert or delete on hiring_decisions
    for each row execute function hiring_stage_from_decisions();

create or replace function hiring_stage_from_outreach()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return new;
    end if;
    update hiring_prospects
    set stage = case new.status when 'sent' then 'contacted' when 'replied' then 'replied'
                                when 'declined' then 'declined' else 'reach_out' end
    where id = new.prospect_id and stage not in ('applied', 'dropped');
    return new;
end $$;

drop trigger if exists hiring_outreach_stage on hiring_outreach;
create trigger hiring_outreach_stage
    before insert or update on hiring_outreach
    for each row execute function hiring_stage_from_outreach();

-- ---- who may switch sourcing on, and change the limits

create or replace function hiring_is_sourcing_admin()
returns boolean language sql stable as $$
    select coalesce(array_length(s.sourcing_admins, 1), 0) = 0
        or lower(coalesce(auth.jwt() ->> 'email', '')) = any (select lower(a) from unnest(s.sourcing_admins) a)
    from hiring_settings s where s.id;
$$;

-- Only switching it ON is guarded. The app saves with an upsert, which arrives as
-- an INSERT even for a row that exists, so "was it on already" is read from the
-- table rather than taken from tg_op; otherwise nobody but an admin could save
-- anything else on a role whose search is running.
create or replace function hiring_sourcing_guard()
returns trigger language plpgsql as $$
declare
    v_was boolean;
begin
    if tg_op = 'UPDATE' then
        v_was := old.enabled;
    else
        select enabled into v_was from hiring_sourcing where job_id = new.job_id;
    end if;
    if new.enabled and not coalesce(v_was, false) and not coalesce(hiring_is_sourcing_admin(), true) then
        raise exception 'Only the people named in Settings can switch sourcing on.';
    end if;
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists hiring_sourcing_guard on hiring_sourcing;
create trigger hiring_sourcing_guard
    before insert or update on hiring_sourcing
    for each row execute function hiring_sourcing_guard();

-- Anyone may edit the wording in Settings; only the admins may change who the
-- admins are, or the monthly limit.
create or replace function hiring_settings_guard()
returns trigger language plpgsql as $$
begin
    if (new.sourcing_admins is distinct from old.sourcing_admins or new.monthly_limit is distinct from old.monthly_limit)
       and not coalesce(hiring_is_sourcing_admin(), true) then
        raise exception 'Only the people named in Settings can change who may switch sourcing on, or the monthly limit.';
    end if;
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists hiring_settings_guard on hiring_settings;
create trigger hiring_settings_guard
    before update on hiring_settings
    for each row execute function hiring_settings_guard();

drop trigger if exists hiring_prospects_set_updated_at on hiring_prospects;
create trigger hiring_prospects_set_updated_at
    before update on hiring_prospects
    for each row execute function set_updated_at();

-- ---- access: staff only, all of it

alter table hiring_settings         enable row level security;
alter table hiring_sourcing         enable row level security;
alter table hiring_criteria         enable row level security;
alter table hiring_agent_runs       enable row level security;
alter table hiring_prospects        enable row level security;
alter table hiring_prospect_sources enable row level security;
alter table hiring_prospect_scores  enable row level security;
alter table hiring_decisions        enable row level security;
alter table hiring_outreach         enable row level security;

revoke all on hiring_settings         from anon;
revoke all on hiring_sourcing         from anon;
revoke all on hiring_criteria         from anon;
revoke all on hiring_agent_runs       from anon;
revoke all on hiring_prospects        from anon;
revoke all on hiring_prospect_sources from anon;
revoke all on hiring_prospect_scores  from anon;
revoke all on hiring_decisions        from anon;
revoke all on hiring_outreach         from anon;

do $$
declare t text;
begin
    foreach t in array array['hiring_settings', 'hiring_sourcing', 'hiring_criteria', 'hiring_agent_runs',
                             'hiring_prospects', 'hiring_prospect_sources', 'hiring_prospect_scores',
                             'hiring_decisions', 'hiring_outreach'] loop
        execute format('drop policy if exists "Signed-in users can read %1$s" on %1$I', t);
        execute format('create policy "Signed-in users can read %1$s" on %1$I for select to authenticated using (true)', t);
        execute format('drop policy if exists "Signed-in users can add %1$s" on %1$I', t);
        execute format('create policy "Signed-in users can add %1$s" on %1$I for insert to authenticated with check (true)', t);
        execute format('drop policy if exists "Signed-in users can update %1$s" on %1$I', t);
        execute format('create policy "Signed-in users can update %1$s" on %1$I for update to authenticated using (true) with check (true)', t);
        -- Settings is one row that must always be there, so it has no delete.
        execute format('drop policy if exists "Signed-in users can delete %1$s" on %1$I', t);
        if t <> 'hiring_settings' then
            execute format('create policy "Signed-in users can delete %1$s" on %1$I for delete to authenticated using (true)', t);
        end if;
    end loop;
end $$;

-- ---- files: photos and screenshots of work

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-prospects', 'hiring-prospects', false, 5242880,       -- 5 MB
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in users can read prospect files" on storage.objects;
create policy "Signed-in users can read prospect files"
    on storage.objects for select to authenticated
    using (bucket_id = 'hiring-prospects');

drop policy if exists "Signed-in users can add prospect files" on storage.objects;
create policy "Signed-in users can add prospect files"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'hiring-prospects');

drop policy if exists "Signed-in users can delete prospect files" on storage.objects;
create policy "Signed-in users can delete prospect files"
    on storage.objects for delete to authenticated
    using (bucket_id = 'hiring-prospects');
