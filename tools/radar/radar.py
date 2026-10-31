"""Radar de dolores: junta quejas/necesidades locales y las agrupa por tema.

Uso:
  python radar.py                      # baja posts de Reddit, clasifica lo nuevo y arma el reporte
  python radar.py --file quejas.txt    # usa un txt propio (una queja por linea)
  python radar.py --dry                # solo descarga y filtro por palabras, sin API de Claude
  python radar.py --max-posts 50       # tope de posts nuevos a clasificar (costo)

Variables de entorno: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET (Reddit), REDDIT_USER_AGENT (opcional),
ANTHROPIC_API_KEY (para clasificar).
Salida: radar.db (SQLite), reporte.md y posts.json (los que pasaron el filtro en esta corrida).
"""
import argparse, hashlib, json, os, re, sys, time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

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


SOURCES = {"reddit": fetch_reddit}


def fetch_all(cfg):
    posts = []
    for name, src_cfg in (cfg.get("sources") or {}).items():
        if not src_cfg or not src_cfg.get("enabled", True):
            continue
        if name not in SOURCES:
            print(f"[warn] fuente desconocida en config.yaml: {name}", file=sys.stderr)
            continue
        posts.extend(SOURCES[name](src_cfg))
    return posts


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
            lines.append(f"- {x['dolor']} ({x['rubro']}) {x['url']}".rstrip())
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
    a = ap.parse_args(argv)
    cfg = load_config(a.config)

    posts = from_file(a.file) if a.file else fetch_all(cfg)
    print(f"{len(posts)} posts bajados")
    posts = prefilter(posts, build_pain_regex(cfg["pain_words"]))
    print(f"{len(posts)} pasan el filtro de quejas")
    with open(os.path.join(os.path.dirname(a.out), "posts.json"), "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)

    conn = store.connect(a.db)
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
