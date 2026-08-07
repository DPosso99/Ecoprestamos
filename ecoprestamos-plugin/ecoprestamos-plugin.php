<?php
/**
 * Plugin Name: Prestamos e Inventario (Medialab)
 * Description: Backend de registro de prestamos y manejo de inventario, migrado desde una app Node/Express+React a un plugin de WordPress con tablas SQL propias ($wpdb + dbDelta) y una API REST bajo /wp-json/pmi/v1/.
 * Version: 1.0.0
 * Author: Medialab
 * Text Domain: ecoprestamos-plugin
 * Requires at least: 6.2
 * Requires PHP: 7.4
 */

// Nota: se requiere WordPress 6.2+ porque $wpdb->prepare() solo a partir de
// esa version inserta NULL real cuando se le pasa un valor PHP null en un
// placeholder %s/%d (antes lo convertia a '' o 0). Varias columnas
// opcionales (Cantidad_total, Dia_compra, etc.) dependen de ese comportamiento.

if (!defined('ABSPATH')) {
    exit;
}

define('PMI_PLUGIN_FILE', __FILE__);
define('PMI_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PMI_PLUGIN_URL', plugin_dir_url(__FILE__));
define('PMI_VERSION', '1.0.0');

require_once PMI_PLUGIN_DIR . 'includes/class-pmi-db.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-utils.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-auth.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-activator.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-rest-usuarios.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-rest-recursos.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-rest-prestamos.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-rest-detalles.php';
require_once PMI_PLUGIN_DIR . 'includes/class-pmi-rest-busqueda.php';

register_activation_hook(__FILE__, array('PMI_Activator', 'activate'));

add_action('rest_api_init', function () {
    PMI_Rest_Usuarios::register_routes();
    PMI_Rest_Recursos::register_routes();
    PMI_Rest_Prestamos::register_routes();
    PMI_Rest_Detalles::register_routes();
    PMI_Rest_Busqueda::register_routes();
});

/**
 * Muestra en el admin de WordPress cualquier problema detectado al crear
 * triggers o llaves foraneas durante la activacion (ver class-pmi-activator).
 */
add_action('admin_notices', function () {
    $notices = get_option(PMI_Activator::NOTICES_OPTION);
    if (empty($notices) || !current_user_can('manage_options')) {
        return;
    }

    foreach ($notices as $notice) {
        printf('<div class="notice notice-warning"><p>%s</p></div>', esc_html($notice));
    }

    delete_option(PMI_Activator::NOTICES_OPTION);
});
