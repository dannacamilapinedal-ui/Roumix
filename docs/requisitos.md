# Roumix — Requisitos del Sistema

## 1. Descripción general

Roumix es una plataforma de **intermediación de arriendos universitarios** en Villavicencio (Meta, Colombia).
Conecta a estudiantes que buscan vivienda cerca de su universidad con propietarios verificados, y el equipo de
Roumix **gestiona todo el proceso**: recibe las solicitudes, se comunica con cada parte, prepara el contrato y
gestiona el pago del primer mes.

Principios del modelo:

- **Comunicación gestionada:** estudiante y propietario nunca se comunican directamente ni ven los datos de
  contacto del otro. Cada uno conversa solo con el equipo de Roumix.
- **Confianza verificable:** los propietarios publican solo después de que Roumix revisa su perfil, y cada
  insignia refleja exactamente lo que se comprobó.
- **Comisión justa:** Roumix cobra al **propietario** el 10 % del primer canon, una sola vez, y solo cuando el
  arriendo se concreta (contrato formalizado y primer pago confirmado). El estudiante no paga comisión.
- **Pagos y firma demostrativos** mientras no haya proveedores autorizados (ver sección 6).

---

## 2. Roles

### Estudiante
- Se registra, confirma su correo e inicia sesión.
- Busca inmuebles en el mapa y la lista, con filtros (tipo, precio, universidad, zona) y orden.
- Ve el detalle y compara hasta 3 inmuebles.
- Envía **solicitudes de arriendo** (fecha de ingreso, duración, personas, mensaje para Roumix) y las cancela
  mientras no haya contrato formalizado.
- Conversa con el equipo de Roumix sobre una vivienda o una solicitud y recibe novedades.
- Revisa y acepta su contrato (aceptación demostrativa).
- Paga el primer mes a través de Roumix (simulado) **solo después** de formalizar el contrato, y puede reportar
  un problema con el pago (disputa).
- Reporta publicaciones sospechosas.
- **No puede:** publicar, ver datos de contacto del propietario, escribirle directamente, ni ver solicitudes,
  contratos o pagos ajenos.

### Propietario
- Se registra (celular obligatorio, solo visible para Roumix) y envía su **perfil a verificación**.
- Acepta las **condiciones de la comisión** (con su versión y fecha).
- Publica inmuebles **solo con la cuenta aprobada**; edita, pausa, marca como arrendado y **retira** sus
  publicaciones (retirar no borra: se conservan como registro).
- Ve las solicitudes de sus inmuebles **cuando Roumix se las comparte**, sin datos de contacto del estudiante
  (solo su primer nombre).
- Conversa con el equipo de Roumix, acepta contratos y consulta su comisión y desembolso.
- **No puede:** modificar publicaciones ajenas, ver el mensaje del estudiante ni las notas internas.

### Administrador (equipo de Roumix)
- Accede a un panel independiente; el rol **no** se elige al registrarse (se asigna con un procedimiento
  controlado desde el servidor).
- Revisa y aprueba, rechaza o pide información a los propietarios.
- Modera publicaciones (aprobar, pausar temporalmente, pedir cambios, rechazar, retirar) y atiende reportes.
- Gestiona solicitudes: cambia estados válidos y deja mensajes para cada parte y notas internas.
- Atiende las conversaciones (responder, notas internas, pendiente/atendida) y escribe a cualquiera de las
  partes de una solicitud.
- Prepara, edita, envía y cancela contratos.
- Consulta pagos, comisiones, desembolsos y devoluciones; registra desembolsos, devoluciones y resuelve disputas.
- Suspende o reactiva cuentas y consulta la auditoría.

---

## 3. Requisitos funcionales

