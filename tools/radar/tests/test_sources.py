"""Fuentes nuevas con respuestas de ejemplo (sin red): YouTube, Google News y App Store."""
import io, json, urllib.error
from datetime import datetime, timedelta, timezone

import pytest

import radar
import store

YT_SEARCH = {"items": [{"id": {"videoId": "vid1"}}, {"id": {"videoId": "vid1"}}, {"id": {"videoId": "vid2"}}]}
YT_COMMENTS = {"items": [
    {"snippet": {"topLevelComment": {"id": "c1", "snippet": {
        "textDisplay": "No encuentro un contador que entienda el monotributo &amp; ganancias",
        "authorDisplayName": "Juan Pérez", "publishedAt": "2026-10-29T10:00:00Z"}}}},
    {"snippet": {"topLevelComment": {"id": "c2", "snippet": {
        "textDisplay": "", "authorDisplayName": "x", "publishedAt": "2026-10-29T10:00:00Z"}}}},
]}

NEWS_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Google News</title>
<item><title>Vecinos reclaman por la falta de turnos en el hospital - Diario Uno</title>
<link>https://news.google.com/rss/articles/abc</link><guid isPermaLink="false">abc</guid>
<pubDate>Fri, 30 Oct 2026 14:00:00 GMT</pubDate><source url="https://diario.uno">Diario Uno</source></item>
<item><title>Sin link</title></item>
</channel></rss>"""

APPSTORE = {"feed": {"entry": [
    {"im:name": {"label": "Mi App"}},  # ficha de la app, sin rating
    {"author": {"name": {"label": "usuario123"}}, "updated": {"label": "2026-10-29T08:00:00-07:00"},
     "im:rating": {"label": "1"}, "id": {"label": "r1"}, "title": {"label": "No anda"},
     "content": {"label": "Desde la actualización no puedo pagar"}},
    {"author": {"name": {"label": "otro"}}, "updated": {"label": "2026-10-29T08:00:00-07:00"},
     "im:rating": {"label": "5"}, "id": {"label": "r2"}, "title": {"label": "Excelente"},
     "content": {"label": "Me encanta"}},
]}}


def fake_get(routes):
    def get(url):
        for frag, body in routes.items():
            if frag in url:
                if isinstance(body, Exception):
                    raise body
                return body if isinstance(body, str) else json.dumps(body)
        raise AssertionError(f"url inesperada: {url}")
    return get


def http_error(code, reason):
    body = json.dumps({"error": {"errors": [{"reason": reason}]}}).encode()
    return urllib.error.HTTPError("https://x", code, reason, {}, io.BytesIO(body))


def no_sleep(monkeypatch):
    monkeypatch.setattr(radar.time, "sleep", lambda s: None)


# --- YouTube ---

def test_youtube_parsea_comentarios_sin_autor(monkeypatch):
    no_sleep(monkeypatch)
    monkeypatch.setenv("YOUTUBE_API_KEY", "k")
    get = fake_get({"search?": YT_SEARCH, "videoId=vid1": YT_COMMENTS,
                    "videoId=vid2": http_error(403, "commentsDisabled")})
    posts = radar.fetch_youtube({"queries": ["monotributo"]}, get=get)
    assert len(posts) == 1
    p = posts[0]
    assert p["id"] == "youtube_c1" and p["fuente"] == "youtube"
    assert "&" in p["texto"] and "&amp;" not in p["texto"]
    assert p["url"] == "https://www.youtube.com/watch?v=vid1&lc=c1"
    assert p["fecha"] == "2026-10-29T10:00:00+00:00"
    assert "Juan" not in json.dumps(p)


def test_youtube_sin_clave_falla_claro(monkeypatch):
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="YOUTUBE_API_KEY"):
        radar.fetch_youtube({"queries": ["x"]})


def test_youtube_cuota_agotada_corta_sin_romper(monkeypatch):
    no_sleep(monkeypatch)
    monkeypatch.setenv("YOUTUBE_API_KEY", "k")
    get = fake_get({"search?": http_error(403, "quotaExceeded")})
    assert radar.fetch_youtube({"queries": ["a", "b"]}, get=get) == []


# --- Google News ---

def test_news_parsea_rss(monkeypatch):
    no_sleep(monkeypatch)
    posts = radar.fetch_news({"queries": ["falta de turnos", "otra"]}, get=fake_get({"news.google.com": NEWS_RSS}))
    assert len(posts) == 1  # la misma nota en dos búsquedas se guarda una vez; la que no tiene link se descarta
    p = posts[0]
    assert p["fuente"] == "noticias/Diario Uno"
    assert p["fecha"] == "2026-10-30T14:00:00+00:00"
    assert p["id"].startswith("news_")


# --- App Store ---

def test_appstore_solo_reseñas_malas_sin_autor(monkeypatch):
    no_sleep(monkeypatch)
    cfg = {"apps": [{"name": "Mi App", "id": 123}], "pages": 1, "max_rating": 2}
    posts = radar.fetch_appstore(cfg, get=fake_get({"id=123": APPSTORE}))
    assert [p["id"] for p in posts] == ["appstore_r1"]
    p = posts[0]
    assert p["fuente"] == "appstore/Mi App"
    assert "1 estrellas" in p["texto"] and "no puedo pagar" in p["texto"]
    assert p["fecha"] == "2026-10-29T15:00:00+00:00"
    assert "usuario123" not in json.dumps(p)


def test_appstore_una_sola_entrada_y_sin_apps(monkeypatch):
    no_sleep(monkeypatch)
    single = {"feed": {"entry": APPSTORE["feed"]["entry"][1]}}
    assert len(radar.parse_appstore_reviews(single, {"name": "A", "id": 1}, 2)) == 1
    assert radar.fetch_appstore({"apps": []}) == []


# --- integración entre fuentes ---

def test_collect_respeta_filter_false(monkeypatch):
    pain = radar.build_pain_regex(["no encuentro"])
    sin_dolor = {"id": "x1", "fuente": "f", "texto": "Excelente app", "url": "", "fecha": None}
    monkeypatch.setitem(radar.SOURCES, "a", lambda cfg: [sin_dolor])
    monkeypatch.setitem(radar.SOURCES, "b", lambda cfg: [{**sin_dolor, "id": "x2"}])
    total, kept = radar.collect({"sources": {"a": {}, "b": {"filter": False}, "c": {"enabled": False}}}, pain)
    assert total == 2 and [p["id"] for p in kept] == ["x2"]


def test_purge_borra_solo_la_fuente_vieja():
    conn = store.connect(":memory:")
    old = (datetime.now(timezone.utc) - timedelta(days=40)).replace(microsecond=0).isoformat()
    for pid in ("youtube_a", "youtube_b", "reddit_a"):
        conn.execute("insert into posts values (?, 'f', 't', '', ?, ?)", (pid, old, old))
    conn.execute("update posts set fetched_at = ? where id = 'youtube_b'", (store.now_iso(),))
    conn.execute("insert into classifications values ('youtube_a', 't', 'r', 'd', 0, 3, 'm', 'x', '{}', ?)", (old,))
    assert store.purge_older_than(conn, "youtube_", 30) == 1
    assert {r[0] for r in conn.execute("select id from posts")} == {"youtube_b", "reddit_a"}
    assert conn.execute("select count(*) from classifications").fetchone()[0] == 0
