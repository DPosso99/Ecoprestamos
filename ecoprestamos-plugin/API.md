# Referencia de la API REST — `pmi/v1`

Namespace completo de WordPress: `rest_url('pmi/v1/...')` (ej.
`https://tu-sitio.com/wp-json/pmi/v1/users`). Esta referencia complementa la
tabla resumen de [`../NOTES.md`](../NOTES.md#endpoints-rest) con el detalle
de cada endpoint: parámetros, cuerpo esperado, forma de la respuesta y
códigos de error. El código fuente de cada uno vive en
`ecoprestamos-plugin/includes/class-pmi-rest-*.php`.

## Convenciones generales

- **Content-Type**: `application/json` en el body de las requests, salvo
  `POST/PUT /resources...` que usan `multipart/form-data` (subida de imagen).
- **Autenticación**: cookie propia `pmi_session` (ver
  [`class-pmi-auth.php`](includes/class-pmi-auth.php)), enviada
  automáticamente por el navegador (`credentials: 'include'`). No es un
  Bearer token — no hace falta mandar ningún header de autorización.
- **CSRF**: toda request de escritura (`POST`/`PUT`/`DELETE`) exige el header
  `X-WP-Nonce` con un nonce válido de tipo `wp_rest`
  (`wp_create_nonce('wp_rest')`, expuesto al frontend como
  `window.PMI_CONFIG.nonce`). Sin este header, la API responde `403
  pmi_bad_nonce` aunque la cookie de sesión sea válida.
- **Errores**: todos los errores no-2xx devuelven un JSON
  `{ "code": "...", "message": "...", "data": { "status": N } }` (formato
  estándar de `WP_Error` en la REST API de WordPress). Los códigos de error
  usados por este plugin: `pmi_bad_request` (400), `pmi_no_auth` (401),
  `pmi_bad_credentials` (401), `pmi_bad_nonce` (403), `pmi_forbidden` (403),
  `pmi_not_found` (404), `pmi_conflict` (409), `pmi_server_error` (500).
- **Roles**: `Estudiante` (por defecto, autoregistro) y `Trabajador`
  (asignado manualmente desde wp-admin → Medialab Prestamos → Usuarios, o
  por otro Trabajador desde la app). "Sesión válida" = cookie `pmi_session`
  vigente (24h) de cualquier rol. "Rol Trabajador" = además de sesión
  válida, `rol = 'Trabajador'` en la fila del usuario.
- **snake_case vs PascalCase**: las tablas y la mayoría de columnas de
  respuesta usan `snake_case` (`correo`, `nombre`, `id_recurso`), pero varios
  endpoints devuelven/reciben una mezcla con nombres heredados del frontend
  original (`Correo`, `Nombre`, `Fecha_prestamo`, `Entregado`...). Se indica
  la forma exacta en cada endpoint abajo — no asumas snake_case en todos.

---

## Usuarios y sesión

### `GET /users`
Lista todos los usuarios. **Requiere**: rol Trabajador.

Respuesta `200`: array de filas
`{ correo, numero, rol, nombre, baneado, trabajo }`.

### `POST /users`
Crea un usuario. Dos modos según el body:

| Campo | Tipo | Notas |
|---|---|---|
| `Correo` | string | Obligatorio. Autoregistro público exige `@eafit.edu.co`. |
| `Nombre` | string | Obligatorio. |
| `Contraseña` / `Contrasena` | string | Opcional; si falta, usa `Medialab2026!` (ver `PMI_Rest_Usuarios::DEFAULT_TEMP_PASSWORD`). |
| `numero` | string | Celular, con código de país incluido por convención del frontend. |
| `adminCreated` | boolean | Si es `true`, **requiere sesión + nonce + rol Trabajador**; habilita los 3 campos de abajo. Si es falso/ausente, la request es pública. |
| `Rol` | `Estudiante` \| `Trabajador` | Solo se respeta si `adminCreated=true`. Sin eso, siempre queda `Estudiante` (medida de seguridad, ver `NOTES.md`). |
| `Baneado` | boolean | Solo con `adminCreated=true`. |
| `Trabajo` | `Trabajador` \| `Practicante` | Solo con `adminCreated=true`. |

**Requiere**: público si `adminCreated` es falso/ausente; sesión + nonce +
rol Trabajador si `adminCreated=true`.

Respuesta `200`: fila creada `{ correo, numero, rol, nombre, baneado,
trabajo }`. Si `adminCreated` es falso, además emite la cookie de sesión
(auto-login tras registro).

Errores: `400 pmi_bad_request` (falta Correo/Nombre, o correo no
institucional en autoregistro), `409 pmi_conflict` (correo ya existe).

### `GET /users/{correo}`
Datos de un usuario. **Requiere**: sesión válida (cualquier rol).

Respuesta `200`: `{ correo, numero, rol, nombre, baneado, trabajo }`.
`404 pmi_not_found` si no existe.

### `PUT /users/{correo}`
Edita un usuario. **Requiere**: sesión válida; debe ser el propio usuario
(`is_self`) o rol Trabajador.

Body (todos opcionales, se conserva el valor actual si se omiten):
`numero`, `Nombre`, `Contraseña`/`Contrasena` (nueva, en texto plano —
se re-hashea solo si es distinta a la actual). Los campos `Rol`, `Baneado`,
`Trabajo` **solo se aplican si quien llama es Trabajador**; si un
Estudiante los manda, se ignoran silenciosamente.

Respuesta `200`: fila actualizada. `403 pmi_forbidden` si no es ni el
propio usuario ni un Trabajador. `404 pmi_not_found`.

### `DELETE /users/{correo}`
**Requiere**: rol Trabajador.

Respuesta `200`: `{ message }`. `409 pmi_conflict` si el usuario tiene
préstamos asociados (restricción FK). `404 pmi_not_found`.

### `POST /login`
Público. Body: `{ Correo, Contraseña }` (o `Contrasena`).

Respuesta `200`: `{ Correo, Nombre, Rol, Baneado }` + emite cookie
`pmi_session` (24h). `401 pmi_bad_credentials` si el correo no existe o la
contraseña no verifica.

### `POST /logout`
Público. Limpia la cookie de sesión. Respuesta `200`: `{ message }`.

---

## Recursos (catálogo/inventario)

### `GET /resources`
**Requiere**: sesión válida.

Respuesta `200`: array de
`{ id_recurso, nombre, ubicacion, estado, dia_compra, tipo,
cantidad_total, cantidad_disponible, activo }`.
`estado` ∈ `Disponible | Ocupado | Activo fijo` (ajustado automáticamente
por los triggers de MySQL al prestar/devolver, ver `NOTES.md`).

### `POST /resources`
`multipart/form-data`. **Requiere**: rol Trabajador.

Campos: `idRecurso` (obligatorio, string libre, ej. `MQ3-01`), `Nombre`,
`Ubicacion`, `Estado` (default `Disponible`), `Dia_compra` (fecha, opcional),
`Tipo`, `Cantidad_total` (int), `Cantidad_disponible` (int, default =
`Cantidad_total`), `activo` (string libre, número de activo fijo, default
`N/A`), `Imagen` (archivo, opcional, máx. 5MB, debe ser `image/*`).

Respuesta `200`: `{ message, idRecurso }`. `400 pmi_bad_request` (falta
`idRecurso`, imagen inválida o >5MB). `409 pmi_conflict` (ID ya existe).

### `GET /resources/{id}`
**Requiere**: sesión válida. Misma forma de fila que `GET /resources`.
`404 pmi_not_found`.

### `PUT /resources/{id}`
`multipart/form-data` (el plugin parsea el body crudo a mano en PUT, ver
`maybe_parse_multipart_put()`). **Requiere**: rol Trabajador.

Mismos campos que `POST`, todos opcionales (conserva el valor actual si se
omiten). Si se manda `Imagen`, reemplaza la imagen guardada.

Respuesta `200`: `{ message }`. `404 pmi_not_found`.

### `DELETE /resources/{id}`
**Requiere**: rol Trabajador. `409 pmi_conflict` si el recurso está
asociado a préstamos (FK). `404 pmi_not_found`.

### `GET /resources/{id}/imagen`
**Requiere**: sesión válida. Devuelve los **bytes crudos** de la imagen
(no JSON) con el `Content-Type` guardado en BD — pensado para usarse
directo como `src` de un `<img>`. `404 pmi_not_found` (JSON) si el recurso
no existe o no tiene imagen.

---

## Préstamos

### `GET /loans`
**Requiere**: sesión válida.

Respuesta `200`: array de `{ idPrestamo, Notas, Fecha_prestamo,
Hora_entrega, Entregado, usuario_solicitante, usuario_responsable }`
(`Entregado` es `0` o `1`).

### `POST /loans`
**Requiere**: sesión válida.

Body: `{ Notas, Fecha_prestamo, Hora_entrega, Entregado, usuario_solicitante,
usuario_responsable }`. `usuario_solicitante`/`usuario_responsable`
obligatorios y deben existir como usuarios. Las fechas se interpretan como
hora **local del sitio**, sin conversión UTC (ver
`PMI_Utils::to_mysql_datetime()`).

Respuesta `200`: `{ message, idPrestamo }`. `400 pmi_bad_request` (faltan
usuarios o no existen).

Nota: crear el préstamo NO agrega recursos — eso es un segundo paso con
`POST /loans/{id}/details`.

### `GET /loans/{id}`
**Requiere**: sesión válida. `404 pmi_not_found`.

### `PUT /loans/{id}`
**Requiere**: sesión válida (cualquier rol logueado puede marcar entrega,
no solo Trabajador — la UI solo expone el botón en el panel de trabajador).

Body: cualquiera de `Notas, Fecha_prestamo, Hora_entrega, Entregado,
usuario_solicitante, usuario_responsable` (parcial). Si se manda
`Entregado: 1` y el préstamo no estaba entregado y no se manda
`Hora_entrega`, se usa la hora actual del servidor automáticamente. Al
quedar `Entregado=1`, el trigger `pmi_after_prestamo_cierre` devuelve las
cantidades al inventario.

Respuesta `200`: `{ message }`. `404 pmi_not_found`.

### `DELETE /loans/{id}`
**Requiere**: rol Trabajador. Borra primero los detalles asociados y luego
el préstamo. `409 pmi_conflict`, `404 pmi_not_found`.

---

## Detalles de préstamo (recursos dentro de un préstamo)

### `GET /loans/alldetails`
**Requiere**: sesión válida. Todos los detalles de todos los préstamos —
usado por el frontend para armar el resumen "×N" en las listas de
préstamos sin pedir cada detalle uno por uno.

Respuesta `200`: array de `{ prestamo_id, recurso_id, cantidad_prestada,
Nombre, Tipo }`.

### `GET /loans/{id}/details`
**Requiere**: sesión válida.

Respuesta `200`: array de `{ prestamo_id, recurso_id, cantidad_prestada,
Nombre, Ubicacion, Estado, Tipo }` (join con `recurso`).
`404 pmi_not_found` si el préstamo no tiene recursos (nota: el cliente
`api.js` trata este 404 puntual como lista vacía, no como error).

### `POST /loans/{id}/details`
**Requiere**: sesión válida.

Body: `{ recurso: [{ id, cantidad }, ...] }`. Por cada item hace un INSERT
que dispara el trigger `pmi_after_detalle_insert`: resta
`cantidad_disponible` del recurso y rechaza el INSERT (vía `SIGNAL` de
MySQL) si no hay stock suficiente o si el recurso es `Activo fijo`.

Respuesta `200`: `{ message, idPrestamo, recurso }`. `404 pmi_not_found`
(préstamo no existe). `400 pmi_bad_request` (sin stock suficiente, recurso
`Activo fijo`, o `recurso_id` inexistente). `500 pmi_server_error` para
cualquier otro error de SQL no reconocido (se registra en el log de
errores del admin y notifica por correo).

### `DELETE /loans/{id}/details/{recurso_id}`
**Requiere**: rol Trabajador.

Respuesta `200`: `{ message }`. `404 pmi_not_found`.

---

## Búsquedas y reportes administrativos

Todos bajo sesión válida como mínimo; los de `/admin/...` exigen rol
Trabajador. Todos devuelven `404 pmi_not_found` si no hay resultados (en
vez de un array vacío — replica el comportamiento del backend original).

| Endpoint | Filtro | Requiere |
|---|---|---|
| `GET /resources/search/tipo/{tipo}` | `tipo` exacto de recurso | Sesión válida |
| `GET /resources/search/nombre/{nombre}` | `nombre` exacto de recurso | Sesión válida |
| `GET /resources/search/salon/{ubicacion}` | `ubicacion` exacta | Sesión válida |
| `GET /admin/baneados` | usuarios con `baneado = 1` | Rol Trabajador |
| `GET /admin/prestamos-por-fecha/{fecha}` | `fecha` formato `YYYY-MM-DD`, compara `DATE(fecha_prestamo)` | Rol Trabajador |

---

## Ejemplo de flujo completo (crear y entregar un préstamo)

```
1. POST /login                          → cookie de sesión
2. GET  /resources                      → catálogo para elegir recursos
3. POST /loans                          → { idPrestamo }
4. POST /loans/{idPrestamo}/details     → agrega recursos (resta inventario)
5. (trabajador) PUT /loans/{idPrestamo} → { Entregado: 1 } (marca entrega,
                                            devuelve inventario al cerrar)
```

Ver también [`../NOTES.md`](../NOTES.md) para el porqué de cada decisión
(triggers de MySQL, autenticación propia, zona horaria, etc.) y
[`../ecoprestamos-theme/ARQUITECTURA.md`](../ecoprestamos-theme/ARQUITECTURA.md)
para cómo el frontend consume esta API.
