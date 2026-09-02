begin;

set local search_path = public, extensions;

select plan(36);

select has_function(
  'private',
  'read_ai_public_session_frame',
  array['uuid', 'integer', 'bigint'],
  'PUBLIC context frame function exists'
);
select has_function(
  'private',
  'read_ai_public_messages',
  array['uuid', 'bigint', 'bigint', 'integer'],
  'PUBLIC message context-window function exists'
);
select has_function(
  'private',
  'read_ai_public_messages_by_ids',
  array['uuid', 'uuid[]', 'bigint'],
  'PUBLIC exact message resolver function exists'
);
select has_function(
  'private',
  'read_ai_public_prep',
  array['uuid', 'uuid[]'],
  'PUBLIC prep resolver function exists'
);

select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.read_ai_public_session_frame(uuid,integer,bigint)',
    'EXECUTE'
  ),
  'worker can read the PUBLIC context frame through a function'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.read_ai_public_messages(uuid,bigint,bigint,integer)',
    'EXECUTE'
  ),
  'worker can read a PUBLIC message window through a function'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.read_ai_public_messages_by_ids(uuid,uuid[],bigint)',
    'EXECUTE'
  ),
  'worker can resolve PUBLIC messages through a function'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.read_ai_public_prep(uuid,uuid[])',
    'EXECUTE'
  ),
  'worker can resolve PUBLIC prep through a function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.read_ai_public_session_frame(uuid,integer,bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the worker context frame'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.read_ai_public_messages(uuid,bigint,bigint,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the worker message reader'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.read_ai_public_messages_by_ids(uuid,uuid[],bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the worker message resolver'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.read_ai_public_prep(uuid,uuid[])',
    'EXECUTE'
  ),
  'authenticated clients cannot call the worker prep reader'
);

select ok(
  not has_table_privilege('bookseasoning_ai_worker', 'public.messages', 'SELECT'),
  'worker cannot bypass the PUBLIC message projection'
);
select ok(
  not has_table_privilege('bookseasoning_ai_worker', 'public.prep_entries', 'SELECT'),
  'worker cannot bypass the PUBLIC prep projection'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_private_prep_bodies', 'SELECT'
  ),
  'PUBLIC worker path cannot select AI_PRIVATE bodies'
);
select ok(
  not has_table_privilege('bookseasoning_ai_worker', 'public.session_runs', 'SELECT'),
  'worker cannot bypass the session frame projection'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
(
  'e1000000-0000-4000-8000-000000000001',
  'public-context-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"공개 컨텍스트 방장"}'::jsonb
),
(
  'e1000000-0000-4000-8000-000000000002',
  'public-context-member@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"공개 컨텍스트 참가자"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'e2000000-0000-4000-8000-000000000001',
  '공개 컨텍스트 책',
  '테스트 작가',
  '테스트 출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'PUBLIC context fixture',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'e4000000-0000-4000-8000-000000000001',
  '공개 컨텍스트 방',
  'e3000000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.session_runs (
  id, room_id, phase, phase_version, started_at, discussion_ends_at,
  aggregate_version, last_message_seq
) values (
  'e5000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'CORE',
  2,
  timezone('utc', now()) - interval '10 minutes',
  timezone('utc', now()) + interval '20 minutes',
  4,
  3
);

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, joined_at, participated_at
) values
(
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'PARTICIPATED',
  '공개 컨텍스트 방장',
  timezone('utc', now()) - interval '20 minutes',
  timezone('utc', now()) - interval '10 minutes'
),
(
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'REGISTERED',
  '공개 컨텍스트 참가자',
  timezone('utc', now()) - interval '15 minutes',
  null
);

insert into public.prep_entries (
  id, room_id, author_user_id, author_profile_name_snapshot,
  prompt_type, visibility, public_body
) values
(
  'e6000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  '공개 컨텍스트 방장',
  'DISCUSSION_QUESTION',
  'PUBLIC',
  '공개된 사전 질문입니다.'
),
(
  'e6000000-0000-4000-8000-000000000002',
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  '공개 컨텍스트 참가자',
  'QUOTE_THOUGHT',
  'AI_PRIVATE',
  null
);

insert into private.ai_private_prep_bodies (
  prep_entry_id, room_id, author_user_id, body, revision
) values (
  'e6000000-0000-4000-8000-000000000002',
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'AI_PRIVATE_CANARY_DB_CONTEXT_MUST_NOT_LEAK',
  1
);

insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body, confirmed_at
) values
(
  'e7000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  1,
  'PARTICIPANT',
  'e1000000-0000-4000-8000-000000000001',
  '공개 컨텍스트 방장',
  'e8000000-0000-4000-8000-000000000001',
  '첫 번째 공개 원문입니다.',
  timezone('utc', now()) - interval '3 minutes'
),
(
  'e7000000-0000-4000-8000-000000000002',
  'e5000000-0000-4000-8000-000000000001',
  2,
  'AI_HOST',
  null,
  'AI 진행자',
  null,
  '서로 다른 전제를 비교해볼까요?',
  timezone('utc', now()) - interval '2 minutes'
),
(
  'e7000000-0000-4000-8000-000000000003',
  'e5000000-0000-4000-8000-000000000001',
  3,
  'PARTICIPANT',
  'e1000000-0000-4000-8000-000000000001',
  '공개 컨텍스트 방장',
  'e8000000-0000-4000-8000-000000000003',
  'cursor 뒤의 공개 원문입니다.',
  timezone('utc', now()) - interval '1 minute'
);

