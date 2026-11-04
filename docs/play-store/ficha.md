# Ficha de Google Play: textos e imágenes

Imágenes en esta carpeta, listas para subir:

| Archivo | Uso en Play Console |
|---|---|
| `01-inicio.png` … `08-clinica-dar-turno.png` | Capturas de teléfono (8, 1080×1920, 9:16). Orden sugerido = el del nombre. |
| `imagen-destacada-1024x500.png` | Imagen destacada (1024×500). |
| `public/icon-512.png` (en la raíz del repo) | Ícono de la app (512×512). |

Las capturas se sacaron con Playwright sobre la app real con datos ficticios (Supabase falso de `responsive-audit/` en la rama `ccr-0e8ed04d-7s0u4l`, con nombres y montos prolijos). Si cambia mucho la interfaz, conviene rehacerlas.

Borrador para cargar en Play Console (Presencia en Play Store → Ficha principal). Solo afirmaciones que el producto cumple hoy (mismas fuentes que `LANDING_FAQ` en `src/lib/landing-content.ts`). **Sin precios, planes ni "pagá en la web"**: la política de pagos de Play no permite dirigir a pagar fuera de Play desde la app ni su ficha.

## Nombre de la app (máx. 30)

```
KineFlow: Agenda y pacientes
```

## Descripción corta (máx. 80)

```
Agenda, pacientes, evoluciones y cobros para kinesiólogos y clínicas.
```

## Descripción completa (máx. 4000)

```
KineFlow es el sistema de gestión para kinesiólogos y clínicas de rehabilitación de Argentina. Agenda, reservas online, historia clínica de cada paciente y cobros, todo en un solo lugar y desde el celular.

AGENDA Y TURNOS
• Vista por día, semana y mes, con los turnos de cada paciente.
• Marcá "Asistió" o "No asistió" en un toque y registrá el cobro.
• Turnos en serie: repetí un turno los días que elijas y KineFlow saltea feriados y horarios ocupados.
• Bloqueá días y definí tus horarios de atención.

RESERVAS ONLINE
• Compartí tu link de reservas o tu código QR.
• El paciente ve tus horarios libres, elige uno y el turno aparece en tu agenda, sin coordinar por mensajes.

RECORDATORIOS POR WHATSAPP
• A los pacientes que aceptan recibirlos les llega la confirmación del turno y un recordatorio 24 horas antes.

HISTORIA CLÍNICA
• Evaluación inicial completa: antecedentes, medicación, estudios complementarios con archivos adjuntos, anamnesis, evaluación funcional y tratamiento inicial.
• Mapa corporal para marcar la zona a tratar.
• Evolución de cada sesión en segundos, desde la agenda.
• Tratamientos con control de sesiones y órdenes médicas con aviso cuando hay que renovarlas.

OBRAS SOCIALES Y ART
• Registrá la obra social o ART y el número de afiliado de cada turno.
• Descargá en Excel las sesiones para rendir.

CLÍNICAS CON VARIOS PROFESIONALES
• Cada profesional con su agenda y sus horarios.
• Cuentas de recepción para dar turnos.
• Reportes de sesiones e ingresos por profesional.

EMPEZÁ RÁPIDO
• Importá tus pacientes desde Excel o CSV y usá la agenda el mismo día.

TUS DATOS, PROTEGIDOS
• Solo vos o, en una clínica, el equipo según los permisos de cada uno ve los datos de los pacientes.
• Tu página pública de reservas muestra tu perfil y tus horarios libres, nunca datos de pacientes.

KineFlow funciona también desde la computadora en www.kineflow.ar, con la misma cuenta.

Contacto: contacto@kineflow.ar
```

## Categoría

Recomendado: **Medicina** (Medical). Es donde buscan los profesionales de la salud y, como la app maneja historias clínicas, igual hay que completar la declaración de apps de salud. Alternativa: **Empresa** (Business).

## Etiquetas sugeridas

Agenda, Gestión de pacientes, Historia clínica, Turnos, Kinesiología.
