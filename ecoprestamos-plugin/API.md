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
  `pmi_banned` (403), `pmi_not_found` (404), `pmi_conflict` (409),
  `pmi_server_error` (500).
- **Roles**: `Estudiante` (por defecto, autoregistro), `Docente` y
  `Trabajador` (asignados manualmente desde wp-admin → Medialab Prestamos →
  Usuarios, o por otro Trabajador desde la app). "Sesión válida" = cookie
  `pmi_session` vigente (24h) de cualquier rol. "Rol Trabajador" = además
  de sesión válida, `rol = 'Trabajador'` en la fila del usuario.
- **Cuentas suspendidas**: si el usuario de la sesión tiene `baneado = 1`,
  cualquier endpoint que exija sesión responde `403 pmi_banned`. La única
  excepción es `GET /users/{correo}` sobre **tu propia** ficha, que sigue
  permitida a propósito: es así como la app detecta el baneo y muestra la
  pantalla de cuenta suspendida en vez de una pantalla vacía.
- **La sesión depende de la contraseña**: la cookie firmada lleva una huella
  derivada del hash de contraseña, así que cambiarla invalida las sesiones
  abiertas y obliga a volver a llamar `POST /login`.
- **snake_case vs PascalCase**: las tablas y la mayoría de columnas de
  respuesta usan `snake_case` (`correo`, `nombre`, `id_recurso`), pero varios
  endpoints devuelven/reciben una mezcla con nombres heredados del frontend
  original (`Correo`, `Nombre`, `Fecha_prestamo`, `Entregado`...). Se indica
  la forma exacta en cada endpoint abajo — no asumas snake_case en todos.

---

## Usuarios y sesión

### `GET /users`
Directorio de usuarios. **Requiere**: sesión válida; lo que devuelve depende
del rol.

- **Rol Trabajador**: todo el directorio, con
  `{ correo, numero, rol, nombre, baneado, trabajo }` por fila.
- **Cualquier otro rol**: solo los Trabajadores activos (`rol = 'Trabajador'`
  y `baneado = 0`) y solo con `{ correo, rol, nombre, trabajo }`. Es lo que
  la app necesita para elegir el responsable de una solicitud; el número de
  celular de nadie viaja en esa respuesta.

### `POST /users`
Crea un usuario. Dos modos según el body:

| Campo | Tipo | Notas |
|---|---|---|
| `Correo` | string | Obligatorio. El autoregistro público exige `@eafit.edu.co`; con `adminCreated=true` se acepta cualquier dominio, porque MediaLab también da de alta proveedores e invitados. |
| `Nombre` | string | Obligatorio. |
| `Contraseña` / `Contrasena` | string | Opcional; si falta, usa `Medialab2026!` (ver `PMI_Rest_Usuarios::DEFAULT_TEMP_PASSWORD`). |
| `numero` | string | Celular, con código de país incluido por convención del frontend. |
| `adminCreated` | boolean | Si es `true`, **requiere sesión + nonce + rol Trabajador**; habilita los 3 campos de abajo. Si es falso/ausente, la request es pública. |
| `Rol` | `Estudiante` \| `Docente` \| `Trabajador` | Solo se respeta si `adminCreated=true`. Sin eso, siempre queda `Estudiante` (medida de seguridad, ver `NOTES.md`). Cualquier valor fuera de esa lista blanca cae a `Estudiante`. |
| `Baneado` | boolean | Solo con `adminCreated=true`. |
| `Trabajo` | `Trabajador` \| `Practicante` | Solo con `adminCreated=true`. Fuera de esa lista blanca cae a `Practicante`. |

**Requiere**: público si `adminCreated` es falso/ausente; sesión + nonce +
rol Trabajador si `adminCreated=true`.

Respuesta `200`: fila creada `{ correo, numero, rol, nombre, baneado,
trabajo }`. Si `adminCreated` es falso, además emite la cookie de sesión
(auto-login tras registro).

Errores: `400 pmi_bad_request` (falta Correo/Nombre, o correo no
institucional en autoregistro), `409 pmi_conflict` (correo ya existe).

