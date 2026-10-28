# Roumix — Vivienda Universitaria en Villavicencio 🏠🎓

Plataforma web para que estudiantes universitarios en Villavicencio (Meta) encuentren habitaciones,
apartaestudios y apartamentos cercanos a su campus, comparen opciones y contacten directamente al
propietario.

## 🛠️ Stack

- **Frontend:** HTML5, CSS3 y JavaScript vanilla.
- **Backend:** Node.js + Express (API REST que también sirve el frontend).
- **Base de datos:** PostgreSQL en Supabase.
- **Autenticación e imágenes:** Supabase Auth y Supabase Storage.
- **Control de versiones:** Git y GitHub.

## 📁 Estructura

```
roumix/
├── frontend/              Sitio web
│   ├── index.html         Portal de acceso (inicio de sesión / registro)
│   ├── pages/             buscar, detalle, comparar, publicar, mis-publicaciones, como-funciona, admin, privacidad
│   ├── css/style.css      Estilos compartidos
│   ├── js/app.js          Lógica compartida (sesión, navegación, modal de contacto)
│   ├── js/api.js          Cliente de la API (sin datos de respaldo locales)
│   ├── js/mapa.js         Mapas Leaflet: búsqueda, selector de ubicación y zona aproximada
│   ├── js/admin.js        Lógica del panel de administración
│   └── assets/img/        Imágenes
├── backend/               API Express
│   ├── src/app.js         Configuración de Express, rutas y archivos estáticos
│   ├── src/server.js      Arranque del servidor
│   ├── src/config/        Conexión a PostgreSQL y cliente de Supabase
│   ├── src/routes/        Rutas de la API
│   ├── src/controllers/   Lógica de cada operación
│   ├── src/middleware/    Autenticación, roles, recepción de fotos y errores
│   ├── src/services/      Subida y borrado de fotos en Supabase Storage
│   ├── scripts/migrate.js Aplica las migraciones de la base de datos
│   └── scripts/asignar-admin.js  Procedimiento controlado para el rol administrador
├── database/
│   ├── migrations/        Cambios del esquema, en orden
│   ├── schema.sql         Foto del esquema actual (referencia)
│   └── seeds.sql          Inmuebles de demostración
└── docs/                  Requisitos, arquitectura, modelo de datos y pruebas
```

## 🚀 Instalación local

