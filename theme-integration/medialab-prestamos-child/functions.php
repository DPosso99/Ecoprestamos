<?php
if (!defined('ABSPATH')) {
    exit;
}

add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style('medialab-parent-style', get_template_directory_uri() . '/style.css');
});

/**
 * [prestamos_inventario_app] monta el div donde la app JS hace mount.
 *
 * La app es JavaScript plano (modulos ES nativos, sin build/Node): vive en
 * assets/js/ de este tema y se carga directo con <script type="module">.
 * No depende del repo original de React en ningun momento.
 */
add_shortcode('prestamos_inventario_app', function () {
    $assets_uri = get_stylesheet_directory_uri() . '/assets';
    $version = defined('PMI_VERSION') ? PMI_VERSION : '1.0.0';

    wp_enqueue_style('pmi-app', $assets_uri . '/css/app.css', array(), $version);

    wp_enqueue_script('pmi-app', $assets_uri . '/js/app.js', array(), $version, true);
    wp_script_add_data('pmi-app', 'type', 'module');

    wp_localize_script('pmi-app', 'PMI_CONFIG', array(
        'restUrl' => esc_url_raw(rest_url('pmi/v1/')),
        'nonce' => wp_create_nonce('wp_rest'),
    ));

    return '<div id="root"></div>';
});

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
