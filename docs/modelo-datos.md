# Roumix — Modelo de Datos

> El esquema vigente está en [`database/schema.sql`](../database/schema.sql) y se aplica con
> `npm run migrate` (desde `backend/`). Este documento lo explica.

## 1. Diagrama entidad-relación

```
┌──────────────────────────┐        ┌──────────────────────────────────┐
│  auth.users (Supabase)   │        │            usuarios              │
│──────────────────────────│        │──────────────────────────────────│
│ id          UUID PK      │──1:1──►│ id          UUID PK FK→auth.users│
│ email       TEXT         │        │ nombre      VARCHAR(120)         │
│ contraseña (cifrada)     │        │ email       VARCHAR(150) UNIQUE  │
└──────────────────────────┘        │ rol         estudiante|propietario│
                                    │ telefono    VARCHAR(30)          │
                                    │ universidad VARCHAR(100)         │
                                    └────────────────┬─────────────────┘
                                                     │ 1
                                                     │ N
                                    ┌────────────────▼─────────────────┐
                                    │            inmuebles             │
                                    │──────────────────────────────────│
                                    │ id              SERIAL PK        │
                                    │ propietario_id  UUID FK→usuarios │
                                    │ titulo, tipo, precio, barrio ... │
                                    │ imagen_principal TEXT            │
                                    │ galeria          TEXT[] (≤ 10)   │
                                    │ estado  disponible|pausado|arrendado│
                                    └──────────────────────────────────┘
```

## 2. Tabla `usuarios` (perfil)

Cada fila es el perfil de una cuenta de **Supabase Auth**. Las contraseñas **no** se guardan
aquí: viven cifradas en `auth.users`.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `UUID` | `PK`, `FK → auth.users(id) ON DELETE CASCADE` | Mismo ID de Supabase Auth |
| `nombre` | `VARCHAR(120)` | `NOT NULL` | Nombre completo |
| `email` | `VARCHAR(150)` | `UNIQUE NOT NULL` | Correo |
| `rol` | `VARCHAR(20)` | `CHECK IN ('estudiante','propietario')` | Rol en Roumix |
| `telefono` | `VARCHAR(30)` | — | WhatsApp de contacto (propietarios) |
| `universidad` | `VARCHAR(100)` | `DEFAULT 'Santo Tomás'` | Universidad |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Auditoría |

**Creación automática:** el trigger `on_auth_user_created` inserta el perfil cuando Supabase Auth
crea una cuenta, con los datos de registro (`nombre`, `rol`, `telefono`, `universidad`).
Después, el backend siempre lee el rol desde esta tabla.

## 3. Tabla `inmuebles`

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `SERIAL` | `PK` | Identificador |
| `propietario_id` | `UUID` | `FK → usuarios(id) ON DELETE CASCADE` | Dueño (sale de la sesión, nunca del navegador). `NULL` solo en datos de demostración |
| `titulo` | `VARCHAR(200)` | `NOT NULL` | Título |
| `tipo` | `VARCHAR(30)` | `CHECK IN ('habitacion','apartaestudio','apartamento')` | Tipo |
| `precio` | `INTEGER` | `NOT NULL CHECK > 0` | Canon mensual en COP |
| `barrio` | `VARCHAR(100)` | `NOT NULL` | Barrio en Villavicencio |
| `universidad` | `VARCHAR(100)` | `NOT NULL` | Universidad cercana |
| `distancia_texto`, `distancia_metros`, `tiempo_pie` | — | — | Distancia al campus |
| `estrato` | `INTEGER` | `CHECK 1–6` | Estrato |
| `area`, `transporte`, `deposito`, `contrato_minimo`, `disponible_desde` | `VARCHAR` | — | Condiciones |
| `amenidades` | `TEXT[]` | `NOT NULL DEFAULT '{}'` | Servicios incluidos |
| `descripcion` | `TEXT` | — | Descripción |
| `latitud`, `longitud` | `NUMERIC(10,6)` | — | Ubicación en el mapa |
| `imagen_principal` | `TEXT` | — | URL pública en Supabase Storage |
| `galeria` | `TEXT[]` | `NOT NULL`, máx. 10 | URLs de la galería |
| `estado` | `VARCHAR(20)` | `NOT NULL CHECK IN ('disponible','pausado','arrendado')` | Solo `disponible` aparece en búsquedas |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Auditoría (`updated_at` por trigger) |

El nombre y teléfono del propietario **no** se copian en `inmuebles`: se obtienen con un `JOIN`
a `usuarios`.

## 4. Seguridad

- **RLS activado** en `usuarios` e `inmuebles` sin políticas: la API pública de Supabase no puede
  leerlas ni modificarlas. Todo pasa por el backend Express, que valida sesión, rol y propiedad.
- Consultas siempre **parametrizadas** (`$1, $2...`).

## 5. Imágenes (Supabase Storage)

Bucket público `inmuebles`: JPEG, PNG o WebP, máximo 5 MB por archivo. En PostgreSQL solo se
guardan las URL. Más adelante la galería puede normalizarse en una tabla `imagenes_inmueble`.

## 6. Migraciones

| Archivo | Cambios |
|---------|---------|
| `001_esquema_inicial.sql` | Tablas `usuarios` e `inmuebles` e índices iniciales |
| `002_perfiles_auth_y_restricciones.sql` | `usuarios.id → auth.users`, propietario real con `ON DELETE CASCADE`, se eliminan `propietario_nombre/telefono`, `updated_at`, trigger de perfil automático, RLS y bucket `inmuebles` |

Las migraciones aplicadas quedan registradas en la tabla `schema_migrations`.
