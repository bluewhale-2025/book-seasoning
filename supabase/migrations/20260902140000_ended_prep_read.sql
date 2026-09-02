create or replace function public.list_room_prep(p_room_id uuid)
returns table (
  entry_id uuid,
  prompt_type text,
  visibility text,
  body text,
  author_user_id uuid,
  author_profile_name text,
  mine boolean,
  revision integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1
    from public.rooms as room
    join public.session_runs as session on session.room_id = room.id
    left join public.room_memberships as membership
      on membership.room_id = room.id
     and membership.user_id = actor_id
    where room.id = p_room_id
      and room.canceled_at is null
      and (
        (
          session.phase = 'SCHEDULED'
          and membership.status = 'REGISTERED'
        )
        or (
          session.phase = 'ENDED'
          and (
            room.host_user_id = actor_id
            or membership.status = 'PARTICIPATED'
          )
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'prep_read_not_allowed';
  end if;

  return query
  select
    entry.id,
    entry.prompt_type,
    entry.visibility,
    case
      when entry.visibility = 'PUBLIC' then entry.public_body
      when entry.author_user_id = actor_id then private_body.body
    end,
    entry.author_user_id,
    entry.author_profile_name_snapshot,
    entry.author_user_id = actor_id,
    entry.revision,
    entry.updated_at
  from public.prep_entries as entry
  join public.room_memberships as author_membership
    on author_membership.room_id = entry.room_id
   and author_membership.user_id = entry.author_user_id
   and author_membership.status in ('REGISTERED', 'PARTICIPATED')
  left join private.ai_private_prep_bodies as private_body
    on private_body.prep_entry_id = entry.id
   and entry.author_user_id = actor_id
  where entry.room_id = p_room_id
    and (entry.visibility = 'PUBLIC' or entry.author_user_id = actor_id)
  order by entry.updated_at, entry.id;
end;
$$;

revoke all on function public.list_room_prep(uuid) from public, anon;
grant execute on function public.list_room_prep(uuid) to authenticated;
