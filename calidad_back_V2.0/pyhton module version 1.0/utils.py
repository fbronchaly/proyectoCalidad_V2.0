import os
import re
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
# UTILIDADES DE DATOS
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


def _clean_text(s: str) -> str:
    if s is None:
        return ""
    # evita caracteres raros en PDF
    return re.sub(r"\s+", " ", str(s)).strip()


def _load_indicadores_enriquecidos() -> Dict[str, Dict[str, Any]]:
    """
    Devuelve dict id_code -> metadata (categoria, titulo, objetivo, unidad, grafico...)
    """
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


def _find_logo_path() -> Optional[Path]:
    for p in LOGO_CANDIDATES:
        if p.exists():
            return p
    return None


def _infer_periodo(docs: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """
    Intenta inferir fecha_inicio y fecha_fin si vienen en los docs.
    """
    for d in docs:
        cfg = d.get("config") or {}
        fi = cfg.get("fecha_inicio") or cfg.get("FECHAINI") or cfg.get("fechaini")
        ff = cfg.get("fecha_fin") or cfg.get("FECHAFIN") or cfg.get("fechafin")
        if fi or ff:
            return (str(fi) if fi else None, str(ff) if ff else None)
    return (None, None)


# =========================
# TRANSFORMACIÓN A SECCIONES
# =========================
def recopilar_datos_informe(coleccion_resultados, id_transaccion: str) -> Dict[str, Any]:
    """
    Carga docs desde Mongo y prepara estructura rica para informe.
    Estructura salida:
    {
      meta: {...},
      indicadores: [
        { id_code, titulo, categoria, objetivo, unidad, items:[{centro, valor, pacientes}], ... }
      ]
    }
    """
    docs = list(coleccion_resultados.find({"id_transaccion": id_transaccion}, {"_id": 0}))

    indicadores_meta = _load_indicadores_enriquecidos()

    fecha_ini, fecha_fin = _infer_periodo(docs)

    meta = {
        "id_transaccion": id_transaccion,
        "generado_en": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "num_docs": len(docs),
        "fecha_inicio": fecha_ini,
        "fecha_fin": fecha_fin,
    }

    agrupado: Dict[str, Dict[str, Any]] = {}

    for d in docs:
        indice = d.get("indice") or {}
        payload = d.get("payload") or {}
        base = d.get("base") or {}

        id_code = str(indice.get("id_code") or indice.get("id") or d.get("id_code") or "").strip()

        # nombre “humano”
        label = indice.get("label") or d.get("indicador") or payload.get("indicador") or "Indicador"
        label = _clean_text(label)

        # centro
        centro = base.get("nombre") or base.get("centro") or base.get("baseData") or "Centro"
        centro = _clean_text(centro)

        # valor / pacientes / unidad
        valor_raw = payload.get("resultado", payload.get("valor"))
        pacientes = payload.get("numero_pacientes", payload.get("pacientes"))
        unidad = payload.get("unidad") or d.get("unidad") or ""

        # enriquecimiento por id_code
        enr = indicadores_meta.get(id_code, {})
        titulo = _clean_text(enr.get("titulo") or label)
        categoria = _clean_text(enr.get("categoria") or indice.get("categoria") or d.get("categoria") or "")
        objetivo = _clean_text(enr.get("objetivo") or "")

        key = id_code or titulo  # clave estable
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
                "valor": valor_raw,
                "valor_num": _safe_float(valor_raw),
                "pacientes": pacientes,
            }
        )

        # si unidad viene vacía pero en algún doc sí
        if not agrupado[key]["unidad"] and unidad:
            agrupado[key]["unidad"] = unidad

    indicadores = list(agrupado.values())

    # orden: por categoría y título
    indicadores.sort(key=lambda x: (x.get("categoria", ""), x.get("titulo", "")))

    return {"meta": meta, "indicadores": indicadores}


