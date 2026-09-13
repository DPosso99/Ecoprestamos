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
| `recurso` (PK `idRecurso`) | `pmi_recurso` (PK `id_recurso`) | Mismo renombrado a snake_case. `Imagen`/`Imagen_tipo` se mantienen como `LONGBLOB`/`varchar` en la fila (no se movio a la Media Library de WP), igual que el original. Una fila ahora puede representar un grupo de unidades identicas: `id_recurso` es la lista de identificadores fisicos separados por coma y `estado` la lista paralela de estados, asi que `id_recurso` crecio a `varchar(500)` y `estado` a `text` (ver la seccion siguiente). |
| `prestamo` (PK `idPrestamo`) | `pmi_prestamo` (PK `id_prestamo`) | Igual estructura y FKs a usuario, mas cuatro columnas nuevas: `fecha_devolucion` (fecha prevista de retorno), `es_indefinido`, `devuelto` y `hora_devolucion` (retorno real). Las tres ultimas no existian en el original, que solo distinguia entre pedido y entregado. |
| `detalle_prestamo` (**sin PRIMARY KEY**, `prestamo_id` con `AUTO_INCREMENT` propio aunque tambien es FK) | `pmi_detalle_prestamo` (PK propia `id_detalle` autoincrement; `prestamo_id`/`recurso_id` son columnas FK normales, sin autoincrement; columna `unidades`) | **Fix de un bug del esquema original**: la tabla no tenia PRIMARY KEY declarada, y `prestamo_id` era a la vez FK y AUTO_INCREMENT (funcionaba solo porque el indice `prestamo_ide_idx` lo cubria, pero es un diseno fragil que permitiria IDs de detalle desalineados del ID real del prestamo). Se agrega una PK subrogada `id_detalle` limpia y la columna `unidades`, que guarda cuales unidades fisicas concretas se asignaron a esa linea del prestamo. |

Los ENUM del original (`Rol`, `Trabajo`, `Estado`, `Tipo`, `Ubicacion`) se
guardan como `varchar` en vez de `ENUM` de MySQL: `dbDelta()` reconoce mal
los cambios futuros de definicion `ENUM` (no altera la lista de valores en
actualizaciones), asi que la validacion de esos valores permitidos vive en
PHP en vez de en el tipo de columna. Si se prefiere mantener `ENUM` real,
basta con editar `plugin/sql/001-tables.sql` antes de activar el plugin la
primera vez.

## Inventario por unidad fisica

El original llevaba el inventario como un contador: `Cantidad_disponible`
subia y bajaba, y nadie sabia *cual* de los cuatro visores se habia
prestado. En Medialab eso no alcanza, porque cada unidad tiene su propio
numero de activo fijo y el trabajador necesita saber que aparato entregar y
cual espera de vuelta.

Por eso una fila de `pmi_recurso` puede representar un grupo de unidades
iguales: `id_recurso` guarda la lista de identificadores fisicos separados
por coma (`GMQ-1,GMQ-2,GMQ-3,GMQ-4`) y `estado` guarda una lista paralela,
un estado por unidad y en el mismo orden (`Disponible`, `Prestado`,
`No disponible`, `Activo fijo`). `cantidad_disponible` dejo de ser un dato
propio: es un valor **derivado** (cuantas unidades quedan en `Disponible`)
que se recalcula en cada escritura, y por eso ya no se toma del formulario
aunque el cliente lo mande.

Toda esa logica vive en una sola clase,
`includes/class-pmi-inventario.php` (`PMI_Inventario`), que es la unica que
descompone la fila en unidades, elige cuales se prestan, las marca y
recalcula el contador. Tener un solo dueno evita que cada endpoint invente
su propia forma de partir las listas por coma.

