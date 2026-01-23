import json
from turtle import width
from matplotlib.ticker import MaxNLocator
import pymongo
from pymongo import MongoClient
from dotenv import load_dotenv
import os
from bson.objectid import ObjectId
from datetime import datetime
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from bson.binary import Binary
import io
import pandas as pd
from requests import get
import seaborn as sns
import re
from pathlib import Path

# Para generar el informe final
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors

def conectar_calidad(): 
    '''
    Conecta con la base de datos de DatosCalidad en MongoDB. 

    Args: 
        None
    Returns: 
        Object: Objeto de la base de datos MongoDB.
    '''
    BASE_DIR= Path(__file__).resolve().parent
    DATA_FILE= BASE_DIR / '.env'

    load_dotenv(DATA_FILE)
    mongo_uri = os.getenv('MONGO_URI')
    client= MongoClient(mongo_uri)
    db= client.DatosCalidad
    return db

def obtener_periodo(coleccion, id_transaccion):
    '''
    Obtiene el periodo de tiempo consultado.

    Args: 
        coleccion (object): Objeto de una colección de MongoDB. 
        id_transaccion (string): Identificador de transacción.
    Returns: 
        tuple : fechas de inicio y fin (str, día/mes/año/) del período aplicado en la transacción.
    '''
    pipeline= [{'$match': {'id_transaccion': id_transaccion}},
               {'$limit':1},
               {'$project':{
                   '_id':0,
                   'periodo_aplicado':'$metadata_calculo.intervalo'}}]
    fechas= coleccion.aggregate(pipeline)
    formato ='%d/%m/%Y'
    for periodo in fechas: 
        fecha_inicio= datetime.strptime(re.search(r'(\d{4}-\d{2}-\d{2}) -', periodo['periodo_aplicado']).group(1),"%Y-%m-%d").strftime(formato) 
        fecha_fin= datetime.strptime(re.search(r'- (\d{4}-\d{2}-\d{2})', periodo['periodo_aplicado']).group(1),"%Y-%m-%d") .strftime(formato)
    periodo= (fecha_inicio, fecha_fin)
    return periodo

def obtener_cursor(coleccion, id_transaccion):
    '''
    Obtiene un cursor iterable en el cual se agrupan los resultados por indicador, 
    y dentro de cada indicador se recogen valores, unidades y pacientes de cada uno de los centros solicitados.

    Args: 
        coleccion (object): Objeto de una colección de MongoDb
        id_transaccion (string): Identificador de transacción.
    Return: 
        pymongo.cursor.Cursor: Objeto iterable de la consulta.
    '''
    pipeline=[{'$match': {'id_transaccion': id_transaccion}},
              {'$group':{
                  '_id': '$indice.label',
                  'centros':{
                      '$push':{
                          'nombre_centro': '$base.nombre',
                          'valor': '$payload.valor',
                          'unidad':'$payload.unidad', 
                          'pacientes': '$payload.numero_pacientes'
                      }}
                  }},
                  {'$project':{
                      '_id':0,
                      'indicador':'$_id',
                      'centros':'$centros'
                  }},
                  {'$sort': {'indicador':1}}]
    resultados=coleccion.aggregate(pipeline)
    return resultados

def listar_indicadores_normalizados():
    """
        Carga un archivo JSON de indicadores y construye un diccionario indexado
        por el nombre normalizado de cada indicador.

        El archivo JSON se lee desde una ruta fija y debe contener una lista de
        objetos, cada uno con la clave "indicador". El nombre del indicador se
        normaliza eliminando espacios en los extremos y convirtiéndolo a minúsculas,
        lo que permite un acceso directo y consistente a los datos.

        Returns:
            dict: Diccionario donde las claves son los nombres de los indicadores
            normalizados (str) y los valores son los objetos completos asociados
            a cada indicador.
"""
    BASE_DIR= Path(__file__).resolve().parent
    DATA_FILE= BASE_DIR / 'indicadores_enriquecidos.json'
    with open (DATA_FILE, 'r', encoding='utf-8-sig') as indice: 
        indicadores= json.load(indice)
    indice_indicadores ={item["indicador"].strip().lower(): item for item in indicadores} #Se crea una clave para cada indicador (nombre indicador) para acceder directamente.
    return indice_indicadores

