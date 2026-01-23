import utils as u
from fastapi import FastAPI
from fastapi.responses import Response

app=FastAPI()
@app.post("/informe")

def descargar_informe_and_csv(id_transaccion:str):
    db= u.conectar_calidad()
    coleccion=db.resultados
    informe_bytes = u.verificar_consulta_existente(id_transaccion)
    if informe_bytes is False:
        datos_informe= u.recopilar_datos_informe(coleccion, id_transaccion)
        informe_bytes= u.generar_informe_pdf(datos_informe)
        u.registrar_resultados_mongodb(id_transaccion, datos_informe)
    return Response(
        content= informe_bytes, 
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=informe.pdf"}
    )