from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import Response, JSONResponse
import utils as u

app = FastAPI(title="Calidad Python PDF Service", version="2.0")


@app.get("/health")
def health():
    """
    Healthcheck con ping a Mongo.
    """
    try:
        ok = u.mongo_ping()
        return JSONResponse({"ok": True, "mongo": ok})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/informe")
def descargar_informe(id_transaccion: str = Query(..., alias="id_transaccion")):
    try:
        pdf_bytes = u.obtener_o_generar_pdf(id_transaccion=id_transaccion)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")

    if not pdf_bytes or not isinstance(pdf_bytes, (bytes, bytearray)):
        raise HTTPException(status_code=500, detail="PDF vacío o inválido")

    # Firma PDF
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=500, detail="Salida no parece un PDF válido")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Informe_{id_transaccion}.pdf"'},
    )