### `GET /users/{correo}`
Datos de un usuario. **Requiere**: sesión válida, y que sea **tu propia
ficha** o que tengas rol Trabajador (`permission_read_user`). Un Estudiante
no puede leer la ficha de otra persona — ahí viaja su número de celular —
y recibe `403 pmi_forbidden`.

Leer tu propia ficha funciona incluso con la cuenta suspendida; es la única
puerta que queda abierta para un usuario con `baneado = 1`.

Respuesta `200`: `{ correo, numero, rol, nombre, baneado, trabajo }`.
`404 pmi_not_found` si no existe.

### `PUT /users/{correo}`
Edita un usuario. **Requiere**: sesión válida; debe ser el propio usuario
(`is_self`) o rol Trabajador.

Body (todos opcionales, se conserva el valor actual si se omiten):
`numero`, `Nombre`, `Contraseña`/`Contrasena` (nueva, en texto plano —
se re-hashea solo si es distinta a la actual). Los campos `Rol`, `Baneado`,
`Trabajo` **solo se aplican si quien llama es Trabajador** (y pasan por las
mismas listas blancas que en `POST /users`); si un Estudiante los manda, se
ignoran silenciosamente.

Cambiar **tu propia** contraseña exige mandar la actual en
`Contrasena_actual` (o `Contraseña_actual`): sin eso, una sesión robada
bastaría para quedarse con la cuenta. Un Trabajador que le restablece la
clave a otra persona no la necesita.

Respuesta `200`: fila actualizada. `403 pmi_forbidden` si no es ni el
propio usuario ni un Trabajador, o si intentas cambiar tu contraseña sin
confirmar la actual. `404 pmi_not_found`.

### `DELETE /users/{correo}`
**Requiere**: rol Trabajador.

Respuesta `200`: `{ message }`. `409 pmi_conflict` si el usuario tiene
préstamos asociados (restricción FK). `404 pmi_not_found`.

### `POST /login`
Público. Body: `{ Correo, Contraseña }` (o `Contrasena`).

No se valida el dominio del correo: esa regla vive solo en el autoregistro
público de `POST /users`, porque un Trabajador puede crear cuentas de otros
dominios y esas también tienen que poder entrar.

Respuesta `200`: `{ Correo, Nombre, Rol, Baneado }` + emite cookie
`pmi_session` (24h). Un usuario suspendido **sí** puede iniciar sesión (la
respuesta trae `Baneado: 1` y la app muestra la pantalla de cuenta
suspendida); lo que no puede es usar el resto de la API.
`401 pmi_bad_credentials` si el correo no existe o la contraseña no
verifica.

### `POST /logout`
Público. Limpia la cookie de sesión. Respuesta `200`: `{ message }`.

---

## Recursos (catálogo/inventario)

> **Una fila puede ser un grupo de unidades.** `id_recurso` es la lista de
> identificadores físicos separados por coma (`GMQ-1,GMQ-2,GMQ-3,GMQ-4`) y
> `estado` es la lista paralela, un estado por unidad y en el mismo orden
> (`Disponible,Prestado,Disponible,Disponible`). `cantidad_disponible` es un
> valor **derivado** (cuántas unidades están en `Disponible`) que el plugin
> recalcula en cada escritura: no se toma nunca del formulario. Toda esa
> lógica vive en `PMI_Inventario` — ver `NOTES.md`.
>
> Las rutas que reciben un `{id}` aceptan tanto el id de la fila completa
> como el de una sola de sus unidades cuando reservan recursos para un
> préstamo; el CRUD de recursos, en cambio, trabaja sobre el `id_recurso`
> completo de la fila.

### `GET /resources`
**Requiere**: sesión válida.

Respuesta `200`: array de
`{ id_recurso, nombre, ubicacion, estado, dia_compra, tipo,
cantidad_total, cantidad_disponible, activo }` (sin la imagen, que tiene su
propio endpoint). Los valores posibles de cada entrada de `estado` son
`Disponible`, `Prestado`, `No disponible` (el estado que reciben las
unidades de un préstamo de Docente) y `Activo fijo` (no prestable). En datos
creados por versiones anteriores del esquema también aparece `Ocupado`, que
se sigue interpretando como "prestada".

