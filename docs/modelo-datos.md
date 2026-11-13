# Roumix — Modelo de Datos

> La fuente de verdad del esquema son las migraciones de [`database/migrations/`](../database/migrations)
> (001 a 013), que se aplican en orden con `npm run migrate` y quedan registradas en `schema_migrations`.
> Este documento las explica. (`database/schema.sql` es una foto antigua, solo de referencia.)

## 1. Diagrama entidad-relación

```
auth.users (Supabase) ──1:1── usuarios ──1:1── verificaciones_propietario
                                 │
            ┌────────────────────┼─────────────────────────────┬──────────────────┐
            │ propietario        │ estudiante                  │ usuario          │ usuario
            ▼                    ▼                             ▼                  ▼
        inmuebles ◄──────── solicitudes ──1:N── solicitudes_historial    conversaciones ──1:N── mensajes
            │  ▲                 │  ▲                                        │ (opcional: inmueble, solicitud)
            │  └── reportes      │  └──────────── conversaciones.solicitud_id
            │                    │
            │                    ├──1:N── contratos (uno vigente por solicitud)
            │                    │            │
            │                    └──1:N── pagos ──(contrato_id)
            │                                 ├──1:N── pagos_eventos
            │                                 ├──1:1── comisiones
            │                                 ├──1:1── desembolsos
            │                                 └──1:1── devoluciones
            └── moderacion_historial ──(disparador)──► auditoria   (solo adición)

usuarios ──1:N── notificaciones        limites_uso (anti-abuso, claves con hash)
```

## 2. Tablas

### Cuentas y confianza

**`usuarios`** — perfil de cada cuenta de Supabase Auth (las contraseñas viven cifradas en `auth.users`).
`id` (= `auth.users.id`), `nombre`, `email`, `rol` (`estudiante` · `propietario` · `admin`), `estado`
(`activo` · `suspendido`), `telefono` (solo lo ve Roumix), `universidad`, `acepto_politica_en`, fechas.
El perfil se crea con un disparador al **confirmar el correo**. El rol `admin` nunca sale del registro público.

**`verificaciones_propietario`** — una por propietario. `estado` (`pendiente` · `aprobado` · `rechazado` ·
`requiere_informacion`), perfil enviado (`nombre_completo`, `telefono`, `ciudad`, `relacion_inmueble`,
`cantidad_inmuebles`, `zonas`, `descripcion`, `perfil_enviado_en`), condiciones de la comisión
(`acepta_comision`, `acepta_comision_en`, `version_condiciones`), teléfono verificado por Roumix (sí/no y
fecha), y la revisión (`mensaje_admin`, `revisado_por`, `revisado_en`).

### Publicaciones

**`inmuebles`** — `propietario_id`, datos de la vivienda (`titulo`, `tipo`, `precio`, `barrio`, `universidad`,
distancia, `estrato`, `area`, `capacidad` 1–20, `amenidades`, `descripcion`, `deposito`, `contrato_minimo`,
`disponible_desde`), ubicación exacta (`latitud`, `longitud`; la API pública la redondea), fotos
(`imagen_principal`, `galeria`).
Dos estados **independientes**:
- `estado` comercial (lo decide el propietario): `disponible` · `pausado` · `arrendado` · `retirado`
  (retirar no borra; queda `retirado_en`).
- `moderacion` (la decide Roumix): `aprobada` · `en_revision` · `requiere_cambios` · `rechazada` · `retirada`,
  con `moderacion_mensaje`, `revisado_por`, `revisado_en`, `revision_alcance`.

Un inmueble es **público** solo si está `disponible`, `aprobada`, su propietario está activo y **aprobado**.

**`reportes`** — `inmueble_id`, `reportante_id` (nunca se muestra al propietario), `motivo`, `descripcion`,
`estado` (`pendiente` · `procedente` · `no_procede`). Una persona reporta una vez cada inmueble.

**`moderacion_historial`** — historial de decisiones sobre publicaciones y cuentas (se conserva tal cual);
sus registros nuevos del sistema o de usuarios se copian a `auditoria` con un disparador.

### Solicitudes y comunicación

**`solicitudes`** — `inmueble_id`, `estudiante_id`, `propietario_id`, copia de `inmueble_titulo` y
`canon_mensual`, `estado` (12 valores, ver `docs/arquitectura.md`), `fecha_ingreso`, `duracion_meses`
(1–24), `personas` (1–20), `mensaje` (solo lo lee Roumix), `compartida_propietario_en`, `cerrada_en`.
Índice único: **una solicitud abierta por estudiante e inmueble**.

**`solicitudes_historial`** — cada cambio de estado o nota, con tres notas separadas por destinatario:
`nota_estudiante`, `nota_propietario` y `nota_interna` (solo Roumix). `autor_rol`: `estudiante`, `admin` o
`sistema`.

