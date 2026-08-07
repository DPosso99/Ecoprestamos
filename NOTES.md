# Notas de migracion

Este documento explica como se tradujo cada pieza del proyecto original
(Node/Express + `mysql2`, sin ORM) a un plugin de WordPress, y por que.

## Tablas

Prefijo de todas las tablas: `{$wpdb->prefix}pmi_` (ej. `wp_pmi_usuario`).
Se eligio un prefijo propio (`pmi_` = Prestamos Medialab Inventario) para no
generar confusion con las tablas nativas de WordPress (`wp_users`, etc.),
aunque no hay colision real de nombres.

| Original (`Backend/Database/init.sql`) | WordPress (`ecoprestamos-plugin/sql/001-tables.sql`) | Cambios |
|---|---|---|
| `usuario` (PK `Correo`) | `pmi_usuario` (PK `correo`) | Columnas renombradas a snake_case ASCII: `Correo`→`correo`, `Contraseña`→`contrasena`, `Rol`→`rol`, `Nombre`→`nombre`, `Baneado`→`baneado`, `Trabajo`→`trabajo`. Se evita la eñe en el nombre de columna por portabilidad entre configuraciones de charset/collation de distintos hostings. |
| `recurso` (PK `idRecurso`) | `pmi_recurso` (PK `id_recurso`) | Mismo renombrado a snake_case. `Imagen`/`Imagen_tipo` se mantienen como `LONGBLOB`/`varchar` en la fila (no se movio a la Media Library de WP), igual que el original. |
| `prestamo` (PK `idPrestamo`) | `pmi_prestamo` (PK `id_prestamo`) | Igual estructura y FKs a usuario. |
| `detalle_prestamo` (**sin PRIMARY KEY**, `prestamo_id` con `AUTO_INCREMENT` propio aunque tambien es FK) | `pmi_detalle_prestamo` (PK propia `id_detalle` autoincrement; `prestamo_id`/`recurso_id` son columnas FK normales, sin autoincrement) | **Fix de un bug del esquema original**: la tabla no tenia PRIMARY KEY declarada, y `prestamo_id` era a la vez FK y AUTO_INCREMENT (funcionaba solo porque el indice `prestamo_ide_idx` lo cubria, pero es un diseno fragil que permitiria IDs de detalle desalineados del ID real del prestamo). Se agrega una PK subrogada `id_detalle` limpia. |

Los ENUM del original (`Rol`, `Trabajo`, `Estado`, `Tipo`, `Ubicacion`) se
guardan como `varchar` en vez de `ENUM` de MySQL: `dbDelta()` reconoce mal
los cambios futuros de definicion `ENUM` (no altera la lista de valores en
actualizaciones), asi que la validacion de esos valores permitidos vive en
PHP en vez de en el tipo de columna. Si se prefiere mantener `ENUM` real,
basta con editar `plugin/sql/001-tables.sql` antes de activar el plugin la
primera vez.

## Triggers y llaves foraneas (decision confirmada)

Se mantuvo la logica de negocio del inventario **en triggers de MySQL**,
igual que el proyecto original, en vez de reimplementarla en PHP:

- `pmi_after_detalle_insert` (`AFTER INSERT ON pmi_detalle_prestamo`): resta
  `cantidad_disponible` del recurso, bloquea si `estado = 'Activo fijo'`, y
  lanza `SIGNAL` si no hay stock suficiente.
- `pmi_after_prestamo_cierre` (`AFTER UPDATE ON pmi_prestamo`): al marcar
  `entregado = 1`, devuelve las cantidades prestadas a `pmi_recurso`.

`dbDelta()` no soporta `CREATE TRIGGER` ni `FOREIGN KEY`, asi que ambos se
crean con `$wpdb->query()` directo durante la activacion
(`includes/class-pmi-activator.php`), leyendo `sql/002-triggers.sql` y
`sql/003-constraints.sql`.

