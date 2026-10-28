-- ============================================================
-- Origen: 202606150001_add_evolution_strength_notes.sql
-- ============================================================
alter table public.evolutions
  add column if not exists strength_notes text;


