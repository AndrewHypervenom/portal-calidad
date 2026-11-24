# Portal de Calidad · Positivo S+

Sitio que reemplaza los libros de Excel de calidad de Prevención de Fraudes:

- `CEDULA INBOUND ADRIANA SEP.xlsm` y `Cedula Monitoreo Adriana SEP 1.xlsm` (cédulas, acumulado y reportes)
- `Modelo Reincidencias-Plan de acción.xlsx` (reincidencia, plan de acción, tiempos, dimensionamiento, muestreo y KPIs)
- Plantillas de retroalimentación, carta de compromiso y acta administrativa

Todo se calcula solo al guardar una evaluación: calificación ponderada con errores críticos, semana, semáforo,
reincidencia en 30 días, nivel del plan (N1–N4), fecha compromiso, documentos a firmar y verificación con las
siguientes 3 auditorías. Capacidad, muestreo semanal y KPIs se recalculan con los datos del portal.

## Qué hace el portal

| Necesidad | Dónde |
|---|---|
| Qué atender hoy: planes vencidos, feedback fuera de 24/48 h, firmas pendientes o incompletas, auditorías del plan semanal, bases fuera del SLA de 24 h, KPIs que no cumplen, calibración quincenal, dictámenes de nuevos ingresos | Campana de **alertas** (barra superior) y **Resumen → Pendientes de hoy** |
| Evaluar una llamada con la cédula | **Nueva evaluación** (atajos 1/2/3 y Ctrl+Enter) |
| Historial de auditorías (antes: hoja Acumulado) | **Evaluaciones** |
| Planes de acción, retroalimentación, carta y acta con firma digital | **Planes y actas** |
| Resultados por cédula, rubro, semana, motivo y proceso | **Análisis** |
| Capacidad, muestreo por riesgo, KPIs, calibraciones, tiempos, bases y nuevos ingresos | **Operación de calidad** |
| Quién hizo qué y cuándo (también dentro de cada evaluación, plan y documento) | **Bitácora** |
| Rutina de trabajo, cédulas, criterios, errores críticos y ruta antirreincidencia | **Guía** |

Reglas que el portal aplica solo:

- Reincidencia y nivel como las fórmulas del PLAN ACCION IND: cuenta el mismo rubro de la misma cédula
  («Cédula · Ítem») en los 30 días anteriores, sin contar el mismo día; el nivel se calcula por rubro y un error
  crítico llega a nivel 4 solo si se repite ese mismo rubro crítico. El plan toma el mayor nivel de sus rubros.
- La firma del colaborador en la retroalimentación registra el feedback de la evaluación y la acción del plan (N1–N2).
- No se puede firmar un formato con campos obligatorios vacíos (aviso **Falta llenar**, igual que en el Excel);
  con la primera firma el contenido queda bloqueado como evidencia.
- Con un plan de nivel 2 o mayor, el plan semanal suma 2 auditorías extra por semana durante 2 semanas.
- Los KPIs «Desviación en calibración» y «Nuevos ingresos que acreditan» se calculan con los registros de
  **Operación → Calibraciones** y del dictamen del periodo de prueba (**Operación → Equipo y nuevos ingresos**).

## Uso diario

Requiere Node.js 18.18 o superior.

```bash
npm install        # solo la primera vez
npm run build      # la primera vez y cada vez que cambie el código
npm start          # abre http://localhost:4173
```

Para que todo el equipo entre desde sus computadoras (misma red):

```bash
npm run start:red  # muestra las direcciones http://<IP>:4173 para compartir
```

Otro puerto: `npm start -- --puerto 8080` (o la variable `PORT`).

Después de actualizar el código con el servidor de uso diario (`npm start`), **vuelve a compilar y reinicia**:
`npm run build` y luego `npm start`. Las reglas de los cambios (`src/shared/reducer.js`) se cargan al arrancar y
las operaciones nuevas (por ejemplo, calibraciones) no se reconocen hasta reiniciar. `npm run dev` se reinicia solo.

## Compartir por internet (enlace temporal)

Para que alguien fuera de la red lo pruebe (por ejemplo, coordinación), con un túnel rápido de Cloudflare
(try.cloudflare.com, sin cuenta). El portal no tiene inicio de sesión: **siempre con contraseña**.

