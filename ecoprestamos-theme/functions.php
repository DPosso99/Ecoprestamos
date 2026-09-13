<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Encola siempre los assets de la app (tema de proposito unico: no hay
 * ninguna pagina de este sitio que no deba mostrarla), enganchado al hook
 * estandar wp_enqueue_scripts para que wp_head() los imprima a tiempo.
 * Si se encolaran dentro del <body> (como hacia el shortcode original) los
 * <link> de CSS quedarian fuera de wp_head() y nunca se imprimirian.
 */
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style('ecoprestamos-theme-style', get_stylesheet_directory_uri() . '/style.css');

    $assets_uri = get_stylesheet_directory_uri() . '/assets';
    $app_file = get_stylesheet_directory() . '/assets/js/app.js';
    $version = (defined('WP_DEBUG') && WP_DEBUG) ? time() : (file_exists($app_file) ? filemtime($app_file) : '1.0.2');

    wp_enqueue_style('pmi-app', $assets_uri . '/css/app.css', array(), $version);

    wp_enqueue_script('pmi-app', $assets_uri . '/js/app.js', array(), $version, true);
    wp_script_add_data('pmi-app', 'type', 'module');

    wp_localize_script('pmi-app', 'PMI_CONFIG', array(
        'restUrl' => esc_url_raw(rest_url('pmi/v1/')),
        'nonce' => wp_create_nonce('wp_rest'),
        'pluginVersion' => defined('PMI_VERSION') ? PMI_VERSION : '',
        'themeVersion' => $version,
        'themeUrl' => get_stylesheet_directory_uri(),
        'logoUrl' => get_stylesheet_directory_uri() . '/pix/Logo_EAFIT.svg',
        'mascotUrl' => get_stylesheet_directory_uri() . '/pix/Armadillo_libro.png',
    ));
});

/**
 * Imprime el contenedor donde la app JS hace mount. Se llama directamente
 * desde las plantillas del tema (index.php, ecoprestamos-theme.php) para que
 * la app este disponible con solo activar el tema, sin depender de que
 * alguien inserte un shortcode en el contenido de una pagina.
 */
function pmi_render_app() {
    echo '<div id="root"></div>';
}

/** Agrega type="module" al <script> encolado con wp_script_add_data(...,'type','module'). */
add_filter('script_loader_tag', function ($tag, $handle) {
    if ($handle !== 'pmi-app') {
        return $tag;
    }
    if (strpos($tag, 'type=') !== false) {
        return $tag;
    }
    return str_replace(' src=', ' type="module" src=', $tag);
}, 10, 2);
