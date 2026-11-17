# Pagos con Wompi (Módulo W-1)

Roumix cobra el **primer mes de arriendo** con [Wompi](https://wompi.com), la pasarela de pagos de
Bancolombia. El pago se habilita **solo cuando el contrato está formalizado**, igual que antes.
La comisión de Roumix (10 % del primer canon) la sigue pagando el propietario; el estudiante paga
el canon completo y Roumix desembolsa el 90 % al propietario.

Roumix usa el **widget** de Wompi. El estudiante escribe los datos de su tarjeta o cuenta dentro de la
ventana de Wompi, así que **esos datos nunca pasan por Roumix ni se guardan**. Wompi hace la
validación de la tarjeta (franquicia y número), la verificación 3D Secure y la conexión con PSE,
Nequi, Botón Bancolombia y Daviplata.

## 1. Activarlo

1. Crea la cuenta de comercio en <https://comercios.wompi.co>.
2. En **Desarrolladores → Llaves del API**, copia las llaves del **ambiente de pruebas (sandbox)**:
   - Llave pública: `pub_test_…`
   - Secreto de integridad: `test_integrity_…`
   - Secreto de eventos: `test_events_…`
   - Llave privada (opcional): `prv_test_…`
3. Pégalas tú mismo, sin compartirlas con nadie, en dos lugares:
   - **Local:** en `backend/.env`, con los nombres `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`,
     `WOMPI_EVENTS_SECRET` y `WOMPI_PRIVATE_KEY`.
   - **Producción:** en Vercel → proyecto roumix → *Settings → Environment Variables*, con los
     mismos nombres. Después vuelve a desplegar.
4. En Wompi, **Desarrolladores → Seguimiento de transacciones → URL de eventos**:
   `https://roumix-eight.vercel.app/api/wompi/eventos`

Mientras falten la llave pública, el secreto de integridad o el de eventos, Roumix sigue con el
**simulador de pagos**. Cuando las tres están puestas, el simulador se cierra: nadie puede marcar un
pago como pagado sin pagar.

Si mezclas llaves de pruebas con llaves de producción, Wompi queda desactivado a propósito, porque las
firmas no coincidirían.

### Datos de prueba de Wompi (solo en sandbox)

- **Tarjeta aprobada:** `4242 4242 4242 4242`, con cualquier fecha futura y cualquier CVC.
- **Tarjeta rechazada:** `4111 1111 1111 1111`.
- **Nequi y PSE:** el propio widget explica qué número o banco de prueba usar para cada resultado.

### Para cobrar dinero real

Wompi exige completar la verificación del comercio (RUT, cuenta bancaria, documentos). Después se
cambian las cuatro variables por las de producción (`pub_prod_…`, `prod_integrity_…`,
`prod_events_…`, `prv_prod_…`) y se registra la URL de eventos en el ambiente de producción.

## 2. Flujo

| Paso | Quién | Qué pasa |
|---|---|---|
| 1 | Estudiante | Toca "Pagar con Wompi" en `pago.html`. |
| 2 | Roumix | `POST /api/pagos/:id/wompi` valida contrato, estado e intentos. Crea un **intento** con una referencia única y **firma** referencia + monto + moneda con el secreto de integridad. |
| 3 | Wompi | El widget cobra con el medio que elija el estudiante. |
| 4 | Roumix | Al cerrar el widget, `POST /api/pagos/:id/wompi/confirmar` **consulta a Wompi** el estado real. Nunca se confía en lo que diga el navegador. |
| 5 | Wompi | Envía el evento `transaction.updated` a `POST /api/wompi/eventos`. Roumix verifica la firma y aplica el resultado. Esto funciona aunque el estudiante haya cerrado la página. |
| 6 | Roumix | Si el pago se aprueba: comisión del 10 %, desembolso pendiente del 90 %, la solicitud pasa a "Pagado", y se envían avisos y correos. |

Los pasos 4 y 5 usan la misma lógica y son **idempotentes**: si llegan los dos, o si Wompi reenvía el
mismo evento, el pago se aprueba una sola vez.

Con PSE o el Botón Bancolombia, el estudiante sale a su banco y vuelve a
`pago.html?pago=<id>&id=<transacción>`. La página confirma la transacción sola.

## 3. Payload del intento de pago

Respuesta de `POST /api/pagos/:id/wompi`. Son los datos con los que se abre el widget:

```json
{
  "status": "success",
  "data": {
    "llavePublica": "pub_test_xxxxxxxx",
    "modo": "sandbox",
    "referencia": "RMX-13-20261115-4A28329F",
    "montoCentavos": 80000000,
    "moneda": "COP",
    "firmaIntegridad": "sha256(referencia + montoCentavos + moneda + secreto de integridad)",
    "urlRetorno": "https://roumix-eight.vercel.app/pages/pago.html?pago=13",
    "cliente": { "correo": "estudiante@correo.com", "nombre": "Laura Pérez" }
  }
}
```

Lo que Roumix guarda del intento (tabla `pagos_intentos_wompi`) y lo que el intento queda amarrando
del contrato:

```json
{
  "pago_id": 13,
  "referencia": "RMX-13-20261115-4A28329F",
  "monto_centavos": 80000000,
  "moneda": "COP",
  "modo": "sandbox",
  "estado": "creado | PENDING | APPROVED | DECLINED | VOIDED | ERROR",
  "wompi_transaccion_id": "12345-1700000000-12345",
  "metodo": "tarjeta | pse | nequi | boton_bancolombia | daviplata | …",
  "contexto (vía pagos)": {
    "solicitud_id": 21,
    "contrato_id": 8,
    "estudiante_id": "uuid del estudiante",
    "propietario_id": "uuid del propietario",
    "concepto": "primer_canon",
    "dispersion": {
      "tipo": "comision_unica_a_cargo_del_propietario",
      "porcentaje_comision": 10,
      "comision": 80000,
      "neto_propietario": 720000
    }
  }
}
```

Los secretos de integridad y de eventos **nunca** salen del servidor.

## 4. Casos límite

| Caso | Qué hace Roumix |
|---|---|
| Evento con firma inválida o alterada | Responde **401** y no toca nada. |
| Wompi reenvía el mismo evento | Se guarda una sola vez (checksum único) y responde **200 "duplicado"**. |
| Llegan el "confirmar" y el webhook del mismo pago | El segundo no cambia nada; nunca se duplica la comisión. |
| "En proceso" tardío después de "aprobado" | Se ignora: un estado final no vuelve atrás. |
| PSE en proceso y el estudiante quiere pagar otra vez | No se puede abrir otro intento (**409**) hasta que el banco responda. Así se evita el doble cobro. |
| Rechazo (fondos insuficientes, banco, 3D Secure, error técnico) | El pago queda "rechazado" con un mensaje claro y el estudiante puede reintentar (máximo 5 rechazos). |
| Se aprueba un cobro cuando el pago ya estaba aprobado o cancelado | Queda marcado **"Cobro por devolver"**, se avisa por correo al equipo y el panel lo resalta. La devolución se hace desde el panel de Wompi. |
| Wompi aprueba un monto distinto al firmado | No se aprueba el pago; queda "por devolver" y en la auditoría. |
| Referencia que no es de Roumix | **200 "referencia_desconocida"**, para que Wompi no siga reintentando. |
| Evento de producción con Roumix en modo de pruebas (o al revés) | Se ignora. |
| Wompi caído o lento al confirmar | Mensaje claro; el pago se registra solo cuando llegue el webhook. |
| Falla de la base de datos al procesar un evento | Se borra el registro del evento para que el reintento de Wompi sí se procese. |
| Faltan las llaves | La pasarela y el webhook responden **503** y vuelve el simulador. |

## 5. Paga mi acudiente (Módulo W-3)

En el paso 3 del checkout, el estudiante elige **"Paga mi acudiente o familiar"** y crea un enlace.
Puede copiarlo, enviarlo por WhatsApp o enviarlo por correo. El acudiente lo abre en
`/pages/pagar.html?c=<código>` y paga con Wompi **sin crear cuenta**.

| Regla | Cómo funciona |
|---|---|
| Vigencia | 24 horas desde que se crea. |
| Un solo enlace activo | Si se crea uno nuevo, el anterior deja de servir. El estudiante también puede anularlo. |
| Seguridad del código | Tiene 256 bits aleatorios. Roumix guarda solo su **huella SHA-256**, así que el código no se puede recuperar ni leer desde la base de datos. Por eso, si el estudiante lo pierde, crea uno nuevo. |
| Qué ve el acudiente | Primer nombre del estudiante, título del inmueble, concepto, monto y fecha de vencimiento. Nunca ve direcciones, apellidos, correos ni datos del propietario. |
| Datos del acudiente | Escribe su nombre y su correo. El nombre queda en el pago y en el recibo. El correo **solo se le pasa a Wompi** para su comprobante; Roumix no lo guarda. |

### Casos límite del enlace

| Caso | Qué pasa |
|---|---|
| El enlace venció | La página dice "Este enlace venció" y no deja abrir la pasarela (**410**). El estudiante crea uno nuevo. |
| Un PSE empezó antes de vencer y el banco lo confirma después | **Sí se registra**: lo que cuenta es la referencia del intento, no el enlace. |
| El estudiante creó otro enlace o anuló el anterior | El enlace viejo muestra "Este enlace ya no sirve" (**410**). |
| El estudiante pagó él mismo | El enlace queda sin efecto y la página muestra "Este arriendo ya está pagado". |
| Acudiente y estudiante pagan al mismo tiempo | El segundo cobro queda marcado como **"Cobro por devolver"** (ver la sección 4). |
| Pago en proceso con el banco | La página del acudiente avisa y no deja pagar otra vez. |
| Se intenta confirmar con una transacción del estudiante | **404**: el enlace solo confirma transacciones abiertas por el acudiente. |
| Wompi no está activo | No se pueden crear enlaces (**503**). |

## 6. Condiciones de la comisión, versión 2026-12 (Módulo W-5a)

La versión **2026-12** mantiene el 10 % del primer canon y agrega un **5 % de cada canon mensual** que
Roumix cobre por **débito automático**, de los meses 2 en adelante. El propietario recibe el 95 % de cada
mes cobrado.

- **Quien aceptó la versión 2026-11** sigue recibiendo los pagos del primer mes como antes. Solo el
  débito automático exige la versión nueva.
- **Aviso en el panel:** en **Propietarios** aparece cuántos propietarios faltan por aceptar y el botón
  **"Avisar a N propietario(s)"**. Ese botón envía un aviso en la plataforma y un correo, una sola vez
  por propietario y versión (tabla `condiciones_avisos`).
- **Aceptación:** en **Mi verificación**, el propietario ve qué cambia y acepta la versión nueva.

## 7. Pruebas

Ejecútalas desde `backend/` con `ROUMIX_PRUEBAS_BD=si npm test -- 08 09`.

La prueba **10** (11 comprobaciones) cubre las condiciones nuevas y el aviso único. La prueba **09** suma 27 comprobaciones del enlace del acudiente: creación, huella, privacidad, vencimiento, anulación, PSE tardío y pago del propio estudiante.

Son 33 comprobaciones con llaves inventadas: se simulan la API de Wompi y su webhook, firmados con el
mismo algoritmo que usa Wompi. Cubren la firma, la verificación de eventos, los permisos, el rechazo,
el pago en proceso, la aprobación, la idempotencia, el doble cobro, el monto alterado y el pago
cancelado.
