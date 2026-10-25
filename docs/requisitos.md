# Roumix — Requisitos del Sistema

## 1. Descripción general
Roumix es una plataforma web para estudiantes universitarios en Villavicencio (Colombia) que necesitan encontrar vivienda cercana a su universidad. Conecta a **propietarios** que tienen inmuebles disponibles con **estudiantes** que buscan arrendar.

---

## 2. Roles de usuario

### Estudiante
- Puede registrarse e iniciar sesión.
- Puede buscar inmuebles disponibles y filtrar por tipo, precio y barrio.
- Puede ver el detalle completo de una publicación.
- Puede seleccionar hasta 3 inmuebles y compararlos en tabla.
- Puede contactar al propietario desde la ficha del inmueble.
- **No puede** publicar, editar ni eliminar inmuebles.
- **No puede** acceder a páginas protegidas sin sesión activa.

### Propietario
- Puede registrarse e iniciar sesión como propietario.
- Puede crear publicaciones con fotos, precio, servicios y barrio.
- Puede ver, editar, pausar y eliminar sus propias publicaciones en "Mis publicaciones".
- **No puede** modificar publicaciones de otro propietario.
- **No puede** acceder a las publicaciones privadas de otros.

### Reglas comunes
- El rol se valida en el **backend** en cada operación protegida.
- La sesión se mantiene al navegar entre páginas y puede cerrarse explícitamente.
- Un usuario no puede cambiar su propio rol manipulando el localStorage.
- Los datos persisten en PostgreSQL (Supabase) sin depender del navegador.

---

## 3. Requisitos funcionales

| ID | Descripción |
|----|-------------|
| RF-01 | El usuario puede registrarse con correo, contraseña, nombre y rol (estudiante / propietario). |
| RF-02 | El usuario puede iniciar sesión con correo y contraseña; el servidor devuelve un token JWT. |
| RF-03 | El token JWT se almacena en `localStorage` y se envía en el header `Authorization` en cada petición protegida. |
| RF-04 | La página de búsqueda muestra todos los inmuebles disponibles desde la API. |
| RF-05 | El usuario puede filtrar por tipo de inmueble, precio máximo y barrio. |
| RF-06 | El detalle del inmueble muestra foto principal, galería, servicios, precio y datos de contacto. |
| RF-07 | El propietario autenticado puede publicar un inmueble con imágenes reales. |
| RF-08 | "Mis publicaciones" muestra solo los inmuebles del propietario que inició sesión. |
| RF-09 | El comparador muestra una tabla con los inmuebles seleccionados por el usuario (hasta 3). |
| RF-10 | Cerrar sesión elimina el token y redirige al inicio. |

---

## 4. Requisitos no funcionales

| ID | Descripción |
|----|-------------|
| RNF-01 | **Seguridad:** el backend valida el token en cada ruta protegida; el frontend nunca decide quién puede publicar. |
| RNF-02 | **Persistencia:** todos los datos se almacenan en PostgreSQL en Supabase. |
| RNF-03 | **Diseño:** los colores y tipografía del prototipo original no se modifican. |
| RNF-04 | **Tecnología:** HTML, CSS, JavaScript vainilla + Node.js + Express. Sin frameworks de frontend. |
| RNF-05 | **Imágenes:** las fotos se almacenan en Supabase Storage; el backend guarda solo la URL. |
| RNF-06 | **Despliegue:** el backend se desplegará en Render; el frontend en Vercel o Netlify. |

---

## 5. Fuera del alcance (v1)
- Chat en tiempo real entre estudiante y propietario.
- Sistema de pagos o reservas.
- Notificaciones push.
- Aplicación móvil nativa.