Cada linea de `pmi_detalle_prestamo` deja registradas en `unidades` las
unidades exactas que se le asignaron. Esa identidad no es un lujo: **sin
ella dos prestamos abiertos sobre el mismo grupo se pisaban**. La
devolucion liberaba "las primeras N unidades que figuren como prestadas",
asi que al cerrar el primer prestamo se liberaba la unidad del segundo (que
seguia afuera) y la propia quedaba marcada como prestada para siempre. La
reserva ocurre ademas dentro de una transaccion con `SELECT ... FOR UPDATE`
sobre la fila del recurso, para que dos solicitudes simultaneas no se
asignen la misma unidad.

## Ciclo de vida de un prestamo: tres estados, no dos

El original tenia dos hitos (pedido / entregado) y liberaba el stock al
marcar `entregado`. Eso significaba que entregarle una camara a un
estudiante la volvia reservable por otra persona en el mismo momento, con
el equipo todavia fuera del laboratorio. Ahora son tres columnas con
significados que conviene no confundir:

- `entregado` / `hora_entrega`: el equipo salio hacia el solicitante y
  **sigue fuera del inventario**.
- `devuelto` / `hora_devolucion`: el equipo volvio al laboratorio. Este es
  el unico hito que libera stock.
- `fecha_devolucion`: la fecha **prevista** de retorno (nula cuando
  `es_indefinido = 1`, la figura de prestamo largo para docentes).

Registrar una devolucion sin haber marcado la entrega asume la entrega: un
equipo que vuelve necesariamente habia salido.

## Triggers y llaves foraneas

El inventario **ya no se mueve en MySQL, se mueve en PHP**. La razon es
directa: lo que importa hoy es cual unidad se presto, y un trigger de SQL
no tiene donde registrar esa asignacion en el detalle del prestamo. Con el
inventario por unidad fisica, un trigger que solo sabe restar cantidades no
puede sostener el modelo.

De los dos triggers del original queda **uno solo**,
`{prefijo}before_detalle_insert` (`BEFORE INSERT ON pmi_detalle_prestamo`),
como ultima linea de defensa: valida stock y bloquea los recursos en
`Activo fijo` para escrituras que no pasan por la API REST (importaciones
de SQL, cambios a mano desde phpMyAdmin). El viejo
`after_prestamo_cierre`, que devolvia cantidades al marcar la entrega, se
elimino por completo; el activador lo borra explicitamente
(`DROP TRIGGER IF EXISTS`) para que no sobreviva de una instalacion previa.

Aquella logica en SQL, ademas, ya venia con un bug propio: el `init.sql`
original calculaba `Estado` dentro del mismo `UPDATE` que modificaba
`Cantidad_disponible`, referenciando esa columna dos veces en la misma
sentencia
(`SET Cantidad_disponible = Cantidad_disponible - X, Estado = IF(Cantidad_disponible - X = 0, ...)`).
MySQL evalua las clausulas `SET` de izquierda a derecha, asi que la segunda
referencia ya veia el valor recien actualizado y la resta se aplicaba dos
veces: el `Estado` nunca llegaba a `'Ocupado'` aunque la cantidad
disponible llegara a 0. Es el tipo de error dificil de ver y de probar que
se evita teniendo el calculo en un solo lugar de PHP.

`dbDelta()` no soporta `CREATE TRIGGER` ni `FOREIGN KEY`, asi que el
trigger y las restricciones se crean con `$wpdb->query()` directo durante
la activacion (`includes/class-pmi-activator.php`), leyendo
`sql/002-triggers.sql` y `sql/003-constraints.sql`.

Los nombres de las restricciones llevan tambien el prefijo del sitio
(`%%PREFIX%%fk_prestamo_solicitante`, etc.). En MySQL el nombre de una
`FOREIGN KEY` es unico en **toda la base de datos**, no por tabla, y en una
red multisitio todos los subsitios comparten base de datos: con nombres
fijos, el segundo subsitio fallaba con "Duplicate foreign key constraint
name" y se quedaba sin integridad referencial. Como el activador ignora a
proposito los errores de duplicado (para poder reactivar el plugin sin
ruido), eso pasaba en silencio.

