<?php
/**
 * Plantilla principal del tema (obligatoria: sin tema padre, este archivo es
 * el que WordPress usa para cualquier URL del sitio que no tenga una
 * plantilla mas especifica). Muestra la app directamente, sin necesidad de
 * insertar ningun shortcode en el contenido de una pagina: basta con activar
 * este tema para que la app quede disponible.
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
