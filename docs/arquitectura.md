# Roumix — Arquitectura del Sistema

## 1. Vista general

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        NAVEGADOR (HTML + CSS + JS)                       │
│  frontend/*.html · js/app.js (sesión, navegación, "Solicitar") · js/api.js│
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTPS · JSON · Authorization: Bearer <token de Supabase Auth>
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  VERCEL                                                                  │
│  · frontend/ como archivos estáticos (cabeceras de seguridad en vercel.json)│
│  · /api/* → api/index.js → backend/src/app.js (Express)                  │
│  · Cron diario → /api/tareas/limpieza (cuentas sin confirmar)            │
└───────┬───────────────────────┬───────────────────────┬──────────────────┘
        │ pg (conexión directa) │ Supabase SDK          │ SMTP / Apps Script
        ▼                       ▼                       ▼
┌────────────────┐   ┌─────────────────────────┐   ┌──────────────────────┐
│ PostgreSQL     │   │ Supabase Auth (cuentas, │   │ Gmail de Roumix      │
│ (Supabase)     │   │ tokens) · Storage (fotos)│   │ (correos)            │
│ RLS activado,  │   └─────────────────────────┘   └──────────────────────┘
│ sin acceso     │
│ público        │
└────────────────┘
```

El backend es el **único** que habla con la base de datos (conexión directa con `DATABASE_URL`). Los roles
públicos de Supabase (`anon`, `authenticated`) no tienen permisos sobre las tablas y RLS está activado en todas,
así que nadie puede leer ni escribir datos saltándose la API.

En local, el mismo servidor Express sirve `frontend/` y la API en `http://localhost:3000`.

## 2. Capas del backend

```
backend/src/
├── app.js             Seguridad (cabeceras, CORS), JSON, rutas, archivos estáticos, manejador de errores
├── routes/            Una por área: define la ruta y la cadena de middleware
├── middleware/
│   ├── auth.js            requireAuth (valida el token y lee el usuario de la BD), requireRol, authOpcional
│   ├── verificacion.js    requirePropietarioAprobado (publicar solo con la cuenta aprobada)
│   ├── auditoriaAdmin.js  Registra en la auditoría cada acción del panel que cambia datos
│   ├── limiteIngreso.js, limiteRegistro.js, captcha.js   Anti-abuso
│   ├── subidaFotos.js     Recepción y validación de fotos (tipo real, tamaño, cantidad)
│   └── errorHandler.js    Respuestas de error uniformes
├── controllers/       Reglas de negocio de cada operación (validan permisos y propiedad del registro)
└── services/
    ├── notificacionesService.js  Correos con la plantilla de Roumix (nunca lanza error)
    ├── avisosService.js          Avisos dentro de la plataforma
    ├── pagosService.js           Reparto 10 % / 90 %, referencias y habilitación del pago
    ├── auditoriaService.js       Registro de auditoría y traducción ruta → acción
    ├── verificacionService.js    Estado de la verificación y condiciones de la comisión
    ├── limitesService.js         Límites persistentes (huellas hash, sin datos en claro)
    └── fotosService.js, geocodificacionService.js
```

Reglas transversales:
- El **rol** se lee de la base de datos en cada petición; nunca se confía en lo que diga el navegador.
- Cada controlador comprueba que el registro **pertenezca** a quien lo pide; si no, responde `404` (no revela
  que existe).
- Los cambios de varias tablas van en **transacciones** (`BEGIN … COMMIT`), con bloqueo de fila (`FOR UPDATE`)
  donde dos acciones podrían cruzarse (aceptar un contrato, pagar, cambiar una solicitud).
- Los estados de contrato y de pago de una solicitud los pone **solo el sistema** (`moverSolicitud`), nunca
  una petición directa.
- Los correos y avisos se envían **después** de guardar; si fallan, la operación queda guardada igual.

## 3. Rutas de la API

Todas bajo `/api`. "Sesión" = `Authorization: Bearer <token>`.

### Públicas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health`, `/health/db` | Estado del servidor y de la base de datos |
| GET | `/config` | Configuración pública (clave pública del CAPTCHA) |
| GET | `/inmuebles?tipo=&precioMax=&universidad=&q=&orden=&ids=` | Inmuebles visibles (sin sesión, sin nombre del propietario) |
| GET | `/inmuebles/:id` | Detalle de un inmueble visible |
| GET | `/mapa/teselas/:z/:x/:y.png` | Teselas del mapa (con caché, limitadas a la región) |
| POST | `/auth/registro`, `/auth/login`, `/auth/recuperar` | Con CAPTCHA y límites de intentos |
| POST | `/auth/refresh` | Renovar el token |

### Con sesión
| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/auth/perfil` · POST `/auth/logout` · POST `/auth/restablecer` | Cualquiera | Perfil, salir, nueva contraseña |
| GET | `/inmuebles/mios`, `/inmuebles/mios/:id` | Propietario | Sus inmuebles en cualquier estado |
| POST · PUT | `/inmuebles`, `/inmuebles/:id` | Propietario **aprobado** | Publicar y editar (multipart con fotos) |
| PATCH | `/inmuebles/:id/estado` | Propietario | `disponible`, `pausado` o `arrendado` |
| DELETE | `/inmuebles/:id` | Propietario | **Retirar** (no borra: queda como registro) |
| GET | `/inmuebles/geocodificar?q=` | Propietario | Buscar una dirección (OpenStreetMap) |
| POST | `/inmuebles/:id/reportes` | Estudiante, propietario | Reportar una publicación |
| GET · PUT | `/propietario/verificacion` | Propietario | Ver o enviar el perfil a revisión |
| POST | `/propietario/condiciones` | Propietario | Aceptar las condiciones de la comisión |
| POST | `/solicitudes` | Estudiante | Enviar una solicitud de arriendo |
| GET | `/solicitudes/mias` | Estudiante, propietario | Sus solicitudes / las compartidas con él |
| POST | `/solicitudes/:id/cancelar` | Estudiante | Cancelar mientras no haya contrato formalizado |
| GET · POST | `/conversaciones` | Estudiante, propietario | Sus conversaciones / nueva consulta a Roumix |
| GET | `/conversaciones/:id` | Estudiante, propietario | Mensajes (sin notas internas) |
| POST | `/conversaciones/:id/mensajes` | Estudiante, propietario | Escribir en su conversación |
| GET | `/notificaciones` · POST `/notificaciones/leidas` | Cualquiera | Novedades y marcarlas como leídas |
| GET | `/contratos/mios` | Estudiante, propietario | Contratos ya enviados en los que participa |
| GET | `/contratos/:id` | Partes, admin | Ver el contrato |
| POST | `/contratos/:id/aceptar` | Partes | Aceptación demostrativa (`firma`, `confirmo`) |
| GET | `/pagos/mios`, `/pagos/:id` | Partes (admin para ver) | Pagos (el estudiante no ve la comisión) |
| POST | `/pagos/:id/simular` | Estudiante | Pagar con el simulador (`metodo`, `resultado`) |
| POST | `/pagos/:id/disputa` | Estudiante | Reportar un problema con un pago aprobado |

### Panel (`/admin/…`, solo rol admin; las acciones que cambian datos quedan en la auditoría)
| Área | Rutas |
|------|-------|
| Resumen y auditoría | `GET /resumen`, `GET /auditoria?entidad=&entidadId=&actor=&q=&desde=&hasta=&antes=`, `GET /historial` (moderación, compatibilidad) |
| Propietarios | `GET /propietarios`, `POST /propietarios/:id/verificacion` |
| Publicaciones y reportes | `GET /inmuebles`, `GET /inmuebles/:id`, `POST /inmuebles/:id/moderacion`, `GET /reportes` |
| Usuarios | `GET /usuarios`, `POST /usuarios/:id/estado` |
| Solicitudes | `GET /solicitudes`, `GET /solicitudes/:id`, `POST /solicitudes/:id` |
| Mensajes | `GET /conversaciones`, `POST /conversaciones`, `GET /conversaciones/:id`, `POST /conversaciones/:id/mensajes`, `POST /conversaciones/:id/estado` |
| Contratos | `GET /contratos`, `GET /solicitudes/:id/contratos`, `POST /solicitudes/:id/contrato`, `PUT /contratos/:id`, `POST /contratos/:id/enviar`, `POST /contratos/:id/cancelar` |
| Pagos | `GET /pagos`, `GET /pagos/:id`, `POST /solicitudes/:id/pago`, `POST /pagos/:id/desembolso`, `/devolucion`, `/resolver-disputa`, `/cancelar` |

### Tarea programada
| GET | `/tareas/limpieza` | Solo con `CRON_SECRET` (Vercel Cron) | Borra cuentas sin confirmar de más de 24 horas |

## 4. Flujo de una solicitud (máquina de estados)

```
recibida ──► en_revision ──► aceptada ──► visita_coordinada ──► en_negociacion ──► contrato_pendiente
   │              │              │               │                    │    ▲                │
   └──────────────┴──────────────┴───────────────┴────────► rechazada / cancelada            │
                                                                       └────(vuelve)────────┘
contrato_pendiente ──(ambas partes aceptan el contrato: SISTEMA)──► contrato_formalizado
contrato_formalizado ──(propietario aceptó la comisión: SISTEMA)──► pago_pendiente
pago_pendiente ──(simulador aprueba: SISTEMA)──► pagado ──(admin registra desembolso)──► completada
pagado ──(devolución)──► cancelada        pago_pendiente ──(admin cancela el pago)──► cancelada
```

- El admin solo puede usar las flechas superiores; los estados de contrato y pago los pone el sistema.
- La solicitud se comparte con el propietario al pasar a `en_revision` (antes no la ve).
- Si la solicitud vuelve a negociación, se rechaza o se cancela, el contrato vigente se cancela solo.

## 5. Frontend

- Cada página interna llama a `protegerPagina([roles])`, que confirma la sesión con el servidor antes de
  mostrar nada. Es solo comodidad: la protección real está en la API.
- `js/api.js` centraliza las llamadas, renueva el token cuando está por vencer y normaliza los datos.
- `js/app.js` arma la navegación según el rol (con el contador de novedades), la ventana "Solicitar arriendo",
  los avisos (`RoumixAvisos`), el modo oscuro (`RoumixTema`) y utilidades comunes.
- Sin datos de respaldo locales: si la API no responde, la página lo dice.
