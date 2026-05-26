# Supabase schema

Para crear las tablas iniciales de KineFlow:

1. Abrí tu proyecto en Supabase.
2. Entrá a **SQL Editor**.
3. Copiá el contenido de `supabase/migrations/202605260001_initial_clinical_schema.sql`.
4. Pegalo y ejecutalo.

Incluye:

- `profiles`
- `patients`
- `appointments`
- `evolutions`
- índices
- triggers de `updated_at`
- trigger para crear perfil al registrar usuario
- Row Level Security para aislar datos por kinesiólogo