**Riesgo a tener en cuenta**: algunos hostings de WordPress compartidos no
dan al usuario de base de datos el privilegio `TRIGGER` (y a veces tampoco
`REFERENCES`/`ALTER` para FKs). Si eso pasa, la activacion no falla y queda
un aviso en el admin (`admin_notices`). La app sigue ajustando el
inventario con normalidad, porque eso lo hace PHP; lo que se pierde es la
validacion extra para las escrituras hechas por fuera de la aplicacion.

## Actualizaciones de esquema

`register_activation_hook()` solo corre cuando alguien activa el plugin
desde el admin. Al actualizar los archivos en su lugar (subir una version
nueva por FTP o por git) el esquema se quedaba en la version anterior, y
cualquier columna nueva provocaba un error de SQL en **cada** request:
`devuelto`, `hora_devolucion` y `unidades` dejaban el sitio inservible
hasta desactivar y reactivar a mano. Para eso `ecoprestamos-plugin.php`
engancha `plugins_loaded` y vuelve a correr el activador cuando la version
guardada en la opcion `pmi_db_version` no coincide con
`PMI_Activator::DB_VERSION` (hoy `1.1.0`). El activador es idempotente, asi
que aplicar el esquema pendiente es seguro.

Los subsitios creados **despues** de activar el plugin en la red tampoco
recibian sus tablas propias. Eso se cubre con `wp_initialize_site`, que
reemplazo al `wpmu_new_blog` deprecado.

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

La cookie lleva ademas una **huella de las credenciales** derivada del hash
de contrasena del usuario. Al ser una cookie autocontenida no hay tabla de
sesiones que borrar, asi que sin esa huella un token copiado seguia
sirviendo las 24 horas completas incluso despues de cambiar la contrasena.
Con ella, cambiar la contrasena invalida las sesiones abiertas. Efecto
secundario esperado: las cookies emitidas antes de esta version no validan
y obligan a entrar de nuevo.

El `baneado` tambien se aplica en el servidor: `permission_logged_in`
responde `403 pmi_banned`. La unica excepcion es leer tu **propia** ficha
con `GET /users/{correo}`, que sigue permitida a proposito, porque es asi
como la aplicacion se entera del baneo y muestra la pantalla de cuenta
suspendida en vez de una pantalla vacia.

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

En el frontend el mismo cuidado se concentra en `todayISO()`
(`assets/js/dom.js`), que arma la fecha de hoy con `getFullYear()`,
`getMonth()` y `getDate()` locales. Las vistas usaban
`toISOString().slice(0,10)`, que calcula "hoy" en UTC: pasadas las 19:00 de
Bogota ya era el dia siguiente para el navegador, y el tablero del
trabajador y los filtros por fecha se veian vacios el resto de la noche.

## Endpoints REST

Namespace: `pmi/v1` (URL completa: `rest_url('pmi/v1/...')`, que ya resuelve
correctamente si WordPress vive en un subdirectorio/subsitio).

