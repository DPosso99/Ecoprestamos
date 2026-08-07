<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de Backend/routes/inventory.routes.js + Controllers/inventory.controllers.js.
 *
 * La imagen se guarda igual que en el proyecto original: como LONGBLOB en la
 * propia fila de recurso (no en la Media Library de WordPress), y se sirve
 * por un endpoint dedicado que devuelve los bytes con su Content-Type.
 */
class PMI_Rest_Recursos
{
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // igual al limite de multer original

    private static $select_fields = 'id_recurso, nombre, ubicacion, estado, dia_compra, tipo, cantidad_total, cantidad_disponible, activo';

    public static function register_routes()
    {
        register_rest_route('pmi/v1', '/resources', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_resources'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'create_resource'),
                'permission_callback' => array('PMI_Auth', 'permission_worker'),
            ),
        ));

        register_rest_route('pmi/v1', '/resources/(?P<id>[^/]+)', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_resource'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array(__CLASS__, 'edit_resource'),
                'permission_callback' => array('PMI_Auth', 'permission_worker'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_resource'),
                'permission_callback' => array('PMI_Auth', 'permission_worker'),
            ),
        ));

        register_rest_route('pmi/v1', '/resources/(?P<id>[^/]+)/imagen', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_resource_image'),
            'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
        ));
    }

    public static function get_resources()
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT ' . self::$select_fields . ' FROM ' . PMI_DB::recurso(), ARRAY_A);
        return rest_ensure_response($rows);
    }

    public static function get_resource(WP_REST_Request $request)
    {
        global $wpdb;
        $id = $request->get_param('id');

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT ' . self::$select_fields . ' FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id),
            ARRAY_A
        );

        if (!$row) {
            return new WP_Error('pmi_not_found', 'Recurso no encontrado', array('status' => 404));
        }

        return rest_ensure_response($row);
    }

    /**
     * PHP solo rellena $_FILES/$_POST automaticamente para multipart/form-data
     * en requests POST; en PUT (usado por EditResource para reemplazar la
     * imagen, igual que el original con `upload.single` en la ruta PUT) el
     * cuerpo llega crudo y hay que parsearlo a mano.
     */
    private static function maybe_parse_multipart_put(WP_REST_Request $request)
    {
        if ($request->get_method() !== 'PUT') {
            return;
        }

        $content_type = (string) $request->get_header('content-type');
        if (stripos($content_type, 'multipart/form-data') === false) {
            return;
        }

        if (!preg_match('/boundary=(.*)$/i', $content_type, $matches)) {
            return;
        }
        $boundary = trim($matches[1], '"');

        $raw = $request->get_body();
        if (!$raw) {
            return;
        }

        $blocks = preg_split('/-{2}' . preg_quote($boundary, '/') . '/', $raw);
        $fields = array();
        $files = array();

        foreach ($blocks as $block) {
            $block = ltrim($block, "\r\n");
            if ($block === '' || $block === '--' || strpos($block, "\r\n\r\n") === false) {
                continue;
            }

            list($headers, $content) = explode("\r\n\r\n", $block, 2);
            $content = preg_replace('/\r\n$/', '', $content);

            if (!preg_match('/name="([^"]+)"/', $headers, $name_match)) {
                continue;
            }
            $name = $name_match[1];

            if (preg_match('/filename="([^"]*)"/', $headers, $filename_match) && $filename_match[1] !== '') {
                preg_match('/Content-Type:\s*([^\r\n]+)/i', $headers, $type_match);
                $tmp_path = tempnam(sys_get_temp_dir(), 'pmi');
                file_put_contents($tmp_path, $content);

                $files[$name] = array(
                    'name' => $filename_match[1],
                    'type' => isset($type_match[1]) ? trim($type_match[1]) : 'application/octet-stream',
                    'tmp_name' => $tmp_path,
                    'error' => UPLOAD_ERR_OK,
                    'size' => strlen($content),
                );
            } else {
                $fields[$name] = $content;
            }
        }

        if (!empty($fields)) {
            $request->set_body_params(array_merge($request->get_body_params(), $fields));
        }
        if (!empty($files)) {
            $request->set_file_params(array_merge($request->get_file_params(), $files));
        }
    }

    private static function extract_image(WP_REST_Request $request)
    {
        $files = $request->get_file_params();
        if (empty($files['Imagen']) || $files['Imagen']['error'] !== UPLOAD_ERR_OK) {
            return array(null, null);
        }

        $file = $files['Imagen'];

        if ($file['size'] > self::MAX_IMAGE_BYTES) {
            return new WP_Error('pmi_bad_request', 'La imagen supera el tamano maximo permitido (5MB)', array('status' => 400));
        }

        $mime = mime_content_type($file['tmp_name']);
        if (strpos($mime, 'image/') !== 0) {
            return new WP_Error('pmi_bad_request', 'Solo se permiten imagenes', array('status' => 400));
        }

        $bytes = file_get_contents($file['tmp_name']);
        return array($bytes, $mime);
    }

    public static function create_resource(WP_REST_Request $request)
    {
        global $wpdb;
        $body = $request->get_body_params();

        $id = sanitize_text_field($body['idRecurso'] ?? '');
        if (!$id) {
            return new WP_Error('pmi_bad_request', 'idRecurso es obligatorio', array('status' => 400));
        }

        $image = self::extract_image($request);
        if (is_wp_error($image)) {
            return $image;
        }
        list($imagen, $imagen_tipo) = $image;

        $existing = $wpdb->get_var($wpdb->prepare('SELECT id_recurso FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id));
        if ($existing) {
            return new WP_Error('pmi_conflict', 'El recurso ya existe', array('status' => 409));
        }

        $cantidad_total = isset($body['Cantidad_total']) ? (int) $body['Cantidad_total'] : null;
        $cantidad_disponible = isset($body['Cantidad_disponible']) ? (int) $body['Cantidad_disponible'] : $cantidad_total;

        // $wpdb->insert() maneja NULL correctamente para columnas nullable
        // (dia_compra, cantidad_total, imagen...); $wpdb->query($wpdb->prepare())
        // con %s/%d crudo NO lo hace de forma confiable (guarda '' o
        // '0000-00-00' en vez de NULL segun la version de WordPress).
        $wpdb->insert(
            PMI_DB::recurso(),
            array(
                'id_recurso' => $id,
                'nombre' => sanitize_text_field($body['Nombre'] ?? ''),
                'ubicacion' => sanitize_text_field($body['Ubicacion'] ?? ''),
                'estado' => sanitize_text_field($body['Estado'] ?? 'Disponible'),
                'dia_compra' => !empty($body['Dia_compra']) ? sanitize_text_field($body['Dia_compra']) : null,
                'tipo' => sanitize_text_field($body['Tipo'] ?? ''),
                'cantidad_total' => $cantidad_total,
                'cantidad_disponible' => $cantidad_disponible,
                'activo' => sanitize_text_field($body['activo'] ?? 'N/A'),
                'imagen' => $imagen,
                'imagen_tipo' => $imagen_tipo,
            ),
            array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s')
        );

        return rest_ensure_response(array('message' => 'Recurso creado', 'idRecurso' => $id));
    }

    public static function edit_resource(WP_REST_Request $request)
    {
        global $wpdb;
        self::maybe_parse_multipart_put($request);
        $id = $request->get_param('id');
        $body = $request->get_body_params();

        $current = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id), ARRAY_A);
        if (!$current) {
            return new WP_Error('pmi_not_found', 'Recurso no encontrado', array('status' => 404));
        }

        $image = self::extract_image($request);
        if (is_wp_error($image)) {
            return $image;
        }
        list($imagen, $imagen_tipo) = $image;

        $cantidad_disponible = array_key_exists('Cantidad_disponible', $body) ? (int) $body['Cantidad_disponible'] : $current['cantidad_disponible'];
        $activo = array_key_exists('activo', $body) ? sanitize_text_field($body['activo']) : ($current['activo'] ?? 'N/A');

        $data = array(
            'nombre' => sanitize_text_field($body['Nombre'] ?? $current['nombre']),
            'ubicacion' => sanitize_text_field($body['Ubicacion'] ?? $current['ubicacion']),
            'estado' => sanitize_text_field($body['Estado'] ?? $current['estado']),
            'dia_compra' => !empty($body['Dia_compra']) ? sanitize_text_field($body['Dia_compra']) : $current['dia_compra'],
            'tipo' => sanitize_text_field($body['Tipo'] ?? $current['tipo']),
            'cantidad_total' => array_key_exists('Cantidad_total', $body) ? (int) $body['Cantidad_total'] : $current['cantidad_total'],
            'cantidad_disponible' => $cantidad_disponible,
            'activo' => $activo,
        );
        $formats = array('%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s');

        if ($imagen !== null) {
            $data['imagen'] = $imagen;
            $data['imagen_tipo'] = $imagen_tipo;
            $formats[] = '%s';
            $formats[] = '%s';
        }

        $wpdb->update(PMI_DB::recurso(), $data, array('id_recurso' => $id), $formats, array('%s'));

        return rest_ensure_response(array('message' => 'Recurso Actualizado'));
    }

    public static function delete_resource(WP_REST_Request $request)
    {
        global $wpdb;
        $id = $request->get_param('id');

        $wpdb->hide_errors();
        $deleted = $wpdb->delete(PMI_DB::recurso(), array('id_recurso' => $id), array('%s'));
        $wpdb->show_errors();

        if ($wpdb->last_error) {
            return new WP_Error('pmi_conflict', 'No se puede eliminar el recurso porque esta asociado a uno o mas prestamos', array('status' => 409));
        }

        if (!$deleted) {
            return new WP_Error('pmi_not_found', 'Recurso no encontrado', array('status' => 404));
        }

        return rest_ensure_response(array('message' => 'Recurso eliminado'));
    }

    public static function get_resource_image(WP_REST_Request $request)
    {
        global $wpdb;
        $id = $request->get_param('id');

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT imagen, imagen_tipo FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id),
            ARRAY_A
        );

        if (!$row || !$row['imagen']) {
            return new WP_Error('pmi_not_found', 'Imagen no encontrada', array('status' => 404));
        }

        // WP_REST_Response siempre serializa $data como JSON, asi que para
        // servir bytes crudos escribimos la respuesta directamente y
        // detenemos la ejecucion de WordPress aqui.
        status_header(200);
        header('Content-Type: ' . $row['imagen_tipo']);
        header('Content-Length: ' . strlen($row['imagen']));
        echo $row['imagen'];
        exit;
    }
}
