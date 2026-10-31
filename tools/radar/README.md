# Radar de dolores

Junta quejas y necesidades locales (Reddit Argentina, o un txt propio), filtra las que suenan a dolor, las clasifica con Claude y arma `reporte.md` con los temas de la semana, ordenados por frecuencia y potencial, comparados con la semana anterior.

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
| `ANTHROPIC_API_KEY` | Para clasificar (no hace falta con `--dry`). |

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

## Agendarlo semanalmente (cron)

`crontab -e` y, por ejemplo, los lunes a las 8:00:

```cron
0 8 * * 1  cd /ruta/a/tools/radar && REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=yyy ANTHROPIC_API_KEY=zzz .venv/bin/python radar.py --max-posts 200 >> radar.log 2>&1
```

Mejor que dejar las claves en el crontab: guardarlas en un archivo `radar.env` con permisos `600` (`export REDDIT_CLIENT_ID=...`, una por línea) y usar `. ./radar.env && .venv/bin/python radar.py`. Cron usa la hora del sistema; revisala con `date`.

## Tests

```bash
.venv/bin/python -m pytest -q
```

Son sin red: filtro, parseo y validación del JSON (con un cliente de Claude falso para los reintentos), deduplicación en SQLite y comparación semanal del reporte.