| Original (`Backend/routes`) | WordPress (`plugin/includes`) | Quien puede llamarlo |
|---|---|---|
| `GET/POST /api/users` | `GET/POST /wp-json/pmi/v1/users` | GET: sesion valida, pero la respuesta depende del rol (un Trabajador ve el directorio completo; los demas solo ven los trabajadores activos, sin numero de celular). POST: publico si es auto-registro (exige correo `@eafit.edu.co`), rol Trabajador si `adminCreated: true`. |
| `GET/PUT/DELETE /api/users/:Correo` | `GET/PUT/DELETE /wp-json/pmi/v1/users/{correo}` | GET: tu propia ficha, o cualquiera si eres Trabajador. PUT: igual, y `Rol`/`Baneado`/`Trabajo` solo se aplican si quien llama es Trabajador. DELETE: rol Trabajador. |
| `POST /api/login`, `POST /api/logout` | `POST /wp-json/pmi/v1/login`, `/logout` | Publico. |
| `GET/POST /api/Resource` | `GET/POST /wp-json/pmi/v1/resources` | GET: sesion valida. POST: rol Trabajador. |
| `GET/PUT/DELETE /api/Resource/:id` | `GET/PUT/DELETE /wp-json/pmi/v1/resources/{id}` | GET: sesion valida. PUT/DELETE: rol Trabajador. |
| `GET /api/Resource/:id/imagen` | `GET /wp-json/pmi/v1/resources/{id}/imagen` | Sesion valida. Sirve bytes crudos con su `Content-Type`, igual que el original (no pasa por la Media Library). |
| `GET/POST /api/Loan` | `GET/POST /wp-json/pmi/v1/loans` | Sesion valida. GET devuelve solo tus prestamos, salvo que seas Trabajador. POST fuerza `usuario_solicitante` al usuario de la sesion, salvo que seas Trabajador (prestamo en mostrador a nombre de otro). |
| `GET/PUT/DELETE /api/Loan/:id` | `GET/PUT/DELETE /wp-json/pmi/v1/loans/{id}` | GET: tu propio prestamo, o cualquiera si eres Trabajador. PUT/DELETE: rol Trabajador. |
| `GET /api/Loan/alldetails` | `GET /wp-json/pmi/v1/loans/alldetails` | Sesion valida, limitado a tus propios prestamos salvo que seas Trabajador. |
| `GET/POST /api/Loan/:id/details` | `GET/POST /wp-json/pmi/v1/loans/{id}/details` | Sesion valida, solo sobre prestamos propios (un Trabajador puede sobre cualquiera). |
| `DELETE /api/Loan/:id/details/:idRecurso` | `DELETE /wp-json/pmi/v1/loans/{id}/details/{recurso_id}` | Rol Trabajador. |
| `GET /api/ResSearch/:Tipo` | `GET /wp-json/pmi/v1/resources/search/tipo/{tipo}` | Sesion valida. |
| `GET /api/ResSearch/name/:Nombre` | `GET /wp-json/pmi/v1/resources/search/nombre/{nombre}` | Sesion valida. |
| `GET /api/ResSearch/salon/:Ubicacion` | `GET /wp-json/pmi/v1/resources/search/salon/{ubicacion}` | Sesion valida. |
| `GET /api/adminsearch/ban` | `GET /wp-json/pmi/v1/admin/baneados` | Rol Trabajador. |
| `GET /api/adminsearch/:Fecha_prestamo` | `GET /wp-json/pmi/v1/admin/prestamos-por-fecha/{fecha}` | Rol Trabajador. |

El criterio detras de esa columna es que un solicitante solo debe ver y
tocar lo suyo. La lista completa de prestamos expone correo, celular y
notas de todo el mundo, y la ficha de otro usuario expone su telefono, asi
que ninguna de las dos cosas se entrega a quien no es Trabajador. Registrar
la entrega o la devolucion (`PUT /loans/{id}`) tambien paso a exigir rol
Trabajador: es trabajo del laboratorio, y mientras bastaba con estar
logueado cualquier estudiante podia cerrar el prestamo de otra persona y
liberar su inventario.

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

Donde si se cambio el criterio del original es en el MIME: en vez de
aceptar cualquier cosa que empiece por `image/`, hay una lista blanca
(`image/jpeg`, `image/png`, `image/gif`, `image/webp`). `image/svg+xml`
tambien empieza por `image/`, y `GET /resources/{id}/imagen` devuelve esos
bytes tal cual en el mismo origen del sitio: un SVG con `<script>` seria
XSS almacenado corriendo con la sesion de WordPress. Ese endpoint manda
ademas `X-Content-Type-Options: nosniff`, porque sin eso un navegador puede
ignorar el `Content-Type` e interpretar el contenido como HTML.

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

