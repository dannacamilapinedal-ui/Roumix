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
│   ├── pages/             buscar, detalle, comparar, publicar, mis-publicaciones, como-funciona
│   ├── css/style.css      Estilos compartidos
│   ├── js/app.js          Lógica compartida (sesión, navegación, modal de contacto)
│   ├── js/api.js          Cliente de la API (sin datos de respaldo locales)
│   └── assets/img/        Imágenes
├── backend/               API Express
│   ├── src/app.js         Configuración de Express, rutas y archivos estáticos
│   ├── src/server.js      Arranque del servidor
│   ├── src/config/        Conexión a PostgreSQL y cliente de Supabase
│   ├── src/routes/        Rutas de la API
│   ├── src/controllers/   Lógica de cada operación
│   ├── src/middleware/    Autenticación, roles y manejo de errores
│   └── scripts/migrate.js Aplica las migraciones de la base de datos
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

## 🔌 API

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/api/health` | Público | Estado del servidor |
| GET | `/api/health/db` | Público | Prueba la conexión con PostgreSQL |
| POST | `/api/auth/registro` | Público | Crear cuenta (nombre, email, password, rol, telefono) |
| POST | `/api/auth/login` | Público | Iniciar sesión; devuelve tokens y el perfil |
| POST | `/api/auth/refresh` | Público | Renovar el token con el refresh token |
| GET | `/api/auth/perfil` | Con sesión | Perfil del usuario (rol leído de la BD) |
| POST | `/api/auth/logout` | Con sesión | Cerrar sesión en Supabase Auth |
| GET | `/api/inmuebles?tipo=&precioMax=&universidad=&q=` | Público | Inmuebles disponibles |
| GET | `/api/inmuebles/:id` | Público | Detalle de un inmueble disponible |
| GET | `/api/inmuebles/mios` | Propietario | Inmuebles del propietario autenticado |
| POST | `/api/inmuebles` | Propietario | Publicar un inmueble |

Las contraseñas las gestiona Supabase Auth; Roumix nunca las guarda. Las rutas protegidas exigen `Authorization: Bearer <token de Supabase Auth>`. El rol y el
propietario se obtienen en el servidor, nunca de lo que envía el navegador.

## 👥 Roles

1. **Estudiante:** busca con filtros, ve el detalle, compara opciones y contacta por WhatsApp.
2. **Propietario:** además publica inmuebles y gestiona solo sus propias publicaciones.

## 📌 Estado del proyecto

- [x] Estructura de carpetas organizada (frontend / backend / database / docs)
- [x] Conexión del backend con PostgreSQL en Supabase y migraciones
- [x] Perfiles ligados a Supabase Auth, claves foráneas, RLS y bucket de imágenes
- [x] Búsqueda y detalle leen la base de datos real, sin respaldos locales silenciosos
- [x] Registro, inicio y cierre de sesión con Supabase Auth; páginas de propietario protegidas
- [ ] Publicación con carga de imágenes a Supabase Storage
- [ ] Editar, pausar y marcar como arrendada una publicación
- [ ] Comparador dinámico con los inmuebles seleccionados
- [ ] Despliegue

---
*Construcción de Software · Semestre 4 · Universidad Santo Tomás Villavicencio*
