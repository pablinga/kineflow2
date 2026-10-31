"""Tests sin red: filtro, parseo/validación del JSON, reintentos, deduplicación y reporte."""
import json, os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import radar
import store

CFG = radar.load_config(os.path.join(os.path.dirname(radar.__file__), "config.yaml"))
PAIN = radar.build_pain_regex(CFG["pain_words"])


def post(pid, texto, fecha="2026-10-30T12:00:00+00:00"):
    return {"id": pid, "fuente": "r/argentina", "texto": texto, "url": f"https://reddit.com/{pid}", "fecha": fecha}


def item(pid, tema="turnos medicos", monetizable=3, **kw):
    base = {"id": pid, "tema": tema, "rubro": "salud", "dolor": "no consigo turno",
            "paga_hoy": False, "monetizable": monetizable, "motivo": "demanda alta"}
    return {**base, **kw}


# --- filtro ---

def test_filtro_detecta_quejas_con_y_sin_tilde():
    posts = [post("a", "¿Cómo hago para sacar turno en el hospital?"),
             post("b", "Como hago para cambiar el DNI"),
             post("c", "Me cansé de llenar la PLANILLA a mano"),
             post("d", "Hoy hizo calor en Rosario"),
             post("e", "Lindo partido el de anoche")]
    assert [p["id"] for p in radar.prefilter(posts, PAIN)] == ["a", "b", "c"]


def test_from_file_ids_estables_y_sin_duplicados(tmp_path):
    f = tmp_path / "quejas.txt"
    f.write_text("No encuentro plomero\n\nNo encuentro plomero\nOtra queja\n", encoding="utf-8")
    a = radar.from_file(str(f))
    b = radar.from_file(str(f))
    assert len(a) == 2
    assert [p["id"] for p in a] == [p["id"] for p in b]
    assert all(p["id"].startswith("manual_") for p in a)


# --- parseo del JSON ---

def test_parse_acepta_lista_valida_con_texto_alrededor():
    txt = "Acá va:\n" + json.dumps([item("1"), item("2", tema="  Contadores  ")]) + "\nListo."
    got = radar.parse_response(txt, ["1", "2"])
    assert set(got) == {"1", "2"}
    assert got["2"]["tema"] == "contadores"


def test_parse_descarta_items_invalidos_y_ids_ajenos():
    data = [item("1"),
            item("2", paga_hoy="si"),          # tipo incorrecto
            item("3", monetizable=9),          # fuera de rango
            {k: v for k, v in item("4").items() if k != "dolor"},  # falta campo
            item("5", monetizable=True),       # bool no es número
            item("99")]                        # id que no pedimos
    got = radar.parse_response(json.dumps(data), ["1", "2", "3", "4", "5"])
    assert set(got) == {"1"}


def test_parse_json_roto_o_sin_lista():
    assert radar.parse_response("[{\"id\": 1,", ["1"]) == {}
    assert radar.parse_response("no puedo ayudar", ["1"]) == {}
    assert radar.parse_response('{"id": "1"}', ["1"]) == {}


class FakeClient:
    """Imita client.messages.create devolviendo respuestas predefinidas en orden."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.prompts = []
        self.messages = self

    def create(self, model, max_tokens, messages):
        self.prompts.append(messages[0]["content"])
        return SimpleNamespace(content=[SimpleNamespace(text=self.responses.pop(0))])


def test_classify_reintenta_solo_los_que_faltan():
    posts = [post("1", "no encuentro turno"), post("2", "me cobran de más")]
    client = FakeClient(["esto no es json", json.dumps([item("1")]), json.dumps([item("2")])])
    out = radar.classify(posts, "modelo", batch=15, max_retries=2, client=client)
    assert sorted(r["id"] for r in out) == ["1", "2"]
    assert len(client.prompts) == 3
    assert "[id=1]" not in client.prompts[2] and "[id=2]" in client.prompts[2]


def test_classify_se_rinde_despues_de_los_reintentos():
    client = FakeClient(["mal"] * 3)
    out = radar.classify([post("1", "x")], "modelo", max_retries=2, client=client)
    assert out == [] and client.responses == []


# --- deduplicación ---

def test_dedup_no_reinserta_ni_reclasifica():
    conn = store.connect(":memory:")
    posts = [post("1", "no encuentro turno"), post("2", "planilla excel")]
    assert store.save_posts(conn, posts) == 2
    assert store.save_posts(conn, posts + [post("3", "otra")]) == 1
    assert len(store.unclassified(conn, ["1", "2", "3"])) == 3

    store.save_classifications(conn, [item("1")], "modelo")
    store.save_classifications(conn, [item("1", tema="otro")], "modelo")  # duplicado: se ignora
    assert {p["id"] for p in store.unclassified(conn, ["1", "2", "3"])} == {"2", "3"}
    tema = conn.execute("select tema from classifications where post_id = '1'").fetchone()[0]
    assert tema == "turnos medicos"


def test_no_guarda_usernames():
    conn = store.connect(":memory:")
    cols = {r[1] for t in ("posts", "classifications") for r in conn.execute(f"pragma table_info({t})")}
    assert not {"author", "autor", "username", "usuario"} & cols


# --- reporte y comparación semanal ---

def test_reporte_ordena_y_compara_con_semana_anterior():
    now = datetime(2026, 10, 31, tzinfo=timezone.utc)
    conn = store.connect(":memory:")
    esta = (now - timedelta(days=2)).isoformat()
    antes = (now - timedelta(days=10)).isoformat()
    posts = ([post(f"t{i}", "turno", esta) for i in range(3)] +
             [post(f"c{i}", "contador", esta) for i in range(2)] +
             [post("n0", "nuevo", esta)] +
             [post("tp", "turno", antes), post("cp1", "contador", antes), post("cp2", "contador", antes)])
    store.save_posts(conn, posts)
    store.save_classifications(conn, [item(f"t{i}") for i in range(3)] + [item("tp")] +
                               [item(f"c{i}", tema="contadores", monetizable=4) for i in range(2)] +
                               [item("cp1", tema="contadores"), item("cp2", tema="contadores")] +
                               [item("n0", tema="delivery", monetizable=5)], "modelo")
    cur = store.classified_between(conn, (now - timedelta(days=7)).isoformat(), now.isoformat())
    prev = store.classified_between(conn, (now - timedelta(days=14)).isoformat(),
                                    (now - timedelta(days=7)).isoformat())
    text, n = radar.build_report(cur, prev)
    assert n == 3
    assert text.index("## turnos medicos") < text.index("## contadores") < text.index("## delivery")
    assert "Temas nuevos: delivery" in text
    assert "Temas que crecen: turnos medicos (1 → 3)" in text
    assert "no prueba que la gente pague" in text
