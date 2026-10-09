UPDATE public.survey_questions
SET options = (
  SELECT jsonb_agg(CASE WHEN o->>'value' = 'rotating' THEN o || '{"builder": true}'::jsonb ELSE o END ORDER BY ord)
  FROM jsonb_array_elements(options) WITH ORDINALITY AS t(o, ord)
)
WHERE id = 'a71ecf9a-f38e-4361-859d-585652b2a9f9';