#RESUMEN 
def generar_resumen (indicadores, centros, fechas): 
    '''
    Genera el texto del párrafo resumen.

    Args: 
        indicadores (list): Lista de indicadores solicitados.
        centros (list): Lista de centros solicitados.
        fechas (tuple): Fecha de inicio, fecha final.
    Returns: 
        string : Texto resumen.
    '''
    separador= '.<br/>'
    resumen = f"La consulta incluye los siguientes índices:<br/><br/><b>{separador.join(indicadores)}.</b><br/><br/>"
    resumen += f"Para los centros: <b>{', '.join(centros)}.</b><br/><br/>"
    resumen += f"En el período comprendido entre <b>{fechas[0]}</b> y <b>{fechas[1]}.</b>"
    return resumen

# GRÁFICOS
def crear_pie_chart(data, unidad):
    '''
    Genera un gráfico de pastel tipo donut que muestra la distribución de valores
    por centro, filtrando aquellos que no alcanzan un umbral mínimo de representación.

    Solo se incluyen en el gráfico los centros cuyo valor represente al menos
    el 1% del total. Además, se resaltan (explode) las rebanadas más relevantes
    según su peso relativo, y se añade un texto central con el total acumulado
    y su unidad de medida.

    Args:
        data (dict): Diccionario que contiene la información a representar.
            Debe incluir las claves:
            - 'nombres_centros' (list[str]): Nombres de los centros.
            - 'valores' (list[float | int]): Valores asociados a cada centro.
        unidad (str): Unidad de medida que se mostrará junto al total en el
            centro del gráfico.

    Returns:
        matplotlib.figure.Figure: Objeto figura de Matplotlib que contiene
        el gráfico generado.
'''
    
    #eliminar aquellos centros con valor 0 para no mostrarlos en el gráfico
    nombres_centros_filtrados= []
    valores_filtrados=[]
    for i in range (len(data['valores'])):
        if data['valores'][i]/sum(data['valores']) >= 0.01: #Mostrar solo aquellos centros que representen al menos el 1% del total
            nombres_centros_filtrados.append(data['nombres_centros'][i])
            valores_filtrados.append(data['valores'][i])

    fig, ax = plt.subplots(figsize=(16, 10), subplot_kw=dict(aspect="equal"))
    colores = plt.cm.tab20.colors[:len(nombres_centros_filtrados)]
    # Resaltar las rebanadas con más incidencias (explotar)
    explode = []
    for p in valores_filtrados:
        if p/sum(valores_filtrados) > 0.1:
            explode.append(0.1)
        elif p/sum(valores_filtrados) > 0.05:
            explode.append(0.05)
        else:
            explode.append(0)
    
    # Crear el gráfico de pastel 3D
    wedges, texts, autotexts = ax.pie(valores_filtrados, 
                                    labels=nombres_centros_filtrados,
                                    autopct='%1.1f%%',
                                    startangle=90,
                                    colors=colores,
                                    explode=explode,
                                    shadow=True,
                                    textprops={'fontsize': 12, 'weight': 'bold'},
                                    pctdistance=0.85,
                                    radius=1.2)
    
    # Mejorar el estilo de los textos
    for text in texts:
        text.set_fontsize(13)
        text.set_weight('bold')
        text.set_color('#2C3E50')
    # Mejorar el estilo de los porcentajes
    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontsize(11)
        autotext.set_weight('bold')
    
    # Añadir un círculo blanco en el centro para efecto "donut" 
    centre_circle = plt.Circle((0, 0), 0.70, fc='white', linewidth=0)
    fig.gca().add_artist(centre_circle)
    
    # Añadir texto en el centro
    total= sum(valores_filtrados)
    ax.text(0, 0, f'Total:\n{total} {unidad}', 
            ha='center', va='center', fontsize=18, weight='bold', color='#2C3E50')
    return fig

def crear_bar_chart(data, etiqueta_x, etiqueta_y):
    """
    Genera un gráfico de barras para visualizar valores por centro utilizando Seaborn.

    El gráfico muestra los valores asociados a cada centro, aplicando una paleta
    de colores diferenciada y configurando el estilo visual para mejorar la
    legibilidad. El eje Y se fuerza a valores enteros y se personalizan las
    etiquetas de los ejes.

    Args:
        data (dict | pandas.DataFrame): Datos a representar. Debe contener las
            columnas o claves:
            - 'nombres_centros': Nombres de los centros.
            - 'valores': Valores asociados a cada centro.
        etiqueta_x (str): Etiqueta descriptiva para el eje X.
        etiqueta_y (str): Etiqueta descriptiva para el eje Y.

    Returns:
        matplotlib.figure.Figure: Objeto figura de Matplotlib que contiene
        el gráfico de barras generado.
    """
    fig,ax = plt.subplots(figsize=(8,6))
    colores = plt.cm.tab20.colors[:len(data['nombres_centros'])]
    sns.barplot(x='nombres_centros', y='valores', data=data, ax=ax, hue='nombres_centros', palette=colores, legend= False)
    sns.set_style('white')
    ax.set_xlabel(etiqueta_x, fontsize=14)
    ax.set_ylabel(etiqueta_y, fontsize=14)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ticks = ax.get_xticklabels()

    # Añadir línea de referencia para el promedio
    promedio = np.mean(data['valores'])
    ax.axhline(promedio, color='navy', linestyle='--', linewidth=1.2, 
            label=f'Promedio: {promedio:.1f} {etiqueta_y.lower()}')
    ax.legend(loc='upper right', fontsize=13)

    #Rotar y alinear etiquetas del eje X
    for tick in ticks:
        tick.set_rotation(45)
        tick.set_ha('right')   
        tick.set_fontsize(5)
    if etiqueta_y == '%':
        ax.set_ylim(0, 100)
    elif max(data['valores']) != 0:
        ax.set_ylim(0, max(data['valores'])*1.25)
    return fig

def graficar(entrada, indice_indicadores):
    '''
    Genera un gráfico para un indicador a partir de los datos de centros y lo
    devuelve como un buffer de imagen listo para ser insertado en un PDF.

    La función extrae los nombres y valores de los centros, valida que exista
    al menos un valor distinto de cero y determina automáticamente el tipo de
    gráfico a generar (barras, donut o pie) según la configuración del indicador.
    El gráfico resultante se guarda en un objeto BytesIO en formato PNG.

    Args:
        entrada (dict): Diccionario con la información del indicador. Debe
            contener las claves:
            - 'indicador' (str): Nombre del indicador.
            - 'centros' (list[dict]): Lista de centros, donde cada centro debe
            incluir:
                - 'nombre_centro': Nombre del centro.
    
    Returns:
        BytesIO | str: Objeto BytesIO que contiene la imagen del gráfico en formato
        PNG si existen valores distintos de cero. En caso contrario, devuelve
        una cadena HTML indicando que todos los valores del indicador son 0.
    '''

    nombre_valor = [(centro['nombre_centro'], centro['valor']) for centro in entrada['centros']]
    nombres_centros, valores= zip(*nombre_valor)

    if max(valores) != 0:
        etiqueta_x= 'Centros'
        etiqueta_y= entrada['centros'][0]['unidad'] #Selecciona la unidad del primer centro puesto que todos deberían tener la misma unidad.
        data= pd.DataFrame ({'nombres_centros': nombres_centros, 'valores': valores})

        # Determinar el tipo de gráfico a generar según indicador
        indice_indicadores= listar_indicadores_normalizados()
        indicador_normalizado = entrada['indicador'].strip().lower()

        if indicador_normalizado in indice_indicadores: 
            tipo= indice_indicadores[indicador_normalizado].get('grafico')
            if tipo == 'barras':
                fig = crear_bar_chart(data, etiqueta_x, etiqueta_y)
            if tipo == 'pie': 
                fig = crear_pie_chart(data, etiqueta_y.lower())
        
            # Guardar el gráfico como bytesIO para insertar en el PDF
            buffer = BytesIO()
            fig.savefig(buffer, format='png', bbox_inches='tight', dpi=200)
            plt.close(fig)
            buffer.seek(0)
            return buffer
    else:
        return '<b>Todos los valores para este indicador son 0.</b><br/><br/>'