**Bug corregido (no presente en el original, o mas bien: SI estaba presente
en el original y se corrigio aqui)**: el `init.sql` original calculaba
`Estado` dentro del mismo `UPDATE` que modificaba `Cantidad_disponible`,
referenciando esa columna dos veces en la misma sentencia
(`SET Cantidad_disponible = Cantidad_disponible - X, Estado = IF(Cantidad_disponible - X = 0, ...)`).
MySQL evalua las clausulas `SET` de izquierda a derecha, asi que la segunda
referencia a `Cantidad_disponible` ya ve el valor recien actualizado, y la
resta se aplica dos veces — el `Estado` nunca llegaba a `'Ocupado'` aunque
la cantidad disponible llegara a 0. En `sql/002-triggers.sql` se corrigio
precalculando el nuevo valor en una variable (`pmi_after_detalle_insert`) y
separando en dos `UPDATE` consecutivos (`pmi_after_prestamo_cierre`, que
ademas es un UPDATE multi-tabla via `JOIN`, donde MySQL ni siquiera
garantiza el orden de evaluacion de las clausulas `SET`).

**Riesgo a tener en cuenta**: algunos hostings de WordPress compartidos no
dan al usuario de base de datos el privilegio `TRIGGER` (y a veces tampoco
`REFERENCES`/`ALTER` para FKs). Si eso pasa, la activacion no falla, pero
queda un aviso en el admin (`admin_notices`) explicando que las cantidades
de recurso no se van a ajustar automaticamente y que hay que revisar
permisos de MySQL con el proveedor de hosting. Los mensajes de error de
`AddDetail` en `class-pmi-rest-detalles.php` siguen funcionando igual
*solo si* los triggers lograron crearse.

## Autenticacion (decision confirmada)

Se mantiene la tabla `pmi_usuario` propia (no se integra con `wp_users`),
con contrasenas `bcrypt` via `password_hash()`/`password_verify()` (PHP)
en vez de la libreria `bcrypt` de Node — el formato de hash es compatible.

En vez de reimplementar JWT (que hubiera requerido empaquetar una libreria
externa como `firebase/php-jwt` dentro del plugin), la sesion se maneja
con:

- Una **cookie propia firmada** (`pmi_session`, HMAC-SHA256 con un secreto
  generado en la activacion y guardado en `wp_options`), equivalente a la
  cookie `token` (JWT) del original. Expira a las 24h, igual que
  `expiresIn: '1d'` en `libs/jwt.js`.
- El **nonce de la REST API de WordPress** (`X-WP-Nonce`, verificado con
  `wp_verify_nonce($nonce, 'wp_rest')`) como proteccion CSRF en cada
  request de escritura (POST/PUT/DELETE), igual que cualquier otro
  endpoint nativo de WP REST.

Esto reemplaza el `Middleware/auth.js` original, que estaba **vacio** (el
backend Node nunca verificaba la sesion en el servidor; la proteccion de
rutas era solo del lado del cliente, en React Router). El plugin si aplica
`permission_callback` en cada ruta REST — ver la tabla de endpoints abajo
para quien puede llamar a cada uno.

## Zona horaria

El proyecto original tuvo varios commits recientes corrigiendo desfases de
horario (`toMySQLDatetime usa hora local en lugar de UTC`). La misma logica
se replico en `includes/class-pmi-utils.php::to_mysql_datetime()`: el string
que manda el frontend (hora local sin offset, ej. `2026-07-06T14:30:00`) se
interpreta directamente como hora local del sitio (`wp_timezone()`), sin
convertir a/desde UTC, para evitar el mismo bug.

## Endpoints REST

Namespace: `pmi/v1` (URL completa: `rest_url('pmi/v1/...')`, que ya resuelve
correctamente si WordPress vive en un subdirectorio/subsitio).

