alter table public.session_runs
  add column aggregate_version bigint not null default 0
    check (aggregate_version >= 0),
  add column channel_epoch integer not null default 1
    check (channel_epoch > 0),
  add column last_message_seq bigint not null default 0
    check (last_message_seq >= 0),
  add column last_event_seq bigint not null default 0
    check (last_event_seq >= 0),
  add column extension_prompted_at timestamptz,
  add column extension_decision_deadline_at timestamptz,
  add column closing_started_at timestamptz,
  add column updated_at timestamptz not null default timezone('utc', now());

create table public.session_connections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  device_id uuid not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  disconnected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_connections_device_unique
    unique (session_id, user_id, device_id),
  constraint session_connections_disconnect_order_check
    check (disconnected_at is null or disconnected_at >= last_seen_at),
  constraint session_connections_update_order_check
    check (updated_at >= created_at)
);

create index session_connections_active_idx
on public.session_connections (session_id, last_seen_at desc, user_id)
where disconnected_at is null;

create index session_connections_user_idx
on public.session_connections (session_id, user_id, last_seen_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  seq_no bigint not null check (seq_no > 0),
  kind text not null check (kind in ('PARTICIPANT', 'AI_HOST')),
  author_user_id uuid references auth.users(id) on delete set null,
  author_profile_name_snapshot text not null
    check (length(btrim(author_profile_name_snapshot)) > 0),
  client_message_id uuid,
  body text not null check (length(body) between 1 and 2000),
  reply_to_message_id uuid,
  reply_author_profile_name_snapshot text,
  reply_quote_snapshot text,
  confirmed_at timestamptz not null default timezone('utc', now()),
  redacted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_session_seq_unique unique (session_id, seq_no),
  constraint messages_session_id_unique unique (session_id, id),
  constraint messages_reply_same_session_fk foreign key (session_id, reply_to_message_id)
    references public.messages(session_id, id) on delete restrict,
  constraint messages_kind_actor_check check (
    (kind = 'PARTICIPANT' and client_message_id is not null)
    or (kind = 'AI_HOST' and author_user_id is null and client_message_id is null)
  ),
  constraint messages_reply_snapshot_check check (
    (reply_to_message_id is null
      and reply_author_profile_name_snapshot is null
      and reply_quote_snapshot is null)
    or (reply_to_message_id is not null
      and length(btrim(reply_author_profile_name_snapshot)) > 0
      and length(reply_quote_snapshot) between 1 and 2000)
  ),
  constraint messages_no_self_reply_check
    check (reply_to_message_id is null or reply_to_message_id <> id),
  constraint messages_redaction_order_check
    check (redacted_at is null or redacted_at >= confirmed_at)
);

create unique index messages_participant_idempotency_idx
on public.messages (session_id, author_user_id, client_message_id)
where kind = 'PARTICIPANT' and author_user_id is not null;

create index messages_session_page_idx
on public.messages (session_id, seq_no desc);

create function private.public_jsonb_keys_allowed(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(p_value)
    when 'object' then not exists (
      select 1
      from pg_catalog.jsonb_each(p_value) as entry(key, value)
      where lower(pg_catalog.regexp_replace(entry.key, '[^a-zA-Z0-9_]', '', 'g'))
        similar to '%(ai_private|aiprivate|password|privateprompt|llmprompt|providerprompt|promptbody|prompttext|providerresponse|secret|token)%'
        or not private.public_jsonb_keys_allowed(entry.value)
    )
    when 'array' then not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_value) as item(value)
      where not private.public_jsonb_keys_allowed(item.value)
    )
    else true
  end;
$$;

revoke all on function private.public_jsonb_keys_allowed(jsonb)
from public, anon, authenticated;

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  event_seq bigint not null check (event_seq > 0),
  aggregate_version bigint not null check (aggregate_version > 0),
  channel_epoch integer not null check (channel_epoch > 0),
  event_type text not null check (
    length(event_type) between 1 and 100
    and event_type ~ '^[A-Z][A-Z0-9_]*$'
  ),
  public_payload jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(public_payload) = 'object'
      and private.public_jsonb_keys_allowed(public_payload)
    ),
  actor_user_id uuid references auth.users(id) on delete set null,
  command_id uuid,
  occurred_at timestamptz not null default timezone('utc', now()),
  constraint session_events_cursor_unique unique (session_id, event_seq)
);

create index session_events_cursor_idx
on public.session_events (session_id, event_seq asc);

alter table public.session_connections enable row level security;
alter table public.messages enable row level security;
alter table public.session_events enable row level security;

revoke all on table public.session_connections from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.session_events from public, anon, authenticated;

comment on column public.session_runs.aggregate_version is
  'Monotonic version for committed participant-facing session state and events.';
comment on column public.session_runs.channel_epoch is
  'Version of the private Realtime topic; incrementing it revokes the old topic.';
comment on table public.session_connections is
  'Durable heartbeat facts used for server-side online participant decisions; Presence remains ephemeral UX.';
comment on table public.messages is
  'Immutable confirmed public discussion messages ordered by a session-local sequence.';
comment on table public.session_events is
  'Append-only committed public event log used to recover from Realtime loss with a cursor.';
