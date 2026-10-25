# Roumix — Arquitectura del Sistema

## 1. Vista general

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Navegador)                         │
│  HTML + CSS + JavaScript vainilla                                   │
│  frontend/pages/*.html  ·  frontend/js/api.js  ·  frontend/js/app.js│
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP / REST (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND  (Node.js + Express)                     │
│  backend/src/server.js                                              │
│  ├── /api/health         ← prueba de conectividad                   │
│  ├── /api/auth           ← registro, login (Supabase Auth)          │
│  ├── /api/inmuebles      ← CRUD inmuebles (protegido con JWT)       │
│  └── /api/usuarios       ← perfil del usuario autenticado          │
└───────────────┬─────────────────────────────────────┬───────────────┘
                │ PostgreSQL (pg Pool SSL)             │ Supabase Admin SDK
                ▼                                     ▼
┌────────────────────────┐            ┌───────────────────────────────┐
│   Supabase Database    │            │       Supabase Auth           │
│   (PostgreSQL)         │            │  Gestiona tokens JWT          │
│   Tablas:              │            │  y sesiones de usuario        │
│   · usuarios           │            └───────────────────────────────┘
│   · inmuebles          │
│   · imagenes_inmueble  │            ┌───────────────────────────────┐
└────────────────────────┘            │     Supabase Storage          │
                                      │   Bucket: inmuebles-fotos     │
                                      │   URLs públicas de imágenes   │
                                      └───────────────────────────────┘
```

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript ES6+ (vainilla, sin frameworks) |
| Backend | Node.js v24 + Express.js |
| Base de datos | PostgreSQL (gestionada por Supabase) |
| Autenticación | Supabase Auth (JWT) |
| Almacenamiento | Supabase Storage |
| ORM / cliente DB | `pg` (node-postgres) |
| Variables de entorno | `dotenv` |
| Despliegue backend | Render.com |
| Despliegue frontend | Vercel / Netlify |
| Control de versiones | Git + GitHub |

---

## 3. Estructura de carpetas

```
roumix/
├── frontend/
│   ├── index.html              ← página de entrada (redirige a buscar)
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js              ← navegación, sesión, navbar
│   │   └── api.js              ← cliente HTTP RoumixAPI
│   ├── pages/                  ← todas las vistas
│   └── assets/img/
│
├── backend/
│   ├── src/
│   │   ├── config/db.js        ← Pool de PostgreSQL
│   │   ├── middleware/
│   │   │   ├── autenticar.js   ← verifica JWT de Supabase
│   │   │   └── autorizarRol.js ← verifica rol del usuario
│   │   ├── routes/             ← endpoints Express
│   │   ├── controllers/        ← lógica de negocio
│   │   └── server.js
│   ├── .env                    ← NO versionar
│   └── package.json
│
├── database/
│   ├── schema.sql              ← estructura de tablas
│   ├── seeds.sql               ← datos de prueba
│   └── migrations/             ← cambios incrementales
│
└── docs/                       ← documentación técnica
```

---

## 4. Flujo de autenticación

```
[Navegador]          [Express Backend]       [Supabase Auth]
     │                      │                      │
     │── POST /api/auth/login ──►                  │
     │                      │── verifyUser ────────►
     │                      │◄── JWT token ────────│
     │◄── { token, usuario } ──│                   │
     │  (guarda en localStorage)                   │
     │                      │                      │
     │── GET /api/inmuebles ──►  (Authorization: Bearer <token>)
     │    middleware autenticar.js verifica JWT     │
     │◄── 200 JSON inmuebles ──│                   │
```

---

## 5. Seguridad por capas

1. **Frontend:** oculta botones y secciones según el rol guardado en el token decodificado (UX solamente).
2. **Backend (middleware `autenticar`):** verifica que el token JWT sea válido antes de cada ruta protegida.
3. **Backend (middleware `autorizarRol`):** comprueba que el rol del token sea el permitido para la operación.
4. **Base de datos:** `propietario_id` es `NOT NULL` en `inmuebles`; el servidor lo inyecta desde el token, nunca desde el body del cliente.
