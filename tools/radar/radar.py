"""Radar de dolores: junta quejas/necesidades locales y las agrupa por tema.

Uso:
  python radar.py                      # baja posts de Reddit, clasifica lo nuevo y arma el reporte
  python radar.py --file quejas.txt    # usa un txt propio (una queja por linea)
  python radar.py --dry                # solo descarga y filtro por palabras, sin API de Claude
  python radar.py --max-posts 50       # tope de posts nuevos a clasificar (costo)

  python radar.py --find-app "mi argentina"   # busca el id de una app de la App Store

Variables de entorno: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET (Reddit), REDDIT_USER_AGENT (opcional),
YOUTUBE_API_KEY (YouTube), ANTHROPIC_API_KEY (para clasificar).
Salida: radar.db (SQLite), reporte.md y posts.json (los que pasaron el filtro en esta corrida).
"""
import argparse, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import yaml

import store

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_USER_AGENT = "python:radar-dolores:0.2 (uso personal)"
WEEK = timedelta(days=7)


def load_config(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


# --- Fuentes -----------------------------------------------------------------
# Cada fuente es una función fetch_<fuente>(cfg_fuente) que devuelve una lista de posts con la
# misma estructura: {"id", "fuente", "texto", "url", "fecha"} (fecha ISO UTC). Sin datos de autor.
# Para sumar una fuente: escribir la función y agregarla a SOURCES y a config.yaml.

def fetch_reddit(cfg):
    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Faltan credenciales de Reddit: definí REDDIT_CLIENT_ID y REDDIT_CLIENT_SECRET "
                 "(app tipo 'script' en https://www.reddit.com/prefs/apps). Ver README.md. "
                 "Para probar sin Reddit usá --file.")
    import praw, prawcore
    reddit = praw.Reddit(client_id=client_id, client_secret=client_secret,
                         user_agent=os.environ.get("REDDIT_USER_AGENT") or DEFAULT_USER_AGENT)
    reddit.read_only = True
    posts, seen = [], set()
    for sub in cfg["subreddits"]:
        for q in cfg["queries"]:
            try:
                results = list(reddit.subreddit(sub).search(
                    q, sort=cfg.get("sort", "new"), time_filter=cfg.get("time_filter", "month"),
                    limit=cfg.get("limit_per_query", 25)))
            except prawcore.exceptions.ResponseException as e:
                if e.response.status_code == 401:
                    sys.exit("Reddit rechazó las credenciales (401): revisá REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.")
                print(f"[warn] {sub}/{q}: {e}", file=sys.stderr)
                results = []
            except prawcore.exceptions.PrawcoreException as e:
                print(f"[warn] {sub}/{q}: {e}", file=sys.stderr)
                results = []
            for s in results:
                pid = f"reddit_{s.id}"
                if pid in seen:
                    continue
                seen.add(pid)
                posts.append({"id": pid, "fuente": f"r/{sub}",
                              "texto": f"{s.title}\n{s.selftext or ''}"[:1200],
                              "url": "https://reddit.com" + s.permalink,
                              "fecha": iso(datetime.fromtimestamp(s.created_utc, timezone.utc))})
            time.sleep(cfg.get("sleep_seconds", 2))  # no abusar
    return posts


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def http_error_reason(e):
    """Motivo de un error de las APIs de Google (ej. 'commentsDisabled', 'quotaExceeded')."""
    try:
        return json.loads(e.read().decode("utf-8"))["error"]["errors"][0]["reason"]
    except Exception:
        return ""