| ID | Descripción |
|----|-------------|
| RF-01 | Registro con nombre, correo real, contraseña y rol (estudiante o propietario); confirmación por correo. |
| RF-02 | Inicio de sesión, recuperación de contraseña y cierre de sesión (Supabase Auth). |
| RF-03 | Verificación de propietarios con estados `pendiente`, `aprobado`, `rechazado` y `requiere_informacion`. |
| RF-04 | Solo un propietario aprobado puede publicar o editar inmuebles. |
| RF-05 | Estado comercial (`disponible`, `pausado`, `arrendado`, `retirado`) separado de la moderación de Roumix. |
| RF-06 | Búsqueda con el mapa como protagonista, filtros, zona aproximada y comparador de hasta 3 inmuebles. |
| RF-07 | Solicitud de arriendo con 12 estados (`recibida` … `completada`, `rechazada`, `cancelada`) y transiciones válidas. |
| RF-08 | Conversaciones usuario ↔ Roumix ligadas a una vivienda o solicitud, con notas internas y estado pendiente/atendida. |
| RF-09 | Avisos en la plataforma y correos para cada novedad importante. |
| RF-10 | Contrato asociado a la solicitud y al inmueble con partes, canon, depósito, inicio, duración, día de pago, servicios y condiciones; estados `borrador`, `enviado`, `pendiente_aceptacion`, `formalizado`, `cancelado`, `expirado`. |
| RF-11 | Al aceptar ambas partes, la solicitud pasa sola a `contrato_formalizado` y se habilita el pago. |
| RF-12 | Pago del primer canon (simulado) solo con contrato formalizado y condiciones de comisión aceptadas. |
| RF-13 | Registro de la comisión (10 %), desembolso del 90 % al propietario, pagos fallidos, cancelaciones, devoluciones y disputas, con referencias, montos y fechas. |
| RF-14 | Panel con resumen (estudiantes, propietarios, por revisar, publicaciones disponibles, solicitudes, contratos formalizados, pagos y comisiones) y gestión de cada área. |
| RF-15 | Auditoría de solo adición de las acciones administrativas sensibles y de los pasos clave de los usuarios. |
| RF-16 | Reportes de publicaciones con pausa preventiva y resolución por el equipo. |

---

## 4. Requisitos no funcionales

| ID | Descripción |
|----|-------------|
| RNF-01 | **Seguridad:** el backend valida sesión, rol (leído de la BD) y propiedad de cada registro; el frontend nunca decide permisos. |
| RNF-02 | **Base de datos:** RLS activado, sin permisos para los roles públicos; restricciones que impiden estados imposibles. |
| RNF-03 | **Privacidad:** sin datos de contacto entre las partes; ubicación pública aproximada; política de datos (Ley 1581 de 2012). |
| RNF-04 | **Secretos:** ninguna clave privada en el frontend ni en el repositorio. |
| RNF-05 | **Anti-abuso:** CAPTCHA, límites persistentes de ingreso, registro, solicitudes, mensajes y reportes. |
| RNF-06 | **Diseño:** interfaz en español, adaptable a celular, con modo oscuro y estados visuales claros. |
| RNF-07 | **Tecnología:** HTML, CSS y JavaScript vanilla + Node.js + Express + PostgreSQL (Supabase). |
| RNF-08 | **Pruebas:** pruebas de integración automatizadas por módulo (`npm test`). |
| RNF-09 | **Despliegue:** Vercel, con despliegue automático desde `main`. |

---

## 5. Fuera del alcance (por ahora)

- Chat en tiempo real (los mensajes se actualizan cada 20 segundos).
- Aplicación móvil nativa y notificaciones push.
- Verificación legal de identidad o de la propiedad de los inmuebles.

## 6. Partes demostrativas

- **Firma del contrato:** aceptación con nombre escrito, fecha, hora y huella SHA-256 del documento. No es una
  firma electrónica con validez legal; requiere integrar un proveedor certificado.
- **Pagos, desembolsos y devoluciones:** simulados y rotulados como tales. No se mueve dinero real ni se guardan
  datos de tarjetas o cuentas. Requiere un proveedor de pagos autorizado que permita desembolsos a terceros.