Ademas de los dos problemas de fondo que explican el inventario por unidad
y el ciclo de vida de tres estados (secciones de arriba), las pruebas
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
- **Un prestamo huerfano bloqueaba al estudiante para siempre**: crear la
  solicitud eran dos peticiones (primero el prestamo, luego sus recursos).
  Si la segunda fallaba — por falta de stock, por ejemplo — quedaba un
  prestamo vacio que el solicitante no podia borrar (`DELETE /loans/{id}`
  exige Trabajador) y que le respondia "ya tienes una solicitud activa" a
  cualquier intento nuevo. Ahora `POST /loans` acepta un arreglo `recursos`
  opcional y registra el prestamo con sus lineas en **una sola
  transaccion**. `POST /loans/{id}/details` se conserva para agregar
  recursos a un prestamo que ya existe.
- **Borrar un recurso destruia el historial**: `DELETE /resources/{id}`
  borraba en cascada las filas de `detalle_prestamo` para esquivar el error
  de llave foranea, y con eso se perdia el registro de que se presto, a
  quien y cuando, incluso de prestamos ya cerrados. Ahora responde
  `409 pmi_conflict` diciendo en cuantos prestamos aparece.
- **Roles y trabajos arbitrarios**: `Rol` y `Trabajo` se guardaban tal como
  llegaban del cliente, asi que un Trabajador podia dejar a alguien con un
  rol inexistente y sin permisos utiles. Ahora pasan por lista blanca
  (`Estudiante|Docente|Trabajador` y `Trabajador|Practicante`).
- **Una sesion robada bastaba para quedarse con la cuenta**: cambiar la
  contrasena propia no pedia la anterior. Ahora `PUT /users/{correo}` exige
  `Contrasena_actual` cuando editas tu propia cuenta; un Trabajador que le
  restablece la clave a otra persona no la necesita.
- **Cuentas creadas por un Trabajador no podian entrar**: `POST /login`
  rechazaba cualquier correo que no fuera `@eafit.edu.co`, pero un
  Trabajador si puede dar de alta cuentas de otros dominios (proveedores,
  invitados). La regla del correo institucional quedo donde corresponde:
  solo en el auto-registro publico de `POST /users`.
- **El horario del laboratorio solo lo validaba el navegador**: una
  peticion armada a mano podia agendar un prestamo un domingo a las 3 de la
  manana. `POST /loans` aplica ahora las mismas reglas que la interfaz
  (Trabajador exento; Docente cualquier fecha pero dentro de 08:00-18:00;
  el resto solo el mismo dia, de lunes a viernes y en horario), y solo
  honra `es_indefinido` para Docente o Trabajador.
- **Sesiones vencidas mostraban pantallas vacias**: el refresco de estado
  del router ignoraba un `401` de `GET /users/{correo}`, asi que cuando la
  cookie expiraba (o quedaba invalidada por un cambio de contrasena) la
  persona seguia navegando una app sin datos, sin entender por que. Ahora
  ese `401` cierra sesion y devuelve a `/login`; cualquier otro error (red,
  500) no la saca de la app.
- **El borrador de solicitud sobrevivia al cierre de sesion**: el siguiente
  usuario que entraba en el mismo navegador veia la seleccion de recursos y
  el telefono de contacto de la persona anterior. `logout()` limpia ahora
  tambien el borrador del ticket y los mapas de detalles.
- **Las vistas adivinaban que unidad tenia cada prestamo** comparando
  subcadenas de los textos que se muestran en pantalla, un heuristico que
  se equivocaba en cuanto dos grupos compartian nombre. Ahora leen el campo
  `unidades` que expone la API.

## Lo que queda pendiente

No hay script de migracion de datos (usuarios/recursos/prestamos ya
existentes en la base de datos MySQL actual del proyecto Node). Si se
necesita traer datos reales, hay que escribir un script aparte que lea de
las tablas originales (`usuario`, `recurso`, `prestamo`, `detalle_prestamo`)
y las inserte en las tablas `pmi_*` con los nombres de columna nuevos (ver
tabla de equivalencias arriba). Los hashes de contrasena `bcrypt` de Node
son compatibles tal cual con `password_verify()` de PHP, no hace falta
rehashear.
