"""Dashboard HTML autocontenido (sin internet ni dependencias) a partir de radar.db.

Muestra las últimas semanas: menciones por fuente, y cada tema con su evolución,
estado (nuevo / crece / estable / baja) y ejemplos.
"""
import json
from collections import Counter, defaultdict
from datetime import timedelta, timezone

WEEK = timedelta(days=7)
SOURCE_ORDER = ["reddit", "youtube", "noticias", "appstore", "manual"]  # color fijo por fuente
SOURCE_LABELS = {"reddit": "Reddit", "youtube": "YouTube", "noticias": "Noticias",
                 "appstore": "App Store", "manual": "Manual"}


def iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def source_group(fuente):
    f = (fuente or "").lower()
    if f.startswith("r/"):
        return "reddit"
    return f.split("/")[0] if f.split("/")[0] in SOURCE_ORDER else "manual"


def week_windows(now, weeks):
    """Ventanas de 7 días que terminan en `now`, de la más vieja a la más nueva."""
    end = now + timedelta(seconds=1)
    return [(end - (weeks - i) * WEEK, end - (weeks - i - 1) * WEEK) for i in range(weeks)]


def topic_status(count, prev):
    if not prev:
        return "nuevo"
    if count > prev:
        return "crece"
    if count < prev:
        return "baja"
    return "estable"


def build_data(items, now, min_potential=2, weeks=8, examples=5):
    """items: filas de store.classified_between para el rango completo (fecha ISO)."""
    wins = week_windows(now, weeks)
    bounds = [(iso(a), iso(b)) for a, b in wins]
    relevant = [it for it in items if it.get("monetizable", 0) >= min_potential]

    def week_of(it):
        for i, (a, b) in enumerate(bounds):
            if a <= it["fecha"] < b:
                return i
        return None

    per_week = [Counter() for _ in wins]
    topics = defaultdict(lambda: {"series": [0] * weeks, "items": []})
    for it in relevant:
        w = week_of(it)
        if w is None:
            continue
        per_week[w][source_group(it.get("fuente"))] += 1
        t = topics[it["tema"].lower()]
        t["series"][w] += 1
        if w == weeks - 1:
            t["items"].append(it)

    rows = []
    for tema, t in topics.items():
        cur = t["items"]
        if not cur:
            continue
        count, prev = len(cur), t["series"][-2] if weeks > 1 else 0
        cur.sort(key=lambda x: (x["monetizable"], x["fecha"]), reverse=True)
        rows.append({
            "tema": tema, "count": count, "prev": prev, "series": t["series"],
            "avg": round(sum(x["monetizable"] for x in cur) / count, 1),
            "pagan": sum(1 for x in cur if x.get("paga_hoy")),
            "fuentes": sorted({source_group(x.get("fuente")) for x in cur}, key=SOURCE_ORDER.index),
            "status": topic_status(count, prev),
            "examples": [{"dolor": x["dolor"], "rubro": x["rubro"], "fuente": x.get("fuente", ""),
                          "url": x.get("url", "")} for x in cur[:examples]],
        })
    rows.sort(key=lambda r: (r["count"], r["avg"] * r["count"]), reverse=True)

    prev_topics = sum(1 for t in topics.values() if t["series"][-2]) if weeks > 1 else 0
    return {
        "generated": now.strftime("%d/%m/%Y %H:%M UTC"),
        "period": f"{wins[-1][0]:%d/%m} al {now:%d/%m/%Y}",
        "sources": [{"key": s, "label": SOURCE_LABELS[s]} for s in SOURCE_ORDER],
        "weeks": [{"label": f"{a:%d/%m}", "range": f"{a:%d/%m} al {(b - timedelta(seconds=1)):%d/%m}",
                   "counts": {s: per_week[i][s] for s in SOURCE_ORDER}} for i, (a, b) in enumerate(wins)],
        "topics": rows,
        "totals": {
            "mentions": sum(r["count"] for r in rows),
            "mentions_prev": sum(per_week[-2].values()) if weeks > 1 else 0,
            "topics": len(rows), "topics_prev": prev_topics,
            "nuevos": sum(1 for r in rows if r["status"] == "nuevo"),
            "crecen": sum(1 for r in rows if r["status"] == "crece"),
            "pagan": sum(r["pagan"] for r in rows),
        },
    }


