# Roumix — Pruebas

## 1. Pruebas automatizadas (`npm test`)

Son **pruebas de integración**: llaman a los controladores reales del backend contra la base de datos
configurada en `DATABASE_URL`. Cada archivo crea sus propios usuarios, inmuebles, solicitudes, contratos y pagos
(con correos `@roumix.test`), los usa y **los borra al terminar**. Los correos van a un transporte simulado
(no se envía nada real) y los registros de auditoría que generan quedan marcados como de prueba y también se
borran.

```bash
ROUMIX_PRUEBAS_BD=si npm test             # Git Bash / macOS / Linux (desde la raíz o desde backend/)
$env:ROUMIX_PRUEBAS_BD="si"; npm test     # PowerShell
npm test -- 03 06                         # solo los archivos que empiezan por 03 y 06
```

`ROUMIX_PRUEBAS_BD=si` es obligatorio porque las pruebas escriben en la base de datos. Lo ideal es usar un
proyecto de Supabase **separado** para pruebas (con su propio `DATABASE_URL`) y aplicarle `npm run migrate`.

El ejecutor (`backend/tests/ejecutar.js`) corre los archivos en orden, muestra cada comprobación y termina con
un resumen; devuelve código de salida 1 si algo falla (útil para integración continua).

### Cobertura (226 comprobaciones)

| Archivo | Comprobaciones | Qué verifica |
|---------|:--------------:|--------------|
| `01-verificacion-propietarios` | 25 | Perfil incompleto no publica; validaciones del perfil (comisión, celular); estados pendiente / requiere información / rechazado / aprobado; correos; un admin no se revisa a sí mismo; las publicaciones de un propietario rechazado se ocultan; historial. |
| `02-publicaciones` | 23 | Capacidad válida (1–20) y CHECK de la BD; "retirado" no se elige a mano; pausa temporal de Roumix con reportes abiertos; retirar conserva la fila y las fotos; una retirada no se edita ni se reactiva; no se retira lo ajeno; la búsqueda pública la excluye. |
| `03-solicitudes` | 42 | El teléfono del propietario no sale en la API; validaciones (fecha, duración, capacidad); una solicitud abierta por inmueble; el propietario no la ve hasta que Roumix la comparte y nunca ve datos del estudiante; transiciones inválidas y estados reservados (pagado, contrato formalizado) rechazados; notas separadas por destinatario; cancelación; correos. |
| `04-mensajes` | 33 | Aislamiento total entre usuarios; el usuario nunca ve notas internas; pendiente / atendida; un solo correo al pasar a pendiente; avisos que se marcan leídos; Roumix escribe a una parte de la solicitud (al propietario solo si ya la conoce) y reutiliza el hilo; límite diario. |
| `05-contratos` | 36 | Solo en "Contrato pendiente"; un contrato vigente; las partes no ven el borrador; enviado = sellado (no se edita); permisos de lectura y aceptación; contenido alterado → huella inválida y no se acepta; paso automático a "Contrato formalizado"; cancelación automática al volver a negociación; expiración. |
| `06-pagos-simulados` | 41 | Sin condiciones de comisión aceptadas no hay pago; al aceptarlas se habilita solo; reparto 800.000 = 80.000 + 720.000; el estudiante no ve la comisión; rechazo y reintento; la BD impide `simulado = false`; disputa retiene el desembolso; desembolso → completada; devolución anula comisión y desembolso; cancelación; totales del panel. |
| `07-auditoria` | 26 | Monta las **rutas reales del panel** en un servidor local y hace peticiones HTTP: cada acción queda auditada con su admin, sin guardar textos privados y con la IP en hash; consultas y acciones fallidas no se registran; un no-admin queda registrado como acceso denegado; resumen con las 8 cifras; filtros y paginación; la BD bloquea modificar o borrar la auditoría. |

## 2. Pruebas manuales recomendadas (en el navegador)

| ID | Flujo | Resultado esperado |
|----|-------|--------------------|
| M-01 | Abrir una página interna sin sesión | Redirige a iniciar sesión y luego vuelve a la página |
| M-02 | Registrarse como propietario y entrar sin aprobación | Lo lleva a "Mi verificación"; "Publicar" muestra el bloqueo |
| M-03 | Admin aprueba al propietario | Llega el correo; ya puede publicar |
| M-04 | Estudiante busca, abre una publicación y toca "Solicitar arriendo" | La solicitud aparece en "Mis solicitudes" y en el panel; llega el correo al equipo |
| M-05 | Admin pasa la solicitud a "En revisión" con un mensaje para cada parte | Cada uno ve solo su mensaje; el propietario ve solo el primer nombre del estudiante |
| M-06 | Estudiante escribe a Roumix; admin responde y deja una nota interna | El estudiante ve la respuesta y el contador en "Mensajes", nunca la nota interna |
| M-07 | Admin prepara y envía el contrato; ambas partes lo aceptan | El contrato queda formalizado y la solicitud pasa a "Pago pendiente" (si el propietario aceptó la comisión) |
| M-08 | Estudiante paga con "rechazado" y luego con "aprobado" | Primero "Pago rechazado", luego "Pagado" con referencia `SIM-…` |
| M-09 | Admin registra el desembolso | La solicitud queda "Completada"; el propietario ve su desembolso |
| M-10 | Revisar la pestaña "Auditoría" | Aparecen las acciones anteriores con responsable y fecha |
| M-11 | Probar en celular y en modo oscuro | Sin desbordes horizontales; textos legibles |

## 3. Herramientas

- **Navegador (DevTools):** red, consola y almacenamiento local.
- **Supabase Dashboard:** revisar filas de las tablas y la auditoría.
- **Thunder Client / Postman:** probar la API con el token de una sesión (`Authorization: Bearer …`).
