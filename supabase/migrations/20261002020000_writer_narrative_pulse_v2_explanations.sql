alter table public.writer_narrative_pulse_points
  add column if not exists dimensions jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

comment on column public.writer_narrative_pulse_points.dimensions is
  'Versioned explanatory dimensions for Narrative Pulse; never the canonical screenplay.';
comment on column public.writer_narrative_pulse_points.evidence is
  'Short provider excerpts supporting the point; historical rows remain empty.';