| Original (`Backend/routes`) | WordPress (`plugin/includes`) | Quien puede llamarlo |
|---|---|---|
| `GET/POST /api/users` | `GET/POST /wp-json/pmi/v1/users` | GET: rol Trabajador. POST: publico si es auto-registro, rol Trabajador si `adminCreated: true`. |
| `GET/PUT/DELETE /api/users/:Correo` | `GET/PUT/DELETE /wp-json/pmi/v1/users/{correo}` | GET/PUT: sesion valida (PUT de campos sensibles como Rol/Baneado solo si es Trabajador). DELETE: rol Trabajador. |
| `POST /api/login`, `POST /api/logout` | `POST /wp-json/pmi/v1/login`, `/logout` | Publico. |
| `GET/POST /api/Resource` | `GET/POST /wp-json/pmi/v1/resources` | GET: sesion valida. POST: rol Trabajador. |
| `GET/PUT/DELETE /api/Resource/:id` | `GET/PUT/DELETE /wp-json/pmi/v1/resources/{id}` | GET: sesion valida. PUT/DELETE: rol Trabajador. |
| `GET /api/Resource/:id/imagen` | `GET /wp-json/pmi/v1/resources/{id}/imagen` | Sesion valida. Sirve bytes crudos con su `Content-Type`, igual que el original (no pasa por la Media Library). |
| `GET/POST /api/Loan` | `GET/POST /wp-json/pmi/v1/loans` | Sesion valida. |
| `GET/PUT/DELETE /api/Loan/:id` | `GET/PUT/DELETE /wp-json/pmi/v1/loans/{id}` | GET/PUT: sesion valida. DELETE: rol Trabajador. |
| `GET /api/Loan/alldetails` | `GET /wp-json/pmi/v1/loans/alldetails` | Sesion valida. |
| `GET/POST /api/Loan/:id/details` | `GET/POST /wp-json/pmi/v1/loans/{id}/details` | Sesion valida. |
| `DELETE /api/Loan/:id/details/:idRecurso` | `DELETE /wp-json/pmi/v1/loans/{id}/details/{recurso_id}` | Rol Trabajador. |
| `GET /api/ResSearch/:Tipo` | `GET /wp-json/pmi/v1/resources/search/tipo/{tipo}` | Sesion valida. |
| `GET /api/ResSearch/name/:Nombre` | `GET /wp-json/pmi/v1/resources/search/nombre/{nombre}` | Sesion valida. |
| `GET /api/ResSearch/salon/:Ubicacion` | `GET /wp-json/pmi/v1/resources/search/salon/{ubicacion}` | Sesion valida. |
| `GET /api/adminsearch/ban` | `GET /wp-json/pmi/v1/admin/baneados` | Rol Trabajador. |
| `GET /api/adminsearch/:Fecha_prestamo` | `GET /wp-json/pmi/v1/admin/prestamos-por-fecha/{fecha}` | Rol Trabajador. |

**Nota sobre la forma de la respuesta**: `getLoans`, `getResources` y
`getUsers` en el backend Node original no desestructuraban el resultado de
`pool.execute(...)`, asi que en realidad devolvian
`[filas, metadataDeColumnas]` en vez de solo `filas` (por eso el frontend
original hace `const [rows] = await res.json()`). El plugin de WordPress
corrige eso y devuelve directamente el arreglo de filas — el frontend
propio (`ecoprestamos-theme/`) ya esta escrito contra esa forma correcta,
no necesita ningun ajuste.

## Subida de imagenes

`Middleware/upload.js` (multer, memoria, limite 5MB, solo `image/*`) se
tradujo a `PMI_Rest_Recursos::extract_image()`, que lee `$_FILES['Imagen']`
via `WP_REST_Request::get_file_params()`, valida tamano (5MB) y MIME
(`mime_content_type()`), y guarda los bytes crudos en la columna `imagen`
(`LONGBLOB`), igual que el original.

## Frontend (tema de WordPress)

El frontend original es React; aqui **no se porto React** (hubiera exigido
Node.js/npm para compilar cada vez, y el pedido explicito fue que todo
viviera dentro de WordPress sin herramientas externas). En su lugar se
reescribieron las mismas pantallas como una SPA en **JavaScript plano**
(modulos ES nativos del navegador, sin bundler) dentro de
`ecoprestamos-theme/assets/js/`:

