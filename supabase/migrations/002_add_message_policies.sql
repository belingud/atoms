-- Add missing policies for messages table

-- Users can update messages in their projects
create policy "Users can update messages in their projects"
  on public.messages for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Users can delete messages in their projects
create policy "Users can delete messages in their projects"
  on public.messages for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );
