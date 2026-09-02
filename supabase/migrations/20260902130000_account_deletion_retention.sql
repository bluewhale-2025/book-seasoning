create table private.account_deletion_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  former_user_id uuid unique,
  command_id uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  status text not null default 'PENDING' check (
    status in ('PENDING','PROCESSING','RETRY_SCHEDULED','COMPLETED','FAILED')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]*$'),
  requested_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc',now()),
  check ((status='PROCESSING' and lease_expires_at is not null) or (status<>'PROCESSING' and lease_expires_at is null)),
  check ((status='RETRY_SCHEDULED' and next_attempt_at is not null) or (status<>'RETRY_SCHEDULED' and next_attempt_at is null)),
  check ((status='COMPLETED' and completed_at is not null) or (status<>'COMPLETED' and completed_at is null))
);

create table private.account_deletion_restore_tombstones (
  deletion_id uuid primary key references private.account_deletion_requests(id) on delete cascade,
  former_user_id uuid not null,
  participant_identity_ids uuid[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc',now())
);

revoke all on table private.account_deletion_requests,
  private.account_deletion_restore_tombstones
from public,anon,authenticated,bookseasoning_ai_worker;

alter table public.messages add column author_participant_identity_id uuid;
alter table public.prep_entries add column author_participant_identity_id uuid;

update public.messages message set author_participant_identity_id=membership.participant_identity_id
from public.session_runs session,public.room_memberships membership
where session.id=message.session_id and membership.room_id=session.room_id
  and membership.user_id=message.author_user_id and message.kind='PARTICIPANT';
update public.prep_entries prep set author_participant_identity_id=membership.participant_identity_id
from public.room_memberships membership
where membership.room_id=prep.room_id and membership.user_id=prep.author_user_id;

create function private.assign_contributor_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='messages' then
    if new.kind='PARTICIPANT' and new.author_user_id is not null then
      select membership.participant_identity_id into new.author_participant_identity_id
      from public.session_runs session join public.room_memberships membership on membership.room_id=session.room_id
      where session.id=new.session_id and membership.user_id=new.author_user_id;
    end if;
  elsif tg_table_name='prep_entries' then
    if new.author_user_id is not null then
      select membership.participant_identity_id into new.author_participant_identity_id
      from public.room_memberships membership
      where membership.room_id=new.room_id and membership.user_id=new.author_user_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_assign_contributor_identity before insert on public.messages
for each row execute function private.assign_contributor_identity();
create trigger prep_assign_contributor_identity before insert on public.prep_entries
for each row execute function private.assign_contributor_identity();

alter table public.prep_entries drop constraint prep_entries_author_user_id_fkey;
alter table public.messages drop constraint messages_author_user_id_fkey;

alter table public.room_memberships drop constraint room_memberships_user_id_fkey;
alter table public.rooms drop constraint rooms_host_user_id_fkey;
alter table public.session_connections drop constraint session_connections_user_id_fkey;
alter table public.session_connections add constraint session_connections_user_id_fkey
foreign key(user_id) references auth.users(id) on delete cascade;
alter table private.ai_host_help_requests drop constraint ai_host_help_requests_actor_user_id_fkey;
alter table private.ai_host_help_requests alter column actor_user_id drop not null;
alter table private.ai_host_help_requests add constraint ai_host_help_requests_actor_user_id_fkey
foreign key(actor_user_id) references auth.users(id) on delete set null;

create or replace function private.on_active_session_host_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_phase text;
begin
  if old.host_user_id is distinct from new.host_user_id then
    select session.phase into target_phase from public.session_runs session where session.room_id=new.id;
    if target_phase not in ('ENDED','CANCELED') then
      perform private.append_session_participant_change(new.id,old.host_user_id,auth.uid(),false,false);
      if new.host_user_id is not null then
        perform private.append_session_participant_change(new.id,new.host_user_id,auth.uid(),false,false);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create function private.account_deletion_blockers(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(code order by code),'[]'::jsonb) from (
    select 'ADMIN_ROLE' code where exists(
      select 1 from public.profiles profile where profile.user_id=p_user_id and profile.role='ADMIN'
    )
    union select 'ACTIVE_PARTICIPATION' where exists(
      select 1 from public.room_memberships membership
      join public.session_runs session on session.room_id=membership.room_id
      where membership.user_id=p_user_id and membership.status='PARTICIPATED'
        and session.phase not in ('ENDED','CANCELED')
    )
    union select 'HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL' where exists(
      select 1 from public.rooms room join public.session_runs session on session.room_id=room.id
      where room.host_user_id=p_user_id and room.canceled_at is null
        and session.phase not in ('ENDED','CANCELED')
    )
  ) blockers;
$$;

create function public.get_account_deletion_preview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); blockers jsonb;
begin
  if actor_id is null then raise exception using errcode='42501',message='authentication_required'; end if;
  blockers:=private.account_deletion_blockers(actor_id);
  return pg_catalog.jsonb_build_object(
    'allowed',jsonb_array_length(blockers)=0,'blockers',blockers,
    'affected',pg_catalog.jsonb_build_object(
      'messages',(select count(*) from public.messages where author_user_id=actor_id),
      'publicPrep',(select count(*) from public.prep_entries where author_user_id=actor_id and visibility='PUBLIC'),
      'privatePrep',(select count(*) from public.prep_entries where author_user_id=actor_id and visibility='AI_PRIVATE'),
      'closingResponses',(select count(*) from public.session_closing_responses where author_user_id=actor_id)
    )
  );
end;
$$;

create function private.anonymize_deleted_account(
  p_user_id uuid,
  p_participant_identity_ids uuid[],
  p_occurred_at timestamptz,
  p_delete_auth_identity boolean default false
)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.session_runs session set
    channel_epoch=session.channel_epoch+1,
    updated_at=p_occurred_at
  where session.phase not in ('ENDED','CANCELED') and exists(
    select 1 from public.room_memberships membership
    where membership.room_id=session.room_id
      and (membership.user_id=p_user_id or membership.participant_identity_id=any(p_participant_identity_ids))
  );
  delete from private.ai_private_prep_bodies where author_user_id=p_user_id;
  delete from public.prep_entries where author_user_id=p_user_id and visibility='AI_PRIVATE';
  update public.prep_entries set author_profile_name_snapshot='탈퇴한 사용자'
  where author_user_id=p_user_id and visibility='PUBLIC';
  update public.messages set author_profile_name_snapshot='탈퇴한 사용자'
  where author_user_id=p_user_id or author_participant_identity_id=any(p_participant_identity_ids);
  update public.messages reply set reply_author_profile_name_snapshot='탈퇴한 사용자'
  where exists(
    select 1 from public.messages original
    where original.id=reply.reply_to_message_id
      and original.author_participant_identity_id=any(p_participant_identity_ids)
  );
  update public.session_closing_responses set
    author_user_id=null,
    profile_name_snapshot='탈퇴한 사용자'
  where author_user_id=p_user_id or participant_identity_id=any(p_participant_identity_ids);
  update public.room_memberships set
    status=case when status='REGISTERED' then 'CANCELED' else status end,
    canceled_at=case when status='REGISTERED' then p_occurred_at else canceled_at end,
    profile_name_snapshot='탈퇴한 사용자'
  where user_id=p_user_id or participant_identity_id=any(p_participant_identity_ids);
  update public.rooms set updated_at=p_occurred_at where host_user_id=p_user_id;
  delete from public.session_connections where user_id=p_user_id;
  update private.ai_host_help_requests set actor_user_id=null where actor_user_id=p_user_id;
  delete from public.profiles where user_id=p_user_id;

  update public.session_events event set public_payload=pg_catalog.jsonb_build_object(
    'message',private.session_message_public_json(message)
  ) from public.messages message
  where event.event_type='MESSAGE_APPENDED'
    and event.public_payload#>>'{message,messageId}'=message.id::text
    and message.author_participant_identity_id=any(p_participant_identity_ids);
  update public.session_events event set public_payload=
    jsonb_set(jsonb_set(event.public_payload,'{participantUserId}','null'::jsonb),'{participant}',
      case when event.public_payload->'participant'='null'::jsonb then 'null'::jsonb
      else jsonb_set(jsonb_set(event.public_payload->'participant','{userId}','null'::jsonb),'{profileName}',to_jsonb('탈퇴한 사용자'::text)) end)
  where event.event_type='SESSION_PARTICIPANT_CHANGED'
    and event.public_payload->>'participantUserId'=p_user_id::text;

  if p_delete_auth_identity then
    delete from auth.users where id=p_user_id;
  end if;
end;
$$;

create function private.reapply_account_deletion_tombstone(
  p_former_user_id uuid,
  p_participant_identity_ids uuid[]
)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.anonymize_deleted_account(
    p_former_user_id,
    p_participant_identity_ids,
    timezone('utc',now()),
    true
  );
end;
$$;

create function public.prepare_account_deletion(p_command_id uuid,p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); existing private.account_deletion_requests%rowtype;
  deletion_id uuid; blockers jsonb; participant_identity_ids uuid[];
  occurred_at timestamptz:=timezone('utc',now());
begin
  if actor_id is null then raise exception using errcode='42501',message='authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-delete:'||actor_id::text,0));
  select request.* into existing from private.account_deletion_requests request where request.former_user_id=actor_id;
  if found then
    if existing.command_id=p_command_id and existing.request_fingerprint<>p_request_fingerprint then
      raise exception using errcode='40001',message='command_payload_mismatch';
    end if;
    return pg_catalog.jsonb_build_object('deletionId',existing.id,'status',existing.status,'duplicate',true,'serverTime',occurred_at);
  end if;
  blockers:=private.account_deletion_blockers(actor_id);
  if jsonb_array_length(blockers)>0 then raise exception using errcode='55000',message='account_deletion_blocked'; end if;
  perform 1 from auth.users user_record where user_record.id=actor_id for update;
  if not found then raise exception using errcode='P0002',message='account_not_found'; end if;
  insert into private.account_deletion_requests(
    former_user_id,command_id,request_fingerprint,status,
    attempt_count,lease_expires_at
  ) values(
    actor_id,p_command_id,p_request_fingerprint,'PROCESSING',
    1,occurred_at+interval '2 minutes'
  ) returning id into deletion_id;

  select coalesce(array_agg(membership.participant_identity_id),'{}'::uuid[])
  into participant_identity_ids
  from public.room_memberships membership where membership.user_id=actor_id;
  insert into private.account_deletion_restore_tombstones(
    deletion_id,former_user_id,participant_identity_ids,expires_at
  ) values(deletion_id,actor_id,participant_identity_ids,occurred_at+interval '37 days');

  perform private.anonymize_deleted_account(
    actor_id,
    participant_identity_ids,
    occurred_at,
    false
  );

  return pg_catalog.jsonb_build_object('deletionId',deletion_id,'status','PROCESSING','duplicate',false,'serverTime',occurred_at);
end;
$$;

create function public.claim_pending_account_deletions(p_limit integer default 10)
returns table(deletion_id uuid,former_user_id uuid) language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  return query with selected as (
    select request.id from private.account_deletion_requests request
    where request.status='PENDING' or (request.status='RETRY_SCHEDULED' and request.next_attempt_at<=timezone('utc',now()))
      or (request.status='PROCESSING' and request.lease_expires_at<=timezone('utc',now()))
    order by request.requested_at for update skip locked limit greatest(1,least(p_limit,50))
  ), updated as (
    update private.account_deletion_requests request set status='PROCESSING',attempt_count=attempt_count+1,
      lease_expires_at=timezone('utc',now())+interval '2 minutes',next_attempt_at=null,updated_at=timezone('utc',now())
    from selected where request.id=selected.id returning request.id,request.former_user_id
  ) select updated.id,updated.former_user_id from updated;
end;
$$;

create function public.complete_account_deletion(p_deletion_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  update private.account_deletion_requests set status='COMPLETED',lease_expires_at=null,next_attempt_at=null,
    error_code=null,completed_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where id=p_deletion_id and status<>'COMPLETED';
  return found;
end;
$$;

create function public.fail_account_deletion(p_deletion_id uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  update private.account_deletion_requests set
    status=case when attempt_count>=10 then 'FAILED' else 'RETRY_SCHEDULED' end,
    lease_expires_at=null,
    next_attempt_at=case when attempt_count>=10 then null else timezone('utc',now())+interval '5 minutes' end,
    error_code=p_error_code,updated_at=timezone('utc',now())
  where id=p_deletion_id and status in ('PENDING','PROCESSING');
  return found;
end;
$$;

create or replace function private.reject_immutable_ai_fact_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and current_setting('bookseasoning.retention_purge',true)='on'
    and tg_table_name in ('ai_evaluations','ai_policy_actions','ai_provider_runs') then return new; end if;
  raise exception using errcode='55000',message='immutable_ai_fact';
end;
$$;

create table private.ai_diagnostic_retention (
  session_id uuid primary key references public.session_runs(id) on delete restrict,
  expires_at timestamptz not null,
  purged_at timestamptz
);
create table private.ai_diagnostic_daily_aggregates (
  period_date date primary key,
  session_count bigint not null default 0,
  evaluation_count bigint not null default 0,
  intervention_count bigint not null default 0,
  provider_run_count bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default timezone('utc',now())
);
revoke all on table private.ai_diagnostic_retention,private.ai_diagnostic_daily_aggregates
from public,anon,authenticated,bookseasoning_ai_worker;

create function private.schedule_ai_diagnostic_expiry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.phase='ENDED' and new.ended_at is not null then
    insert into private.ai_diagnostic_retention(session_id,expires_at)
    values(new.id,new.ended_at+interval '90 days')
    on conflict(session_id) do update set expires_at=excluded.expires_at;
  end if;
  return new;
end;
$$;
create trigger session_ai_diagnostic_expiry after insert or update of phase,ended_at on public.session_runs
for each row execute function private.schedule_ai_diagnostic_expiry();
insert into private.ai_diagnostic_retention(session_id,expires_at)
select id,ended_at+interval '90 days' from public.session_runs where phase='ENDED' and ended_at is not null
on conflict do nothing;

create function private.purge_expired_ai_diagnostics(p_now timestamptz default timezone('utc',now()),p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare target record; purged_count integer:=0; eval_count bigint; intervention_count bigint;
  provider_count bigint; in_tokens bigint; out_tokens bigint;
begin
  perform set_config('bookseasoning.retention_purge','on',true);
  for target in select retention.session_id,retention.expires_at from private.ai_diagnostic_retention retention
    where retention.purged_at is null and retention.expires_at<=p_now
    order by retention.expires_at for update skip locked limit greatest(1,least(p_limit,1000))
  loop
    select count(*) into eval_count from private.ai_evaluations where session_id=target.session_id;
    select count(*) into intervention_count from private.ai_interventions where session_id=target.session_id;
    select count(*),coalesce(sum((usage->>'inputTokens')::bigint),0),coalesce(sum((usage->>'outputTokens')::bigint),0)
      into provider_count,in_tokens,out_tokens from private.ai_provider_runs provider
      join private.ai_job_runs job on job.id=provider.job_id where job.session_id=target.session_id;
    insert into private.ai_diagnostic_daily_aggregates(
      period_date,session_count,evaluation_count,intervention_count,provider_run_count,input_tokens,output_tokens
    ) values(target.expires_at::date,1,eval_count,intervention_count,provider_count,in_tokens,out_tokens)
    on conflict(period_date) do update set
      session_count=private.ai_diagnostic_daily_aggregates.session_count+1,
      evaluation_count=private.ai_diagnostic_daily_aggregates.evaluation_count+excluded.evaluation_count,
      intervention_count=private.ai_diagnostic_daily_aggregates.intervention_count+excluded.intervention_count,
      provider_run_count=private.ai_diagnostic_daily_aggregates.provider_run_count+excluded.provider_run_count,
      input_tokens=private.ai_diagnostic_daily_aggregates.input_tokens+excluded.input_tokens,
      output_tokens=private.ai_diagnostic_daily_aggregates.output_tokens+excluded.output_tokens,
      updated_at=p_now;
    update private.ai_evaluations set canonical_result='{"purged":true}'::jsonb where session_id=target.session_id;
    update private.ai_policy_actions set reason_codes='[]'::jsonb,supporting_evidence_refs='[]'::jsonb where session_id=target.session_id;
    update private.ai_interventions set canonical_output=null where session_id=target.session_id;
    update private.ai_provider_runs provider set usage=null,response_id='purged',canonical_run='{"purged":true}'::jsonb
      from private.ai_job_runs job where job.id=provider.job_id and job.session_id=target.session_id and provider.status='SUCCEEDED';
    update private.ai_diagnostic_retention set purged_at=p_now where session_id=target.session_id;
    purged_count:=purged_count+1;
  end loop;
  return purged_count;
end;
$$;

create function private.purge_expired_account_restore_tombstones(p_now timestamptz default timezone('utc',now()))
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update private.account_deletion_requests request set former_user_id=null,updated_at=p_now
  from private.account_deletion_restore_tombstones tombstone
  where tombstone.deletion_id=request.id and tombstone.expires_at<=p_now;
  delete from private.account_deletion_restore_tombstones where expires_at<=p_now;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

select cron.schedule('bookseasoning-purge-retention','17 3 * * *',
  'select private.purge_expired_ai_diagnostics(); select private.purge_expired_account_restore_tombstones();')
where not exists(select 1 from cron.job where jobname='bookseasoning-purge-retention');

revoke all on function private.account_deletion_blockers(uuid),private.assign_contributor_identity(),
  private.anonymize_deleted_account(uuid,uuid[],timestamptz,boolean),
  private.reapply_account_deletion_tombstone(uuid,uuid[]),
  private.purge_expired_ai_diagnostics(timestamptz,integer),
  private.purge_expired_account_restore_tombstones(timestamptz)
from public,anon,authenticated;
revoke all on function public.get_account_deletion_preview(),public.prepare_account_deletion(uuid,text),
  public.claim_pending_account_deletions(integer),public.complete_account_deletion(uuid),
  public.fail_account_deletion(uuid,text)
from public,anon,authenticated;
grant execute on function public.get_account_deletion_preview(),public.prepare_account_deletion(uuid,text)
to authenticated;
grant execute on function public.claim_pending_account_deletions(integer),
  public.complete_account_deletion(uuid),public.fail_account_deletion(uuid,text)
to service_role;