### `POST /resources`
`multipart/form-data`. **Requiere**: rol Trabajador.

Campos: `idRecurso` (obligatorio, string libre; una unidad como `MQ3-01` o
un grupo como `GMQ-1,GMQ-2,GMQ-3`), `Nombre`, `Ubicacion`, `Estado`
(default `Disponible`; una entrada por unidad, en el orden de `idRecurso`),
`Dia_compra` (fecha, opcional), `Tipo`, `Cantidad_total` (int), `activo`
(string libre, número de activo fijo — también admite una lista paralela,
default `N/A`), `Imagen` (archivo, opcional, máx. 5MB).

`Cantidad_disponible` **no se acepta**: se calcula contando las unidades en
`Disponible`, para que el formulario no pueda contradecir a los estados.

La imagen se valida contra una lista blanca de formatos: `image/jpeg`,
`image/png`, `image/gif` y `image/webp`. **SVG se rechaza a propósito**,
porque `GET /resources/{id}/imagen` sirve los bytes crudos en el mismo
origen del sitio y un SVG puede llevar `<script>` dentro.

Respuesta `200`: `{ message, idRecurso }`. `400 pmi_bad_request` (falta
`idRecurso`, imagen >5MB o de un formato fuera de la lista blanca).
`409 pmi_conflict` (ID ya existe).

### `GET /resources/{id}`
**Requiere**: sesión válida. Misma forma de fila que `GET /resources`.
`404 pmi_not_found`.

### `PUT /resources/{id}`
`multipart/form-data` (el plugin parsea el body crudo a mano en PUT, ver
`maybe_parse_multipart_put()`). **Requiere**: rol Trabajador.

Mismos campos que `POST`, todos opcionales (conserva el valor actual si se
omiten). Si se manda `Imagen`, reemplaza la imagen guardada.
`Cantidad_disponible` se vuelve a derivar del `Estado` resultante. Si se
manda un `idRecurso` distinto, el cambio se propaga a los detalles de
préstamo que apuntaban al id anterior.

Respuesta `200`: `{ message, idRecurso }`. `404 pmi_not_found`.
`400 pmi_bad_request` si la imagen es inválida.

### `DELETE /resources/{id}`
**Requiere**: rol Trabajador.

Un recurso que aparece en **cualquier** préstamo no se borra: responde
`409 pmi_conflict` indicando en cuántos aparece. Antes se borraban en
cascada sus filas de `detalle_prestamo` para esquivar el error de llave
foránea, y con eso se destruía el historial de qué se prestó, a quién y
cuándo, incluso de préstamos ya cerrados. `404 pmi_not_found` si no existe.

### `GET /resources/{id}/imagen`
**Requiere**: sesión válida. Devuelve los **bytes crudos** de la imagen
(no JSON) con el `Content-Type` guardado en BD — pensado para usarse
directo como `src` de un `<img>`. Manda además
`X-Content-Type-Options: nosniff`, y si la fila trae un `imagen_tipo` fuera
de la lista blanca de subida (por ejemplo importada a mano) lo sirve como
`application/octet-stream`: la idea es que el navegador nunca interprete
esos bytes como HTML o SVG en el origen del sitio.
`404 pmi_not_found` (JSON) si el recurso no existe o no tiene imagen.

---

## Préstamos

> **El ciclo de vida son tres estados, no dos.** `Entregado`/`Hora_entrega`
> = el equipo salió hacia el solicitante y **sigue fuera del inventario**.
> `Devuelto`/`Hora_devolucion` = volvió al laboratorio, y **este es el único
> hito que libera stock**. `fecha_devolucion` es la fecha **prevista** de
> retorno (nula cuando `es_indefinido = 1`). Confundir `Entregado` con
> `Devuelto` es exactamente lo que hacía que entregarle una cámara a un
> estudiante la dejara reservable por otra persona en el mismo momento.

### `GET /loans`
**Requiere**: sesión válida. Un Trabajador recibe todos los préstamos;
cualquier otro rol recibe **solo los propios** (los suyos como
`usuario_solicitante`), porque la lista completa expone correo, celular y
notas de todo el mundo.

