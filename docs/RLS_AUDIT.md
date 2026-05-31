# Auditoria RLS

## Alcance

Tablas sensibles revisadas:

- `profiles`
- `patients`
- `appointments`
- `evolutions`
- `clinics`
- `clinic_professionals`
- `clinic_professional_availability`
- `subscriptions`
- `payment_events`

`plans` tiene RLS activo, pero no contiene datos personales: se permite lectura de planes activos a usuarios autenticados.

## Estado esperado

Todas las tablas sensibles tienen RLS activo. La migracion `202606010001_harden_rls_ownership.sql` tambien fuerza RLS para reducir riesgos si una conexion privilegiada usa el rol propietario por error.

Reglas principales:

- Un kinesiólogo solo puede leer y operar pacientes propios (`owner_id = auth.uid()`).
- Turnos propios quedan vinculados al `owner_id` del kinesiólogo y a pacientes propios.
- Evoluciones propias quedan vinculadas al `owner_id` y a pacientes accesibles por el usuario autenticado.
- Consultorios solo administran sus propias clinicas y vinculos.
- Suscripciones solo se leen por `account_id = auth.uid()`.
- Eventos de pago no tienen policies de lectura para usuarios finales.

## Service role

Las APIs que usan service role deben validar primero el token del usuario con el cliente normal de Supabase y luego filtrar cada operacion por el usuario autenticado. La ruta de baja de suscripcion filtra por `account_id = user.id` antes de actualizar registros.

El webhook de Mercado Pago usa service role porque no hay usuario logueado en esa llamada. La asociacion se resuelve por `external_reference`, suscripcion existente o email unico de perfil, y registra logs sin payload clinico.

## Verificacion QA

Para validar aislamiento entre usuarios contra `kineflow-qa`:

```bash
npm run test:rls
```

Requiere estas variables apuntando a QA:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

El script crea dos usuarios temporales, inserta datos con Usuario A e intenta leer y editar esos datos con Usuario B. Luego elimina los usuarios temporales.