# DESCRIPCIÓN
def obtener_claves(entrada, indice_indicadores):
    """
    Construye el título y la descripción textual de un indicador a partir de los
    datos de sus centros y de la configuración definida en el índice de indicadores.

    La descripción generada indica el tipo de representación gráfica utilizada,
    el título del indicador y el detalle de cada centro, incluyendo su valor,
    unidad y número de pacientes. El texto resultante está formateado en HTML
    para su uso en informes o documentos PDF.

    Args:
        entrada (dict): Diccionario con la información del indicador. Debe
            contener:
            - 'indicador' (str): Nombre del indicador.
            - 'centros' (list[dict]): Lista de centros, donde cada centro incluye:
                - 'nombre_centro' (str): Nombre del centro.
                - 'valor' (int | float): Valor del indicador.
                - 'unidad' (str): Unidad de medida.
                - 'pacientes' (int): Número de pacientes asociados.
        indice_indicadores (dict): Diccionario de indicadores normalizados que
            define metadatos como el título, tipo de gráfico, artículo y objetivo.

    Returns:
        dict: Diccionario con la información textual del indicador, con las claves:
            - 'titulo' (str): Título del indicador.
            - 'descripcion' (str): Descripción detallada en formato HTML.
            - 'objetivo' (str): Objetivo asociado al indicador.
    """

    indicador_normalizado = entrada['indicador'].strip().lower()
    if indicador_normalizado in indice_indicadores:
        titulo= indice_indicadores[indicador_normalizado].get('titulo')
        tipo= indice_indicadores[indicador_normalizado].get('grafico')
        if tipo == 'barras':
            nombre_tipo = 'mediante gráfico de barras'
        if tipo == 'donut':
            nombre_tipo = 'circular'
        if tipo == 'pie': 
            nombre_tipo = 'circular'
        articulo = indice_indicadores[indicador_normalizado].get('articulo')
        if articulo != '':
            nexo = 'de ' + articulo 
        else:
            nexo = 'del'
    descripcion= f"Representación {nombre_tipo} {nexo} {titulo.lower()} en los siguientes centros: "
    for centro in entrada['centros']:
        if centro == entrada['centros'][-1]:
            puntuación = '.'
        else: 
            puntuación = ','
        if float(centro['valor']).is_integer():
            valor = int(centro['valor'])
        else:
            valor = f"{centro['valor']:.1f}"
        if not centro['unidad'] == '%':
            unidad = ' ' + centro['unidad'].lower()
        else: 
            unidad = centro['unidad'].lower()
        descripcion += f" <b>{centro['nombre_centro']}</b>: {valor}{unidad} (Pacientes: {centro['pacientes']}){puntuación}"
    return {
        'titulo': titulo,
        'descripcion':descripcion,
        'objetivo': indice_indicadores[indicador_normalizado].get('objetivo')
    }