```powershell
npm run build
$env:PORTAL_CLAVE = "una-contraseña-larga"     # el navegador pedirá usuario «calidad» y esta contraseña
$env:DATA_DIR = "C:\ruta\datos-demo"            # opcional: copia de prueba para no mezclar con los datos reales
npm start
```

En otra terminal (`cloudflared.exe` oficial de Cloudflare, en `%LOCALAPPDATA%\cloudflared\`):

```powershell
& "$env:LOCALAPPDATA\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4173
```

Comparte el enlace `https://…trycloudflare.com` que aparece y, por otro medio, la contraseña. El enlace cambia
cada vez, deja de funcionar al cerrar cualquiera de las dos terminales (Ctrl+C) y no tiene garantía de
disponibilidad. Estos túneles no transmiten eventos en vivo: el portal lo detecta y revisa cambios cada 4 segundos.

## Datos y respaldos

- `datos/portal.json` es la base compartida. Si no existe, se crea desde `public/seed.json`
  (las 114 evaluaciones de septiembre migradas de los Excel).
- Cada día se guarda una copia en `datos/respaldos/` (se conservan 30).
- En **Ajustes → Datos** se puede descargar un respaldo, restaurarlo, exportar todo a Excel (evaluaciones,
  ejecutivos, documentos, seguimiento, calibraciones y bitácora) e importar meses anteriores desde la hoja
  *Acumulado* de los libros de cédulas: el portal recalcula cada calificación, la compara con la del Excel y omite
  las evaluaciones que ya existen. Si la fila 1 del Acumulado (la que copia la macro al guardar) tiene fórmulas
  rotas, lo avisa y asigna cada dato a su rubro.
- Al arrancar con una base de una versión anterior del portal, el servidor la pone al día (por ejemplo, separa
  rubros con el mismo texto en distintos aplicativos y agrega hallazgos nuevos). Antes de escribir guarda la copia
  del día en `datos/respaldos/`.
- Los cambios se ven en vivo en todas las computadoras conectadas.
- Si el sitio se abre sin el servidor (por ejemplo, publicado como archivos estáticos), trabaja en modo local:
  los datos quedan solo en ese navegador.
- `datos/` contiene información del personal: no la subas a repositorios ni carpetas públicas.

## Marca

Logotipos oficiales en `public/marca/` (copiados de `Logotipos/`): preferencial sobre fondo claro, negativo en la
barra lateral y en modo oscuro, y el isotipo S+ (recortado del logotipo) para la barra angosta, el celular y el ícono.
Colores corporativos en `src/styles.css`: verde `#10D451`, magenta `#B33D9E`, cinza claro `#E0EBE7`,
cinza medio `#A1ADAD` y preto `#000000`. Sobre el verde el texto va en negro (blanco sobre verde no es legible).

## Desarrollo

```bash
npm run dev        # http://localhost:5191, con la API incluida
npm test           # calificación igual al Excel, reincidencia, capacidad, muestreo, importación, alertas, firmas, KPIs
                   # y conciliación celda por celda con los Excel de la carpeta padre (se omite si no están)
npm run typecheck
npm run extraer    # regenera public/seed.json desde los Excel de la carpeta padre (requiere Python 3 y openpyxl)
```

`npm run extraer` recalcula cada evaluación histórica y se detiene si alguna no cuadra con la columna
*Promedio* del Acumulado. Las inconsistencias encontradas en los libros quedan documentadas en
**Ajustes → Datos**, tarjeta «Migración desde los Excel».

Para probar sin tocar los datos reales: `DATA_DIR=/ruta/a/otra/carpeta npm run dev`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/shared/reducer.js` | Reglas de cada cambio y bitácora; las usan el servidor y el navegador |
| `src/lib/` | Cálculos: calificación, planes y reincidencia, alertas, muestreo, análisis, capacidad, KPIs, Excel |
| `src/pages/`, `src/panels/` | Pantallas y paneles laterales |
| `src/documents/` | Retroalimentación, carta y acta: llenado, reglas de firma, impresión y Word oficial |
| `server/` | Servidor sin dependencias: API, sincronización en vivo y archivos |
| `scripts/extraer_excel.py` | Migración desde los Excel |
| `tests/` | Pruebas automáticas |