- `router.js` — ruteo por **hash** (`#/catalogo`, `#/ops/ticket/123`, etc.),
  para que la app funcione igual sin importar la URL/anidacion real de la
  pagina de WordPress que la aloja.
- `state.js` — equivalente a los React contexts originales (auth, catalogo,
  prestamos, usuarios, ticket/borrador de solicitud), como un store simple
  con pubsub.
- `api.js` — cliente fetch hacia `pmi/v1`, con nonce automatico en cada
  request de escritura.
- `views/*.js` — una funcion de render por pantalla (ver tabla en el
  README principal).

No hay paridad visual pixel-a-pixel con el Tailwind original (el
Command Palette Ctrl+K se volvio un buscador simple, el dropdown de
filtros con navegacion por teclado se volvio un `<select>` nativo), pero
si paridad completa de flujo y logica de negocio.

## Bugs encontrados y corregidos durante las pruebas

Ademas del trigger de MySQL corregido (seccion de arriba), las pruebas
end-to-end contra un WordPress real (Local by Flywheel) sacaron a la luz
estos problemas, ya corregidos en este repo:

- **Escalacion de privilegios en el registro publico**: `POST /users` sin
  `adminCreated` aceptaba igual un `Rol` arbitrario del body — cualquier
  visitante podia auto-asignarse `Trabajador`. Corregido en
  `class-pmi-rest-usuarios.php::create_user()`: fuera de la rama
  `adminCreated` (ya protegida por `permission_worker`), `Rol`/`Baneado`/
  `Trabajo` se ignoran del cliente y siempre quedan en sus valores por
  defecto de Estudiante.
- **Columnas nullable guardadas como `'0000-00-00'`/`0` en vez de `NULL`**:
  `$wpdb->query($wpdb->prepare('...VALUES (%s,...)', null, ...))` no
  garantiza NULL real segun la version de WordPress. Se cambiaron esos
  `INSERT` (recurso y prestamo) a `$wpdb->insert()`, que si maneja NULL de
  forma consistente en cualquier version.
- **Correos con `@` rompian las rutas `/users/{correo}`**: el
  `encodeURIComponent()` del cliente JS escapa `@` como `%40`, y el
  enrutamiento de este WordPress no lo decodifica de vuelta (404). Como
  `@` es valido sin escapar en un segmento de ruta (RFC 3986), se ajusto
  `api.js` para no escaparlo.
- **Campos `disabled` en formularios de edicion se perdian al guardar**:
  un `<input disabled>` no se incluye en `FormData` al enviar el
  formulario, asi que editar un usuario o recurso existente (con el
  Correo/ID bloqueado para que no cambie) mandaba ese campo vacio y
  fallaba la validacion. Cambiado a `readonly` (se ve igual, pero si viaja
  en el `FormData`).
- **Imagenes del catalogo no llenaban la tarjeta**: `.pmi-resource-media`
  usaba `object-fit: contain` con padding, dejando espacio en blanco
  alrededor. Cambiado a `object-fit: cover` a pantalla completa del
  contenedor.
- **El detalle de un prestamo no mostraba que se pidio ni cuanto**: los
  endpoints `GET /loans/{id}/details` y `GET /loans/alldetails` nunca
  seleccionaban `cantidad_prestada` (tampoco lo hacia el backend Node
  original). Se agrego esa columna a ambos, y las vistas de detalle
  (estudiante y trabajador) ahora listan cada recurso con su cantidad.

## Lo que queda pendiente

No hay script de migracion de datos (usuarios/recursos/prestamos ya
existentes en la base de datos MySQL actual del proyecto Node). Si se
necesita traer datos reales, hay que escribir un script aparte que lea de
las tablas originales (`usuario`, `recurso`, `prestamo`, `detalle_prestamo`)
y las inserte en las tablas `pmi_*` con los nombres de columna nuevos (ver
tabla de equivalencias arriba). Los hashes de contrasena `bcrypt` de Node
son compatibles tal cual con `password_verify()` de PHP, no hace falta
rehashear.
