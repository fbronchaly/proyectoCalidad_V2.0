import os
import re
import hashlib
from pathlib import Path
from io import BytesIO
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import Response

from dotenv import load_dotenv
from pymongo import MongoClient
from bson.binary import Binary

import pandas as pd
import matplotlib
matplotlib.use("Agg")  # imprescindible en Docker (sin display)
import matplotlib.pyplot as plt
import numpy as np

# --- CONFIGURACIÓN ESTILO GRÁFICOS ---
# Configuramos un estilo global más moderno para matplotlib
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica', 'sans-serif']
plt.rcParams['axes.spines.top'] = False
plt.rcParams['axes.spines.right'] = False
plt.rcParams['axes.spines.left'] = False  # Opcional: quitar eje Y para barras horizontales
plt.rcParams['axes.grid'] = True
plt.rcParams['grid.alpha'] = 0.3
plt.rcParams['grid.linestyle'] = '--'
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.titleweight'] = 'bold'
plt.rcParams['axes.labelsize'] = 11

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
    KeepTogether
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
    """Intenta extraer las fechas de consulta de los documentos."""
    for d in docs:
        # Buscamos en varios posibles lugares donde el backend guarda la config
        cfg = d.get("config") or {}
        payload = d.get("payload") or {}
        
        fi = (
            cfg.get("fecha_inicio") or cfg.get("fechaInicio") or 
            cfg.get("FECHAINI") or cfg.get("fechaini") or
            payload.get("fecha_inicio") or payload.get("fechaInicio")
        )
        ff = (
            cfg.get("fecha_fin") or cfg.get("fechaFin") or 
            cfg.get("FECHAFIN") or cfg.get("fechafin") or
            payload.get("fecha_fin") or payload.get("fechaFin")
        )
        
        if fi or ff:
            # Limpiamos formato si viene con hora
            if isinstance(fi, str) and "T" in fi: fi = fi.split("T")[0]
            if isinstance(ff, str) and "T" in ff: ff = ff.split("T")[0]
            return (str(fi) if fi else None, str(ff) if ff else None)
    return (None, None)


