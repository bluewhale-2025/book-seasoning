begin;

set local search_path = public, extensions;

select plan(5);

select has_function(
  'private',
  'commit_public_evaluation_candidate',
  array[
    'uuid', 'integer', 'text', 'integer', 'bigint', 'text', 'jsonb', 'text',
    'jsonb'
  ],
  'the public Evaluator commit boundary exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.commit_public_evaluation_candidate(uuid,integer,text,integer,bigint,text,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot commit Evaluator results'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_public_evaluation_candidate(uuid,integer,text,integer,bigint,text,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'the worker can use the Evaluator commit boundary'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_evaluations', 'SELECT'
  ),
  'the worker still cannot bypass function-level evaluation access'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_evaluations', 'INSERT'
  ),
  'the worker cannot directly insert canonical Evaluator output'
);

select * from finish();
rollback;
