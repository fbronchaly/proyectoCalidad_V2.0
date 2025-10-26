

const query228 = `  SELECT COUNT(*) AS total_sesiones,
               SUM(CASE WHEN KT_FINAL > 45 THEN 1 ELSE 0 END) AS sesiones_superior_45
        FROM SESION
        WHERE NREGGEN = '553293'
          AND FECHA BETWEEN '2019-05-01' AND '2019-06-30'`


// kt de pacientes por fecha y ID
const query229 = `

SELECT FECHA,
       KT_FINAL
FROM SESION
WHERE NREGGEN = '1024901'  -- Reemplaza este valor con el identificador del paciente que desees consultar
  AND FECHA BETWEEN '2019-05-01' AND '2019-06-30';  -- Reemplaza las fechas con el rango deseado

`

const query230 = `
SELECT COUNT(DISTINCT NREGGEN) AS numero_de_pacientes
FROM SESION
WHERE FECHA BETWEEN '2019-05-01' AND '2019-06-30';


`

const query231 = `   SELECT
            r.RDB$RELATION_NAME AS TABLE_NAME,
            f.RDB$FIELD_NAME AS COLUMN_NAME
        FROM
            RDB$RELATION_FIELDS rf
            JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            JOIN RDB$RELATIONS r ON rf.RDB$RELATION_NAME = r.RDB$RELATION_NAME
        WHERE
            r.RDB$VIEW_SOURCE IS NULL
        ORDER BY
            r.RDB$RELATION_NAME,
            f.RDB$FIELD_NAME  `


            
const query223 = `
WITH SesionesValidas AS (
    SELECT NREGGEN, 
           COUNT(*) AS TOTAL_SESIONES,  -- Total de sesiones por paciente
           SUM(CASE WHEN KT_FINAL > 45 THEN 1 ELSE 0 END) AS SESIONES_SUPERIOR_45  -- Sesiones con KT_FINAL > 45
    FROM SESION
    WHERE KT_FINAL IS NOT NULL
      AND FECHA BETWEEN '2019-05-01' AND '2019-06-30'  -- Intervalo bimensual específico
    GROUP BY NREGGEN
),
PorcentajeSesiones AS (
    SELECT NREGGEN,
           TOTAL_SESIONES,
           SESIONES_SUPERIOR_45,
           (SESIONES_SUPERIOR_45 * 100.0 / TOTAL_SESIONES) AS PORCENTAJE_SESIONES_SUPERIOR_45
    FROM SesionesValidas
),
Resultado AS (
    SELECT 
        COUNT(NREGGEN) AS TOTAL_PACIENTES,
        SUM(CASE WHEN PORCENTAJE_SESIONES_SUPERIOR_45 > 45 THEN 1 ELSE 0 END) AS PACIENTES_CON_MAS_DE_45_PORCIENTO
    FROM PorcentajeSesiones
)
SELECT 
    (PACIENTES_CON_MAS_DE_45_PORCIENTO * 100.0 / TOTAL_PACIENTES) AS PORCENTAJE_PACIENTES_CON_MAS_DE_45_PORCIENTO,
    TOTAL_PACIENTES
FROM Resultado;
`

const query224 = `WITH SesionesPorPaciente AS (
    SELECT 
        NREGGEN,
        COUNT(*) AS TOTAL_SESIONES,  -- Total de sesiones por paciente
        SUM(CASE WHEN KT_FINAL > 45 THEN 1 ELSE 0 END) AS SESIONES_SUPERIOR_45  -- Sesiones con KT_FINAL > 45 por paciente
    FROM SESION
    WHERE KT_FINAL IS NOT NULL
      AND FECHA BETWEEN '2019-05-01' AND '2019-06-30'  -- Intervalo bimensual específico
    GROUP BY NREGGEN
),
PorcentajeSesionesPorPaciente AS (
    SELECT 
        NREGGEN,
        TOTAL_SESIONES,
        SESIONES_SUPERIOR_45,
        (SESIONES_SUPERIOR_45 * 100.0 / TOTAL_SESIONES) AS PORCENTAJE_SESIONES_SUPERIOR_45
    FROM SesionesPorPaciente
),
PacientesConAltoPorcentaje AS (
    SELECT 
        COUNT(*) AS TOTAL_PACIENTES_CON_ALTO_PORCENTAJE  -- Pacientes con más del 45% de sesiones superiores a 45
    FROM PorcentajeSesionesPorPaciente
    WHERE PORCENTAJE_SESIONES_SUPERIOR_45 > 45
),
ConteoGlobal AS (
    SELECT 
        COUNT(*) AS TOTAL_PACIENTES,  -- Total de pacientes
        (SELECT TOTAL_PACIENTES_CON_ALTO_PORCENTAJE FROM PacientesConAltoPorcentaje) AS TOTAL_PACIENTES_CON_ALTO_PORCENTAJE
    FROM SesionesPorPaciente
)
SELECT 
    (TOTAL_PACIENTES_CON_ALTO_PORCENTAJE * 100.0 / TOTAL_PACIENTES) AS PORCENTAJE_PACIENTES_CON_ALTO_PORCENTAJE
FROM ConteoGlobal;
`