# =========================
# GRÁFICOS
# =========================
def _plot_barras(items: List[Dict[str, Any]], titulo: str, unidad: str) -> Optional[BytesIO]:
    data = []
    for it in items:
        v = it.get("valor_num")
        if v is None:
            continue
        data.append((it.get("centro", ""), v))

    if not data:
        return None

    df = pd.DataFrame(data, columns=["centro", "valor"])
    # si hay muchos centros, limita altura
    fig_h = 4.0
    if len(df) > 10:
        fig_h = 5.5

    fig, ax = plt.subplots(figsize=(10, fig_h))
    ax.bar(df["centro"], df["valor"])
    ax.set_title(titulo)
    ax.set_ylabel(unidad or "valor")
    ax.tick_params(axis="x", rotation=35)

    buf = BytesIO()
    plt.tight_layout()
    fig.savefig(buf, format="png", dpi=170)
    plt.close(fig)
    buf.seek(0)
    return buf


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
        leading=14.5,
        spaceBefore=10,
        spaceAfter=8,
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
            target_h = 0.55 * cm
            target_w = target_h * (iw / ih)
            canvas.drawImage(img, 2 * cm, y - target_h + 0.05 * cm, width=target_w, height=target_h, mask="auto")
        except Exception:
            pass

    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawRightString(PAGE_WIDTH - 2 * cm, y - 0.1 * cm, _clean_text(title))

    # Divider line
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
    def __init__(self, filename_or_buffer, **kwargs):
        super().__init__(filename_or_buffer, **kwargs)
        self._toc = None

    def afterFlowable(self, flowable):
        """
        Notifica entradas del índice cuando pasamos por un H1/H2.
        """
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            text = flowable.getPlainText()
            if style == "H1":
                key = re.sub(r"[^a-zA-Z0-9_]+", "_", text)[:60]
                self.notify("TOCEntry", (0, text, self.page))
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=0, closed=False)
            elif style == "H2":
                self.notify("TOCEntry", (1, text, self.page))


# =========================
# PDF: GENERADOR PRINCIPAL
# =========================
def generar_informe_pdf(dataset: Dict[str, Any]) -> bytes:
    """
    Genera PDF válido y devuelve bytes.
    """
    meta = dataset.get("meta") or {}
    indicadores = dataset.get("indicadores") or []

    buffer = BytesIO()

    styles = _build_styles()
    logo_path = _find_logo_path()

    # Márgenes y frame (dejamos espacio a cabecera/pie)
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

            # centrado
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
        ParagraphStyle(name="TOC1", fontSize=10, leftIndent=16, firstLineIndent=0, spaceAfter=4, textColor=colors.HexColor("#444444")),
    ]
    story.append(toc)
    story.append(PageBreak())

    # ---------- RESUMEN EJECUTIVO ----------
    story.append(Paragraph("Resumen ejecutivo", styles["H1"]))
    story.append(Spacer(1, 6))

    # resumen por categoría: nº indicadores
    cat_counts: Dict[str, int] = {}
    for ind in indicadores:
        cat = ind.get("categoria") or "Sin categoría"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    story.append(Paragraph(
        "Este informe consolida los resultados analíticos por centro y por indicador. "
        "Incluye tablas y gráficos para facilitar la interpretación comparativa.",
        styles["Small"]
    ))
    story.append(Spacer(1, 10))

    if cat_counts:
        data = [["Categoría", "Indicadores"]] + [[c, str(n)] for c, n in sorted(cat_counts.items(), key=lambda x: (-x[1], x[0]))]
        tbl = Table(data, colWidths=[12.5 * cm, 3.0 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3b57")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 12))

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
        # tabla
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
        story.append(Spacer(1, 10))

        # gráfico
        buf = _plot_barras(items, titulo, unidad)
        if buf is not None:
            try:
                story.append(RLImage(buf, width=16.5 * cm, height=7.0 * cm))
                story.append(Spacer(1, 8))
                story.append(Paragraph("Figura: Comparativa por centro.", styles["Small"]))
            except Exception:
                story.append(Paragraph("[No se pudo insertar el gráfico]", styles["Small"]))
        else:
            story.append(Paragraph("No se dispone de valores numéricos suficientes para generar gráfico.", styles["Small"]))

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

    # 1) Cache
    cached = obtener_pdf_guardado(db, id_transaccion)
    if cached and cached.startswith(b"%PDF"):
        return cached

    # 2) Dataset desde resultados
    # OJO: aquí usas "resultados" (según tu módulo actual).
    # Si en tu backend Node guardas en otra colección, cámbialo aquí.
    col_resultados = db["resultados"]
    dataset = recopilar_datos_informe(col_resultados, id_transaccion=id_transaccion)

    pdf_bytes = generar_informe_pdf(dataset)

    # 3) Guardar cache
    if pdf_bytes and pdf_bytes.startswith(b"%PDF"):
        guardar_pdf(db, id_transaccion, pdf_bytes)

    return pdf_bytes