def recopilar_datos_informe(coleccion, id_transaccion):
    '''
    Genera la estructura de datos necesaria para construir un informe de
    indicadores a partir de una colección de datos y un identificador de
    transacción.

    La función recorre las entradas asociadas a la transacción, recopila los
    centros e indicadores únicos, genera los gráficos correspondientes,
    construye las descripciones y objetivos de cada indicador y crea un resumen
    global del periodo analizado. El resultado se devuelve ordenado y listo
    para su posterior renderizado en un informe o PDF.

    Args:
        coleccion: Colección de datos desde la que se obtienen las entradas del
            informe (por ejemplo, una colección de MongoDB).
        id_transaccion (str): Identificador de la transacción que se desea
            procesar.

    Returns:
        list[dict]: Lista de secciones del informe. Cada elemento contiene, al
        menos:
            - 'titulo' (str): Título de la sección.
            - 'descripcion' (str): Texto descriptivo del indicador o resumen.
            - 'grafico' (BytesIO, opcional): Imagen del gráfico asociada al
            indicador.
            - 'objetivo' (str, opcional): Objetivo o interpretación del indicador.

        La primera posición de la lista corresponde siempre al resumen general
        del informe.
    '''
    datos=[]
    centros=[]
    indicadores=[]
    periodo= obtener_periodo(coleccion, id_transaccion)
    cursor = obtener_cursor(coleccion, id_transaccion)
    indice_indicadores= listar_indicadores_normalizados()
    for entrada in cursor:
        claves = obtener_claves(entrada, indice_indicadores)
        for centro in entrada['centros']: 
            if centro['nombre_centro'] not in centros:
                centros.append(centro['nombre_centro'])
        if claves['titulo'] not in indicadores:
            indicadores.append(claves['titulo'])
        grafico= graficar(entrada, indice_indicadores)
        descripcion= claves['descripcion']
        objetivo_interpretacion= claves['objetivo']
        datos.append({'titulo': claves['titulo'], 'grafico':grafico, 'descripcion':descripcion, 'objetivo': objetivo_interpretacion})
    datos = sorted(datos, key=lambda x: x['titulo'])
    indicadores.sort()
    resumen= generar_resumen(indicadores, centros, periodo)
    datos.insert(0, {'titulo':'Resumen', 'descripcion':resumen}) #Insertamos el resumen en primera posición para que sea la primera sección del informe.
    return datos

def generar_csv(coleccion, id_trasaccion): 
    """
    Genera un archivo CSV a partir de los datos almacenados en una colección,
    estructurada por indicadores y centros. 

    Args:
        coleccion: Objeto o referencia a la colección origen de los datos 
            (por ejemplo, una colección de MongoDB).
        id_trasaccion (str): Identificador de la transacción cuyos datos se 
            desean exportar.

    Returns:
        str: Contenido del archivo CSV generado. El CSV contiene una fila por 
        centro y una columna por indicador, incluyendo la unidad en el nombre 
        de cada columna. El índice no se incluye en el archivo exportado.

    Notes:
        - El CSV devuelto se genera en memoria (no se guarda en disco).  
    """
    cursor= obtener_cursor(coleccion, id_transaccion)
    rows=[]
    for entrada in cursor:
        indicador= entrada['indicador']
        for centro in entrada['centros']: 
            unidad= centro['unidad']
            nombre_columna=  f'{indicador} ({unidad})'
            row= {'Indicador': nombre_columna, 'Centro':centro['nombre_centro'], 'valor': int(centro['valor'])}
            rows.append(row)
    df = pd.DataFrame(rows)
    df_pivot= df.pivot(index='Centro', columns= 'Indicador', values= 'valor')
    df_pivot = df_pivot.reset_index()
    df_pivot.columns.name = None
    return df_pivot.to_csv(index=False)

#INFORME FINAL
class AutoScaledImage(Image):
    """Imagen que se ajusta automáticamente al ancho y alto de página."""
    def __init__(self, img_data, max_width=None, max_height=None, *args, **kwargs):
        super().__init__(img_data, *args, **kwargs)
        
        page_width, page_height = A4
        self.max_width = max_width or (page_width - 4*cm)
        self.max_height = max_height or (page_height - 6*cm)
        self._resize_image()

    def _resize_image(self):
        iw, ih = self.imageWidth, self.imageHeight
        aspect = ih / float(iw)

        # Ajustar a ancho máximo manteniendo proporción
        if iw > self.max_width:
            iw_new = self.max_width
            ih_new = iw_new * aspect
        else:
            iw_new, ih_new = iw, ih

        # Ajustar si el alto excede la altura permitida
        if ih_new > self.max_height:
            ih_new = self.max_height
            iw_new = ih_new / aspect

        self.drawWidth = iw_new
        self.drawHeight = ih_new

