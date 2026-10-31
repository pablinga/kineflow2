"""Persistencia en SQLite: posts y clasificaciones, deduplicados por id.

Solo se guarda texto, fuente/subreddit, url y fechas. Nunca usernames.
"""
import json
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
create table if not exists posts (
  id          text primary key,
  fuente      text not null,
  texto       text not null,
  url         text not null default '',
  fecha       text not null,          -- fecha del post (ISO, UTC)
  fetched_at  text not null           -- primera vez que se bajó
);
create table if not exists classifications (
  post_id        text primary key references posts(id),
  tema           text not null,
  rubro          text not null,
  dolor          text not null,
  paga_hoy       integer not null,
  monetizable    integer not null,
  motivo         text not null,
  model          text not null,
  raw            text not null,
  classified_at  text not null
);
"""


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def save_posts(conn, posts):
    """Inserta los posts que no existen. Devuelve cuántos eran nuevos."""
    fetched = now_iso()
    before = conn.total_changes
    conn.executemany(
        "insert or ignore into posts (id, fuente, texto, url, fecha, fetched_at) values (?, ?, ?, ?, ?, ?)",
        [(p["id"], p["fuente"], p["texto"], p["url"], p.get("fecha") or fetched, fetched) for p in posts],
    )
    conn.commit()
    return conn.total_changes - before


def unclassified(conn, ids):
    """De los ids dados, los que todavía no tienen clasificación (más nuevos primero)."""
    ids = list(ids)
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    rows = conn.execute(
        f"select p.* from posts p left join classifications c on c.post_id = p.id "
        f"where c.post_id is null and p.id in ({marks}) order by p.fecha desc",
        ids,
    ).fetchall()
    return [dict(r) for r in rows]


def save_classifications(conn, items, model):
    at = now_iso()
    conn.executemany(
        "insert or ignore into classifications (post_id, tema, rubro, dolor, paga_hoy, monetizable, motivo, "
        "model, raw, classified_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [(str(r["id"]), r["tema"], r["rubro"], r["dolor"], int(r["paga_hoy"]), r["monetizable"], r["motivo"],
          model, json.dumps(r, ensure_ascii=False), at) for r in items],
    )
    conn.commit()


def classified_between(conn, start_iso, end_iso):
    """Posts clasificados con fecha de post en [start, end)."""
    rows = conn.execute(
        "select p.id, p.fuente, p.texto, p.url, p.fecha, c.tema, c.rubro, c.dolor, c.paga_hoy, "
        "c.monetizable, c.motivo from posts p join classifications c on c.post_id = p.id "
        "where p.fecha >= ? and p.fecha < ?",
        (start_iso, end_iso),
    ).fetchall()
    return [dict(r) for r in rows]
