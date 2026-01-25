import os
import re
import hashlib
from pathlib import Path
from io import BytesIO
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from pymongo import MongoClient
from bson.binary import Binary

import pandas as pd
import matplotlib
matplotlib.use("Agg")  # imprescindible en Docker (sin display)
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader

from reportlab.platypus import (
    BaseDocTemplate,
    PageTemplate,
    Frame,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    Image as RLImage,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


# =========================
# CONFIG / RUTAS
# =========================
BASE_DIR = Path(__file__).resolve().parent
PAGE_WIDTH, PAGE_HEIGHT = A4

DEFAULT_TITLE = "Informe Analítico de Indicadores de Calidad"
DEFAULT_SUBTITLE = "Fundación Renal Española"

LOGO_CANDIDATES = [
    BASE_DIR / "logo.jpg",
    BASE_DIR / "logo.png",
    BASE_DIR / "anagrama.png",
    BASE_DIR / "assets" / "logo.jpg",
    BASE_DIR / "assets" / "logo.png",
]

INDICADORES_JSON = BASE_DIR / "indicadores_enriquecidos.json"
CENTROS_CATALOGO_JSON = BASE_DIR / "centrosCatalogo.json"


# =========================
# MONGODB
# =========================
def conectar_calidad():
    """
    Conexión a MongoDB usando variables de entorno.
    Compatible con Docker y local (si existe .env junto al archivo).
    """
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "mongodb://mongodb:27017/"
    db_name = os.getenv("MONGODB_DBNAME") or os.getenv("DB_NAME") or "DatosCalidad"

    client = MongoClient(
        mongo_uri,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=20000,
    )
    return client[db_name]


def mongo_ping() -> bool:
    db = conectar_calidad()
    db.command("ping")
    return True


# =========================
# UTILIDADES
# =========================
def _safe_float(x: Any) -> Optional[float]:
    if x is None:
        return None
    try:
        if isinstance(x, str):
            x = x.replace(",", ".").strip()
        return float(x)
    except Exception:
        return None


def _clean_text(s: Any) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def _load_indicadores_enriquecidos() -> Dict[str, Dict[str, Any]]:
    if not INDICADORES_JSON.exists():
        return {}
    try:
        import json
        data = json.loads(INDICADORES_JSON.read_text(encoding="utf-8"))
        out = {}
        for item in data:
            id_code = str(item.get("id_code", "")).strip()
            if id_code:
                out[id_code] = item
        return out
    except Exception:
        return {}


def _load_centros_catalogo() -> Dict[str, Any]:
    """Carga el catálogo de centros (id/label/path/region/color).

    Estructura esperada (como el generado desde Angular):
    {
      "centros": [{"id":"DB1","label":"...","path":"...","region":"...","color":"#..."}, ...],
      "byId": {"DB1": {"label":..., "path":..., "region":..., "color":...}, ...}
    }
    """
    if not CENTROS_CATALOGO_JSON.exists():
        return {"centros": [], "byId": {}, "byLabel": {}, "byPath": {}}
    try:
        import json

        raw = json.loads(CENTROS_CATALOGO_JSON.read_text(encoding="utf-8"))
        centros = raw.get("centros") or []
        by_id = raw.get("byId") or {}

        # Normaliza indexadores adicionales (por label / por path)
        by_label = {}
        by_path = {}
        for c in centros:
            cid = (c.get("id") or "").strip()
            label = _clean_text(c.get("label") or "")
            path = _clean_text(c.get("path") or "")
            region = _clean_text(c.get("region") or "")
            color = _clean_text(c.get("color") or "")
            if cid and cid not in by_id:
                by_id[cid] = {"label": label, "path": path, "region": region, "color": color}
            if label:
                by_label[label.lower()] = {"id": cid, "label": label, "path": path, "region": region, "color": color}
            if path:
                by_path[path.lower()] = {"id": cid, "label": label, "path": path, "region": region, "color": color}

        return {"centros": centros, "byId": by_id, "byLabel": by_label, "byPath": by_path}
    except Exception:
        return {"centros": [], "byId": {}, "byLabel": {}, "byPath": {}}


def _find_logo_path() -> Optional[Path]:
    for p in LOGO_CANDIDATES:
        if p.exists():
            return p
    return None


def _infer_periodo(docs: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    for d in docs:
        cfg = d.get("config") or {}
        fi = cfg.get("fecha_inicio") or cfg.get("FECHAINI") or cfg.get("fechaini")
        ff = cfg.get("fecha_fin") or cfg.get("FECHAFIN") or cfg.get("fechafin")
        if fi or ff:
            return (str(fi) if fi else None, str(ff) if ff else None)
    return (None, None)


# =========================
# COLORES CONSISTENTES POR CENTRO
# =========================
def _center_color_hex(centro: str) -> str:
    """
    Color estable por centro (hash) -> hex.
    Evita tonos demasiado claros u oscuros.
    """
    s = (centro or "Centro").encode("utf-8")
    h = hashlib.md5(s).hexdigest()

    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)

    def clamp(x):
        return max(40, min(200, x))

    r, g, b = clamp(r), clamp(g), clamp(b)
    return f"#{r:02x}{g:02x}{b:02x}"


def _build_center_palette(indicadores: list) -> dict:
    """Construye paleta global (estable) para TODO el PDF.

    Prioridad:
    1) color definido en centrosCatalogo.json
    2) fallback por hash (estable)
    """
    catalogo = _load_centros_catalogo()
    by_label = catalogo.get("byLabel") or {}

    centros = set()
    for ind in indicadores:
        for it in (ind.get("items") or []):
            c = _clean_text(it.get("centro") or "")
            if c:
                centros.add(c)

    centros = sorted(centros)
    palette = {}
    for c in centros:
        meta = by_label.get(c.lower())
        if meta and meta.get("color"):
            palette[c] = meta["color"]
        else:
            palette[c] = _center_color_hex(c)
    return palette


# =========================
# TRANSFORMACIÓN A DATASET DE INFORME
# =========================
def recopilar_datos_informe(coleccion_resultados, id_transaccion: str) -> Dict[str, Any]:
    docs = list(coleccion_resultados.find({"id_transaccion": id_transaccion}, {"_id": 0}))
    indicadores_meta = _load_indicadores_enriquecidos()
    centros_catalogo = _load_centros_catalogo()
    by_id = centros_catalogo.get("byId") or {}
    by_label = centros_catalogo.get("byLabel") or {}
    by_path = centros_catalogo.get("byPath") or {}
    fecha_ini, fecha_fin = _infer_periodo(docs)

    meta = {
        "id_transaccion": id_transaccion,
        "generado_en": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "num_docs": len(docs),
        "fecha_inicio": fecha_ini,
        "fecha_fin": fecha_fin,
    }

    agrupado: Dict[str, Dict[str, Any]] = {}

    def _resolver_centro(base: Dict[str, Any]) -> Tuple[str, Optional[str], Optional[str]]:
        """Devuelve (label_centro, region, id).

        Resolver por:
        - id (DBx)
        - path (.gdb)
        - label ya proporcionado
        """
        base_id = _clean_text(base.get("id") or base.get("baseId") or base.get("codigo") or "")
        base_path = _clean_text(base.get("path") or base.get("baseData") or base.get("database") or "")
        base_label = _clean_text(base.get("nombre") or base.get("centro") or base.get("label") or "")

        if base_id and base_id in by_id:
            m = by_id[base_id]
            return (_clean_text(m.get("label") or base_label or base_id), _clean_text(m.get("region")), base_id)

        if base_path and base_path.lower() in by_path:
            m = by_path[base_path.lower()]
            return (_clean_text(m.get("label") or base_label or base_path), _clean_text(m.get("region")), _clean_text(m.get("id")))

        if base_label and base_label.lower() in by_label:
            m = by_label[base_label.lower()]
            return (_clean_text(m.get("label") or base_label), _clean_text(m.get("region")), _clean_text(m.get("id")))

        # Fallback: lo que venga
        return (base_label or base_path or base_id or "Centro", None, base_id or None)

    for d in docs:
        indice = d.get("indice") or {}
        payload = d.get("payload") or {}
        base = d.get("base") or {}

        id_code = str(indice.get("id_code") or indice.get("id") or d.get("id_code") or "").strip()
        label = indice.get("label") or d.get("indicador") or payload.get("indicador") or "Indicador"
        label = _clean_text(label)

        centro, region, centro_id = _resolver_centro(base)

        valor_raw = payload.get("resultado", payload.get("valor"))
        pacientes = payload.get("numero_pacientes", payload.get("pacientes"))
        unidad = payload.get("unidad") or d.get("unidad") or ""

        enr = indicadores_meta.get(id_code, {})
        titulo = _clean_text(enr.get("titulo") or label)
        categoria = _clean_text(enr.get("categoria") or indice.get("categoria") or d.get("categoria") or "")
        objetivo = _clean_text(enr.get("objetivo") or "")

        key = id_code or titulo
        if key not in agrupado:
            agrupado[key] = {
                "id_code": id_code,
                "titulo": titulo,
                "categoria": categoria,
                "objetivo": objetivo,
                "unidad": unidad,
                "items": [],
            }

        agrupado[key]["items"].append(
            {
                "centro": centro,
                "region": region,
                "centro_id": centro_id,
                "valor": valor_raw,
                "valor_num": _safe_float(valor_raw),
                "pacientes": pacientes,
            }
        )

        if not agrupado[key]["unidad"] and unidad:
            agrupado[key]["unidad"] = unidad

    indicadores = list(agrupado.values())
    indicadores.sort(key=lambda x: (x.get("categoria", ""), x.get("titulo", "")))

    return {"meta": meta, "indicadores": indicadores}


# =========================
# GRÁFICAS (BARRAS + DONUT GAUGE)
# =========================
def _plot_barras_coloreadas(items: List[Dict[str, Any]], titulo: str, unidad: str, palette: dict) -> Optional[BytesIO]:
    data = []
    for it in items:
        v = it.get("valor_num")
        c = (it.get("centro") or "").strip()
        if v is None or not c:
            continue
        data.append((c, v))

    if not data:
        return None

    df = pd.DataFrame(data, columns=["centro", "valor"])
    # Orden descendente por valor para lectura más clara
    df = df.sort_values(by="valor", ascending=False).reset_index(drop=True)
    colors_list = [palette.get(c, "#4c78a8") for c in df["centro"]]

    n = len(df)
    horizontal = n > 12
    if horizontal:
        fig_h = max(4.0, 0.35 * n)
        fig, ax = plt.subplots(figsize=(10, fig_h))
        ax.barh(df["centro"], df["valor"], color=colors_list)
        ax.invert_yaxis()
        ax.set_xlabel(unidad or "valor")
    else:
        fig_h = 4.0 if n <= 10 else 5.5
        fig, ax = plt.subplots(figsize=(10, fig_h))
        ax.bar(df["centro"], df["valor"], color=colors_list)
        ax.set_ylabel(unidad or "valor")
        ax.tick_params(axis="x", rotation=35)

    ax.set_title(titulo)

    buf = BytesIO()
    plt.tight_layout()
    fig.savefig(buf, format="png", dpi=170)
    plt.close(fig)
    buf.seek(0)
    return buf


def _plot_gauge_donuts_por_centro(items: List[Dict[str, Any]], titulo: str, palette: dict) -> Optional[BytesIO]:
    """
    Donut tipo gauge por centro:
    - Parte rellena = valor (0-100)
    - Resto = gris
    Genera una figura con N donuts (subplots).
    """
    rows_data = []
    for it in items:
        c = (it.get("centro") or "").strip()
        v = it.get("valor_num")
        if not c or v is None:
            continue

        # Clamp a [0,100] para gauge
        v = max(0.0, min(100.0, float(v)))
        rows_data.append((c, v))

    if not rows_data:
        return None

    # Orden por centro (estable)
    rows_data.sort(key=lambda x: x[0])

    n = len(rows_data)
    cols = 3 if n >= 3 else n
    rows = int(np.ceil(n / cols))

    fig_w = 10
    fig_h = 3.6 * rows
    fig, axes = plt.subplots(rows, cols, figsize=(fig_w, fig_h))
    if n == 1:
        axes = np.array([axes])
    axes = axes.flatten()

    for ax in axes[n:]:
        ax.axis("off")

    for i, (centro, v) in enumerate(rows_data):
        ax = axes[i]
        color = palette.get(centro, "#4c78a8")

        ax.pie(
            [v, 100.0 - v],
            startangle=90,
            colors=[color, "#e6e6e6"],
            wedgeprops=dict(width=0.35, edgecolor="white"),
        )
        ax.set(aspect="equal")
        ax.set_title(_clean_text(centro), fontsize=10, pad=6)
        ax.text(0, 0, f"{v:.1f}%", ha="center", va="center", fontsize=12, fontweight="bold")

    fig.suptitle(titulo, fontsize=14)
    buf = BytesIO()
    plt.tight_layout(rect=[0, 0, 1, 0.94])
    fig.savefig(buf, format="png", dpi=170)
    plt.close(fig)
    buf.seek(0)
    return buf


def _is_percent_indicator(unidad: str) -> bool:
    u = (unidad or "").lower()
    return ("%" in u) or ("porcentaje" in u)


def _select_chart(items: List[Dict[str, Any]], titulo: str, unidad: str, palette: dict) -> Optional[BytesIO]:
    """Elige la mejor gráfica según unidad y número de centros."""
    n = len([it for it in items if it.get("valor_num") is not None])
    if n == 0:
        return None

    if _is_percent_indicator(unidad):
        # Donuts solo cuando hay pocos centros; con muchos, barras es más legible.
        if n <= 9:
            buf = _plot_gauge_donuts_por_centro(items, f"{titulo} — % por centro", palette)
            if buf is not None:
                return buf
        return _plot_barras_coloreadas(items, titulo, unidad, palette)

    # Por defecto: barras
    return _plot_barras_coloreadas(items, titulo, unidad, palette)


# =========================
# PDF: ESTILOS
# =========================
def _build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="H1",
        parent=styles["Heading1"],
        fontSize=16,
        leading=18,
        spaceBefore=14,
        spaceAfter=10,
        textColor=colors.HexColor("#1f3b57"),
    ))
    styles.add(ParagraphStyle(
        name="H2",
        parent=styles["Heading2"],
        fontSize=12.5,
        leading=15,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor("#1f3b57"),
    ))
    styles.add(ParagraphStyle(
        name="Small",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=11.5,
        textColor=colors.HexColor("#333333"),
    ))
    styles.add(ParagraphStyle(
        name="Meta",
        parent=styles["Normal"],
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#444444"),
    ))
    styles.add(ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#1f3b57"),
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="CoverSub",
        parent=styles["Normal"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#555555"),
        spaceAfter=10,
    ))
    return styles