Respuesta `200`: array de `{ idPrestamo, Notas, Fecha_prestamo,
Hora_entrega, Entregado, usuario_solicitante, usuario_responsable,
fecha_devolucion, es_indefinido, Devuelto, Hora_devolucion }`
(`Entregado`, `Devuelto` y `es_indefinido` son `0` o `1`).

### `POST /loans`
**Requiere**: sesión válida.

Body: `{ Notas, Fecha_prestamo, Hora_entrega, Entregado,
usuario_solicitante, usuario_responsable, fecha_devolucion, es_indefinido,
recursos }`. `usuario_solicitante`/`usuario_responsable` son obligatorios y
deben existir como usuarios. Las fechas se interpretan como hora **local del
sitio**, sin conversión UTC (ver `PMI_Utils::to_mysql_datetime()`).

- `usuario_solicitante` se **fuerza** al usuario de la sesión salvo que
  quien llame sea Trabajador (préstamo en mostrador a nombre de otro): cada
  persona pide para sí misma.
- `es_indefinido` solo se honra para Docente o Trabajador; es la figura de
  préstamo largo para proyectos y semilleros, y un estudiante no puede
  otorgársela a sí mismo.
- `recursos` es opcional: un arreglo `[{ id, cantidad }]`. Si viene, el
  préstamo y sus líneas se registran en **una sola transacción**, con la
  fila de cada recurso bloqueada (`SELECT ... FOR UPDATE`) mientras se
  eligen las unidades. Si la reserva falla, no queda ningún préstamo. Antes
  esto eran dos peticiones y, al fallar la segunda, el préstamo vacío
  quedaba bloqueando al solicitante ("ya tienes una solicitud activa") sin
  que él pudiera borrarlo.

**Horario del laboratorio** (mismas reglas que aplica la interfaz, ahora
también en el servidor): un Trabajador está exento; un Docente puede elegir
cualquier fecha pero debe quedar entre las 08:00 y las 18:00; cualquier otro
rol solo puede pedir para el **mismo día**, de lunes a viernes y en ese
mismo horario.

Respuesta `200`: `{ message, idPrestamo }`. `400 pmi_bad_request` (faltan
usuarios o no existen, fecha fuera de horario, recurso inexistente, sin
stock suficiente o recurso `Activo fijo`). `500 pmi_server_error` si el
`INSERT` del préstamo falla.

### `GET /loans/{id}`
**Requiere**: sesión válida, y que el préstamo sea tuyo o que tengas rol
Trabajador. `403 pmi_forbidden` en caso contrario, `404 pmi_not_found` si no
existe.

### `PUT /loans/{id}`
**Requiere**: rol Trabajador. Registrar la entrega y la devolución es
trabajo del laboratorio; mientras bastaba con estar logueado, cualquier
estudiante podía cerrar el préstamo de otra persona y liberar su inventario.

Body: cualquiera de `Notas, Fecha_prestamo, Hora_entrega, Entregado,
Devuelto, Hora_devolucion, fecha_devolucion, es_indefinido,
usuario_solicitante, usuario_responsable` (parcial). Detalles del
comportamiento:

- Si se marca un hito (`Entregado: 1` o `Devuelto: 1`) sobre un préstamo que
  no lo tenía y no se manda la hora correspondiente, se usa la hora actual
  del sitio.
- Marcar `Devuelto: 1` sobre un préstamo que no estaba entregado lo marca
  también como entregado: un equipo que vuelve necesariamente había salido.
- Solo al pasar a `Devuelto = 1` se devuelven las unidades al inventario, y
  se devuelven **las que quedaron registradas** en la columna `unidades` de
  cada detalle. Las unidades que un trabajador haya reclasificado como
  `Activo fijo` mientras estaban afuera no se tocan.

Respuesta `200`: `{ message }`. `404 pmi_not_found`.

### `DELETE /loans/{id}`
**Requiere**: rol Trabajador. Si el préstamo no estaba devuelto, primero
libera sus unidades (de lo contrario quedarían reservadas para siempre, sin
detalle que registre cuáles eran), después borra los detalles asociados y
por último el préstamo. `409 pmi_conflict`, `404 pmi_not_found`.

