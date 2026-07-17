# Integración del frontend en WordPress

Esta carpeta contiene un **tema hijo de WordPress, listo para usar**
([`medialab-prestamos-child/`](medialab-prestamos-child)) con el frontend
completo de la app ya construido en JavaScript plano (sin React, sin
Node.js, sin paso de build). Es hijo de **Twenty Twenty-Five** por
defecto; si tu sitio usa otro tema, cambia la línea `Template:` en
`medialab-prestamos-child/style.css`.

## Instalación

1. Copia `medialab-prestamos-child/` a
   `wp-content/themes/medialab-prestamos-child/` y actívalo (Apariencia →
   Temas). Trae el shortcode `[prestamos_inventario_app]` ya registrado en
   `functions.php`.
2. Crea (o edita) una página de WordPress, pega el shortcode
   `[prestamos_inventario_app]` en el contenido.
3. En el panel derecho del editor de esa página, en **Plantilla**,
   selecciona **"Prestamos Inventario (App)"**
   ([`page-prestamos-template.php`](medialab-prestamos-child/page-prestamos-template.php)) —
   sirve la app a pantalla completa, sin el header/footer del tema. Sin
   este paso, la app queda encajada dentro del layout normal del tema
   (columna angosta, con el ancho de contenido del tema padre).
4. Publica la página. La URL puede tener cualquier nivel de anidación
   (`/prestamos/`, `/ecolabs/ecoprestamos/`, etc.) — el ruteo interno de
   la app es por hash (`#/catalogo`, `#/ops`, ...), así que no depende en
   absoluto de la ruta real de la página.

No hay ningún paso de build, ni antes ni después de editar el código: los
archivos en `assets/js/` se sirven directo al navegador como módulos ES
nativos (`<script type="module">`).

## Estructura del tema

```
medialab-prestamos-child/
├── style.css                      Cabecera del tema hijo
├── functions.php                  Shortcode [prestamos_inventario_app] + enqueue de assets
├── page-prestamos-template.php    Plantilla de pagina de ancho completo
└── assets/
    ├── css/app.css                    Sistema de diseño (tokens de color, tarjetas, botones, etc.)
    └── js/
        ├── app.js                     Punto de entrada
        ├── router.js                  Router por hash + guards de rol (estudiante/trabajador)
        ├── state.js                   Estado global (auth, catalogo, prestamos, usuarios, ticket)
        ├── api.js                     Cliente REST hacia pmi/v1 (nonce automatico en escrituras)
        ├── dom.js                     Helpers (escape HTML, formato de fecha, navegacion)
        ├── components/
        │   ├── topbar.js                  Barra superior (logo, buscador, menu de usuario)
        │   └── modal.js                   Modal generico reutilizable
        └── views/                     Una funcion de render por pantalla (ver README principal)
```

## Notas técnicas

- **Autenticación**: `functions.php` localiza `window.PMI_CONFIG` con la
  URL del REST API (`rest_url('pmi/v1/')`) y un nonce (`wp_create_nonce('wp_rest')`).
  `api.js` usa esa URL como base y agrega el nonce como header
  `X-WP-Nonce` en cada request de escritura (POST/PUT/DELETE).
- **Sesión**: el plugin usa una cookie propia (no `wp_users`), guardada en
  `sessionStorage` del lado del cliente igual que el proyecto original
  (`state.js`, clave `medialab_user`).
- **Sin build ni caché de assets que romper**: al editar cualquier archivo
  en `assets/js/` o `assets/css/`, solo hace falta recargar la página
  (o vaciar caché del navegador si tienes un plugin de caché activo en
  WordPress).

Ver [`../NOTES.md`](../NOTES.md) para las decisiones de diseño y los bugs
encontrados/corregidos durante las pruebas.