**`conversaciones`** — hilo entre **un** usuario y Roumix: `usuario_id`, `usuario_rol`, opcionalmente
`inmueble_id` y `solicitud_id`, `asunto`, `estado` (`pendiente` · `atendida`), `iniciada_por`, marcas de
lectura de cada lado. Un hilo por usuario y solicitud.

**`mensajes`** — `conversacion_id`, `autor_rol`, `tipo` (`mensaje` · `nota_interna`), `cuerpo` (≤ 2000).
La base de datos impide que alguien que no sea admin escriba una nota interna.

**`notificaciones`** — avisos dentro de la plataforma: `usuario_id`, `tipo`, `titulo`, `cuerpo`, `enlace`,
`leida_en`.

### Contratos y pagos

**`contratos`** — `solicitud_id`, `inmueble_id`, partes (`estudiante_nombre`, `propietario_nombre`), inmueble
(`inmueble_titulo`, `inmueble_direccion`), condiciones (`canon_mensual`, `deposito`, `fecha_inicio`,
`duracion_meses`, `dia_pago` 1–28, `servicios_incluidos`, `condiciones`), `estado` (`borrador` · `enviado` ·
`pendiente_aceptacion` · `formalizado` · `cancelado` · `expirado`), envío (`enviado_en`, `vence_en` a 7 días,
`huella` SHA-256 del contenido) y aceptaciones demostrativas (`aceptado_*_en`, `firma_*`).
Reglas de la BD: un contrato **vigente** por solicitud; no puede estar `formalizado` sin las dos aceptaciones.

**`pagos`** — primer canon de un contrato formalizado: `monto` (lo paga el estudiante completo),
`porcentaje_comision` (10), `comision`, `neto_propietario`, `estado` (`pendiente` · `aprobado` · `fallido` ·
`cancelado` · `reembolsado` · `en_disputa`), `simulado`, `proveedor`, `metodo` (solo métodos simulados),
`referencia`, `intentos`, `ultimo_error`.
Reglas de la BD: `simulado` **no puede ser falso**; `comision + neto_propietario = monto`; un pago activo por
contrato. No hay columnas para tarjetas ni cuentas bancarias.

**`pagos_eventos`** — cada movimiento (habilitado, intento aprobado o rechazado, cancelado, devolución,
disputa abierta o resuelta, desembolso) con `referencia`, `monto`, `detalle`, autor y fecha.

**`comisiones`** — una por pago aprobado: `monto`, `porcentaje`, `version_condiciones` aceptada por el
propietario, `estado` (`registrada` · `anulada`).

**`desembolsos`** — el 90 % para el propietario: `monto`, `estado` (`pendiente` · `retenido` · `realizado` ·
`anulado`), `referencia`, `realizado_en`.

**`devoluciones`** — `pago_id`, `monto`, `motivo`, `referencia`, autor.

### Auditoría y anti-abuso

**`auditoria`** — historial de **solo adición**: `actor_id`, `actor_rol`, `actor_nombre` (copia), `accion`,
`entidad`, `entidad_id`, `resumen`, `datos` (JSON sin textos privados), `ip_huella` (hash), `origen`,
`es_prueba`. Un disparador rechaza cualquier `UPDATE` o `DELETE` (salvo registros de pruebas automáticas).
Sin llaves foráneas a usuarios, para que el rastro sobreviva si una cuenta se elimina.

**`limites_uso`** — marcas de intentos (ingreso, registro) con la clave en hash, para limitar abusos de forma
persistente entre instancias del servidor.

## 3. Seguridad de la base de datos

- **RLS activado en todas las tablas** y permisos revocados a `anon` y `authenticated`: solo el backend
  (conexión directa) lee y escribe. (Migraciones 006 en adelante.)
- Llaves foráneas con la acción adecuada: `RESTRICT` donde borrar dejaría historial huérfano (inmuebles con
  solicitudes, solicitudes con contratos o pagos), `SET NULL` para conservar registros si se elimina una cuenta,
  `CASCADE` solo para datos que pertenecen por completo a su padre (mensajes de una conversación).
- Restricciones `CHECK` en todos los estados y rangos, e índices únicos para las reglas "a lo sumo uno"
  (solicitud abierta, contrato vigente, pago activo, hilo por solicitud).

## 4. Migraciones

| N.º | Qué hace |
|-----|----------|
| 001–005 | Esquema inicial, perfiles ligados a Supabase Auth, fotos en Storage, moderación y reportes, perfil al confirmar el correo |
| 006 | Endurece permisos: RLS y sin acceso para los roles públicos; límites persistentes |
| 007 | Verificación de propietarios |
| 008 | Capacidad y estado comercial `retirado` |
| 009 | Solicitudes de arriendo e historial |
| 010 | Conversaciones, mensajes y notificaciones |
| 011 | Contratos |
| 012 | Pagos simulados, eventos, comisiones, desembolsos y devoluciones |
| 013 | Auditoría de solo adición (con copia del historial de moderación) |