# =========================
# COLORES CONSISTENTES POR CENTRO
# =========================
def _center_color_hex(centro: str) -> str:
    """
    Color estable por centro (hash) -> hex.
    Genera una paleta profesional basada en el nombre.
    """
    s = (centro or "Centro").encode("utf-8")
    h = hashlib.md5(s).hexdigest()
    # Usamos una semilla determinista para elegir de una paleta predefinida profesional
    # en lugar de generar colores RGB aleatorios que pueden salir feos.
    paleta_profesional = [
        "#2E86C1", "#1ABC9C", "#F39C12", "#E74C3C", "#8E44AD", 
        "#34495E", "#16A085", "#D35400", "#C0392B", "#27AE60",
        "#2980B9", "#7F8C8D", "#9B59B6", "#E67E22", "#008080"
    ]
    idx = int(h, 16) % len(paleta_profesional)
    return paleta_profesional[idx]

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
# GRÁFICAS ESPECTACULARES
# =========================
def _plot_barras_coloreadas(items: List[Dict[str, Any]], titulo: str, unidad: str, palette: dict) -> Optional[BytesIO]:
    data = []
    for it in items:
        v = it.get("valor_num")
        c = (it.get("centro") or "").strip()
        # Filtramos None, pero permitimos 0 para dibujarlos si existen
        if v is None or not c:
            continue
        data.append((c, v))

    if not data:
        return None
    
    # Si todos son 0, devolvemos None para que el PDF maneje el mensaje de texto
    if all(d[1] == 0 for d in data):
        return None

    df = pd.DataFrame(data, columns=["centro", "valor"])
    # Orden descendente por valor para lectura más clara
    df = df.sort_values(by="valor", ascending=True).reset_index(drop=True)
    colors_list = [palette.get(c, "#4c78a8") for c in df["centro"]]

    n = len(df)
    
    # Ajuste dinámico de altura
    fig_h = max(4.5, 0.5 * n + 1.5)
    fig, ax = plt.subplots(figsize=(10, fig_h))
    
    bars = ax.barh(df["centro"], df["valor"], color=colors_list, height=0.7, edgecolor='white', linewidth=1)
    
    ax.set_xlabel(unidad or "Valor", fontweight='bold', color='#555555')
    
    max_val = df["valor"].max() if not df.empty else 1
    if max_val == 0: max_val = 1
    
    offset = max_val * 0.01

    for bar in bars:
        width = bar.get_width()
        label_x_pos = width + offset
        # Etiqueta de valor
        ax.text(label_x_pos, bar.get_y() + bar.get_height()/2, f'{width:.2f}', 
                va='center', ha='left', fontsize=9, fontweight='bold', color='#333333')

    # Ajustar límite X
    ax.set_xlim(0, max_val * 1.15)
    
    # --- LÍNEA FINA VISIBLE PARA VALORES ALTOS (GRID) ---
    # Grid vertical más visible
    ax.grid(axis='y', alpha=0)
    ax.grid(axis='x', color='#aaaaaa', linestyle='--', linewidth=0.8, alpha=0.5)
    # Línea sutil en el borde derecho o valor máximo referencial
    ax.axvline(x=max_val, color='#dedede', linestyle='-', linewidth=1, alpha=0.8, zorder=0)

    buf = BytesIO()
    plt.tight_layout()
    fig.savefig(buf, format="png", dpi=200, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf


def _plot_polar_porcentaje(items: List[Dict[str, Any]], titulo: str, palette: dict) -> Optional[BytesIO]:
    """
    Gráfico polar (diente de sierra / donut variable) para porcentajes.
    Muestra todos los centros en un solo gráfico con radio variable.
    """
    data = []
    for it in items:
        c = (it.get("centro") or "").strip()
        v = it.get("valor_num")
        if not c or v is None: continue
        data.append((c, max(0.0, min(100.0, float(v)))))

    if not data:
        return None
    
    # Si todos son 0, no pintar gráfico para mostrar texto
    if all(d[1] == 0 for d in data):
        return None

    # Ordenar por nombre para estabilidad y localización
    data.sort(key=lambda x: x[0])

    centros = [x[0] for x in data]
    valores = [x[1] for x in data]
    colors_list = [palette.get(c, "#4c78a8") for c in centros]

    N = len(centros)
    theta = np.linspace(0.0, 2 * np.pi, N, endpoint=False)
    
    # "Diente plano": Ancho cubre todo el sector
    width = (2 * np.pi) / N 

    fig_size = 8.0
    fig = plt.figure(figsize=(fig_size, fig_size))
    ax = fig.add_subplot(111, projection='polar')

    # bottom=20 hace el efecto de donut (agujero en el centro)
    # bars sobresalen desde el radio 20 hasta 20+valor
    RADIO_INTERIOR = 20
    
    # Dibujamos las barras
    # Usamos bottom=RADIO_INTERIOR para que haya agujero
    bars = ax.bar(theta, valores, width=width, bottom=RADIO_INTERIOR, 
                  color=colors_list, alpha=1.0, edgecolor='white', linewidth=1.5) # Alpha 1.0 para nitidez

    ax.set_yticklabels([])
    ax.set_theta_zero_location('N') # Norte arriba
    ax.set_theta_direction(-1) # Sentido reloj
    
    # Eliminamos circulos concéntricos y bordes para máxima limpieza visual
    ax.grid(False)
    ax.spines['polar'].set_visible(False)
    
    # Límite fijo: 100% + radio interior
    ax.set_ylim(0, 100 + RADIO_INTERIOR) 

    # Etiquetas de los centros (fuera)
    ax.set_xticks(theta)
    ax.set_xticklabels(centros, fontweight='bold', fontsize=9)

    # Etiquetas de valor (dentro de la barra, en el extremo)
    for bar, angle, val in zip(bars, theta, valores):
        # Posición del texto un poco más adentro del borde exterior de la barra para que se lea sobre el color
        # O fuera si es pequeño.
        # Estrategia: Ponemos el valor FUERA de la barra para contraste máximo y nitidez
        pos_r = RADIO_INTERIOR + val + 5  # Un poco separado del borde
        
        ax.text(angle, pos_r, f"{val:.1f}%", 
                ha='center', va='center', fontsize=10, fontweight='bold', color='#333333')

    plt.tight_layout()
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=220, bbox_inches='tight', transparent=True)
    plt.close(fig)
    buf.seek(0)
    return buf


