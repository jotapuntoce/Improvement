-- Custom SQL migration file, put your code below! --
-- La comunidad es de la red de afiliadas: dueños del muelle y afiliadas activas.
alter table post enable row level security;
create policy "network members read posts" on post for select using (public.is_network_member(post.muelle_org_id));

alter table comment enable row level security;
create policy "network members read comments of readable posts"
  on comment for select using (exists (select 1 from post p where p.id = comment.post_id));

alter table community_event enable row level security;
create policy "network members read events"
  on community_event for select using (public.is_network_member(community_event.muelle_org_id));

-- El candado por nivel es de la app (el nivel se calcula en el servidor); RLS limita a la red.
alter table course enable row level security;
create policy "network members read courses" on course for select using (public.is_network_member(course.muelle_org_id));

alter table lesson enable row level security;
create policy "network members read lessons of readable courses"
  on lesson for select using (exists (select 1 from course c where c.id = lesson.course_id));

alter table lesson_completion enable row level security;
create policy "people read their completions, dock owners read their network's"
  on lesson_completion for select
  using (lesson_completion.profile_id = auth.uid() or exists (
    select 1 from lesson l join course c on c.id = l.course_id
    where l.id = lesson_completion.lesson_id and public.is_dock_owner(c.muelle_org_id)));

grant select on post, comment, community_event, course, lesson, lesson_completion to authenticated;
