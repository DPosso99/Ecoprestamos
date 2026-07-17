<?php
/**
 * Template Name: Prestamos Inventario (App)
 *
 * Plantilla de pagina de ancho completo, sin el header/footer del tema
 * (Twenty Twenty-Five es un tema de bloques; get_header()/get_footer()
 * clasicos no aplican bien ahi, asi que esta plantilla se sirve sola).
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
<?php echo do_shortcode('[prestamos_inventario_app]'); ?>
<?php wp_footer(); ?>
</body>
</html>