# =========================
# PDF: HEADER / FOOTER
# =========================
def _draw_header_footer(canvas, doc, title: str, logo_path: Optional[Path]):
    canvas.saveState()

    # Header
    y = PAGE_HEIGHT - 1.2 * cm

    if logo_path and logo_path.exists():
        try:
            img = ImageReader(str(logo_path))
            iw, ih = img.getSize()
            target_h = 1.88 * cm
            target_w = target_h * (iw / ih)
            canvas.drawImage(img, 2 * cm, y - target_h + 0.05 * cm, width=target_w, height=target_h, mask="auto")
        except Exception:
            pass

    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawRightString(PAGE_WIDTH - 2 * cm, y - 0.1 * cm, _clean_text(title))

    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.6)
    canvas.line(2 * cm, y - 0.25 * cm, PAGE_WIDTH - 2 * cm, y - 0.25 * cm)

    # Footer
    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.line(2 * cm, 1.4 * cm, PAGE_WIDTH - 2 * cm, 1.4 * cm)

    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.setFont("Helvetica", 9)
    canvas.drawString(2 * cm, 1.0 * cm, datetime.now().strftime("%d/%m/%Y %H:%M"))
    canvas.drawRightString(PAGE_WIDTH - 2 * cm, 1.0 * cm, f"Página {doc.page}")

    canvas.restoreState()