create temporary table public_frame on commit drop as
select private.read_ai_public_session_frame(
  'e5000000-0000-4000-8000-000000000001', 0, 2
) as document;

select is(
  document #>> '{session,sessionId}',
  'e5000000-0000-4000-8000-000000000001',
  'frame is scoped to the requested session'
) from public_frame;
select is(
  document #>> '{session,pinnedPackVersionId}',
  'e3000000-0000-4000-8000-000000000001',
  'frame carries the room-pinned exact Pack version'
) from public_frame;
select is(
  (document #>> '{session,targetThroughSeq}')::bigint,
  2::bigint,
  'frame freezes the requested evaluation cursor'
) from public_frame;
select is(
  document -> 'baseWiki',
  'null'::jsonb,
  'base version zero has no committed Wiki'
) from public_frame;
select is(
  pg_catalog.jsonb_array_length(document -> 'participants'),
  2,
  'frame contains only current registered or actual participants'
) from public_frame;
select is(
  (document #>> '{objectiveMetrics,actualParticipantCount}')::integer,
  1,
  'objective metrics distinguish actual participation'
) from public_frame;
select is(
  (document #>> '{objectiveMetrics,connectedParticipantCount}')::integer,
  0,
  'objective metrics use durable heartbeat facts instead of Presence guesses'
) from public_frame;

create temporary table public_prep on commit drop as
select private.read_ai_public_prep(
  'e5000000-0000-4000-8000-000000000001', null
) as document;

select is(
  pg_catalog.jsonb_array_length(document),
  1,
  'PUBLIC prep reader omits AI_PRIVATE rows'
) from public_prep;
select is(
  document #>> '{0,visibility}',
  'PUBLIC',
  'prep projection fixes visibility to PUBLIC'
) from public_prep;
select is(
  document #>> '{0,body}',
  '공개된 사전 질문입니다.',
  'PUBLIC prep original body is materialized'
) from public_prep;
select ok(
  document::text not like '%AI_PRIVATE_CANARY_DB_CONTEXT_MUST_NOT_LEAK%',
  'AI_PRIVATE canary is absent from the PUBLIC projection'
) from public_prep;
select is(
  pg_catalog.jsonb_array_length(private.read_ai_public_prep(
    'e5000000-0000-4000-8000-000000000001',
    array['e6000000-0000-4000-8000-000000000002']::uuid[]
  )),
  0,
  'an exact AI_PRIVATE prep id still cannot cross the PUBLIC function'
);

create temporary table public_messages on commit drop as
select private.read_ai_public_messages(
  'e5000000-0000-4000-8000-000000000001', 1, 2, 20
) as document;

select is(
  pg_catalog.jsonb_array_length(document),
  2,
  'message window returns only Raw Data through the cursor'
) from public_messages;
select is(
  document #>> '{1,seqNo}',
  '2',
  'message window preserves session sequence order'
) from public_messages;
select is(
  pg_catalog.jsonb_array_length(private.read_ai_public_messages_by_ids(
    'e5000000-0000-4000-8000-000000000001',
    array[
      'e7000000-0000-4000-8000-000000000001',
      'e7000000-0000-4000-8000-000000000003'
    ]::uuid[],
    2
  )),
  1,
  'exact lookup filters a known future message by cursor'
);
select is(
  private.read_ai_public_messages_by_ids(
    'e5000000-0000-4000-8000-000000000001',
    array['e7000000-0000-4000-8000-000000000001']::uuid[],
    2
  ) #>> '{0,messageId}',
  'e7000000-0000-4000-8000-000000000001',
  'exact lookup materializes the original message identity'
);
select is(
  pg_catalog.jsonb_array_length(private.read_ai_public_messages_by_ids(
    'e5000000-0000-4000-8000-000000000099',
    array['e7000000-0000-4000-8000-000000000001']::uuid[],
    2
  )),
  0,
  'exact lookup cannot resolve a message through another session id'
);

select throws_ok(
  $$
    select private.read_ai_public_session_frame(
      'e5000000-0000-4000-8000-000000000001', 0, 4
    )
  $$,
  '22023',
  'ai_context_cursor_ahead',
  'a context cursor cannot run ahead of committed Raw Data'
);
select throws_ok(
  $$
    select private.read_ai_public_session_frame(
      'e5000000-0000-4000-8000-000000000001', 1, 2
    )
  $$,
  'P0002',
  'ai_context_base_wiki_not_found',
  'a requested base Wiki must exist in the same session'
);
select throws_ok(
  $$
    select private.read_ai_public_messages(
      'e5000000-0000-4000-8000-000000000001', 0, 2, 20
    )
  $$,
  '22023',
  'invalid_ai_message_range',
  'invalid Raw Data ranges fail closed'
);

select * from finish();
rollback;
