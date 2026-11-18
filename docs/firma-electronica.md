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

## F-2 · Código de un solo uso al correo (hecho)

Firmar el contrato exige un **código de 6 dígitos** que llega al **correo confirmado** de quien firma.
Así se demuestra que la firma la hizo quien controla esa cuenta y ese correo (Decreto 2364: el
mecanismo debe estar bajo control exclusivo del firmante).

- Desde la página del contrato, la persona toca **"Enviar código a mi correo"**: `POST /api/contratos/:id/codigo`.
  El código **solo** viaja en el correo; la respuesta de la API solo dice a qué correo llegó (oculto).
- Del código se guarda solo su **huella SHA-256 con sal** (tabla `firmas_codigos`) y el correo al que se envió.
- **Uso:**
  - vence a los **10 minutos**;
  - admite **5 intentos** (al 5.º error se anula);
  - se usa **una sola vez**.
- **Reenvío:**
  - pedir otro anula el anterior;
  - se puede pedir uno cada 60 segundos, con un máximo de 5 por hora.
- Si el correo de la cuenta no está confirmado, no se envía el código.
- **Auditoría:** al firmar se registra el código usado, el correo al que llegó y la huella del PDF firmado.

## F-3 · Firma manuscrita y evidencias (hecho)

Para firmar, la persona:
1. Escribe su nombre **como aparece en su documento**. Debe empezar por el primer nombre del documento
   e incluir otra palabra del mismo; se ignoran tildes y mayúsculas.
2. **Dibuja su firma** con el dedo o el mouse en un recuadro. Se envía como PNG transparente, y el
   servidor rechaza imágenes que no sean PNG, que tengan un tamaño anómalo o que estén vacías.
3. Acepta el **consentimiento expreso**, el mismo texto que queda guardado.
4. Escribe el **código** que llegó a su correo (F-2).

Los errores de firma o de nombre **no gastan** el código.

**Evidencias** (tabla `firmas_contrato`, de **solo adición**: un disparador impide modificar o borrar firmas):

| Evidencia | Para qué sirve |
|---|---|
| Rol, usuario, nombre escrito y documento | Identifica al firmante |
| Imagen PNG de la firma y su huella SHA-256 | La firma manuscrita digitalizada |
| Texto exacto del consentimiento | Prueba que aceptó firmar electrónicamente |
| Código usado y correo al que llegó | Control exclusivo del medio de firma |
| Huella SHA-256 del PDF firmado | Vincula la firma con ese documento |
| Fecha y hora, IP y dispositivo (navegador) | Trazabilidad |

**Quién ve qué:**
- La otra parte ve la imagen, el nombre, el documento y la fecha de cada firma.
- El equipo de Roumix ve además la IP, el dispositivo y el correo completo.

## F-4 · PDF firmado, certificado y verificación pública (hecho)

Cuando firma la segunda parte, Roumix toma el **PDF original sellado** (que no se modifica) y genera el
**PDF firmado** (`contratos_documentos` tipo `firmado`):

1. Estampa la firma dibujada de cada parte sobre su línea. Al enviar el contrato se guardó en qué
   página y recuadro va cada firma (`cajas_firma`).
2. Agrega una **página de certificado** con:
   - el código de verificación;
   - la fecha de formalización y la versión de la plantilla;
   - la huella SHA-256 del PDF original;
   - por cada firmante: nombre, documento, imagen de la firma, fecha y hora de Colombia, correo
     **oculto** al que llegó el código y las huellas de la firma y del documento firmado;
   - el texto del consentimiento.
3. Guarda el PDF con su huella y le asigna al contrato un **código de verificación**
   `RMX-XXXX-XXXX-XXXX` (aleatorio, sin 0/O ni 1/I/L para no confundirlos).

Por privacidad, el certificado **no** muestra la IP, el dispositivo ni el correo completo: Roumix los
conserva como evidencia.

- Si la generación falla al formalizar, el contrato igual queda formalizado; el PDF firmado se genera
  la siguiente vez que alguien lo descarga, con el mismo código. Es idempotente: nunca hay dos.
- Ambas partes reciben un correo con el código; la página del contrato muestra el botón
  **"Descargar contrato firmado"**, el código y la huella.
- Queda en la auditoría como `contrato_pdf_firmado`.

### Verificación pública

`pages/verificar.html` (sin cuenta) permite comprobar un contrato:

- **Con el código** (`GET /api/verificar/:codigo`), por ejemplo desde el enlace del certificado.
- **Con el archivo**: el navegador calcula la huella SHA-256 del PDF (el archivo no se sube) y la compara
  con la guardada (`GET /api/verificar/huella/:sha256`). Un solo byte cambiado hace que no coincida.

La respuesta solo trae el número de contrato, el estado, las fechas, la plantilla, las huellas y las
**iniciales** de los firmantes. No incluye nombres, documentos, correos, inmueble ni IP. Las búsquedas
sin resultado tienen un límite de 20 cada 15 minutos por IP.

## Siguientes pasos (fuera del código)

- **Revisión legal** de la plantilla (ver arriba).
- Opcional, para más fuerza probatoria: firma digital certificada de Roumix sobre el PDF o una estampa
  de tiempo de una entidad de certificación acreditada por la ONAC.