const query226 = ` 
    SELECT 
    COUNT(*) AS NUM_VALORES_NULOS
FROM 
    SESION
WHERE 
    KT_FINAL IS NULL
    
    AND FECHA BETWEEN '2024-01-01' AND '2024-03-31';

`

const query227 = `WITH SesionesPorPaciente AS (
    SELECT 
        NREGGEN,
        COUNT(*) AS TOTAL_SESIONES,  -- Total de sesiones por paciente
        SUM(CASE WHEN KT_FINAL > 45 THEN 1 ELSE 0 END) AS SESIONES_SUPERIOR_45  -- Sesiones con KT_FINAL > 45 por paciente
    FROM SESION
    WHERE KT_FINAL IS NOT NULL
      AND FECHA BETWEEN '2019-05-01' AND '2019-06-30'  -- Intervalo bimensual específico
    GROUP BY NREGGEN
),
PacientesConSesionesAltoKt AS (
    SELECT 
        COUNT(DISTINCT NREGGEN) AS PACIENTES_CON_KT_SUPERIOR_45  -- Pacientes con al menos una sesión con KT_FINAL > 45
    FROM SesionesPorPaciente
    WHERE SESIONES_SUPERIOR_45 > 0
),
TotalPacientes AS (
    SELECT 
        COUNT(DISTINCT NREGGEN) AS TOTAL_PACIENTES  -- Total de pacientes
    FROM SesionesPorPaciente
)
SELECT 
    (PACIENTES_CON_KT_SUPERIOR_45 * 100.0 / TOTAL_PACIENTES) AS PORCENTAJE_PACIENTES_CON_KT_SUPERIOR_45
FROM TotalPacientes, PacientesConSesionesAltoKt;
`

  //  -- Esta consulta obtiene el porcentaje de pacientes con una media de KT_FINAL > 45 en un intervalo bimensual dado.

  const query221 = `
  WITH PacientesValidos AS (
      SELECT NREGGEN
      FROM PACIENTES
      WHERE DATEADD(MONTH, 3, FECH_INICIO_CENTRO) <= '2024-02-28'  -- Fecha de fin del intervalo bimensual
  ),
  SesionesValidas AS (
      SELECT NREGGEN, AVG(KT_FINAL) AS MEDIA_KT_FINAL
      FROM SESION
      WHERE NREGGEN IN (SELECT NREGGEN FROM PacientesValidos)
        AND KT_FINAL IS NOT NULL
        AND FECHA BETWEEN '2021-09-01' AND '2021-10-31'  -- Intervalo bimensual específico
      GROUP BY NREGGEN
  ),
  Resultado AS (
      SELECT 
          COUNT(NREGGEN) AS TOTAL_PACIENTES,
          SUM(CASE WHEN MEDIA_KT_FINAL > 45 THEN 1 ELSE 0 END) AS PACIENTES_SOBRE_45
      FROM SesionesValidas
  )
  SELECT 
      (PACIENTES_SOBRE_45 * 100.0 / TOTAL_PACIENTES) AS PORCENTAJE_PACIENTES_SOBRE_45
  FROM Resultado;
  
  
  `
  const query222 = `WITH SesionesValidas AS (
      SELECT NREGGEN, 
             COUNT(*) AS NUM_SESIONES_VALIDAS,  -- Contamos el número de sesiones válidas por paciente
             AVG(KT_FINAL) AS MEDIA_KT_FINAL
      FROM SESION
      WHERE KT_FINAL IS NOT NULL
        AND FECHA BETWEEN '2019-05-01' AND '2019-06-30'  -- Intervalo bimensual específico
        AND KT_FINAL>1
        AND KT_FINAL<200
      GROUP BY NREGGEN
  ),
  Resultado AS (
      SELECT 
          COUNT(NREGGEN) AS TOTAL_PACIENTES,
          SUM(CASE WHEN MEDIA_KT_FINAL > 45 THEN 1 ELSE 0 END) AS PACIENTES_SOBRE_45,
          SUM(NUM_SESIONES_VALIDAS) AS TOTAL_SESIONES_VALIDAS  -- Sumamos el número total de sesiones válidas
      FROM SesionesValidas
  )
  SELECT 
      (PACIENTES_SOBRE_45 * 100.0 / TOTAL_PACIENTES) AS PORCENTAJE_PACIENTES_SOBRE_45,
      TOTAL_PACIENTES,
      TOTAL_SESIONES_VALIDAS
  FROM Resultado;
  `