def generar_informe_pdf(datos_informe):
    """
    Genera un informe PDF con portada, cabecera corporativa, índice automático (TOC) 
    y secciones dinámicas basadas en contenido suministrado. El PDF se construye 
    utilizando ReportLab (Platypus) y puede incluir textos, imágenes, encabezados 
    jerárquicos y saltos de página.

    Este informe genera:
    - Título principal.
    - Índice (Tabla de contenidos) autogenerado.
    - Secciones dinámicas con título, gráfico opcional y descripción.
    - Cabecera con logotipo en todas las páginas.
    - Marcadores internos PDF para navegación.

    Args:
        datos_informe (list[dict]):
            Lista de diccionarios que definen cada sección del informe. 
            Cada entrada debe contener al menos:
                - 'titulo' (str): Título visible de la sección.
            Claves opcionales:
                - 'grafico' (str): Ruta a una imagen a incluir en la sección.
                - 'descripcion' (str): Texto descriptivo en formato HTML simple.

    Returns:
        bytes:
            El documento PDF en formato binario. Esto permite:
            - devolverlo a través de una API,
            - guardarlo en disco desde fuera de esta función,
            - enviarlo como archivo descargable en un servidor web.

    Notes:
        - El logotipo se carga desde la ruta definida en la constante LOGO_PATH.
        - El PDF se genera completamente en memoria utilizando BytesIO.
        - Si una imagen no puede cargarse, se inserta un mensaje de error en su lugar.
        - Internamente se usa multiBuild para permitir cabeceras y tabla de contenidos.

    Side Effects:
        Ninguno. El PDF NO se guarda en disco; solo se devuelve como bytes.
    """
    # Configuración
    BASE_DIR= Path(__file__).resolve().parent
    LOGO_PATH = BASE_DIR / 'logo.jpg'
    OUTPUT_PDF = "informe_basico.pdf"
    buffer = BytesIO()

    # Estilos
    styles = getSampleStyleSheet()

    # Estilo para título principal
    titulo_style = styles['Title']

    # Estilo para apartados (MiHeading1)
    styles.add(ParagraphStyle(
        name="MiHeading1",
        fontSize=16,
        spaceBefore=16,
        spaceAfter=10,
        leading=20,
        textColor=colors.HexColor("#004080"),
        tabStops=[150, 200]
    ))

    # Función para dibujar cabecera con logo
    def cabecera(canvas, doc):
        '''
        Dibuja la cabecera del informe en el lienzo PDF, añadiendo el logotipo (si está
        disponible) y el título 'Informe de calidad'.

        La función guarda y restaura el estado del canvas para no afectar al resto del
        documento. Si la ruta del logo (`LOGO_PATH`) existe, intenta dibujarlo en la
        esquina superior izquierda; en caso de error, el logo se omite silenciosamente.

        Args:
            canvas (reportlab.pdfgen.canvas.Canvas): Lienzo PDF sobre el que se dibuja
                la cabecera.
            doc (reportlab.platypus.doctemplate.BaseDocTemplate): Objeto del documento
                que contiene márgenes y dimensiones útiles para posicionar elementos.

        Side Effects:
            Modifica el contenido gráfico del canvas en la parte superior de la página.

        Notes:
            La función asume que las constantes `LOGO_PATH`, `A4` y `cm` están definidas
            en el ámbito global.
            '''
        canvas.saveState()
        if LOGO_PATH:
            try:
                canvas.drawImage(LOGO_PATH, x=doc.leftMargin, y=A4[1] - 3*cm, width=3*cm, height=3*cm, preserveAspectRatio=True)
            except:
                pass
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawRightString(A4[0] - doc.rightMargin, A4[1] - 1*cm, "Informe de calidad")
        pagina= '- %d -' % doc.page
        canvas.drawString(A4[0]/2, 30, pagina)
        canvas.restoreState()

    # Crear documento
    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=4*cm,
        bottomMargin=2*cm
    )

    story = []
    # Título
    story.append(Paragraph("Análisis de resultados", titulo_style))
    story.append(Spacer(1, 12))

    # Índice
    story.append(Paragraph("Índice", styles['Heading2']))
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle(name= 'MiHeading1',fontSize=12, leftIndent=20, firstLineIndent=-10, spaceBefore=5)]
    story.append(toc)
    story.append(PageBreak())

    # Sistema para registrar apartados en TOC
    def after_flowable(flowable):
        '''
        Procesa un elemento (`flowable`) después de ser renderizado en el documento PDF,
        actualizando la tabla de contenidos (TOC) y el índice de marcadores si corresponde.

        Args:
            flowable (reportlab.platypus.flowables.Flowable): Elemento que acaba de ser
                renderizado en el documento PDF. Se espera que sea, típicamente, un
                `Paragraph`.

        Side Effects:
            - Modifica el canvas del documento (`doc.canv`) añadiendo marcadores.
            - Notifica al objeto TOC mediante `doc.notify('TOCEntry', ...)`.

        Notes:
            - La función asume que las variables `doc` y `Paragraph` están definidas
            en el ámbito global.
            - Se usa solo para encabezados de nivel 0 (`MiHeading1`). Para niveles
            adicionales, habría que adaptar la lógica de `level`.
            - Los nombres de marcadores generados son válidos en PDF/HTML interno
            (sin espacios ni caracteres especiales).
        '''
        if isinstance(flowable, Paragraph) and flowable.style.name == 'MiHeading1':
            text = flowable.getPlainText()
            key = text.replace(" ", "_") #Los nombres de marcadores (o anchors) deben ser identificadores válidos en el contexto de PDF/HTML interno, y no pueden contener espacios ni caracteres especiales.
            doc.notify('TOCEntry', (0, text, doc.page)) # Notifica al TOC cuando se inserta un apartado
            doc.canv.bookmarkPage(key)
            doc.canv.addOutlineEntry(text, key, level=0, closed=False)

    doc.afterFlowable = after_flowable

    # Función para agregar sección
    def add_section(content):
        '''
        Agrega una sección al documento PDF, incluyendo título, gráfico opcional y descripción,
        y realiza un salto de página al final de la sección.

        La función construye el contenido de la sección en la lista global `story` usando
        elementos de ReportLab (`Paragraph`, `Spacer`, `AutoScaledImage`, `PageBreak`). 
        Se crea un ancla HTML interna para el título para poder referenciar la sección
        posteriormente.

        Args:
            content (dict): Diccionario que representa la sección, con las posibles claves:
                - 'titulo' (str, obligatorio): Título de la sección.
                - 'grafico' (str, opcional): Ruta de la imagen a incluir en la sección.
                - 'descripcion' (str, opcional): Texto descriptivo de la sección.

        Side Effects:
            - Modifica la lista global `story` agregando los elementos correspondientes
            a la sección.
            - Puede agregar imágenes al PDF mediante `AutoScaledImage`.

        Notes:
            - Si la imagen no puede cargarse, se agrega un mensaje de error en su lugar.
            - Se asume que las variables globales `story` y `styles` están definidas
            en el contexto.
            - Se agrega un `PageBreak` al final de la sección para iniciar la siguiente
            sección en una nueva página.
            - Los títulos se convierten en claves (keys) reemplazando espacios por "_"
            para poder usarse como anclas.'''
        
        title= content['titulo']
        key = title.replace(" ", "_")
        story.append(Paragraph(f'<a name="{key}"/>{title}', styles["MiHeading1"]))
        story.append(Spacer(1, 12))

        #Objetivo
        objetivo = content.get('objetivo')
        if objetivo:
            story.append(Paragraph(f'<b>Objetivo:</b> {objetivo}', styles["Normal"]))
            story.append(Spacer(1, 12))

        # Si existe gráfico
        grafico = content.get("grafico")
        if grafico and isinstance(grafico, str):
            story.append(Paragraph(f"{grafico}", styles["Normal"]))
        else:
            try:
                story.append(AutoScaledImage(grafico))
                story.append(Spacer(1, 8))
            except Exception as e:
                story.append(Paragraph(f"[Error al cargar imagen: {grafico}]", styles["Normal"]))
                story.append(Spacer(1, 8))
    
            # Si existe descripción
            descripcion = content.get("descripcion")
            if descripcion:
                if contador_figuras == 0:
                    story.append(Paragraph(descripcion, styles["Normal"]))
                    story.append(Spacer(1, 12))
                else:    
                    story.append(Paragraph(f'<b>Figura {contador_figuras}.</b> {descripcion}', styles["Normal"]))
                    story.append(Spacer(1, 12))
        
        # Salto de página al final de la sección
        story.append(PageBreak())

    # Apartados
    contador_figuras=0
    for dato in datos_informe:
        add_section(dato)
        if not isinstance(dato.get('grafico'), str):
            contador_figuras= contador_figuras+1  #Solo hay un gráfico por sección. Se evita que se cuente en caso de no haber gráfico.

    # Generar PDF
    doc.multiBuild(story, onFirstPage=cabecera, onLaterPages=cabecera )

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# Registar resultados en MongoDB

