# Prestamos e Inventario — WordPress

Sistema de registro de préstamos y manejo de inventario para un laboratorio
(Medialab), migrado desde una app independiente Node.js/Express + React
hacia un **plugin + tema de WordPress**, sin hosting adicional: toda la
aplicación vive dentro de una instalación de WordPress normal, usando su
propia base de datos MySQL.

Este repositorio es independiente del proyecto original (React/Vue +
Node.js), que sigue existiendo y manteniéndose por separado. No hay código
copiado de ese repo — es una reimplementación completa:

- **Backend**: traducido de Express/`mysql2` a PHP (`$wpdb` + REST API de
  WordPress).
- **Frontend**: reconstruido desde cero en **JavaScript plano** (módulos ES
  nativos del navegador, sin React, sin Node.js, sin paso de build). Todo
  el código — backend y frontend — se edita y se sirve directamente desde
  WordPress.

## Estructura

```
prestamos-wordpress/
├── plugin/                                Plugin de WordPress (backend)
│   ├── prestamos-inventario.php              Archivo principal del plugin
│   ├── includes/                             Clases: tablas, auth, rutas REST, logica de negocio
│   │   ├── class-pmi-activator.php              Crea tablas/triggers/FKs en la activacion
│   │   ├── class-pmi-auth.php                   Sesion (cookie propia) + nonce de WP
│   │   ├── class-pmi-db.php                     Nombres de tabla (prefijo pmi_)
│   │   ├── class-pmi-utils.php                  Helpers (fechas, etc.)
│   │   └── class-pmi-rest-*.php                 Controladores REST: usuarios, recursos, prestamos, detalles, busqueda
│   └── sql/                                  Definiciones de tabla (dbDelta), triggers y FKs
│
├── theme-integration/
│   ├── README.md                             Como instalar/activar el tema
│   └── medialab-prestamos-child/             Tema hijo de WordPress (frontend, listo para usar)
│       ├── functions.php                        Registra el shortcode [prestamos_inventario_app]
│       ├── page-prestamos-template.php           Plantilla de pagina de ancho completo
│       ├── style.css                             Cabecera del tema hijo (Template: twentytwentyfive)
│       └── assets/
│           ├── css/app.css                       Sistema de diseño (tokens de color, componentes)
│           └── js/                               App JS (modulos ES, sin build)
│               ├── app.js, router.js, state.js, api.js, dom.js
│               ├── components/                      topbar.js, modal.js
│               └── views/                            una vista por pantalla (ver tabla abajo)
│
├── README.md                              Este archivo
└── NOTES.md                               Decisiones de migracion, equivalencias, bugs encontrados y corregidos
```

## Qué hace el plugin

- Crea 4 tablas propias con prefijo `{wp_prefix}pmi_` (`usuario`, `recurso`,
  `prestamo`, `detalle_prestamo`) usando `dbDelta()`, más llaves foráneas y
  dos triggers de inventario (ajustan `Cantidad_disponible`/`Estado` del
  recurso automáticamente al prestar/devolver), ejecutados vía
  `$wpdb->query()` en la activación (`dbDelta()` no soporta `FOREIGN KEY`
  ni `TRIGGER`).
- Expone una API REST bajo `/wp-json/pmi/v1/...` equivalente a las rutas
  Express originales (usuarios, recursos, préstamos, detalles, búsquedas).
- Autenticación propia (no usa `wp_users`): tabla `pmi_usuario` con
  contraseñas `bcrypt` (`password_hash`/`password_verify`), sesión vía
  cookie propia firmada (HMAC), y protección CSRF con el sistema de nonces
  de WordPress (`X-WP-Nonce`) en cada request de escritura.

## Qué hace el tema

Un tema hijo (`medialab-prestamos-child`) que registra el shortcode
`[prestamos_inventario_app]`. Al insertarlo en cualquier página, monta una
app de una sola página (SPA) con ruteo por hash (`#/catalogo`, `#/ops`,
etc.) — por eso funciona igual sin importar en qué URL o nivel de
anidación viva la página (`/prestamos/`, `/ecolabs/ecoprestamos/`, etc.).

Pantallas incluidas:

| Vista | Rol | Archivo |
|---|---|---|
| Login / Registro | público | `views/login.js` |
| Catálogo de recursos | Estudiante | `views/catalogo.js` |
| Nueva solicitud (wizard 3 pasos) | Estudiante | `views/nueva-solicitud.js` |
| Mis solicitudes | Estudiante | `views/mis-solicitudes.js` |
| Detalle de solicitud | Estudiante | `views/detalle-pedido.js` |
| Mis préstamos entregados | Estudiante | `views/mis-prestamos.js` |
| Panel / Dashboard | Trabajador | `views/ops-dashboard.js` |
| Bandeja de solicitudes | Trabajador | `views/ops-solicitudes.js` |
| Detalle de préstamo + marcar entregado | Trabajador | `views/ops-ticket.js` |
| Gestión de catálogo (CRUD + imagen) | Trabajador | `views/ops-catalogo.js` |
| Gestión de usuarios (CRUD + baneo) | Trabajador | `views/ops-usuarios.js` |

## Instalación

1. Copia la carpeta `plugin/` a `wp-content/plugins/prestamos-inventario/`
   y actívalo desde **Plugins → Plugins instalados**. Si el usuario de la
   base de datos no tiene privilegios `TRIGGER` o para agregar
   `FOREIGN KEY` (común en algunos hostings compartidos), verás un aviso
   en el admin explicando qué falló — la app sigue funcionando, solo sin
   esa validación extra a nivel de base de datos.
2. Copia `theme-integration/medialab-prestamos-child/` a
   `wp-content/themes/medialab-prestamos-child/` y actívalo (Apariencia →
   Temas). Es un tema hijo de **Twenty Twenty-Five**; si tu sitio usa otro
   tema, ajusta la línea `Template:` en `style.css`.
3. Crea una página, pon el shortcode `[prestamos_inventario_app]` en el
   contenido, y en el panel derecho del editor selecciona la plantilla
   **"Prestamos Inventario (App)"** (ancho completo, sin el header/footer
   del tema). Publícala.

Detalles y variantes en [`theme-integration/README.md`](theme-integration/README.md).

### Probar localmente (Local by Flywheel, MAMP, etc.)

No hace falta nada más que un WordPress corriendo con PHP y MySQL — no se
requiere Node.js, npm, ni ningún paso de build, ni antes ni después de
publicar cambios en el frontend (es JavaScript plano servido tal cual).

## Ver también

- [`NOTES.md`](NOTES.md) — equivalencias detalladas con el proyecto
  original, decisiones de migración, y una lista de bugs reales
  encontrados y corregidos durante las pruebas (incluye uno heredado del
  proyecto original: un trigger de MySQL que nunca marcaba un recurso
  como "Ocupado").
- [`theme-integration/README.md`](theme-integration/README.md) — cómo
  instalar y activar el tema paso a paso.
