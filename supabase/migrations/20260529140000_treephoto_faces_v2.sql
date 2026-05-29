-- TreePhoto cloud V2 schema
-- Sprint 17: people and faces with strict opt-in. Faces are never auto-named:
-- detection only produces anonymous face records; naming is always a manual action.

-- Strict opt-in: face analysis is disabled until the photographer explicitly enables it.
alter table public.projects
  add column if not exists face_analysis_enabled boolean not null default false;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- null = anonymous group. Never auto-filled; only a manual name sets this.
  display_name text,
  status text not null default 'unconfirmed' check (status in ('unconfirmed', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photo_faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  bounding_box jsonb not null default '{}'::jsonb,
  embedding vector(128) not null,
  confidence numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_project_idx on public.people(project_id, status);
create index if not exists photo_faces_photo_idx on public.photo_faces(photo_id);
create index if not exists photo_faces_person_idx on public.photo_faces(person_id) where person_id is not null;
create index if not exists photo_faces_hnsw_idx
  on public.photo_faces using hnsw (embedding vector_cosine_ops);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

drop trigger if exists photo_faces_set_updated_at on public.photo_faces;
create trigger photo_faces_set_updated_at
  before update on public.photo_faces
  for each row execute function public.set_updated_at();

alter table public.people enable row level security;
alter table public.photo_faces enable row level security;

create policy "people_members_select" on public.people
  for select using ((select public.is_project_member(project_id)));
create policy "people_members_insert" on public.people
  for insert with check ((select public.is_project_member(project_id)));
create policy "people_members_update" on public.people
  for update using ((select public.is_project_member(project_id)))
  with check ((select public.is_project_member(project_id)));
create policy "people_members_delete" on public.people
  for delete using ((select public.is_project_member(project_id)));

create policy "photo_faces_members_select" on public.photo_faces
  for select using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_faces_members_insert" on public.photo_faces
  for insert with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_faces_members_update" on public.photo_faces
  for update using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  ) with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_faces_members_delete" on public.photo_faces
  for delete using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );

-- Allow the face_detection job type alongside the existing analysis jobs.
alter table public.jobs drop constraint if exists jobs_job_type_check;
alter table public.jobs add constraint jobs_job_type_check
  check (job_type in (
    'generate_thumbnail',
    'quality_analysis',
    'perceptual_hash',
    'semantic_embedding',
    'face_detection'
  ));
