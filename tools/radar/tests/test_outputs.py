"""Reporte fechado, dashboard y mail (sin red)."""
import json, re
from datetime import datetime, timedelta, timezone

import pytest

import dashboard
import mailer
import radar
import store

NOW = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)


def seed(conn, rows):
    """rows: (id, fuente, tema, días atrás, monetizable)."""
    posts, items = [], []
    for pid, fuente, tema, days, m in rows:
        posts.append({"id": pid, "fuente": fuente, "texto": "t", "url": f"https://x/{pid}",
                      "fecha": (NOW - timedelta(days=days)).replace(microsecond=0).isoformat()})
        items.append({"id": pid, "tema": tema, "rubro": "r", "dolor": f"dolor {pid}", "paga_hoy": pid.endswith("p"),
                      "monetizable": m, "motivo": "m"})
    store.save_posts(conn, posts)
    store.save_classifications(conn, items, "modelo")


@pytest.fixture
def conn():
    c = store.connect(":memory:")
    seed(c, [("a1", "r/argentina", "turnos", 1, 3), ("a2p", "youtube", "turnos", 2, 4), ("a3", "noticias/X", "turnos", 3, 3),
             ("a4", "r/argentina", "turnos", 9, 3),
             ("b1", "appstore/Banco", "apps bancarias", 1, 2), ("b2", "appstore/Banco", "apps bancarias", 10, 2),
             ("b3", "appstore/Banco", "apps bancarias", 11, 2),
             ("c1", "manual", "contadores", 2, 5),
             ("z1", "r/argentina", "ruido", 1, 1),          # bajo potencial: no cuenta
             ("old", "r/argentina", "turnos", 80, 5)])      # fuera de las 8 semanas
    return c


def test_dashboard_semanas_estados_y_orden(conn):
    items = store.classified_between(conn, "2000", "3000")
    d = dashboard.build_data(items, NOW)
    assert len(d["weeks"]) == 8
    last, prev = d["weeks"][-1]["counts"], d["weeks"][-2]["counts"]
    assert last == {"reddit": 1, "youtube": 1, "noticias": 1, "appstore": 1, "manual": 1}
    assert prev["reddit"] == 1 and prev["appstore"] == 2
    t = {r["tema"]: r for r in d["topics"]}
    assert set(t) == {"turnos", "apps bancarias", "contadores"}
    assert (t["turnos"]["status"], t["turnos"]["count"], t["turnos"]["prev"]) == ("crece", 3, 1)
    assert t["apps bancarias"]["status"] == "baja"
    assert t["contadores"]["status"] == "nuevo"
    assert [r["tema"] for r in d["topics"]][0] == "turnos"
    assert t["turnos"]["fuentes"] == ["reddit", "youtube", "noticias"]
    assert t["turnos"]["series"][-2:] == [1, 3]
    assert d["totals"] == {"mentions": 5, "mentions_prev": 3, "topics": 3, "topics_prev": 2,
                           "nuevos": 1, "crecen": 1, "pagan": 1}


def test_dashboard_no_deja_cerrar_el_script():
    data = {"x": "</script><script>alert(1)</script>"}
    html = dashboard.render(data)
    payload = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S).group(1)
    assert "<" not in payload
    assert json.loads(payload) == data


def test_reporte_guarda_copia_fechada(conn, tmp_path):
    out = tmp_path / "reporte.md"
    text, summary = radar.report(conn, str(out), 2, NOW)
    archived = tmp_path / "reportes" / "2026-10-31.md"
    assert out.read_text(encoding="utf-8") == archived.read_text(encoding="utf-8") == text
    assert summary["temas"] == 3 and summary["nuevos"] == 1


def test_mail_desactivado_o_incompleto():
    assert mailer.email_settings({}) is None
    with pytest.raises(SystemExit, match="SMTP_HOST"):
        mailer.email_settings({"RADAR_EMAIL_TO": "a@b.c", "SMTP_USER": "u", "SMTP_PASSWORD": "p"})


class FakeSMTP:
    sent = []

    def __init__(self, host, port, timeout):
        self.host, self.port = host, port

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def login(self, user, password):
        self.user = user

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


def test_mail_arma_y_manda_con_adjunto(tmp_path):
    env = {"RADAR_EMAIL_TO": "a@b.c, d@e.f", "SMTP_HOST": "smtp.x", "SMTP_USER": "radar@x", "SMTP_PASSWORD": "p"}
    s = mailer.email_settings(env)
    assert s["port"] == 587 and s["from"] == "radar@x" and s["to"] == ["a@b.c", "d@e.f"]
    dash = tmp_path / "dashboard.html"
    dash.write_text("<html></html>", encoding="utf-8")
    msg = mailer.build_message(s, "Radar", "# Radar de dolores\n", [str(dash)])
    assert mailer.send(s, msg, smtp_factory=FakeSMTP)
    m = FakeSMTP.sent[-1]
    assert m["To"] == "a@b.c, d@e.f" and m["Subject"] == "Radar"
    assert [p.get_filename() for p in m.iter_attachments()] == ["dashboard.html"]


def test_mail_que_falla_no_corta():
    class Boom(FakeSMTP):
        def login(self, user, password):
            raise OSError("sin red")
    s = mailer.email_settings({"RADAR_EMAIL_TO": "a@b.c", "SMTP_HOST": "h", "SMTP_USER": "u", "SMTP_PASSWORD": "p"})
    assert mailer.send(s, mailer.build_message(s, "x", "y"), smtp_factory=Boom) is False
