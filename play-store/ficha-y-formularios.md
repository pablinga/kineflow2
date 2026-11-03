# KineFlow en Google Play: ficha y formularios

Material para copiar en Play Console. Las capturas están en `play-store/capturas/` (1080×1920) y la imagen destacada en `play-store/imagen-destacada-1024x500.png`. El ícono es `public/icon-512.png`.

Todas las capturas son de la app real con datos ficticios: no aparece ningún paciente real.

---

## 1. Ficha principal de la tienda

**Nombre de la app** (máx. 30): `KineFlow`

**Descripción breve** (máx. 80, tiene 73):

```
Agenda, pacientes, evoluciones y cobros para kinesiólogos y consultorios.
```

**Descripción completa** (máx. 4000):

```
KineFlow es el sistema de gestión para kinesiólogos y clínicas de rehabilitación de Argentina. Turnos, pacientes, evoluciones y cobros en un solo lugar, desde el celular.

AGENDA Y TURNOS
• Agenda por día, semana y mes.
• Al dar un turno ves solo tus horarios libres.
• Turnos en serie: repetí un turno varios días de la semana. Los feriados y los horarios ocupados se saltean solos.
• Marcá "Asistió" o "No asistió" en un toque, con opción de deshacer.
• Tipos de atención con duración y precio precargados.

RESERVAS ONLINE
• Compartí tu link de reservas o tu código QR. El paciente elige un horario libre y el turno aparece en tu agenda, sin coordinar por mensajes.
• Página pública con tu perfil: tratamientos, localidad y obras sociales.

RECORDATORIOS POR WHATSAPP
• Confirmación del turno y recordatorio 24 horas antes, solo a los pacientes que aceptan recibirlos.
• Menos ausencias y menos mensajes escritos a mano.

FICHA DEL PACIENTE
• Datos, cobertura y número de afiliado.
• Evaluación kinésica con mapa corporal para marcar las zonas a tratar.
• Tratamientos y evolución de cada sesión, con nivel de dolor.
• Órdenes médicas y autorizaciones: sesiones usadas, vencimientos y avisos para renovar.
• Archivos adjuntos (estudios, órdenes).
• Importá tus pacientes desde Excel o CSV.

COBROS Y REPORTES
• Registrá el cobro de cada sesión y mirá lo pendiente.
• Reportes de sesiones por obra social o ART para rendir, descargables en Excel.
• Inicio con indicadores: turnos de la semana, ocupación de la agenda, asistencia del mes e ingresos por semana.

PARA CLÍNICAS Y CONSULTORIOS
• Profesionales sin límite, cada uno con su agenda y sus horarios.
• Cuentas de recepción para dar turnos.
• Permisos por rol: cada profesional ve a sus pacientes.

PRIVACIDAD
• Los datos de tus pacientes los ven solo vos y, en una clínica, el equipo según los permisos de cada uno.
• Toda la comunicación viaja cifrada.
• KineFlow no usa los datos de salud de los pacientes para publicidad ni los vende.

Notificaciones: resumen diario de tus turnos en el celular.

Para usar la app necesitás una cuenta de KineFlow. Podés crearla en www.kineflow.ar.

Contacto: contacto@kineflow.ar
```

> A propósito no aparecen precios, la prueba gratuita ni los pagos: la política de pagos de Play no permite dirigir a pagar fuera de la app, y en la app ya está oculto el checkout.

**Recursos gráficos**
| Campo | Archivo |
|---|---|
| Ícono (512×512) | `public/icon-512.png` |
| Imagen destacada (1024×500) | `play-store/imagen-destacada-1024x500.png` |
| Capturas de teléfono (subirlas en este orden) | `play-store/capturas/01-agenda.png` … `07-indicadores.png` |
| Capturas de tablet | Opcionales. Se pueden subir las mismas; Play solo las muestra en tablets. |

---

## 2. Configuración de la tienda

- **Tipo de app:** App · **Categoría:** Medicina (alternativa: Empresa).
- **Etiquetas** (hasta 5): elegí las más cercanas de la lista de Play, por ejemplo "Gestión de citas", "Historias clínicas", "Productividad".
- **Mail:** `contacto@kineflow.ar` · **Sitio web:** `https://www.kineflow.ar` · **Teléfono:** opcional (no lo cargues si no querés que sea público).

---

## 3. Contenido de la app (*Política → Contenido de la app*)

### Política de privacidad
`https://www.kineflow.ar/politica-de-privacidad`

### Acceso a la app (importante)
Los revisores de Google necesitan entrar. Elegí **"Todas o algunas funciones están restringidas"** y cargá la cuenta de prueba de producción:

- Usuario: `revision.play@kineflow.ar`
- Contraseña: la que se pasó por el chat (no se guarda en el repo).

Es una cuenta de kinesióloga particular ("Paula Medina") con prueba activa hasta 2031, 8 pacientes ficticios, turnos desde 3 semanas antes hasta 6 semanas después de su creación (2026-11-03), una evaluación con mapa corporal, un tratamiento y evoluciones. Los pacientes no tienen consentimiento de WhatsApp, así que no se envía ningún mensaje.