def registrar_resultados_mongodb(id_transaccion, datos_informe):
    '''
    Convierte los gráficos de los indicadores a formato BSON y guarda todo el
    informe en la base de datos.

    Cada gráfico almacenado en un objeto BytesIO se transforma en un objeto
    Binary de PyMongo para su inserción en MongoDB. Luego se construye un
    documento con la transacción y los datos del informe, y se inserta en la
    colección correspondiente.

    Args:
        id_transaccion (str): Identificador de la transacción asociada al informe.
        datos_informe (list[dict]): Lista de secciones del informe, donde cada
            elemento puede contener:
            - 'titulo' (str): Título de la sección.
            - 'descripcion' (str): Texto descriptivo.
            - 'grafico' (BytesIO, opcional): Gráfico asociado al indicador.
            - 'objetivo' (str, opcional): Objetivo del indicador.

    Returns:
        None

    Side Effects:
        Inserta un documento en la colección `informes` de la base de datos,
        con la transacción y los datos procesados.
    '''
    for entrada in datos_informe:
        if 'grafico' in entrada:
            grafico_bytes = entrada['grafico'].getvalue()
            entrada['grafico'] = Binary(grafico_bytes)
    documento = {
        'id_transaccion': id_transaccion,
        'datos': datos_informe  
        }
    db= conectar_calidad()
    coleccion= db.informes
    coleccion.insert_one(documento)

def verificar_consulta_existente(id_transaccion):
    '''
    Recupera un informe de la base de datos por su transacción y genera un PDF.

    La función busca un documento en la colección `informes` usando el
    `id_transaccion`. Si se encuentra, convierte los gráficos almacenados en
    BSON de vuelta a objetos BytesIO y luego genera un PDF con toda la información
    del informe. Si no existe el informe, devuelve `False`.

    Args:
        id_transaccion (str): Identificador de la transacción asociada al informe.

    Returns:
        BytesIO | bool: Objeto BytesIO que contiene el PDF generado si se
        encuentra el informe. Devuelve `False` si no existe ningún informe con
        el identificador proporcionado.

    Side Effects:
        Accede a la base de datos `calidad` y lee la colección `informes`.
    '''
    db= conectar_calidad()
    coleccion= db.informes
    resultado= coleccion.find_one({'id_transaccion': id_transaccion})
    if resultado:
        datos_informe= resultado['datos']
        for entrada in datos_informe:
            if 'grafico' in entrada:
                grafico_bytes = entrada['grafico']
                entrada['grafico'] = io.BytesIO(grafico_bytes)
        informe_bytes= generar_informe_pdf(datos_informe)
        return informe_bytes
    return False
