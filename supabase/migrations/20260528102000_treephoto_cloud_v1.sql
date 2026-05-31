-- TreePhoto cloud V1 schema
-- Sprint 8: projects, photos, decisions, collections and processing jobs.

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  project_type text not null default 'general',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  original_filename text not null,
  file_size bigint,
  mime_type text,
  width integer,
  height integer,
  rating smallint not null default 0 check (rating between 0 and 5),
  pick_status text not null default 'unreviewed' check (pick_status in ('unreviewed', 'pick', 'reject', 'review')),
  autoflow_class text not null default 'review' check (autoflow_class in ('keep', 'review', 'reject')),
  color_label text,
  is_favorite boolean not null default false,
  is_deleted boolean not null default false,
  storage_path text not null,
  thumbnail_path text,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, storage_path)
);

create table if not exists public.photo_analysis (
  photo_id uuid primary key references public.photos(id) on delete cascade,
  score numeric(5,2),
  sharpness_score numeric(5,2),
  composition_score numeric(5,2),
  exposure_score numeric(5,2),
  is_blurry boolean not null default false,
  is_duplicate boolean not null default false,
  perceptual_hash text,
  tags text[] not null default '{}',
  explanation text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  collection_type text not null default 'manual' check (collection_type in ('manual', 'smart', 'system')),
  rule jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.collection_photos (
  collection_id uuid not null references public.collections(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, photo_id)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  job_type text not null check (job_type in ('generate_thumbnail', 'quality_analysis', 'perceptual_hash', 'semantic_embedding')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_owner_idx on public.organizations(owner_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id, organization_id);
create index if not exists projects_org_idx on public.projects(organization_id, created_at desc);
create index if not exists photos_project_status_idx on public.photos(project_id, pick_status, is_deleted);
create index if not exists photos_project_autoflow_idx on public.photos(project_id, autoflow_class, rating desc);
create index if not exists photo_analysis_phash_idx on public.photo_analysis(perceptual_hash) where perceptual_hash is not null;
create index if not exists collections_project_idx on public.collections(project_id, collection_type, sort_order);
create index if not exists collection_photos_photo_idx on public.collection_photos(photo_id);
create index if not exists jobs_polling_idx on public.jobs(status, run_after, created_at) where status = 'pending';
create index if not exists jobs_project_status_idx on public.jobs(project_id, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

drop trigger if exists photo_analysis_set_updated_at on public.photo_analysis;
create trigger photo_analysis_set_updated_at
  before update on public.photo_analysis
  for each row execute function public.set_updated_at();

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = target_project_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_project_storage_object(target_bucket_id text, target_object_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with path_parts as (
    select string_to_array(target_object_name, '/') as parts
  )
  select exists (
    select 1
    from path_parts
    where target_bucket_id = 'project-photos'
      and array_length(parts, 1) >= 5
      and parts[1] = 'organizations'
      and parts[3] = 'projects'
      and parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (select public.is_project_member(parts[4]::uuid))
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-photos',
  'project-photos',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/avif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.photos enable row level security;
alter table public.photo_analysis enable row level security;
alter table public.collections enable row level security;
alter table public.collection_photos enable row level security;
alter table public.jobs enable row level security;

create policy "organizations_members_select" on public.organizations
  for select using ((select public.is_organization_member(id)));
create policy "organizations_owner_insert" on public.organizations
  for insert with check ((select auth.uid()) = owner_id);
create policy "organizations_owners_update" on public.organizations
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "organization_members_members_select" on public.organization_members
  for select using ((select public.is_organization_member(organization_id)));
create policy "organization_members_owner_insert" on public.organization_members
  for insert with check (
    exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = (select auth.uid())
    )
  );
create policy "organization_members_owner_update" on public.organization_members
  for update using (
    exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = (select auth.uid())
    )
  );

create policy "projects_members_select" on public.projects
  for select using ((select public.is_organization_member(organization_id)));
create policy "projects_members_insert" on public.projects
  for insert with check (
    (select public.is_organization_member(organization_id))
    and created_by = (select auth.uid())
  );
create policy "projects_members_update" on public.projects
  for update using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "photos_members_select" on public.photos
  for select using ((select public.is_project_member(project_id)));
create policy "photos_members_insert" on public.photos
  for insert with check ((select public.is_project_member(project_id)));
create policy "photos_members_update" on public.photos
  for update using ((select public.is_project_member(project_id)))
  with check ((select public.is_project_member(project_id)));

create policy "photo_analysis_members_select" on public.photo_analysis
  for select using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_analysis_members_insert" on public.photo_analysis
  for insert with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_analysis_members_update" on public.photo_analysis
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

create policy "collections_members_select" on public.collections
  for select using ((select public.is_project_member(project_id)));
create policy "collections_members_insert" on public.collections
  for insert with check ((select public.is_project_member(project_id)));
create policy "collections_members_update" on public.collections
  for update using ((select public.is_project_member(project_id)))
  with check ((select public.is_project_member(project_id)));

create policy "collection_photos_members_select" on public.collection_photos
  for select using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and (select public.is_project_member(c.project_id))
    )
  );
create policy "collection_photos_members_insert" on public.collection_photos
  for insert with check (
    exists (
      select 1 from public.collections c
      join public.photos p on p.id = photo_id
      where c.id = collection_id
        and p.project_id = c.project_id
        and (select public.is_project_member(c.project_id))
    )
  );
create policy "collection_photos_members_delete" on public.collection_photos
  for delete using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and (select public.is_project_member(c.project_id))
    )
  );

create policy "jobs_members_select" on public.jobs
  for select using ((select public.is_project_member(project_id)));
create policy "jobs_members_insert" on public.jobs
  for insert with check ((select public.is_project_member(project_id)));
create policy "jobs_members_update" on public.jobs
  for update using ((select public.is_project_member(project_id)))
  with check ((select public.is_project_member(project_id)));

create policy "project_photos_members_insert" on storage.objects
  for insert with check ((select public.can_access_project_storage_object(bucket_id, name)));
create policy "project_photos_members_select" on storage.objects
  for select using ((select public.can_access_project_storage_object(bucket_id, name)));
create policy "project_photos_members_update" on storage.objects
  for update using ((select public.can_access_project_storage_object(bucket_id, name)))
  with check ((select public.can_access_project_storage_object(bucket_id, name)));
create policy "project_photos_members_delete" on storage.objects
  for delete using ((select public.can_access_project_storage_object(bucket_id, name)));