def parse_youtube_comments(data, video_id):
    out = []
    for t in data.get("items", []):
        top = t.get("snippet", {}).get("topLevelComment", {})
        sn = top.get("snippet", {})
        text = html.unescape(sn.get("textDisplay") or "").strip()
        if not text or not top.get("id"):
            continue
        out.append({"id": f"youtube_{top['id']}", "fuente": "youtube", "texto": text[:1200],
                    "url": f"https://www.youtube.com/watch?v={video_id}&lc={top['id']}",
                    "fecha": iso(datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00")))})
    return out


def fetch_youtube(cfg, get=http_get):
    """Comentarios de videos recientes que coinciden con las búsquedas (YouTube Data API v3).

    Cuota: cada búsqueda cuesta 100 unidades y cada página de comentarios 1 (10.000 por día gratis).
    """
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        sys.exit("Falta YOUTUBE_API_KEY para la fuente youtube (clave de la YouTube Data API v3 en "
                 "https://console.cloud.google.com/apis/credentials). Ver README.md, o poné "
                 "enabled: false en config.yaml.")
    api = "https://www.googleapis.com/youtube/v3/"
    since = iso(datetime.now(timezone.utc) - timedelta(days=cfg.get("video_days", 30))).replace("+00:00", "Z")
    sleep = cfg.get("sleep_seconds", 1)
    posts, seen_videos = [], set()
    for q in cfg["queries"]:
        params = {"part": "snippet", "q": q, "type": "video", "regionCode": cfg.get("region", "AR"),
                  "relevanceLanguage": cfg.get("language", "es"), "publishedAfter": since,
                  "maxResults": cfg.get("videos_per_query", 5), "order": "relevance", "key": key}
        try:
            found = json.loads(get(api + "search?" + urllib.parse.urlencode(params)))
        except urllib.error.HTTPError as e:
            reason = http_error_reason(e)
            if e.code == 400 and reason in ("keyInvalid", "badRequest"):
                sys.exit("YouTube rechazó YOUTUBE_API_KEY: revisá la clave.")
            if reason in ("quotaExceeded", "dailyLimitExceeded"):
                print("[warn] youtube: se terminó la cuota diaria; sigo con lo bajado", file=sys.stderr)
                break
            print(f"[warn] youtube/{q}: {e} {reason}", file=sys.stderr)
            continue
        except Exception as e:
            print(f"[warn] youtube/{q}: {e}", file=sys.stderr)
            continue
        time.sleep(sleep)
        for v in found.get("items", []):
            vid = v.get("id", {}).get("videoId")
            if not vid or vid in seen_videos:
                continue
            seen_videos.add(vid)
            params = {"part": "snippet", "videoId": vid, "maxResults": cfg.get("comments_per_video", 50),
                      "order": "time", "textFormat": "plainText", "key": key}
            try:
                data = json.loads(get(api + "commentThreads?" + urllib.parse.urlencode(params)))
                posts.extend(parse_youtube_comments(data, vid))
            except urllib.error.HTTPError as e:
                if http_error_reason(e) != "commentsDisabled":
                    print(f"[warn] youtube/{vid}: {e}", file=sys.stderr)
            except Exception as e:
                print(f"[warn] youtube/{vid}: {e}", file=sys.stderr)
            time.sleep(sleep)
    return posts


def parse_news_rss(xml_text):
    out = []
    for it in ET.fromstring(xml_text).iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link:
            continue
        medio = (it.findtext("source") or "").strip()
        guid = (it.findtext("guid") or link).strip()
        try:
            fecha = iso(parsedate_to_datetime(it.findtext("pubDate")))
        except (TypeError, ValueError):
            fecha = None
        out.append({"id": "news_" + hashlib.sha1(guid.encode("utf-8")).hexdigest()[:16],
                    "fuente": f"noticias/{medio}" if medio else "noticias",
                    "texto": title[:1200], "url": link, "fecha": fecha})
    return out


def fetch_news(cfg, get=http_get):
    """Titulares de Google News (RSS público) para cada búsqueda, de los últimos días."""
    posts, seen = [], set()
    for q in cfg["queries"]:
        params = {"q": f"{q} when:{cfg.get('days', 7)}d", "hl": cfg.get("hl", "es-419"),
                  "gl": cfg.get("gl", "AR"), "ceid": cfg.get("ceid", "AR:es-419")}
        try:
            items = parse_news_rss(get("https://news.google.com/rss/search?" + urllib.parse.urlencode(params)))
        except Exception as e:
            print(f"[warn] noticias/{q}: {e}", file=sys.stderr)
            items = []
        for p in items:
            if p["id"] not in seen:
                seen.add(p["id"])
                posts.append(p)
        time.sleep(cfg.get("sleep_seconds", 2))
    return posts


def parse_appstore_reviews(data, app, max_rating):
    entries = data.get("feed", {}).get("entry", [])
    if isinstance(entries, dict):  # con una sola reseña el feed no trae lista
        entries = [entries]
    out = []
    for e in entries:
        rating = e.get("im:rating", {}).get("label")
        if rating is None:  # la primera entrada a veces es la ficha de la app
            continue
        if int(rating) > max_rating:
            continue
        title = e.get("title", {}).get("label", "").strip()
        content = e.get("content", {}).get("label", "").strip()
        rid = e.get("id", {}).get("label")
        if not rid or not (title or content):
            continue
        updated = e.get("updated", {}).get("label")
        out.append({"id": f"appstore_{rid}", "fuente": f"appstore/{app['name']}",
                    "texto": f"[{app['name']}, {rating} estrellas] {title}\n{content}"[:1200],
                    "url": f"https://apps.apple.com/{app.get('country', 'ar')}/app/id{app['id']}",
                    "fecha": iso(datetime.fromisoformat(updated)) if updated else None})
    return out


def fetch_appstore(cfg, get=http_get):
    """Reseñas recientes de baja puntuación de apps de la App Store (feed RSS público de Apple)."""
    if not cfg.get("apps"):
        print("[warn] appstore: no hay apps en config.yaml (buscá ids con --find-app)", file=sys.stderr)
        return []
    country = cfg.get("country", "ar")
    posts = []
    for app in cfg["apps"]:
        app = {**app, "country": country}
        for page in range(1, cfg.get("pages", 2) + 1):
            url = (f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/"
                   f"id={app['id']}/sortby=mostrecent/json")
            try:
                batch = parse_appstore_reviews(json.loads(get(url)), app, cfg.get("max_rating", 2))
            except Exception as e:
                print(f"[warn] appstore/{app['name']}: {e}", file=sys.stderr)
                break
            posts.extend(batch)
            time.sleep(cfg.get("sleep_seconds", 2))
    return posts


def find_app(term, country="ar", get=http_get):
    """Busca apps en la App Store para completar config.yaml."""
    params = {"term": term, "country": country, "entity": "software", "limit": 8}
    data = json.loads(get("https://itunes.apple.com/search?" + urllib.parse.urlencode(params)))
    for r in data.get("results", []):
        print(f"- {{name: {r.get('trackName')}, id: {r.get('trackId')}}}   # {r.get('sellerName')}")
    if not data.get("results"):
        print("Sin resultados.")


SOURCES = {"reddit": fetch_reddit, "youtube": fetch_youtube, "news": fetch_news, "appstore": fetch_appstore}


def collect(cfg, pain):
    """Baja de todas las fuentes activas y aplica el filtro de dolor (salvo filter: false).

    Devuelve (total bajado, posts que pasan).
    """
    total, kept = 0, []
    for name, src_cfg in (cfg.get("sources") or {}).items():
        src_cfg = src_cfg or {}
        if not src_cfg.get("enabled", True):
            continue
        if name not in SOURCES:
            print(f"[warn] fuente desconocida en config.yaml: {name}", file=sys.stderr)
            continue
        posts = SOURCES[name](src_cfg)
        passed = prefilter(posts, pain) if src_cfg.get("filter", True) else posts
        print(f"  {name}: {len(posts)} bajados, {len(passed)} pasan el filtro")
        total += len(posts)
        kept.extend(passed)
    return total, kept


def from_file(path):
    """Una queja por línea. El id sale del texto, así la misma queja no se clasifica dos veces."""
    out, seen = [], set()
    for line in open(path, encoding="utf-8"):
        text = line.strip()
        if not text:
            continue
        pid = "manual_" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
        if pid in seen:
            continue
        seen.add(pid)
        out.append({"id": pid, "fuente": "manual", "texto": text[:1200], "url": "", "fecha": None})
    return out


# --- Filtro ------------------------------------------------------------------

def build_pain_regex(words):
    return re.compile("(" + "|".join(words) + ")", re.I)


def prefilter(posts, pain):
    return [p for p in posts if pain.search(p["texto"])]


# --- Clasificación -----------------------------------------------------------

PROMPT = """Sos un analista de oportunidades de negocio en Argentina.
Para cada texto devolvé un objeto JSON con: id, tema (2-4 palabras, genérico para poder agrupar),
rubro, dolor (1 frase), paga_hoy (true si ya paga o menciona pagar por una solución),
monetizable (1-5), motivo (1 frase corta). Si no es un dolor real, monetizable=0.
Respondé SOLO con una lista JSON.

TEXTOS:
"""

TEXT_FIELDS = ("tema", "rubro", "dolor", "motivo")


def validate_item(r):
    """Devuelve el objeto normalizado o None si le faltan campos o tienen tipos inválidos."""
    if not isinstance(r, dict) or r.get("id") is None:
        return None
    out = {"id": str(r["id"])}
    for k in TEXT_FIELDS:
        v = r.get(k)
        if not isinstance(v, str) or not v.strip():
            return None
        out[k] = v.strip()
    out["tema"] = out["tema"].lower()
    if not isinstance(r.get("paga_hoy"), bool):
        return None
    out["paga_hoy"] = r["paga_hoy"]
    m = r.get("monetizable")
    if isinstance(m, bool) or not isinstance(m, (int, float)) or m != int(m) or not 0 <= m <= 5:
        return None
    out["monetizable"] = int(m)
    return out


def parse_response(txt, expected_ids):
    """Extrae la lista JSON de la respuesta y devuelve {id: item válido} para los ids esperados."""
    m = re.search(r"\[.*\]", txt, re.S)
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, list):
        return {}
    expected = set(expected_ids)
    out = {}
    for r in data:
        item = validate_item(r)
        if item and item["id"] in expected:
            out[item["id"]] = item
    return out


def classify(posts, model, batch=15, max_retries=2, client=None):
    """Clasifica en lotes. Si la respuesta viene rota o incompleta, reintenta solo los que faltan."""
    if client is None:
        import anthropic
        client = anthropic.Anthropic()
    out, failed = [], []
    for i in range(0, len(posts), batch):
        pending = posts[i:i + batch]
        for attempt in range(max_retries + 1):
            body = "\n\n".join(f'[id={p["id"]}] {p["texto"][:600]}' for p in pending)
            msg = client.messages.create(model=model, max_tokens=4000,
                                         messages=[{"role": "user", "content": PROMPT + body}])
            txt = "".join(getattr(b, "text", "") for b in msg.content)
            got = parse_response(txt, [p["id"] for p in pending])
            out.extend(got.values())
            pending = [p for p in pending if p["id"] not in got]
            if not pending:
                break
            if attempt < max_retries:
                print(f"[warn] {len(pending)} sin clasificación válida, reintento {attempt + 1}", file=sys.stderr)
        failed.extend(pending)
    if failed:
        print(f"[warn] {len(failed)} posts quedaron sin clasificar; se reintentan en la próxima corrida",
              file=sys.stderr)
    return out


# --- Reporte -----------------------------------------------------------------

def group_by_tema(items, min_potential):
    g = defaultdict(list)
    for it in items:
        if it.get("monetizable", 0) >= min_potential:
            g[it["tema"].lower()].append(it)
    return g


def build_report(current, previous, min_potential=2, period=""):
    g = group_by_tema(current, min_potential)
    prev_counts = {t: len(xs) for t, xs in group_by_tema(previous, min_potential).items()}
    ranked = sorted(g.items(), key=lambda kv: (len(kv[1]),
                    sum(x["monetizable"] for x in kv[1])), reverse=True)
    nuevos = [t for t, _ in ranked if t not in prev_counts]
    crecen = [(t, prev_counts[t], len(xs)) for t, xs in ranked
              if t in prev_counts and len(xs) > prev_counts[t]]

    lines = ["# Radar de dolores", ""]
    if period:
        lines += [period, ""]
    lines += ["> **Ojo:** una queja repetida no prueba que la gente pague. Es una pista para ir a "
              "validar hablando con quienes tienen el problema, no una demanda comprobada.", "",
              "Ordenado por frecuencia y potencial (monetizable promedio).", ""]
    lines += ["## Comparación con la semana anterior", ""]
    lines.append("- Temas nuevos: " + (", ".join(nuevos) if nuevos else "ninguno"))
    lines.append("- Temas que crecen: " + (", ".join(f"{t} ({a} → {b})" for t, a, b in crecen)
                                          if crecen else "ninguno"))
    lines.append("")
    if not ranked:
        lines.append("Sin temas esta semana.")
    for tema, xs in ranked:
        pagan = sum(1 for x in xs if x.get("paga_hoy"))
        avg = sum(x["monetizable"] for x in xs) / len(xs)
        prev = prev_counts.get(tema)
        tag = "nuevo" if prev is None else f"semana anterior: {prev}"
        lines.append(f"## {tema} — {len(xs)} menciones, {pagan} ya pagan, potencial {avg:.1f}/5 ({tag})")
        for x in xs[:3]:
            lines.append(f"- {x['dolor']} ({x['rubro']}; {x.get('fuente', '')}) {x['url']}".rstrip())
        lines.append("")
    return "\n".join(lines) + "\n", len(ranked)


def report(conn, path, min_potential, now=None):
    now = now or datetime.now(timezone.utc)
    # +1 s: las fechas se guardan sin fracciones; un post cargado en este mismo segundo entra.
    cur = store.classified_between(conn, iso(now - WEEK), iso(now + timedelta(seconds=1)))
    prev = store.classified_between(conn, iso(now - 2 * WEEK), iso(now - WEEK))
    period = f"Semana del {(now - WEEK):%d/%m/%Y} al {now:%d/%m/%Y} (UTC)."
    text, n = build_report(cur, prev, min_potential, period)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Reporte: {path} ({n} temas)")


# --- Main --------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="txt con una queja por línea (en lugar de las fuentes de config.yaml)")
    ap.add_argument("--dry", action="store_true", help="solo descarga y filtra, sin llamar a Claude")
    ap.add_argument("--max-posts", type=int, help="tope de posts nuevos a clasificar")
    ap.add_argument("--config", default=os.path.join(HERE, "config.yaml"))
    ap.add_argument("--db", default=os.path.join(HERE, "radar.db"))
    ap.add_argument("--out", default=os.path.join(HERE, "reporte.md"))
    ap.add_argument("--find-app", metavar="NOMBRE", help="busca el id de una app de la App Store y sale")
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    if a.find_app:
        find_app(a.find_app, ((cfg.get("sources") or {}).get("appstore") or {}).get("country", "ar"))
        return

    pain = build_pain_regex(cfg["pain_words"])
    if a.file:
        posts = from_file(a.file)
        total, posts = len(posts), prefilter(posts, pain)
    else:
        total, posts = collect(cfg, pain)
    print(f"{total} posts bajados")
    print(f"{len(posts)} pasan el filtro de quejas")
    with open(os.path.join(os.path.dirname(a.out), "posts.json"), "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)

    conn = store.connect(a.db)
    for name, src_cfg in (cfg.get("sources") or {}).items():
        if src_cfg and src_cfg.get("retention_days"):
            n = store.purge_older_than(conn, f"{name}_", src_cfg["retention_days"])
            if n:
                print(f"{n} posts de {name} borrados por antigüedad (retention_days)")
    print(f"{store.save_posts(conn, posts)} nuevos en la base")
    # Solo vale la pena pagar por lo que entra en el reporte: esta semana y la anterior.
    cutoff = iso(datetime.now(timezone.utc) - 2 * WEEK)
    pending = [p for p in store.unclassified(conn, [p["id"] for p in posts]) if p["fecha"] >= cutoff]
    max_posts = a.max_posts if a.max_posts is not None else cfg.get("max_posts")
    if max_posts is not None and len(pending) > max_posts:
        print(f"{len(pending)} sin clasificar; se clasifican los {max_posts} más nuevos (--max-posts)")
        pending = pending[:max_posts]
    if a.dry:
        print(f"{len(pending)} se clasificarían (modo --dry: no se llama a Claude)")
        return
    if pending:
        items = classify(pending, cfg["model"], cfg.get("batch_size", 15), cfg.get("max_retries", 2))
        store.save_classifications(conn, items, cfg["model"])
        print(f"{len(items)} clasificados")
    report(conn, a.out, cfg.get("min_potential", 2))


if __name__ == "__main__":
    main()
