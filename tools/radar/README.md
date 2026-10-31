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

Google News y la App Store no piden clave.

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
0 8 * * 1  cd /ruta/a/tools/radar && REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=yyy YOUTUBE_API_KEY=www ANTHROPIC_API_KEY=zzz .venv/bin/python radar.py --max-posts 200 >> radar.log 2>&1
```

Mejor que dejar las claves en el crontab: guardarlas en un archivo `radar.env` con permisos `600` (`export REDDIT_CLIENT_ID=...`, una por línea) y usar `. ./radar.env && .venv/bin/python radar.py`. Cron usa la hora del sistema; revisala con `date`.

## Tests

```bash
.venv/bin/python -m pytest -q
```

Son sin red: filtro, fuentes con respuestas de ejemplo (YouTube, Google News, App Store), parseo y validación del JSON (con un cliente de Claude falso para los reintentos), deduplicación en SQLite y comparación semanal del reporte.
