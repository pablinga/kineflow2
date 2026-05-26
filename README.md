# KineFlow

Aplicacion web inicial para gestion clinica de kinesiologos, creada con Next.js 15, React, TypeScript, TailwindCSS y Supabase.

## Pantallas incluidas

- Home publica con hero, beneficios, planes, como funciona, CTA y footer.
- Login.
- Registro.
- Dashboard responsive con bienvenida, metricas, accesos rapidos, turnos y pacientes.

## Configuracion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y completa las credenciales publicas de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=example-public-anon-key
```

No uses `NEXT_PUBLIC_` para secretos privados. Las recomendaciones para cargar variables en Vercel estan en `SECURITY.md`.

3. Inicia el entorno local:

```bash
npm run dev
```

La app queda disponible en `http://localhost:3000`.
