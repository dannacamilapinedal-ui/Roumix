# Contratos con firma electrónica (módulos F-1 a F-4)

Roumix pasa de una "aceptación demostrativa" (nombre escrito + botón) a una **firma electrónica**
pensada para tener valor probatorio en Colombia.

> **No es asesoría legal.** El texto del contrato debe revisarlo un abogado (por ejemplo, el
> Consultorio Jurídico de una universidad) antes de usarlo con arriendos reales.

## Marco legal (resumen)

- **Ley 527 de 1999** y **Decreto 2364 de 2012** (compilado en el Decreto 1074 de 2015): la firma
  electrónica vale como la firma a mano si el método es **confiable y apropiado**.
- **Confiable** significa que se pueda demostrar:
  - quién firmó;
  - que solo esa persona controlaba el medio de firma;
  - que el documento no cambió;
  - la trazabilidad de la firma.
- Hay autos de juzgados colombianos que **rechazaron demandas por arriendos firmados electrónicamente**
  cuando no se probó ese método. Por eso Roumix guarda las evidencias de cada firma.
- **Ley 820 de 2003** (arrendamiento de vivienda urbana): rige el contenido del contrato. Su
  **artículo 16 prohíbe exigir depósitos en dinero**, así que la plantilla no cobra depósito.

## F-1 · Contrato en PDF sellado (hecho)

- Cada usuario registra su **documento de identidad** (CC, CE, PPT o pasaporte) en *Solicitudes*.
  Un mismo documento no puede estar en dos cuentas.
- Al **enviar** el contrato, Roumix exige el documento de ambas partes. Si falta, no lo envía y le
  avisa a quien le falta.
- Con los dos documentos, genera el **PDF definitivo** con la plantilla de la Ley 820. Luego calcula su
  **huella SHA-256**, guarda el PDF (tabla `contratos_documentos`) y copia al contrato los nombres y
  documentos tal como quedaron.
- Las partes y el equipo descargan el PDF. Antes de entregarlo, Roumix verifica que el archivo
  guardado coincida con su huella; si no coincide, no lo entrega.

### Plantilla y revisión legal

La plantilla está en `backend/src/services/contratoPdfService.js` (`PLANTILLA`). Mientras
`revisada: false`, el PDF y la página del contrato dicen **"Pendiente de revisión legal"**.

Cuando un abogado la revise:
1. Ajustar el texto de `clausulas()`.
2. Cambiar `version` (por ejemplo, `arriendo-vivienda-2026-12`) y poner `revisada: true`,
   `revisadaPor` y `revisadaEn`.
3. Los contratos ya enviados conservan su versión.

**Qué llevarle al abogado:**
- el PDF de un contrato de prueba;
- este documento, que explica cómo se firma;
- la lista de evidencias que guardará el F-3.

## Siguientes módulos

- **F-2 · Código al correo:** código de 6 dígitos al correo confirmado; dura 10 minutos y tiene
  intentos limitados.
- **F-3 · Firma:** firma manuscrita dibujada, nombre y documento, consentimiento expreso y el código.
  Evidencias guardadas: fecha y hora, IP, dispositivo y huella del PDF.
- **F-4 · PDF firmado y certificado:** las firmas se estampan en el PDF y se agrega una página de
  certificado con las evidencias. Una página pública de verificación permite comprobar el documento
  por su código.