Instrucciones para el revisor:
```
Iniciá sesión con el email y la contraseña indicados. La cuenta es de un kinesiólogo particular con pacientes y turnos ficticios. Desde el menú inferior se accede a Agenda, Pacientes e Ingresos.
```

### Anuncios
**No**, la app no contiene anuncios.

### Clasificación de contenido (cuestionario IARC)
- Categoría: **"Todas las demás apps"** (utilidad, productividad, comunicación…).
- Violencia, sexo, lenguaje, drogas, apuestas: **No** en todas.
- ¿Los usuarios pueden interactuar o intercambiar contenido entre sí?: **No.** Los recordatorios por WhatsApp son mensajes automáticos del sistema al paciente, no un chat.
- ¿Comparte la ubicación del usuario?: **No.**
- ¿Permite compras digitales?: **No.**
- ¿Acceso irrestricto a internet?: **No** (solo abre kineflow.ar).

Resultado esperado: apta para todo público.

### Público objetivo
**18 años o más** (solo esa franja). La app no está dirigida a niños.

### Apps de salud (declaración)
- Marcá que la app tiene funciones de salud, en la categoría de **gestión de servicios de salud / historias clínicas** (el nombre exacto depende de la lista de Play: buscá la que habla de gestión clínica o de servicios de atención de salud).
- **No** es un dispositivo médico, **no** da diagnósticos ni recomendaciones de tratamiento, y **no** está conectada a sensores ni a Health Connect.
- La usan profesionales de la salud para registrar la atención de sus pacientes.

### Funciones financieras
**Mi app no ofrece ninguna función financiera.** Registrar cobros de sesiones es administración del consultorio, no un servicio financiero.

### App gubernamental / noticias / COVID-19
**No** en las tres.

### Seguridad de los datos

**Preguntas generales**
| Pregunta | Respuesta |
|---|---|
| ¿Tu app recopila o comparte alguno de los tipos de datos del usuario requeridos? | **Sí** |
| ¿Todos los datos se encriptan en tránsito? | **Sí** |
| ¿Ofrecés una forma de solicitar que se borren los datos? | **Sí** · `https://www.kineflow.ar/eliminar-cuenta` |

**Datos compartidos:** marcá **ninguno**. Supabase, Vercel, Resend, Meta (WhatsApp), Cloudflare y Mercado Pago procesan datos *por cuenta* de KineFlow, y Play no cuenta eso como "compartir".

**Datos recopilados** (todos: *no* se procesan de forma efímera):

| Tipo de dato en Play | ¿Por qué? | Obligatorio | Finalidad |
|---|---|---|---|
| Información personal → **Nombre** | Cuenta del profesional y pacientes | Obligatorio | Funcionalidad de la app, Gestión de la cuenta |
| Información personal → **Dirección de correo electrónico** | Login y avisos | Obligatorio | Funcionalidad de la app, Gestión de la cuenta, Comunicaciones del desarrollador |
| Información personal → **ID de usuario** | Identificador de la cuenta | Obligatorio | Funcionalidad de la app, Gestión de la cuenta |
| Información personal → **Número de teléfono** | Teléfono del profesional y de pacientes (recordatorios) | Opcional | Funcionalidad de la app |
| Información personal → **Dirección** | Dirección visible del perfil público | Opcional | Funcionalidad de la app |
| Información personal → **Otra información** | DNI del paciente, matrícula profesional | Opcional | Funcionalidad de la app |
| Salud y actividad física → **Información de salud** | Evaluaciones, evoluciones, tratamientos, órdenes médicas | Opcional | Funcionalidad de la app |
| Información financiera → **Otra información financiera** | Cobros de sesiones que registra el profesional | Opcional | Funcionalidad de la app |
| Información financiera → **Historial de compras** | Estado del plan de KineFlow | Obligatorio | Gestión de la cuenta |
| Fotos y videos → **Fotos** | Fotos de órdenes y estudios adjuntos | Opcional | Funcionalidad de la app |
| Archivos y documentos → **Archivos y documentos** | PDF de órdenes y estudios | Opcional | Funcionalidad de la app |
| Actividad en la app → **Interacciones con la app** | Vercel Analytics (páginas vistas, sin cookies) | Obligatorio | Estadísticas |
| Información y rendimiento de la app → **Otros datos de rendimiento** | Speed Insights (velocidad de carga) | Obligatorio | Estadísticas |
| ID de dispositivo u otros IDs → **ID de dispositivo u otros** | Suscripción a notificaciones push | Opcional | Funcionalidad de la app |

No se recopila: ubicación, contactos del teléfono, calendario, mensajes, audio, búsquedas web ni apps instaladas.

---

## 4. Pendientes antes de enviar a revisión

1. **Cuenta para el revisor:** creada (ver "Acceso a la app"). Probar el login una vez desde el celular. Los turnos futuros llegan hasta mediados de diciembre de 2026: si la revisión de una versión nueva cae después, cargar turnos nuevos.
2. **Huellas SHA-256:** después de subir el primer `.aab`, pasame las dos huellas y las cargo en Vercel.
3. **Prueba cerrada:** si la cuenta de Play Console es personal, hace falta una prueba cerrada con 12 testers durante 14 días antes de pasar a producción.
