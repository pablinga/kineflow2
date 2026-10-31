# Radar de dolores

Junta quejas y necesidades locales (Reddit Argentina, comentarios de YouTube, titulares de Google News, reseñas malas de la App Store, o un txt propio), filtra las que suenan a dolor, las clasifica con Claude y arma `reporte.md` con los temas de la semana, ordenados por frecuencia y potencial, comparados con la semana anterior.

> Una queja repetida no prueba que la gente esté dispuesta a pagar: el reporte es una lista de pistas para ir a validar.

## Instalación

```bash
cd tools/radar
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Variables de entorno

| Variable | Para qué |
| --- | --- |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | API oficial de Reddit. Crear una app tipo **script** en https://www.reddit.com/prefs/apps (el id es el texto debajo del nombre de la app). Si faltan, el script corta con un mensaje (salvo con `--file`). |
| `REDDIT_USER_AGENT` | Opcional. Reddit pide algo como `python:radar-dolores:0.2 (by /u/tu_usuario)`. |
| `YOUTUBE_API_KEY` | Fuente `youtube`. Crear un proyecto en https://console.cloud.google.com, activar **YouTube Data API v3** y crear una clave de API (conviene restringirla a esa API). Gratis hasta 10.000 unidades por día. Si falta, el script corta con un mensaje; para no usar YouTube poné `enabled: false`. |
| `ANTHROPIC_API_KEY` | Para clasificar (no hace falta con `--dry`). |

| `RADAR_EMAIL_TO` | Opcional. Si está, al terminar manda el reporte por mail (con `dashboard.html` adjunto). Varios destinatarios separados por coma. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `RADAR_EMAIL_FROM` | Servidor para el mail. Puerto 587 (STARTTLS, por defecto) o 465 (SSL). `RADAR_EMAIL_FROM` es opcional (por defecto, `SMTP_USER`). Ejemplos: Gmail → `smtp.gmail.com`, tu cuenta y una [contraseña de aplicación](https://myaccount.google.com/apppasswords); Resend → `smtp.resend.com`, usuario `resend`, contraseña = API key y un remitente de un dominio verificado. |

Google News y la App Store no piden clave. Si `RADAR_EMAIL_TO` está pero falta algún dato del SMTP, el script corta antes de gastar en Claude; si el envío falla (red, contraseña), avisa y el reporte queda guardado igual. `--no-email` saltea el mail.

## Uso

```bash
.venv/bin/python radar.py                     # baja Reddit, clasifica lo nuevo y arma reporte.md
.venv/bin/python radar.py --dry               # solo baja y filtra; dice cuántos se clasificarían
.venv/bin/python radar.py --max-posts 50      # tope de posts a clasificar en esta corrida (costo)
.venv/bin/python radar.py --file quejas.txt   # quejas manuales, una por línea
```

- Subreddits, búsquedas, palabras de dolor, modelo, tamaño de lote, reintentos y pausas se configuran en `config.yaml`.
- Todo queda en `radar.db` (SQLite): posts (texto, subreddit, url, fecha) y clasificaciones. No se guardan usernames. Un post ya clasificado no se vuelve a mandar a Claude, aunque aparezca en otra búsqueda o en otra corrida.
- Solo se clasifican los posts de los últimos 14 días (la semana del reporte y la anterior), los más nuevos primero, hasta `max_posts`.
- Si Claude devuelve un JSON roto o con campos faltantes, se reintenta solo con los posts que faltan (`max_retries`). Los que siguen fallando quedan para la próxima corrida.
- Para sumar otra fuente: escribir `fetch_<fuente>(cfg)` en `radar.py`, que devuelva posts con `{id, fuente, texto, url, fecha}`, registrarla en `SOURCES` y agregar su bloque en `config.yaml` bajo `sources:`.

## Qué genera

Todo en esta carpeta (o donde apunte `--out`):

- `reporte.md`: el reporte de la última corrida. Arriba, la comparación con la semana anterior (temas nuevos y que crecen).
- `reportes/AAAA-MM-DD.md`: una copia de cada corrida, para mirar semanas viejas.
- `dashboard.html`: se abre con doble clic en el navegador (no necesita internet). Muestra las últimas 8 semanas (`dashboard_weeks`): menciones por semana y fuente, y cada tema con su estado (nuevo, crece, estable, baja), su evolución, potencial, cuántos ya pagan y ejemplos con link.
- `radar.db`: la base con todo el historial.

## Fuentes

| Fuente | Qué trae | Notas |
| --- | --- | --- |
| `reddit` | Posts de las búsquedas en cada subreddit | API oficial (PRAW). |
| `youtube` | Comentarios de videos de los últimos `video_days` días que coinciden con las búsquedas, región AR | Cada búsqueda gasta 100 unidades de cuota y cada video 1: con la config de ejemplo son ~630 por corrida. Si se agota la cuota, sigue con lo que bajó. Los datos de YouTube se borran de la base a los `retention_days` (30) días, para respetar las políticas de su API. |
| `news` | Titulares de Google News (RSS) de los últimos `days` días | Dan contexto (problemas grandes); rinden menos como "yo pagaría por esto". |
| `appstore` | Reseñas de hasta `max_rating` estrellas de las apps listadas | Saltean el filtro de palabras (`filter: false`): una reseña de 1–2 estrellas ya es una queja. Hay que cargar las apps: `python radar.py --find-app "mi argentina"` lista nombre e id para pegar en `config.yaml`. |

En ninguna fuente se guardan nombres de autor.

## Agendarlo semanalmente (cron)

`crontab -e` y, por ejemplo, los lunes a las 8:00:

```cron
0 8 * * 1  cd /ruta/a/tools/radar && . ./radar.env && .venv/bin/python radar.py --max-posts 200 >> radar.log 2>&1
```

Las claves van en `radar.env` (está en `.gitignore`), con permisos `600` (`chmod 600 radar.env`):

```bash
export REDDIT_CLIENT_ID=...
export REDDIT_CLIENT_SECRET=...
export YOUTUBE_API_KEY=...
export ANTHROPIC_API_KEY=...
export RADAR_EMAIL_TO=vos@tumail.com
export SMTP_HOST=smtp.gmail.com
export SMTP_USER=vos@gmail.com
export SMTP_PASSWORD=contraseña-de-aplicacion
```

Cron usa la hora del sistema; revisala con `date`. Si la compu está apagada a esa hora, esa semana no corre (en una Mac que duerme, `launchd` es más confiable que cron).

## Tests

```bash
.venv/bin/python -m pytest -q
```

Son sin red: filtro, fuentes con respuestas de ejemplo (YouTube, Google News, App Store), parseo y validación del JSON (con un cliente de Claude falso para los reintentos), deduplicación en SQLite, comparación semanal del reporte, copia fechada, dashboard (semanas, estados, que un texto de internet no pueda inyectar código) y mail con un servidor SMTP falso.
