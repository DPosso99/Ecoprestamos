<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de:
 *  - Backend/routes/ResSearch.routes.js + Controllers/Ressearchs.controllers.js
 *  - Backend/routes/adminSearch.routes.js + Controllers/adminsearch.controllers.js
 */
class PMI_Rest_Busqueda
{
    public static function register_routes()
    {
        register_rest_route('pmi/v1', '/resources/search/tipo/(?P<tipo>[^/]+)', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'by_tipo'),
            'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
        ));

        register_rest_route('pmi/v1', '/resources/search/nombre/(?P<nombre>[^/]+)', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'by_nombre'),
            'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
        ));

        register_rest_route('pmi/v1', '/resources/search/salon/(?P<ubicacion>[^/]+)', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'by_salon'),
            'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
        ));

        register_rest_route('pmi/v1', '/admin/baneados', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'usuarios_baneados'),
            'permission_callback' => array('PMI_Auth', 'permission_worker'),
        ));

        register_rest_route('pmi/v1', '/admin/prestamos-por-fecha/(?P<fecha>\d{4}-\d{2}-\d{2})', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'prestamos_por_fecha'),
            'permission_callback' => array('PMI_Auth', 'permission_worker'),
        ));
    }

    public static function by_tipo(WP_REST_Request $request)
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE tipo = %s', $request->get_param('tipo')), ARRAY_A);
        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hay recursos de este tipo', array('status' => 404));
        }
        return rest_ensure_response($rows);
    }

    public static function by_nombre(WP_REST_Request $request)
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE nombre = %s', $request->get_param('nombre')), ARRAY_A);
        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hay recursos con este nombre', array('status' => 404));
        }
        return rest_ensure_response($rows);
    }

    public static function by_salon(WP_REST_Request $request)
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE ubicacion = %s', $request->get_param('ubicacion')), ARRAY_A);
        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hay recursos en este salon', array('status' => 404));
        }
        return rest_ensure_response($rows);
    }

    public static function usuarios_baneados()
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE baneado = 1', ARRAY_A);
        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hay usuarios baneados', array('status' => 404));
        }
        return rest_ensure_response($rows);
    }

    public static function prestamos_por_fecha(WP_REST_Request $request)
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . PMI_DB::prestamo() . ' WHERE DATE(fecha_prestamo) = %s',
            $request->get_param('fecha')
        ), ARRAY_A);

        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hubo prestamos esa fecha', array('status' => 404));
        }
        return rest_ensure_response($rows);
    }
}
