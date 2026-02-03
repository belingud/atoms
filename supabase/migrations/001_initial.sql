-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects table
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  role text check (role in ('user', 'assistant')) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Files table
create table public.files (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  path text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, path)
);

-- Row Level Security (RLS)
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;

-- Projects policies
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Messages policies
create policy "Users can view messages in their projects"
  on public.messages for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can create messages in their projects"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Files policies
create policy "Users can view files in their projects"
  on public.files for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = files.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can create files in their projects"
  on public.files for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = files.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can update files in their projects"
  on public.files for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = files.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete files in their projects"
  on public.files for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = files.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Indexes for performance
create index idx_projects_user_id on public.projects(user_id);
create index idx_messages_project_id on public.messages(project_id);
create index idx_files_project_id on public.files(project_id);
