# Tema de WordPress (frontend)

Esta carpeta contiene un **tema de WordPress independiente, listo para
usar**, con el frontend completo de la app ya construido en JavaScript
plano (sin React, sin Node.js, sin paso de build). No tiene tema padre por
defecto (`Template:` en blanco en `style.css`); si prefieres usarlo como
hijo de **Hello Elementor**, agrega `Template: hello-elementor` a la
cabecera de `style.css` (requiere tener Hello Elementor instalado en el
sitio).

## Instalación

1. Copia esta carpeta a `wp-content/themes/ecoprestamos-theme/` y actívalo
   (Apariencia → Temas).
2. Listo. `index.php` muestra la app directamente en cualquier URL del
   sitio — **no hace falta ningún shortcode** ni crear una página especial.
   La URL puede tener cualquier nivel de anidación (`/prestamos/`,
   `/ecolabs/ecoprestamos/`, etc.) — el ruteo interno de la app es por hash
   (`#/catalogo`, `#/ops`, ...), así que no depende en absoluto de la ruta
   real de la página.

Si en cambio quieres mostrar la app solo dentro de una página puntual de un
sitio que usa otro tema, usa la plantilla opcional
[`ecoprestamos-theme.php`](ecoprestamos-theme.php) (aparece como
**"Prestamos Inventario (App)"** en el selector de plantilla del editor de
páginas) — sirve la app a pantalla completa, sin el header/footer del tema.

No hay ningún paso de build, ni antes ni después de editar el código: los
archivos en `assets/js/` se sirven directo al navegador como módulos ES
nativos (`<script type="module">`).

## Estructura del tema

```
ecoprestamos-theme/
├── style.css                      Cabecera del tema (sin tema padre, o Hello Elementor)
├── functions.php                  pmi_render_app() + enqueue de assets
├── index.php                      Plantilla principal: muestra la app en cualquier URL del sitio
├── ecoprestamos-theme.php         Plantilla opcional de pagina de ancho completo ("Template Name")
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
