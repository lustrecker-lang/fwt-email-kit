-- eGovern Email Kit — full backend schema.
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every statement is guarded.

-- =========================================================== templates table

create table if not exists email_templates (
    id                  uuid primary key default gen_random_uuid(),
    project             text not null,          -- 'nursing' | 'onegov' | 'smartfinance' | 'egovern'
    name                text not null,          -- 'Application approved'
    description         text,
    composition         jsonb not null,         -- block list + theme overrides, so it reopens in the composer
    html                text not null,          -- rendered output, ready to paste into SendGrid
    variables           text[] not null default '{}',
    sendgrid_template_id text,                  -- filled in later by the sync script
    is_live             boolean not null default false,  -- in production, vs. still a draft
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- `create table if not exists` skips an existing table entirely, so a database
-- created before the live flag needs the column adding on its own. New drafts
-- default to false: nothing goes live until someone says so.
alter table email_templates add column if not exists is_live boolean not null default false;

-- One name per project, so saving the same template twice updates rather than duplicates.
create unique index if not exists email_templates_project_name_idx
    on email_templates (project, name);

create index if not exists email_templates_project_idx
    on email_templates (project);

create index if not exists email_templates_is_live_idx
    on email_templates (is_live);

-- Keep updated_at honest.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists email_templates_set_updated_at on email_templates;
create trigger email_templates_set_updated_at
    before update on email_templates
    for each row execute function set_updated_at();

-- ===================================================================== RLS
-- Reading is open to everyone — that is the point of the shared link.
-- Writing requires a signed-in user. Combined with sign-ups being disabled
-- (step 3 in the README), that means you and nobody else.

alter table email_templates enable row level security;

drop policy if exists "Anyone can read templates" on email_templates;
create policy "Anyone can read templates"
    on email_templates for select
    using (true);

drop policy if exists "Signed-in users can insert templates" on email_templates;
create policy "Signed-in users can insert templates"
    on email_templates for insert to authenticated
    with check (true);

drop policy if exists "Signed-in users can update templates" on email_templates;
create policy "Signed-in users can update templates"
    on email_templates for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete templates" on email_templates;
create policy "Signed-in users can delete templates"
    on email_templates for delete to authenticated
    using (true);

-- ============================================================ project brands
-- Per-project branding: logo, display name, colour-role overrides.
-- The defaults live in theme.js; a row here overrides them for one project,
-- and every template in that project picks the change up.

create table if not exists project_brands (
    key         text primary key,          -- 'nursing' | 'onegov' | 'smartfinance' | 'egovern'
    brand_name  text,
    logo_url    text,
    logo_width  integer,
    font        text,                      -- a key from FONT_STACKS in theme.js; null = shipped default
    colors      jsonb not null default '{}'::jsonb,
    social      jsonb not null default '{}'::jsonb,  -- { facebook: url, instagram: url, ... }
    stamp_url   text,                      -- official stamp or seal, transparent PNG
    updated_at  timestamptz not null default now()
);

-- `create table if not exists` skips an existing table entirely, so a project
-- created before per-project fonts, social links or the stamp needs the columns
-- adding on their own.
alter table project_brands add column if not exists font text;
alter table project_brands add column if not exists social jsonb not null default '{}'::jsonb;
alter table project_brands add column if not exists stamp_url text;

-- A row here is also how a project comes into existence. The four shipped ones
-- have defaults in theme.js and need no row; anything added in the app is only
-- ever a row in this table, which is why the key is free text rather than an
-- enum.

drop trigger if exists project_brands_set_updated_at on project_brands;
create trigger project_brands_set_updated_at
    before update on project_brands
    for each row execute function set_updated_at();

alter table project_brands enable row level security;

-- Read is public so the shared library renders every project correctly.
drop policy if exists "Anyone can read project brands" on project_brands;
create policy "Anyone can read project brands"
    on project_brands for select
    using (true);

drop policy if exists "Signed-in users can insert project brands" on project_brands;
create policy "Signed-in users can insert project brands"
    on project_brands for insert to authenticated
    with check (true);

drop policy if exists "Signed-in users can update project brands" on project_brands;
create policy "Signed-in users can update project brands"
    on project_brands for update to authenticated
    using (true) with check (true);

drop policy if exists "Signed-in users can delete project brands" on project_brands;
create policy "Signed-in users can delete project brands"
    on project_brands for delete to authenticated
    using (true);

-- ================================================================== storage
-- Public bucket: uploaded images need a permanent, publicly reachable URL,
-- because mail clients cannot load anything else. Attachments linked from a
-- Documents section need the same thing — the recipient clicks the URL months
-- later, long after any signed link would have expired.
--
-- SVG is deliberately excluded — Outlook and several Android clients won't
-- render it. So is text/html: a public bucket serving attacker-authored HTML on
-- the project's own origin is a stored-XSS hole, and no email needs it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'email-assets',
    'email-assets',
    true,
    10485760,                                    -- 10 MB
    array[
        -- pictures: logos, hero images
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        -- documents linked from a Documents section
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain',
        'application/zip'
    ]
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read email assets" on storage.objects;
create policy "Public can read email assets"
    on storage.objects for select
    using (bucket_id = 'email-assets');

drop policy if exists "Signed-in users can upload email assets" on storage.objects;
create policy "Signed-in users can upload email assets"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'email-assets');

-- Note: there is deliberately NO delete policy for email-assets.
-- Emails already delivered still point at these URLs; deleting an image puts a
-- broken picture in someone's inbox months later. Remove images by hand, from
-- the dashboard, only when you are certain nothing references them.
