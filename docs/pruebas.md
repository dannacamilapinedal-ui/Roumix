# Roumix — Plan de Pruebas

## 1. Pruebas de conectividad (Manual)

| ID | Prueba | Comando | Resultado esperado |
|----|--------|---------|-------------------|
| P-01 | Health check backend | `GET http://localhost:3000/api/health` | `{ "status": "ok" }` |
| P-02 | Listar inmuebles | `GET http://localhost:3000/api/inmuebles` | Array JSON con los inmuebles |
| P-03 | Inmueble por ID | `GET http://localhost:3000/api/inmuebles/<uuid>` | Objeto del inmueble |
| P-04 | Ruta no existente | `GET http://localhost:3000/api/nada` | `404` |

---

## 2. Pruebas de autenticación (Etapa 3)

| ID | Prueba | Entrada | Resultado esperado |
|----|--------|---------|-------------------|
| A-01 | Registro exitoso | correo nuevo + contraseña válida + rol | `201 { token, usuario }` |
| A-02 | Correo ya registrado | correo duplicado | `409 "El correo ya está en uso"` |
| A-03 | Contraseña corta | menos de 6 caracteres | `400 "Contraseña inválida"` |
| A-04 | Login correcto | correo + contraseña válidos | `200 { token, usuario }` |
| A-05 | Login incorrecto | contraseña errónea | `401 "Credenciales incorrectas"` |
| A-06 | Token vencido | JWT expirado | `401 "Token inválido"` |

---

## 3. Pruebas de autorización (Etapa 4)

| ID | Prueba | Actor | Resultado esperado |
|----|--------|-------|-------------------|
| Z-01 | Publicar sin token | Sin sesión | `401 "Se requiere autenticación"` |
| Z-02 | Publicar como estudiante | Token con rol=estudiante | `403 "No autorizado"` |
| Z-03 | Publicar como propietario | Token con rol=propietario | `201` inmueble creado |
| Z-04 | Editar publicación ajena | Propietario B edita de A | `403` |
| Z-05 | Ver mis publicaciones sin token | Sin sesión | `401` |

---

## 4. Pruebas de inmuebles (Etapa 2 en adelante)

| ID | Prueba | Descripción |
|----|--------|-------------|
| I-01 | Publicar inmueble sin `propietario_id` | El backend debe rechazar o inyectarlo del token |
| I-02 | Campos vacíos en formulario | El frontend valida antes de enviar |
| I-03 | Imagen mayor a 5 MB | El frontend rechaza el archivo |
| I-04 | Mis publicaciones muestra solo las propias | Verificar con dos propietarios distintos |

---

## 5. Pruebas de UI / Navegación

| ID | Prueba | Descripción |
|----|--------|-------------|
| U-01 | Logo en `frontend/pages/*.html` | Al hacer click lleva a `../index.html` |
| U-02 | Cerrar sesión | Elimina token, redirige a index |
| U-03 | Acceso directo a `publicar.html` sin sesión | Redirige a `index.html?redirigir=publicar.html` |
| U-04 | Comparador con 0 inmuebles | Muestra mensaje "No has seleccionado inmuebles" |
| U-05 | Comparador con 3 inmuebles | Muestra tabla con 3 columnas correctas |

---

## 6. Herramientas recomendadas

- **Postman** o **Thunder Client (VS Code):** para probar endpoints del backend.
- **Navegador DevTools:** para inspeccionar Network, localStorage y errores de consola.
- **Supabase Dashboard:** para verificar filas insertadas en las tablas.
