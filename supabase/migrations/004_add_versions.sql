-- Version history tables for project snapshots

-- Project versions table
create table public.project_versions (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  version_number integer not null,
  description text,
  agent_id text,
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, version_number)
);

-- Version file snapshots table
create table public.version_files (
  id uuid default uuid_generate_v4() primary key,
  version_id uuid references public.project_versions(id) on delete cascade not null,
  path text not null,
  content text not null,
  unique(version_id, path)
);

-- Row Level Security
alter table public.project_versions enable row level security;
alter table public.version_files enable row level security;

-- project_versions policies (same pattern as messages/files)
create policy "Users can view versions of their projects"
  on public.project_versions for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can create versions in their projects"
  on public.project_versions for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete versions of their projects"
  on public.project_versions for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_versions.project_id
      and projects.user_id = auth.uid()
    )
  );

-- version_files policies (access through project_versions → projects)
create policy "Users can view version files of their projects"
  on public.version_files for select
  using (
    exists (
      select 1 from public.project_versions
      join public.projects on projects.id = project_versions.project_id
      where project_versions.id = version_files.version_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can create version files in their projects"
  on public.version_files for insert
  with check (
    exists (
      select 1 from public.project_versions
      join public.projects on projects.id = project_versions.project_id
      where project_versions.id = version_files.version_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete version files of their projects"
  on public.version_files for delete
  using (
    exists (
      select 1 from public.project_versions
      join public.projects on projects.id = project_versions.project_id
      where project_versions.id = version_files.version_id
      and projects.user_id = auth.uid()
    )
  );

-- Indexes
create index idx_project_versions_project_id on public.project_versions(project_id);
create index idx_project_versions_created_at on public.project_versions(created_at);
create index idx_version_files_version_id on public.version_files(version_id);
