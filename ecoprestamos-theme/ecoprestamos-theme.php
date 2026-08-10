<?php
/**
 * Template Name: Prestamos Inventario (App)
 *
 * Plantilla de pagina de ancho completo, sin el header/footer de ningun
 * tema padre (este tema no tiene tema padre; se sirve sola). Opcional: solo
 * hace falta si se quiere mostrar la app en una pagina especifica ademas de
 * index.php, que ya la muestra en cualquier URL del sitio sin shortcode.
 * Selecciona "Prestamos Inventario (App)" como plantilla en el editor de
 * la pagina de WordPress donde debe vivir la aplicacion.
 */
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?php wp_title(''); ?></title>
<?php wp_head(); ?>
</head>
<body <?php body_class('pmi-app-wrapper'); ?>>
<?php pmi_render_app(); ?>
<?php wp_footer(); ?>
</body>
</html>
