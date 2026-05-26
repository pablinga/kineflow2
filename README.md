# KineFlow

Aplicación web inicial para gestión clínica de kinesiólogos, creada con Next.js 15, React, TypeScript, TailwindCSS y Supabase.

## Pantallas incluidas

- Home pública moderna con hero, beneficios, cómo funciona, CTA y footer.
- Login.
- Registro.
- Dashboard responsive con bienvenida, métricas, accesos rápidos, turnos y pacientes mockeados.

## Configuración local

1. Instalá dependencias:

```bash
npm install
```

2. Creá `.env.local` a partir de `.env.example` y completá las credenciales de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

3. Iniciá el entorno local:

```bash
npm run dev
```

La app quedará disponible en `http://localhost:3000`.