def render(data):
    # Los textos vienen de internet: el JSON se escapa para no cerrar el <script>,
    # y el JS solo usa textContent (nunca innerHTML con datos).
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    return TEMPLATE.replace("__DATA__", payload)


def write(conn, path, now, min_potential=2, weeks=8):
    import store
    items = store.classified_between(conn, iso(now - weeks * WEEK), iso(now + timedelta(seconds=1)))
    with open(path, "w", encoding="utf-8") as f:
        f.write(render(build_data(items, now, min_potential, weeks)))
    print(f"Dashboard: {path}")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar de dolores</title>
<style>
.viz-root {
  color-scheme: light;
  --page: #f9f9f7; --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e;
  --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --wash: rgba(11,11,11,0.04);
  --s-reddit: #2a78d6; --s-youtube: #eb6834; --s-noticias: #1baf7a; --s-appstore: #eda100; --s-manual: #e87ba4;
  --accent: #2a78d6; --spark: #898781; --up: #006300; --down: #52514e;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    color-scheme: dark;
    --page: #0d0d0d; --surface-1: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7;
    --muted: #898781; --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --wash: rgba(255,255,255,0.05);
    --s-reddit: #3987e5; --s-youtube: #d95926; --s-noticias: #199e70; --s-appstore: #c98500; --s-manual: #d55181;
    --accent: #3987e5; --spark: #898781; --up: #0ca30c; --down: #c3c2b7;
  }
}
* { box-sizing: border-box; }
body { margin: 0; }
.viz-root { min-height: 100vh; background: var(--page); color: var(--text-primary);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px 16px 48px; }
.wrap { max-width: 1040px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 2px; font-weight: 600; }
h2 { font-size: 16px; margin: 0 0 4px; font-weight: 600; }
.sub { color: var(--text-secondary); margin: 0; }
.note { margin: 16px 0 20px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface-1); color: var(--text-secondary); }
.note strong { color: var(--text-primary); }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
@media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.tile .label { color: var(--text-secondary); font-size: 13px; }
.tile .value { font-size: 28px; font-weight: 600; margin-top: 2px; }
.tile .delta { font-size: 12px; color: var(--muted); margin-top: 2px; }
.delta.up { color: var(--up); } .delta.down { color: var(--down); }
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 10px 0 6px; color: var(--text-secondary); font-size: 12px; }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px;
  margin-right: 6px; vertical-align: -1px; background: var(--c); }
#chart { position: relative; }
#chart svg { display: block; width: 100%; }
.tip { position: absolute; pointer-events: none; background: var(--surface-1); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.12);
  white-space: nowrap; display: none; z-index: 2; }
.tip .v { font-weight: 600; color: var(--text-primary); }
.tip .k { color: var(--text-secondary); }
.tip .row::before { content: ""; display: inline-block; width: 10px; height: 2px; margin-right: 6px;
  vertical-align: 3px; background: var(--c); }
details { margin-top: 10px; color: var(--text-secondary); }
summary { cursor: pointer; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-weight: 500; color: var(--text-secondary); padding: 8px 8px; border-bottom: 1px solid var(--grid); }
td { padding: 9px 8px; border-bottom: 1px solid var(--grid); vertical-align: middle; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 10px; }
.filters button { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: transparent; color: var(--text-secondary); }
.filters button[aria-pressed="true"] { background: var(--text-primary); color: var(--surface-1); border-color: var(--text-primary); }
tr.topic { cursor: pointer; }
tr.topic:hover, tr.topic:focus { background: var(--wash); outline: none; }
.tema { font-weight: 600; }
.chip { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border);
  color: var(--text-secondary); white-space: nowrap; }