---

## Detalles de préstamo (recursos dentro de un préstamo)

### `GET /loans/alldetails`
**Requiere**: sesión válida. Los detalles de todos los préstamos en una
consulta — usado por el frontend para armar el resumen "×N" en las listas de
préstamos sin pedir cada detalle uno por uno. Un Trabajador ve todo;
cualquier otro rol ve solo el contenido de sus propios préstamos.

Respuesta `200`: array de `{ prestamo_id, recurso_id, cantidad_prestada,
unidades, Nombre, Ubicacion, Estado, Tipo, activo }`.

### `GET /loans/{id}/details`
**Requiere**: sesión válida, y que el préstamo sea tuyo o que tengas rol
Trabajador (`403 pmi_forbidden` en caso contrario).

Respuesta `200`: array de `{ prestamo_id, recurso_id, cantidad_prestada,
unidades, Nombre, Ubicacion, Estado, Tipo, activo }` (join con `recurso`).
`404 pmi_not_found` si el préstamo no tiene recursos (nota: el cliente
`api.js` trata este 404 puntual como lista vacía, no como error).

`unidades` es la lista separada por coma de las unidades físicas concretas
que se le asignaron a esa línea (`GMQ-1,GMQ-3`). Es lo que permite al
trabajador saber qué aparato entregar y cuál espera de vuelta, y lo que hace
que la devolución no se equivoque de unidad cuando hay dos préstamos
abiertos sobre el mismo grupo. Los detalles creados antes de que existiera
esta columna la traen vacía.

### `POST /loans/{id}/details`
Agrega recursos a un préstamo que ya existe (crear el préstamo con sus
recursos de una vez se hace en `POST /loans`).

**Requiere**: sesión válida, y que el préstamo sea tuyo o que tengas rol
Trabajador (`403 pmi_forbidden` en caso contrario).

Body: `{ recurso: [{ id, cantidad }, ...] }`. El `id` puede ser el de la
fila completa o el de una de sus unidades. Por cada recurso, dentro de una
transacción y con la fila bloqueada, se eligen las primeras unidades
disponibles, se insertan en el detalle junto con sus ids en `unidades` y se
marcan como prestadas — como `No disponible` si el solicitante es Docente,
como `Prestado` en cualquier otro caso. Si dos entradas del body resuelven
al mismo recurso, sus cantidades se suman antes de elegir unidades.

El trigger `{prefijo}before_detalle_insert` sigue existiendo como última
línea de defensa a nivel de base de datos (stock y `Activo fijo`) para
escrituras que no pasan por esta API; por la API el rechazo ocurre antes, en
PHP.

Respuesta `200`: `{ message, idPrestamo, recurso }`. `404 pmi_not_found`
(préstamo no existe). `400 pmi_bad_request` (body sin recursos, sin stock
suficiente, recurso `Activo fijo`, o `recurso_id` inexistente).
`500 pmi_server_error` para cualquier otro error de SQL no reconocido (se
registra en el log de errores del admin y notifica por correo).

### `DELETE /loans/{id}/details/{recurso_id}`
**Requiere**: rol Trabajador. Al quitar la línea devuelve al inventario las
unidades que tenía asignadas.

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

## Ejemplo de flujo completo (crear, entregar y recibir un préstamo)

```
1. POST /login                          → cookie de sesión
2. GET  /resources                      → catálogo para elegir recursos
3. POST /loans  { recursos: [...] }     → { idPrestamo } (reserva las
                                            unidades en la misma
                                            transacción)
4. (trabajador) PUT /loans/{idPrestamo} → { Entregado: 1 } (salió del lab;
                                            el stock NO se libera)
5. (trabajador) PUT /loans/{idPrestamo} → { Devuelto: 1 } (volvió al lab;
                                            aquí se libera el stock)
```

Ver también [`../NOTES.md`](../NOTES.md) para el porqué de cada decisión
(inventario por unidad física, autenticación propia, zona horaria, etc.) y
[`../ecoprestamos-theme/ARQUITECTURA.md`](../ecoprestamos-theme/ARQUITECTURA.md)
para cómo el frontend consume esta API.
