# Roumix — Vivienda Universitaria en Villavicencio 🏠🎓

Plataforma web de **intermediación de arriendos universitarios** en Villavicencio (Meta). Los estudiantes
encuentran habitaciones, apartaestudios y apartamentos cerca de su universidad; los propietarios verificados
publican sus inmuebles; y el equipo de Roumix **acompaña todo el proceso**: recibe las solicitudes, habla con
cada parte, prepara el contrato y gestiona el pago del primer mes.

> **Comunicación gestionada:** estudiantes y propietarios nunca se escriben directamente ni ven el teléfono o el
> correo del otro. Todo pasa por el equipo de Roumix.
>
> **Partes demostrativas:** la firma del contrato y los pagos son **simulados** (ver
> [Qué es demostrativo](#-qué-es-demostrativo)). No se mueve dinero real.

**En producción:** https://roumix-eight.vercel.app

## 🛠️ Stack

- **Frontend:** HTML5, CSS3 y JavaScript vanilla (sin frameworks). Mapas con Leaflet + OpenStreetMap.
- **Backend:** Node.js 20+ y Express 5 (API REST).
- **Base de datos:** PostgreSQL en Supabase, con migraciones versionadas.
- **Autenticación e imágenes:** Supabase Auth y Supabase Storage.
- **Correo:** Gmail de Roumix por SMTP (o un Google Apps Script como relevo).
- **Despliegue:** Vercel (páginas estáticas + la API como función).

## 🔄 Cómo funciona (flujo completo)

```
Propietario                      Roumix (panel)                         Estudiante
───────────                      ──────────────                         ──────────
1. Se registra y envía su perfil ─► 2. Revisa y aprueba la cuenta
3. Acepta las condiciones de la comisión (10 % del primer mes)
4. Publica su inmueble ─────────────────────────────────────────────► 5. Busca en el mapa y compara
                                   6. Recibe la solicitud ◄──────────── 5b. Envía "Solicitar arriendo"
                                   7. Habla con cada parte (Mensajes), coordina visita y condiciones
                                   8. Prepara el contrato y lo envía
9. Acepta el contrato ───────────────────────────────────────────────► 9b. Acepta el contrato
                                   10. Contrato FORMALIZADO → se habilita el pago (automático)
                                                                       11. Paga el primer mes (simulado)
                                   12. Registra la comisión (10 %) y el desembolso del 90 % al propietario
                                   → Solicitud COMPLETADA
```

Estados de una solicitud: `recibida → en_revision → aceptada → visita_coordinada → en_negociacion →
contrato_pendiente → contrato_formalizado → pago_pendiente → pagado → completada`, además de `rechazada`
y `cancelada`. Los estados de contrato y pago **solo los pone el sistema**: nadie puede marcar a mano una
solicitud como "pagada".

## 👥 Roles

| Rol | Puede |
|-----|-------|
| **Estudiante** | Buscar con filtros y mapa, ver el detalle, comparar hasta 3 inmuebles, enviar y cancelar solicitudes, escribirle a Roumix, aceptar su contrato, pagar el primer mes (simulado), reportar un problema con el pago y reportar publicaciones. |
| **Propietario** | Enviar su perfil a verificación, aceptar las condiciones de la comisión, publicar (solo con la cuenta **aprobada**), editar, pausar, marcar como arrendado y **retirar** sus publicaciones, ver las solicitudes que Roumix le comparte, escribirle a Roumix, aceptar contratos y ver su desembolso. |
| **Administrador** | Todo el panel `/pages/admin.html`: verificar propietarios, moderar publicaciones y reportes, gestionar solicitudes, mensajes (con notas internas), contratos, pagos, desembolsos, devoluciones y disputas, cuentas de usuario y la **auditoría**. |

El rol de administrador **no se puede elegir al registrarse**. Se asigna con un procedimiento controlado
(ver [Asignar el primer administrador](#asignar-el-primer-administrador)).

## 📁 Estructura

```
roumix/
├── frontend/                 Sitio web (lo sirve Vercel o el propio backend en local)
│   ├── index.html            Portada
│   ├── ingresar.html         Inicio de sesión y registro
│   ├── pages/
│   │   ├── buscar.html       Búsqueda con el mapa como protagonista
│   │   ├── detalle.html      Detalle del inmueble y "Solicitar arriendo"
│   │   ├── comparar.html     Comparador (hasta 3)
│   │   ├── solicitudes.html  Solicitudes del estudiante / del propietario
│   │   ├── mensajes.html     Conversaciones con el equipo de Roumix y novedades
│   │   ├── contrato.html     Contrato (documento imprimible y aceptación demostrativa)
│   │   ├── pago.html         Pago simulado del primer mes, desglose y movimientos
│   │   ├── publicar.html, mis-publicaciones.html, verificacion.html   (propietario)
│   │   ├── admin.html        Panel de administración
│   │   └── privacidad.html, restablecer.html, como-funciona.html
│   ├── js/app.js             Sesión, navegación, ventana "Solicitar arriendo", avisos
│   ├── js/api.js             Cliente de la API
│   ├── js/admin.js           Lógica del panel
│   ├── js/mapa.js            Mapas (Leaflet)
│   └── css/style.css         Estilos (incluye modo oscuro e impresión del contrato)
├── backend/
│   ├── src/app.js            Express: seguridad, rutas y archivos estáticos
│   ├── src/routes/           Rutas de la API (una por área)
│   ├── src/controllers/      Lógica de cada operación
│   ├── src/middleware/       Sesión, roles, verificación, límites, CAPTCHA, auditoría, fotos, errores
│   ├── src/services/         Correo, avisos, pagos, auditoría, verificación, fotos, límites, geocodificación
│   ├── scripts/migrate.js    Aplica las migraciones
│   ├── scripts/asignar-admin.js
│   └── tests/                Pruebas de integración (npm test)
├── api/index.js              Punto de entrada de la API en Vercel (reutiliza backend/src/app.js)
├── database/migrations/      Esquema en orden (001 … 013): la fuente de verdad de la base de datos
└── docs/                     Requisitos, arquitectura, modelo de datos y pruebas
```

## 🚀 Instalación local

Requisitos: Node.js 20 o superior y un proyecto de [Supabase](https://supabase.com).

```bash
npm install                 # desde la raíz instala también el backend
```

Copia `backend/.env.example` como `backend/.env` y completa los valores:

| Variable | Obligatoria | Para qué |
|----------|:-----------:|----------|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL (Supabase → Connect → Transaction pooler) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Sí | Validar sesiones y subir fotos |
| `SUPABASE_SERVICE_ROLE_KEY` | Recomendada | **Secreta.** Que los correos de cuenta salgan desde el correo de Roumix |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Recomendada | Envío de correos (o `CORREO_RELAY_URL` + `CORREO_RELAY_SECRETO`) |
| `CORREO_REMITENTE`, `CORREO_ADMIN` | No | Remitente y correo extra que recibe los avisos del equipo |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | No | CAPTCHA de Cloudflare (sin ellas queda desactivado) |
| `APP_URL` | En producción | Dirección pública para los enlaces de los correos |
| `CORS_ORIGIN` | No | Orígenes adicionales permitidos |
| `CRON_SECRET` | En Vercel | Protege la tarea diaria de limpieza |

> `backend/.env` contiene credenciales y **nunca** se sube a GitHub (está en `.gitignore`).
> Ninguna clave secreta va en el frontend.

```bash
npm run migrate      # crea o actualiza las tablas (aplica solo las migraciones nuevas)
npm run dev          # servidor con recarga automática en http://localhost:3000
npm test             # pruebas de integración (ver "Pruebas")
```

### Asignar el primer administrador

1. Crea una cuenta normal (estudiante) y confirma el correo. Usa una cuenta distinta a la de propietario.
2. Desde la raíz: `npm run admin:asignar -- correo@ejemplo.com` (para quitarlo: agrega `--quitar`).
3. Cierra sesión y vuelve a entrar: aparecerá "Administración" en el menú.

## 🧪 Pruebas

```bash
ROUMIX_PRUEBAS_BD=si npm test             # Git Bash / macOS / Linux
$env:ROUMIX_PRUEBAS_BD="si"; npm test     # PowerShell
npm test -- 05 06                         # solo algunas
```

Son **226 comprobaciones de integración** en 7 archivos (`backend/tests/`), una por módulo: verificación
de propietarios, publicaciones, solicitudes, mensajes, contratos, pagos simulados y auditoría. Llaman a los
controladores reales contra la base de datos configurada; cada prueba crea sus propios usuarios y datos
(con correos `@roumix.test`) y **los borra al terminar**. No envían correos reales. Como escriben en la base
de datos, piden confirmarlo con `ROUMIX_PRUEBAS_BD=si`. Detalle en [`docs/pruebas.md`](docs/pruebas.md).

## 🛡️ Seguridad y confianza

- **Roles y permisos en el servidor:** el rol se lee siempre de la base de datos, nunca del navegador. Cada
  consulta comprueba que el registro pertenezca a quien la hace (un estudiante no ve solicitudes, contratos ni
  pagos ajenos; un propietario solo los de sus inmuebles).
- **Base de datos:** RLS activado en todas las tablas y sin permisos para los roles públicos de Supabase; solo
  el backend accede. Restricciones (`CHECK`, índices únicos) que impiden estados imposibles: un contrato no
  queda formalizado sin las dos aceptaciones, un pago no puede marcarse como real, la comisión y el neto
  siempre suman el monto.
- **Sin datos de contacto entre las partes:** la API no devuelve teléfonos ni correos de la otra parte; sin
  sesión ni siquiera el nombre del propietario. La ubicación pública se redondea (~100 m).
- **Propietarios verificados:** solo publican con la cuenta aprobada por Roumix. La verificación revisa el
  perfil y, si se llama, el teléfono; **no es** una verificación legal de identidad ni de propiedad.
- **Auditoría de solo adición:** cada acción del panel y los pasos clave de los usuarios quedan en la tabla
  `auditoria`, que la base de datos no deja modificar ni borrar. No guarda el contenido de mensajes y la IP
  queda como huella (hash).
- **Anti-abuso:** CAPTCHA, límites persistentes de intentos de ingreso y registro, límites de solicitudes,
  mensajes y reportes; cabeceras de seguridad (CSP, `X-Frame-Options`) y CORS restringido.
- **Contraseñas:** las gestiona Supabase Auth; Roumix nunca las guarda.

## 🎭 Qué es demostrativo

| Parte | Cómo funciona hoy | Qué falta para que sea real |
|-------|-------------------|-----------------------------|
| **Firma del contrato** | Cada parte escribe su nombre y confirma; se guardan fecha, hora y la huella SHA-256 del documento. | Integrar un proveedor de firma electrónica certificado. |
| **Pagos** | Un simulador interno aprueba o rechaza (el estudiante elige el resultado para la demostración). Se registran referencias, comisión, desembolso, devoluciones y disputas, todo marcado como simulado. | Un proveedor de pagos autorizado que procese cobros y desembolsos a terceros (y una migración nueva y revisada, porque la base de datos hoy impide pagos no simulados). |
| **Desembolsos y devoluciones** | El administrador los registra en el panel. | Lo mismo: el proveedor de pagos. |

No se guardan datos de tarjetas ni cuentas bancarias, y ningún texto afirma que se movió dinero real.

## ☁️ Despliegue en Vercel

Vercel sirve `frontend/` y ejecuta toda la API como una función (`api/index.js`). Cada `git push` a `main`
despliega solo. Configuración en `vercel.json` (rutas, cabeceras de seguridad y la tarea diaria
`/api/tareas/limpieza`, que borra cuentas sin confirmar).

1. Importa el repositorio en Vercel (Framework Preset: **Other**).
2. Agrega las variables de entorno de la tabla de arriba, con `APP_URL=https://<proyecto>.vercel.app`.
3. Agrega esa dirección en Supabase (**Site URL** y **Redirect URLs** con `/**`) y en Cloudflare Turnstile.
4. Aplica las migraciones contra la base de producción con `npm run migrate`.

`render.yaml` se conserva por si se quiere desplegar en Render (ver la historia del proyecto).

## 📧 Correos y avisos

Cada evento importante llega **por correo** y como **aviso en la plataforma** (contador junto a "Mensajes"):
verificación del propietario, solicitudes (nueva, cambios de estado), respuestas de Roumix, contratos (enviado,
falta tu aceptación, formalizado), pagos (habilitado, aprobado, desembolso, devolución) y reportes. Ningún
correo incluye datos de contacto de la otra parte ni la identidad de quien reporta. Si un correo falla, la
operación se guarda igual. Plantilla del relevo por Apps Script: [`docs/correo-apps-script.gs`](docs/correo-apps-script.gs).

## 🔌 API

Resumen por área (todas bajo `/api`; las rutas protegidas exigen `Authorization: Bearer <token>`).
La lista completa con sus reglas está en [`docs/arquitectura.md`](docs/arquitectura.md).

| Área | Rutas | Acceso |
|------|-------|--------|
| Salud y configuración | `GET /health`, `GET /health/db`, `GET /config` | Público |
| Autenticación | `POST /auth/registro`, `/login`, `/recuperar`, `/restablecer`, `/refresh`, `/logout`; `GET /auth/perfil` | Público (con CAPTCHA) o sesión |
| Inmuebles | `GET /inmuebles`, `GET /inmuebles/:id` (público); `GET /inmuebles/mios`, `POST`, `PUT`, `PATCH /:id/estado`, `DELETE /:id` = retirar (propietario); `POST /inmuebles/:id/reportes` | Según la ruta |
| Verificación | `GET`/`PUT /propietario/verificacion`, `POST /propietario/condiciones` | Propietario |
| Solicitudes | `POST /solicitudes`, `GET /solicitudes/mias`, `POST /solicitudes/:id/cancelar` | Estudiante / propietario |
| Mensajes y avisos | `GET`/`POST /conversaciones`, `GET /conversaciones/:id`, `POST /conversaciones/:id/mensajes`; `GET /notificaciones`, `POST /notificaciones/leidas` | Estudiante / propietario |
| Contratos | `GET /contratos/mios`, `GET /contratos/:id`, `POST /contratos/:id/aceptar` | Partes del contrato (y admin para ver) |
| Pagos | `GET /pagos/mios`, `GET /pagos/:id`, `POST /pagos/:id/simular`, `POST /pagos/:id/disputa` | Partes del pago (y admin para ver) |
| Panel | `/admin/…`: resumen, reportes, inmuebles, usuarios, propietarios, solicitudes, conversaciones, contratos, pagos, auditoría | Admin |

## 📌 Estado del proyecto

- [x] Seguridad base: datos del propietario ocultos sin sesión, CORS, cabeceras, límites persistentes y permisos de BD
- [x] Verificación de propietarios (perfil, revisión de Roumix, bloqueo para publicar)
- [x] Publicaciones: capacidad, retiro sin borrar (historial) y pausa temporal de Roumix
- [x] Solicitudes de arriendo con 12 estados, en lugar del contacto directo por WhatsApp
- [x] Comunicación gestionada: conversaciones con Roumix, notas internas y avisos
- [x] Contratos demostrativos con aceptación de ambas partes y huella del documento
- [x] Pagos simulados: comisión del 10 %, desembolsos, devoluciones y disputas
- [x] Panel ampliado y auditoría de solo adición
- [x] Pruebas de integración (`npm test`) y documentación
- [x] Despliegue en Vercel

### Pendientes y limitaciones conocidas

- **Firma electrónica y pagos reales:** requieren proveedores autorizados (ver "Qué es demostrativo").
- **Propietarios existentes:** los dos propietarios aprobados antes del módulo de pagos deben aceptar las
  condiciones de la comisión en "Mi verificación"; hasta entonces no se habilita el pago de sus arriendos.
- **Rotar la contraseña de la base de datos** (Supabase → Database → Reset password) y actualizar
  `DATABASE_URL` en `backend/.env` y en Vercel.
- **MFA para administradores:** se recomienda activar la autenticación multifactor de Supabase.
- **Pruebas sobre la base real:** las pruebas usan la base configurada; lo ideal es un proyecto de Supabase
  separado para pruebas.
- `database/schema.sql` es una foto antigua del esquema; la fuente de verdad son las migraciones.

---
*Construcción de Software · Semestre 4 · Universidad Santo Tomás Villavicencio*