def _is_percent_indicator(unidad: str) -> bool:
    u = (unidad or "").lower()
    return ("%" in u) or ("porcentaje" in u)


def _select_chart(items: List[Dict[str, Any]], titulo: str, unidad: str, palette: dict) -> Optional[BytesIO]:
    """Elige la mejor gráfica según unidad y número de centros."""
    # Filtramos nulos, pero mantenemos ceros para evaluar si "todo es cero" después
    validos = [it for it in items if it.get("valor_num") is not None]
    
    # Si no hay datos (lista vacía), chart es None
    if not validos:
        return None
    
    # Comprobación de "todo ceros" se hace dentro de las funciones de plot para devolver None
    
    if _is_percent_indicator(unidad):
        return _plot_polar_porcentaje(validos, titulo, palette)

    return _plot_barras_coloreadas(validos, titulo, unidad, palette)


# =========================
# PDF: ESTILOS
# =========================
def _build_styles():
    styles = getSampleStyleSheet()

    # --- PALETA DE COLORES PDF ---
    corp_dark = colors.HexColor("#1A3A58") # Azul oscuro corporativo
    corp_blue = colors.HexColor("#2E86C1") # Azul medio
    corp_gray = colors.HexColor("#5D6D7E") # Gris azulado

    styles.add(ParagraphStyle(
        name="H1",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        spaceBefore=18,
        spaceAfter=12,
        textColor=corp_dark,
        borderPadding=0,
        fontName="Helvetica-Bold"
    ))
    styles.add(ParagraphStyle(
        name="H2",
        parent=styles["Heading2"],
        fontSize=14,
        leading=16,
        spaceBefore=14,
        spaceAfter=8,
        textColor=corp_blue,
        fontName="Helvetica-Bold"
    ))
    styles.add(ParagraphStyle(
        name="Small",
        parent=styles["Normal"],
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#444444"),
    ))
    styles.add(ParagraphStyle(
        name="Meta",
        parent=styles["Normal"],
        fontSize=11,
        leading=14,
        textColor=corp_gray,
    ))
    styles.add(ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontSize=28,
        leading=34,
        textColor=corp_dark,
        spaceAfter=16,
        fontName="Helvetica-Bold",
        alignment=1 # Center
    ))
    styles.add(ParagraphStyle(
        name="CoverSub",
        parent=styles["Normal"],
        fontSize=16,
        leading=20,
        textColor=corp_gray,
        spaceAfter=20,
        alignment=1 # Center
    ))
    return styles