Requisitos: Node.js 20 o superior y un proyecto en [Supabase](https://supabase.com).

```bash
cd backend
npm install
```

Copie `backend/.env.example` como `backend/.env` y complete los valores
(Supabase Dashboard → **Connect** y **Project Settings → API Keys**):

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión de PostgreSQL (Transaction pooler) |
| `SUPABASE_URL` | `https://<ref-del-proyecto>.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave pública *anon* / *publishable* |
| `PORT` | Puerto del servidor (por defecto 3000) |
| `CORS_ORIGIN` | Solo en producción: orígenes permitidos |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | CAPTCHA de Cloudflare Turnstile (si faltan, el CAPTCHA queda desactivado) |
| `APP_URL` | Dirección pública, para el enlace de "recuperar contraseña" |

> `backend/.env` contiene credenciales y **nunca** se sube a GitHub (está en `.gitignore`).

Crear o actualizar las tablas y, opcionalmente, cargar los datos de demostración:

```bash
npm run migrate            # aplica database/migrations
npm run migrate -- --seed  # además carga database/seeds.sql
```

Iniciar el servidor:

```bash
npm run dev    # con recarga automática
npm start      # modo normal
```

Abra **http://localhost:3000** — el mismo servidor entrega la página y la API.

> Estos comandos funcionan tanto desde `backend/` como desde la carpeta raíz del proyecto: el
> `package.json` de la raíz solo reenvía `dev`, `start`, `migrate` y `admin:asignar` al backend.
> Deja la terminal abierta mientras usas Roumix; si se cierra, la página mostrará
> "No se pudo conectar con el servidor de Roumix".

## 🔌 API

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/api/health` | Público | Estado del servidor |
| GET | `/api/health/db` | Público | Prueba la conexión con PostgreSQL |
| POST | `/api/auth/registro` | Público + CAPTCHA | Crear cuenta (nombre, email, password, rol, telefono) |
| POST | `/api/auth/login` | Público + CAPTCHA | Iniciar sesión; devuelve tokens y el perfil |
| POST | `/api/auth/recuperar` | Público + CAPTCHA | Envía el correo para crear una contraseña nueva (no revela si la cuenta existe) |
| POST | `/api/auth/restablecer` | Token del enlace | Guarda la contraseña nueva y cierra todas las sesiones |
| GET | `/api/config` | Público | Configuración pública del frontend (clave pública del CAPTCHA) |
| POST | `/api/auth/refresh` | Público | Renovar el token con el refresh token |
| GET | `/api/auth/perfil` | Con sesión | Perfil del usuario (rol leído de la BD) |
| POST | `/api/auth/logout` | Con sesión | Cerrar sesión en Supabase Auth |
| GET | `/api/inmuebles?tipo=&precioMax=&universidad=&q=&orden=` | Público | Inmuebles disponibles. `q` busca en título, barrio, universidad, distancia y comodidades; `orden`: `precio-asc`, `precio-desc`, `distancia`, `recientes` |
| GET | `/api/inmuebles?ids=1,2,3` | Público | Datos actuales de hasta 3 inmuebles disponibles (comparador) |
| GET | `/api/inmuebles/:id` | Público | Detalle de un inmueble disponible |
| GET | `/api/inmuebles/mios` | Propietario | Inmuebles del propietario autenticado (todos los estados) |
| GET | `/api/inmuebles/mios/:id` | Propietario | Un inmueble propio (para editarlo) |
| POST | `/api/inmuebles` | Propietario | Publicar con fotos (multipart: `datos` JSON + `fotos`) |
| PUT | `/api/inmuebles/:id` | Propietario | Editar datos y fotos (`datos.fotosConservar` + `fotos` nuevas) |
| PATCH | `/api/inmuebles/:id/estado` | Propietario | `disponible`, `pausado` o `arrendado` |
| DELETE | `/api/inmuebles/:id` | Propietario | Eliminar el inmueble y sus fotos |
| GET | `/api/inmuebles/geocodificar?q=` | Propietario | Buscar una dirección o sector de Villavicencio (OpenStreetMap) |
| POST | `/api/inmuebles/:id/reportes` | Estudiante o propietario | Reportar una publicación (`motivo`, `descripcion`) |
| GET | `/api/admin/resumen` | Admin | Métricas del panel |
| GET | `/api/admin/reportes?estado=` | Admin | Reportes `pendiente`, `procedente`, `no_procede` o `todos` |
| GET | `/api/admin/inmuebles?moderacion=&q=` | Admin | Publicaciones con su moderación y reportes pendientes |
| GET | `/api/admin/inmuebles/:id` | Admin | Detalle completo, reportes e historial |
| POST | `/api/admin/inmuebles/:id/moderacion` | Admin | `aprobar`, `solicitar_cambios`, `rechazar` o `retirar` con justificación |
| GET | `/api/admin/usuarios?rol=&estado=&q=` | Admin | Usuarios y sus antecedentes |
| POST | `/api/admin/usuarios/:id/estado` | Admin | Suspender o reactivar (no a sí mismo ni a otros admins) |
| GET | `/api/admin/historial` | Admin | Auditoría de decisiones |

Las contraseñas las gestiona Supabase Auth; Roumix nunca las guarda. Las rutas protegidas exigen `Authorization: Bearer <token de Supabase Auth>`. El rol y el
propietario se obtienen en el servidor, nunca de lo que envía el navegador. Un propietario solo puede
ver, editar, pausar o eliminar sus propios inmuebles.

**Fotos:** JPG, PNG o WebP (se verifica el contenido real del archivo), máximo 5 MB cada una, hasta
8 por envío y 10 por inmueble. El backend las sube a Supabase Storage con la sesión del propietario,
y las políticas del bucket solo le permiten escribir en su carpeta `inmuebles/<id del propietario>/`.
No se necesita la clave secreta de Supabase.

## 👥 Roles

1. **Estudiante:** busca con filtros, ve el detalle, compara opciones, contacta por WhatsApp y reporta anuncios sospechosos.
2. **Propietario:** además publica inmuebles y gestiona solo sus propias publicaciones.
3. **Administrador:** revisa reportes, modera publicaciones, suspende cuentas y consulta el historial en `/pages/admin.html`.

### Asignar el primer administrador

No existe opción de registrarse como administrador. El rol se asigna con un procedimiento controlado
que solo puede ejecutar quien tiene las credenciales de la base de datos (`backend/.env`):

1. Crea una cuenta normal en Roumix (como estudiante) y confirma el correo. Usa una cuenta distinta a la
   de propietario, para que nadie modere sus propias publicaciones.
2. Desde `backend/` ejecuta:

```bash
npm run admin:asignar -- correo@ejemplo.com
```

3. Cierra sesión y vuelve a entrar: aparecerá "Administración" en el menú.
   Para retirar el rol: `npm run admin:asignar -- correo@ejemplo.com --quitar`.

Se recomienda activar la autenticación multifactor (MFA) de Supabase para las cuentas de administración
cuando se despliegue la plataforma.

## 🛡️ Moderación y confianza

- **Estado comercial y moderación son independientes.** El propietario decide `disponible`, `pausado` o
  `arrendado`; Roumix decide `aprobada`, `en_revision`, `requiere_cambios`, `rechazada` o `retirada`.
  Solo se muestra lo que está disponible **y** aprobado. Aprobar una revisión nunca reactiva algo que el
  propietario había pausado.
- **Reportar inicia una revisión, no es una condena.** Pausa preventiva con el primer reporte, salvo que la
  publicación haya sido revisada y aprobada en los últimos 30 días (entonces se necesitan 2 personas).
- **Anti-abuso:** sesión obligatoria, un reporte por persona y publicación, máximo 5 por día, nadie reporta lo propio.
- **Auditoría:** cada pausa, decisión y suspensión queda en `moderacion_historial` con responsable y justificación.
- **Insignias reales:** "Correo confirmado" (Supabase Auth) y "Revisada por Roumix" (aprobación registrada con
  fecha y alcance). No hay "teléfono verificado" porque aún no se verifica.
- **Privacidad:** la API pública redondea la ubicación a ~100 m y el detalle muestra una zona de 250 m.
  El propietario nunca sabe quién lo reportó. Política de datos (Ley 1581 de 2012) en `/pages/privacidad.html`
  y aceptación obligatoria al registrarse.

## 🗺️ Mapas

Leaflet con teselas de OpenStreetMap servidas por el backend (`/api/mapa/teselas`, con caché y limitado a la
región de Villavicencio): pedirlas directo desde el navegador falla con "403 Access blocked" cuando el navegador
no envía la cabecera Referer. La búsqueda de direcciones usa Nominatim, también a
través del backend (máximo 1 petición por segundo y caché, según su política de uso). No requiere claves ni
facturación. Para un sitio con mucho tráfico conviene contratar un proveedor de teselas (o Google Maps
Platform, que exige clave restringida por dominio y facturación).

## ☁️ Despliegue (Render)

Roumix se despliega como un solo servicio web en [Render](https://render.com) usando `render.yaml`:

1. En Render: **New → Blueprint**, conecta GitHub y elige este repositorio.
2. Render pedirá `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos valores de `backend/.env`).
3. Cuando termine, la aplicación queda en `https://<nombre>.onrender.com` con HTTPS.
4. En Supabase → **Authentication → URL Configuration**, cambia **Site URL** por esa dirección y en
   **Redirect URLs** agrega `https://<nombre>.onrender.com/**` y `http://localhost:3000/**`, para que los
   correos de confirmación y de recuperación de contraseña lleven a la página correcta.
5. CAPTCHA: en Cloudflare → **Turnstile → Add widget** registra los dominios `<nombre>.onrender.com` y
   `localhost`, y copia la clave de sitio y la secreta en `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`.

Cada `git push` a `main` vuelve a desplegar automáticamente. El plan gratuito se "duerme" tras 15 minutos
sin visitas: la primera carga después puede tardar cerca de un minuto.

## 📌 Estado del proyecto

- [x] Estructura de carpetas organizada (frontend / backend / database / docs)
- [x] Conexión del backend con PostgreSQL en Supabase y migraciones
- [x] Perfiles ligados a Supabase Auth, claves foráneas, RLS y bucket de imágenes
- [x] Búsqueda y detalle leen la base de datos real, sin respaldos locales silenciosos
- [x] Registro, inicio y cierre de sesión con Supabase Auth; páginas de propietario protegidas
- [x] Publicación con fotos en Supabase Storage asociada al propietario autenticado
- [x] Editar, pausar, reactivar, marcar como arrendada y eliminar publicaciones propias
- [x] Búsqueda con filtros y orden en la API, detalle con galería completa y visor de fotos
- [x] Comparador dinámico: hasta 3 inmuebles elegidos por el estudiante, con datos actuales de la API
- [x] Reportes, moderación con historial de auditoría y panel de administración
- [x] Insignias de confianza respaldadas por comprobaciones reales y política de datos personales
- [x] Selector de ubicación en el mapa y zona aproximada pública
- [ ] Despliegue

---
*Construcción de Software · Semestre 4 · Universidad Santo Tomás Villavicencio*
