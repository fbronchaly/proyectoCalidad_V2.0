# Guía de Implementación: Captores de Fósforo (Quelantes)

Este documento detalla cómo utilizar las etiquetas dinámicas para consultar medicamentos quelantes del fósforo en el sistema de Indicadores de Calidad.

## 1. Etiquetas Disponibles para SQL

El sistema procesa automáticamente estas etiquetas y las sustituye por la lista de códigos de medicamentos válida para el centro hospitalario que se está consultando.

| Etiqueta | Descripción | Uso Recomendado |
| :--- | :--- | :--- |
| `<LISTA_CAPTORES_FOSFORO>` | **Todos** los quelantes del fósforo (Cálcicos + No Cálcicos + Otros). | Para indicadores generales de tratamiento de hiperfosfatemia. |
| `<LISTA_CAPTORES_CALCICOS>` | Solo quelantes con base de **calcio**. | Para evaluar carga de calcio o indicadores específicos. |
| `<LISTA_CAPTORES_NO_CALCICOS>` | Solo quelantes **NO cálcicos** (Sevelamer, Lantano, etc.). | Para pacientes con hipercalcemia o calcificaciones. |

> **Nota de compatibilidad:** La etiqueta antigua `:CODIGOS_CAPTORES` sigue funcionando y es equivalente a `<LISTA_CAPTORES_FOSFORO>`.

---

## 2. Ejemplo de Uso en una Query

Si quieres contar cuántos pacientes toman algún captor no cálcico:

```sql
SELECT COUNT(DISTINCT COD_PACIENTE)
FROM TRATAMIENTOS
WHERE COD_FARMACO IN (<LISTA_CAPTORES_NO_CALCICOS>)
  AND ACTIVO = 1
```

El sistema transformará esa consulta en algo como:

```sql
-- Ejemplo para un hospital concreto
SELECT COUNT(DISTINCT COD_PACIENTE)
FROM TRATAMIENTOS
WHERE COD_FARMACO IN ('REN', 'FOSRENOL', 'VELPHORO', ...)
  AND ACTIVO = 1
```

---

## 3. Lógica de Clasificación Automática

El sistema lee los archivos `DBx.json` y clasifica los grupos de medicamentos basándose en palabras clave contenidas en su descripción o nombre comercial.

### Grupo: Cálcicos
Se incluyen si el nombre del grupo o medicamento contiene:
* `CALCIC`, `CLCIC` (ej. Cálcicos)
* `APORTES CA`, `CALCIO`
* `CAOSINA`, `ROYEN`, `MASTICAL`, `OSVAREN`

### Grupo: No Cálcicos
Se incluyen si el nombre del grupo o medicamento contiene:
* `NO CALCIC`, `NO CLCIC`
* `SEVELAMEL`, `SEVELAMER` (Renagel, Renvela)
* `LANTANO` (Fosrenol)
* `ALUMINIC`, `ALUMNIC`
* `VELPHORO`, `FOSRENOL`, `RENAGEL`, `RENVELA`

> **Importante:** Si un grupo se llama "QUELANTES DEL FOSFORO NO CALCICOS", el sistema prioriza el "NO CALCICOS" y lo excluye de la lista de cálcicos, asignándolo correctamente a la lista de no cálcicos.