.chip.nuevo, .chip.crece { color: var(--text-primary); border-color: var(--accent); }
.dots span { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 3px; background: var(--c); }
tr.detail td { background: var(--wash); padding: 10px 16px 14px; }
tr.detail ul { margin: 0; padding-left: 18px; }
tr.detail li { margin: 4px 0; color: var(--text-primary); }
tr.detail .meta { color: var(--text-secondary); }
a { color: var(--accent); }
.empty { color: var(--text-secondary); padding: 20px 0; }
.scroll { overflow-x: auto; }
.show-sm { display: none; }
@media (max-width: 720px) {
  .hide-sm { display: none; } .show-sm { display: inline; }
  th, td { padding-left: 5px; padding-right: 5px; }
}
.foot { margin-top: 20px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div class="viz-root"><div class="wrap">
  <h1>Radar de dolores</h1>
  <p class="sub" id="period"></p>
  <div class="note"><strong>Ojo:</strong> una queja repetida no prueba que la gente pague. Esto es una lista de pistas
    para ir a validar hablando con quienes tienen el problema.</div>

  <div class="tiles" id="tiles"></div>

  <div class="card">
    <h2>Menciones por semana</h2>
    <p class="sub">Quejas con potencial, por fuente. Cada barra es una semana (7 días).</p>
    <div class="legend" id="legend"></div>
    <div id="chart"><div class="tip" id="tip"></div></div>
    <details><summary>Ver como tabla</summary><div class="scroll"><table id="weekTable"></table></div></details>
  </div>

  <div class="card" style="margin-top:16px">
    <h2>Temas de la semana</h2>
    <p class="sub">Ordenados por frecuencia y potencial. Tocá un tema para ver ejemplos.</p>
    <div class="filters" id="filters"></div>
    <div class="scroll"><table id="topics"></table></div>
  </div>
  <p class="foot" id="foot"></p>
</div></div>
<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  const D = JSON.parse(document.getElementById("data").textContent);
  const el = (tag, attrs, text) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const NS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const color = s => `var(--s-${s})`;
  const label = Object.fromEntries(D.sources.map(s => [s.key, s.label]));

  document.getElementById("period").textContent = `Semana del ${D.period} · generado el ${D.generated}`;
  document.getElementById("foot").textContent = "Los datos de YouTube se guardan 30 días, así que su historia es más corta.";

  // --- tiles ---
  const T = D.totals;
  const tiles = [
    ["Menciones esta semana", T.mentions, T.mentions - T.mentions_prev, "vs. semana anterior"],
    ["Temas", T.topics, T.topics - T.topics_prev, "vs. semana anterior"],
    ["Temas nuevos", T.nuevos, null, `${T.crecen} temas crecen`],
    ["Menciones donde ya pagan", T.pagan, null, T.mentions ? `${Math.round(100 * T.pagan / T.mentions)}% de las menciones` : ""],
  ];
  const tilesEl = document.getElementById("tiles");
  for (const [lab, val, delta, hint] of tiles) {
    const c = el("div", { class: "card tile" });
    c.append(el("div", { class: "label" }, lab), el("div", { class: "value" }, String(val)));
    let cls = "delta", txt = hint;
    if (delta !== null) {
      cls += delta > 0 ? " up" : delta < 0 ? " down" : "";
      txt = `${delta > 0 ? "▲ +" : delta < 0 ? "▼ " : ""}${delta === 0 ? "igual" : delta} ${hint}`;
    }
    c.append(el("div", { class: cls }, txt));
    tilesEl.append(c);
  }

  // --- legend + week table ---
  const used = D.sources.filter(s => D.weeks.some(w => w.counts[s.key]));
  const legend = document.getElementById("legend");
  for (const s of used) { const sp = el("span", {}, s.label); sp.style.setProperty("--c", color(s.key)); legend.append(sp); }
  const wt = document.getElementById("weekTable");
  const head = el("tr"); head.append(el("th", {}, "Semana"));
  for (const s of used) head.append(el("th", { class: "num" }, s.label));
  head.append(el("th", { class: "num" }, "Total")); wt.append(head);
  for (const w of D.weeks) {
    const tr = el("tr"); tr.append(el("td", {}, w.range));
    let tot = 0;
    for (const s of used) { tot += w.counts[s.key]; tr.append(el("td", { class: "num" }, String(w.counts[s.key]))); }
    tr.append(el("td", { class: "num" }, String(tot))); wt.append(tr);
  }

  // --- stacked columns ---
  const chart = document.getElementById("chart"), tip = document.getElementById("tip");
  function drawChart() {
    chart.querySelectorAll("svg").forEach(n => n.remove());
    const W = chart.clientWidth || 600, H = 220, padL = 32, padR = 8, padT = 12, padB = 26;
    const totals = D.weeks.map(w => used.reduce((a, s) => a + w.counts[s.key], 0));
    const max = Math.max(1, ...totals);
    const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
    const top = Math.ceil(max / step) * step;
    const y = v => padT + (H - padT - padB) * (1 - v / top);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img",
      "aria-label": "Menciones por semana y fuente; los valores están en la tabla de abajo" });
    for (let v = 0; v <= top; v += step) {
      svg.append(sv("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      const t = sv("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 11 });
      t.textContent = v; svg.append(t);
    }
    const band = (W - padL - padR) / D.weeks.length, bw = Math.min(24, band * 0.6);
    D.weeks.forEach((w, i) => {
      const cx = padL + band * (i + 0.5);
      let acc = 0;
      const segs = used.filter(s => w.counts[s.key]);
      segs.forEach((s, j) => {
        const v = w.counts[s.key], y0 = y(acc), y1 = y(acc + v);
        const isTop = j === segs.length - 1, gap = j > 0 ? 2 : 0, h = Math.max(0, y0 - y1 - gap);
        const x = cx - bw / 2, yy = y1, r = isTop ? Math.min(4, h) : 0;
        const d = `M${x},${yy + h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${yy + h} Z`;
        svg.append(sv("path", { d, fill: color(s.key) }));
        acc += v;
      });
      const t = sv("text", { x: cx, y: H - 8, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 });
      t.textContent = w.label; svg.append(t);
      if (i === D.weeks.length - 1 && totals[i]) {
        const lt = sv("text", { x: cx, y: y(totals[i]) - 5, "text-anchor": "middle", fill: "var(--text-secondary)", "font-size": 11 });
        lt.textContent = totals[i]; svg.append(lt);
      }
      const hit = sv("rect", { x: cx - band / 2, y: padT, width: band, height: H - padT - padB, fill: "transparent", tabindex: 0 });
      const show = ev => {
        tip.replaceChildren(el("div", { class: "k" }, `Semana ${w.range}`));
        const tr = el("div"); tr.append(el("span", { class: "v" }, String(totals[i])), el("span", { class: "k" }, " menciones")); tip.append(tr);
        for (const s of used) {
          if (!w.counts[s.key]) continue;
          const r = el("div", { class: "row" }); r.style.setProperty("--c", color(s.key));
          r.append(el("span", { class: "v" }, String(w.counts[s.key])), el("span", { class: "k" }, " " + s.label)); tip.append(r);
        }
        tip.style.display = "block";
        const left = Math.min(Math.max(0, cx - tip.offsetWidth / 2), W - tip.offsetWidth);
        tip.style.left = left + "px"; tip.style.top = "0px";
        hit.setAttribute("fill", "var(--wash)");
      };
      const hide = () => { tip.style.display = "none"; hit.setAttribute("fill", "transparent"); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", hide); hit.addEventListener("blur", hide);
      svg.insertBefore(hit, svg.firstChild);
    });
    chart.append(svg);
  }
  drawChart();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawChart, 100); });

  // --- topics ---
  const STATUS = { nuevo: "★ Nuevo", crece: "▲ Crece", estable: "= Estable", baja: "▼ Baja" };
  const filtersEl = document.getElementById("filters");
  let filter = "todos";
  const FILTERS = [["todos", "Todos"], ["nuevo", "Nuevos"], ["crece", "Crecen"]];
  for (const [k, lab] of FILTERS) {
    const n = D.topics.filter(t => k === "todos" || t.status === k).length;
    const b = el("button", { type: "button", "aria-pressed": String(k === filter) }, `${lab} (${n})`);
    b.addEventListener("click", () => { filter = k; filtersEl.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawTopics(); });
    filtersEl.append(b);
  }
  function spark(series) {
    const w = 84, h = 22, max = Math.max(1, ...series);
    const pts = series.map((v, i) => [2 + (w - 4) * i / (series.length - 1 || 1), h - 3 - (h - 6) * v / max]);
    const s = sv("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, "aria-hidden": "true" });
    s.append(sv("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: "var(--spark)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const [lx, ly] = pts[pts.length - 1];
    s.append(sv("circle", { cx: lx, cy: ly, r: 4, fill: "var(--accent)", stroke: "var(--surface-1)", "stroke-width": 2 }));
    return s;
  }
  const safeUrl = u => /^https:\/\//i.test(u || "") ? u : null;
  const table = document.getElementById("topics");
  function drawTopics() {
    table.replaceChildren();
    const rows = D.topics.filter(t => filter === "todos" || t.status === filter);
    if (!rows.length) { const tr = el("tr"); tr.append(el("td", { class: "empty" }, "Sin temas para mostrar.")); table.append(tr); return; }
    const h = el("tr");
    [["Tema", ""], ["Estado", ""], ["Menciones", "num", "Menc."], ["Sem. ant.", "num hide-sm"], ["Últimas 8 semanas", "hide-sm"],
     ["Potencial", "num", "Pot."], ["Ya pagan", "num hide-sm"], ["Fuentes", "hide-sm"]].forEach(([t, c, short]) => {
      const th = el("th", { class: c });
      if (short) th.append(el("span", { class: "hide-sm" }, t), el("span", { class: "show-sm" }, short));
      else th.textContent = t;
      h.append(th);
    });
    table.append(h);
    for (const t of rows) {
      const tr = el("tr", { class: "topic", tabindex: 0, "aria-expanded": "false" });
      tr.append(el("td", { class: "tema" }, t.tema));
      const st = el("td"); st.append(el("span", { class: "chip " + t.status }, STATUS[t.status])); tr.append(st);
      tr.append(el("td", { class: "num" }, String(t.count)), el("td", { class: "num hide-sm" }, String(t.prev)));
      const sp = el("td", { class: "hide-sm", title: t.series.join(" · ") }); sp.append(spark(t.series)); tr.append(sp);
      tr.append(el("td", { class: "num" }, `${t.avg.toFixed(1)}/5`), el("td", { class: "num hide-sm" }, String(t.pagan)));
      const fu = el("td", { class: "hide-sm dots" });
      for (const f of t.fuentes) { const d = el("span", { title: label[f] }); d.style.setProperty("--c", color(f)); fu.append(d); }
      fu.append(document.createTextNode(t.fuentes.map(f => label[f]).join(", ")));
      tr.append(fu);
      const det = el("tr", { class: "detail", hidden: "" });
      const td = el("td", { colspan: 8 }); const ul = el("ul");
      for (const x of t.examples) {
        const li = el("li"); li.append(document.createTextNode(x.dolor + " "));
        li.append(el("span", { class: "meta" }, `(${x.rubro}; ${x.fuente}) `));
        const u = safeUrl(x.url);
        if (u) li.append(el("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, "ver"));
        ul.append(li);
      }
      td.append(ul); det.append(td);
      const toggle = () => { det.hidden = !det.hidden; tr.setAttribute("aria-expanded", String(!det.hidden)); };
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      table.append(tr, det);
    }
  }
  drawTopics();
})();
</script>
</body>
</html>
"""