# =========================
# PDF: HEADER / FOOTER
# =========================
def _draw_header_footer(canvas, doc, title: str, logo_path: Optional[Path]):
    canvas.saveState()

    # Header
    # Ajustamos anagrama más hacia la esquina (margen izq 1.5cm, más arriba)
    y_header = PAGE_HEIGHT - 1.0 * cm 
    margin_x = 1.5 * cm

    if logo_path and logo_path.exists():
        try:
            img = ImageReader(str(logo_path))
            iw, ih = img.getSize()
            target_h = 1.8 * cm
            target_w = target_h * (iw / ih)
            # Dibujamos logo
            canvas.drawImage(img, margin_x, y_header - target_h, width=target_w, height=target_h, mask="auto")
        except Exception:
            pass

    # Título a la derecha
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawRightString(PAGE_WIDTH - 2 * cm, y_header - 0.9 * cm, _clean_text(title))

    # Línea horizontal MÁS BAJA que el anagrama
    # El logo termina en (y_header - target_h). Bajamos un poco más (0.3cm gap)
    y_line = y_header - 1.8 * cm - 0.3 * cm
    
    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.6)
    canvas.line(margin_x, y_line, PAGE_WIDTH - 2 * cm, y_line)

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

    # ---------- PORTADA "ESPECTACULAR" ----------
    story.append(Spacer(1, 3.0 * cm))

    # Logo centrado y más grande
    if logo_path and logo_path.exists():
        try:
            img = ImageReader(str(logo_path))
            iw, ih = img.getSize()
            max_w = 12 * cm
            max_h = 5 * cm
            scale = min(max_w / iw, max_h / ih)
            w, h = iw * scale, ih * scale
            # Truco para centrar imagen: Meterla en una tabla de una celda centrada o usar flowable alignment
            story.append(RLImage(str(logo_path), width=w, height=h)) 
            story.append(Spacer(1, 1.5 * cm))
        except Exception:
            pass

    story.append(Paragraph(DEFAULT_TITLE, styles["CoverTitle"]))
    story.append(Paragraph(DEFAULT_SUBTITLE, styles["CoverSub"]))
    
    story.append(Spacer(1, 1.5 * cm))
    
    # Caja de metadatos estilizada
    periodo_txt = "-"
    if meta.get("fecha_inicio") or meta.get("fecha_fin"):
        periodo_txt = f"{meta.get('fecha_inicio') or '?'} al {meta.get('fecha_fin') or '?'}"

    # Tabla decorativa para la portada
    cover_data = [
        ["FECHA DE GENERACIÓN", meta.get('generado_en','')],
        ["PERIODO ANALIZADO", periodo_txt],
        ["ID TRANSACCIÓN", meta.get('id_transaccion','')],
        ["REGISTROS PROCESADOS", str(meta.get('num_docs',0))]
    ]
    
    t_cover = Table(cover_data, colWidths=[6*cm, 8*cm])
    t_cover.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#F2F4F4")),
        ('TEXTCOLOR', (0,0), (0,-1), colors.HexColor("#1A3A58")),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.white), # Grid blanco para separar
        ('ALIGN', (0,0), (0,-1), 'RIGHT'),
        ('ALIGN', (1,0), (1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ]))
    story.append(t_cover)

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

    # ---------- SECCIONES POR INDICADOR ----------
    for i, ind in enumerate(indicadores):
        titulo = ind.get("titulo") or "Indicador"
        categoria = ind.get("categoria") or ""
        objetivo = ind.get("objetivo") or ""
        unidad = ind.get("unidad") or ""

        # Agrupamos todo el bloque del indicador para intentar que no se rompa feo,
        # aunque si es muy grande ReportLab lo romperá igual.
        # Usamos KeepTogether para título + tabla si es posible.
        
        elements = []
        
        elements.append(Paragraph(titulo, styles["H1"]))
        
        meta_info = []
        if categoria: meta_info.append(f"<b>Categoría:</b> {categoria}")
        if objetivo: meta_info.append(f"<b>Objetivo:</b> {objetivo}")
        if unidad: meta_info.append(f"<b>Unidad:</b> {unidad}")
        
        if meta_info:
            elements.append(Paragraph(" | ".join(meta_info), styles["Small"]))
        
        elements.append(Spacer(1, 10))

        items = ind.get("items") or []

        # Tabla
        table_data = [["Centro", "Valor", "Nº pacientes"]]
        valores_numeros = []
        for it in items:
            val = it.get("valor_num")
            if val is not None: valores_numeros.append(val)
            
            table_data.append([
                it.get("centro", ""),
                "" if it.get("valor") is None else str(it.get("valor")),
                "" if it.get("pacientes") is None else str(it.get("pacientes")),
            ])

        tbl = Table(table_data, colWidths=[9.5 * cm, 3.0 * cm, 3.0 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2471A3")), 
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("FONTSIZE", (0, 1), (-1, -1), 10),
            ("ALIGN", (1, 1), (2, -1), "CENTER"), 
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D5D8DC")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F6F7")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(tbl)
        elements.append(Spacer(1, 15))

        # --- GRÁFICAS ---
        # Verificamos si hay algún valor > 0 para mostrar título de gráfica
        # O si el usuario pide mostrar "Datos son 0"
        
        all_zeros = (len(valores_numeros) > 0) and (sum(valores_numeros) == 0)
        
        if len(items) >= 2:
             elements.append(Paragraph("Visualización Gráfica", styles["H2"]))
        
        buf_global = _select_chart(items, titulo, unidad, palette)
        
        if buf_global is not None:
            try:
                # Ajustamos tamaño segun tipo
                elements.append(RLImage(buf_global, width=16.5 * cm, height=7.5 * cm))
                elements.append(Spacer(1, 6))
            except Exception:
                pass
        else:
            # Si select_chart devuelve None puede ser porque no hay datos o porque son todos 0
            if all_zeros:
                # Caso solicitado: Mostrar texto indicando ceros y NO mostrar gráfica
                elements.append(Spacer(1, 10))
                # Caja gris con texto
                t_msg = Table([["Los datos resultantes para este indicador son 0 (Cero)."]], colWidths=[16*cm])
                t_msg.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F0F0F0")),
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#888888")),
                    ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Oblique'),
                    ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CCCCCC")),
                    ('TOPPADDING', (0,0), (-1,-1), 12),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 12),
                ]))
                elements.append(t_msg)
            else:
                elements.append(Paragraph("Datos insuficientes para generar gráfica.", styles["Small"]))

        # (Omitimos gráfica por regiones para simplificar el flujo continuo, a menos que sea crítica)
        # El user pidió "distribuya coherentemente". Menos es más. 
        # Si la global ya muestra todo (como el polar), la regional sobra.
        # Solo añadimos footer de nota
        elements.append(Spacer(1, 15))
        
        # Añadimos al story principal
        # Usamos KeepTogether para intentar mantener el bloque unido, pero si es muy grande fallará
        # Mejor añadimos directo, separando indicadores con Spacer grande en vez de PageBreak
        
        story.extend(elements)
        
        # Separador entre indicadores
        if i < len(indicadores) - 1:
            story.append(Spacer(1, 2.5 * cm))
            # Opcional: Linea separadora
            story.append(Paragraph("<seq id='indicators'/> _______________________________________________________________________", styles["Meta"]))
            story.append(Spacer(1, 1.5 * cm))

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


# =========================
# API (FASTAPI)
# =========================
app = FastAPI(
    title="Servicio de Generación de Informes (Calidad)",
    description="Microservicio para generar PDF con gráficas a partir de resultados en Mongo.",
    version="1.0.0",
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "calidad-python-pdf"}

@app.get("/health")
def health_check():
    try:
        mongo_ping()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")

@app.post("/informe")
async def generar_informe_endpoint(id_transaccion: str = Query(..., description="UUID de la transacción")):
    """
    Genera (o recupera) el informe PDF para una transacción dada.
    Devuelve el archivo PDF en streaming.
    """
    if not id_transaccion:
        raise HTTPException(status_code=400, detail="Falta id_transaccion")

    try:
        print(f"🔹 [POST /informe] Solicitud recibida para id_transaccion={id_transaccion}")
        pdf_bytes = obtener_o_generar_pdf(id_transaccion)

        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="No se encontraron datos para generar informe o error interno.")

        return Response(content=pdf_bytes, media_type="application/pdf")

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno generando PDF: {str(e)}")