# =========================
# PDF: DOCUMENTO CON TOC REAL
# =========================
class InformeDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            if flowable.style.name == "H1":
                text = flowable.getPlainText()
                key = re.sub(r"[^a-zA-Z0-9_]+", "_", text)[:60]
                self.notify("TOCEntry", (0, text, self.page))
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=0, closed=False)


# =========================
# PDF: GENERADOR
# =========================
def generar_informe_pdf(dataset: Dict[str, Any]) -> bytes:
    meta = dataset.get("meta") or {}
    indicadores = dataset.get("indicadores") or []

    # Paleta global (colores consistentes en TODO el informe)
    palette = _build_center_palette(indicadores)

    buffer = BytesIO()
    styles = _build_styles()
    logo_path = _find_logo_path()

    left = 2 * cm
    right = 2 * cm
    top = 2.2 * cm
    bottom = 1.8 * cm

    frame = Frame(
        left,
        bottom,
        PAGE_WIDTH - left - right,
        PAGE_HEIGHT - top - bottom,
        id="normal",
    )

    doc = InformeDoc(
        buffer,
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title=DEFAULT_TITLE,
        author=DEFAULT_SUBTITLE,
    )

    def on_page(canvas, doc_):
        _draw_header_footer(canvas, doc_, DEFAULT_TITLE, logo_path)

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=on_page)])

    story: List[Any] = []

    # ---------- PORTADA ----------
    story.append(Spacer(1, 2.0 * cm))

    if logo_path and logo_path.exists():
        try:
            img = ImageReader(str(logo_path))
            iw, ih = img.getSize()
            max_w = 14 * cm
            max_h = 6 * cm
            scale = min(max_w / iw, max_h / ih)
            w, h = iw * scale, ih * scale
            story.append(RLImage(str(logo_path), width=w, height=h))
            story.append(Spacer(1, 1.2 * cm))
        except Exception:
            story.append(Paragraph("[No se pudo cargar el logo]", styles["Meta"]))
            story.append(Spacer(1, 1.0 * cm))

    story.append(Paragraph(DEFAULT_TITLE, styles["CoverTitle"]))
    story.append(Paragraph(DEFAULT_SUBTITLE, styles["CoverSub"]))
    story.append(Spacer(1, 0.6 * cm))

    periodo_txt = ""
    if meta.get("fecha_inicio") or meta.get("fecha_fin"):
        periodo_txt = f"Periodo: {meta.get('fecha_inicio') or '-'} → {meta.get('fecha_fin') or '-'}"

    story.append(Paragraph(f"<b>Transacción:</b> {meta.get('id_transaccion','')}", styles["Meta"]))
    story.append(Paragraph(f"<b>Generado:</b> {meta.get('generado_en','')}", styles["Meta"]))
    if periodo_txt:
        story.append(Paragraph(f"<b>{periodo_txt}</b>", styles["Meta"]))
    story.append(Paragraph(f"<b>Registros base:</b> {meta.get('num_docs',0)}", styles["Meta"]))

    story.append(PageBreak())

    # ---------- ÍNDICE ----------
    story.append(Paragraph("Índice", styles["H1"]))
    story.append(Spacer(1, 8))

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontSize=11, leftIndent=0, firstLineIndent=0, spaceAfter=6),
    ]
    story.append(toc)
    story.append(PageBreak())

    # ---------- LEYENDA DE COLORES POR CENTRO (global) ----------
    story.append(Paragraph("Leyenda de centros (colores)", styles["H1"]))
    story.append(Spacer(1, 8))

    catalogo = _load_centros_catalogo()
    by_label = catalogo.get("byLabel") or {}

    if palette:
        data = [["Centro", "Región", "Color (HEX)"]]
        for c in sorted(palette.keys()):
            m = by_label.get(c.lower()) or {}
            data.append([c, m.get("region") or "", palette[c]])

        tbl = Table(data, colWidths=[8.2 * cm, 5.0 * cm, 2.3 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3b57")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(tbl)
    else:
        story.append(Paragraph("No se han detectado centros para generar paleta.", styles["Small"]))

    story.append(PageBreak())

    # ---------- SECCIONES POR INDICADOR ----------
    for ind in indicadores:
        titulo = ind.get("titulo") or "Indicador"
        categoria = ind.get("categoria") or ""
        objetivo = ind.get("objetivo") or ""
        unidad = ind.get("unidad") or ""

        story.append(Paragraph(titulo, styles["H1"]))
        if categoria:
            story.append(Paragraph(f"<b>Categoría:</b> {categoria}", styles["Small"]))
        if objetivo:
            story.append(Paragraph(f"<b>Objetivo:</b> {objetivo}", styles["Small"]))
        if unidad:
            story.append(Paragraph(f"<b>Unidad:</b> {unidad}", styles["Small"]))
        story.append(Spacer(1, 10))

        items = ind.get("items") or []

        # Tabla
        table_data = [["Centro", "Valor", "Nº pacientes"]]
        for it in items:
            table_data.append([
                it.get("centro", ""),
                "" if it.get("valor") is None else str(it.get("valor")),
                "" if it.get("pacientes") is None else str(it.get("pacientes")),
            ])

        tbl = Table(table_data, colWidths=[9.5 * cm, 3.0 * cm, 3.0 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F4F8")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1f3b57")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("FONTSIZE", (0, 1), (-1, -1), 9.5),
            ("ALIGN", (1, 1), (2, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.whitesmoke]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 12))

        # --- GRÁFICAS ---
        if len(items) >= 2:
            story.append(Paragraph("Comparativa global", styles["H2"]))
        buf_global = _select_chart(items, titulo, unidad, palette)
        if buf_global is not None:
            try:
                story.append(RLImage(buf_global, width=16.5 * cm, height=7.0 * cm))
                story.append(Spacer(1, 6))
            except Exception:
                story.append(Paragraph("[No se pudo insertar la gráfica global]", styles["Small"]))
        else:
            story.append(Paragraph("No hay valores numéricos suficientes para generar gráfica.", styles["Small"]))

        # Por región (zona)
        region_map: Dict[str, List[Dict[str, Any]]] = {}
        for it in items:
            r = _clean_text(it.get("region") or "") or "(Sin región)"
            region_map.setdefault(r, []).append(it)

        regiones_ordenadas = sorted(region_map.keys(), key=lambda x: (x == "(Sin región)", x))
        for region in regiones_ordenadas:
            sub_items = region_map[region]
            centros_distintos = sorted({(_clean_text(i.get("centro") or "")) for i in sub_items if i.get("centro")})
            if len(centros_distintos) < 2:
                continue

            story.append(Spacer(1, 8))
            story.append(Paragraph(f"Comparativa por región: {region}", styles["H2"]))

            buf_reg = _select_chart(sub_items, f"{titulo} — {region}", unidad, palette)
            if buf_reg is not None:
                try:
                    story.append(RLImage(buf_reg, width=16.5 * cm, height=7.0 * cm))
                except Exception:
                    story.append(Paragraph("[No se pudo insertar la gráfica por región]", styles["Small"]))

        story.append(Spacer(1, 6))
        story.append(Paragraph("Colores consistentes por centro en todo el informe.", styles["Small"]))

        story.append(PageBreak())

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================
# CACHE PDF EN MONGO
# =========================
def obtener_pdf_guardado(db, id_transaccion: str) -> Optional[bytes]:
    col = db["informes_pdf"]
    doc = col.find_one({"id_transaccion": id_transaccion}, {"_id": 0, "pdf": 1})
    if not doc:
        return None

    pdf = doc.get("pdf")
    if isinstance(pdf, Binary):
        return bytes(pdf)
    if isinstance(pdf, (bytes, bytearray)):
        return bytes(pdf)
    return None


def guardar_pdf(db, id_transaccion: str, pdf_bytes: bytes) -> None:
    col = db["informes_pdf"]
    col.update_one(
        {"id_transaccion": id_transaccion},
        {"$set": {"id_transaccion": id_transaccion, "pdf": Binary(pdf_bytes)}},
        upsert=True
    )


def obtener_o_generar_pdf(id_transaccion: str) -> bytes:
    db = conectar_calidad()

    cached = obtener_pdf_guardado(db, id_transaccion)
    if cached and cached.startswith(b"%PDF"):
        return cached

    # Ajusta esta colección si tu backend guarda en otra:
    col_resultados = db["resultados"]
    dataset = recopilar_datos_informe(col_resultados, id_transaccion=id_transaccion)

    pdf_bytes = generar_informe_pdf(dataset)

    if pdf_bytes and pdf_bytes.startswith(b"%PDF"):
        guardar_pdf(db, id_transaccion, pdf_bytes)

    return pdf_bytes
