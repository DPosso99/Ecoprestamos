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

    /**
     * Formatos de imagen aceptados. Deliberadamente sin SVG: el endpoint de
     * imagen devuelve los bytes crudos en el origen del sitio, y un SVG puede
     * contener JavaScript.
     */
    const ALLOWED_IMAGE_TYPES = array('image/jpeg', 'image/png', 'image/gif', 'image/webp');

    /** Archivos temporales creados por maybe_parse_multipart_put() en esta request. */
    private static $temp_files = array();

    /**
     * Columnas de recurso que se devuelven al cliente: excluye la imagen
     * (LONGBLOB), que no es serializable a JSON y se sirve por su propio
     * endpoint. Publica porque las busquedas de PMI_Rest_Busqueda leen las
     * mismas columnas.
     *
     * `tiene_imagen` va calculado aqui para que el cliente sepa si merece la
     * pena pedir la foto: sin ese dato, el catalogo pedia una imagen por recurso
     * y el plugin respondia 404 en los que no la tienen (y con el catalogo lleno
     * de fotos, una peticion por recurso a la vez que atraviesa PHP y lee un
     * LONGBLOB). `LENGTH()` sobre el blob no lee los bytes: usa el largo.
     */
    public static $select_fields = 'id_recurso, nombre, ubicacion, estado, dia_compra, tipo, cantidad_total, cantidad_disponible, activo, (imagen IS NOT NULL AND LENGTH(imagen) > 0) AS tiene_imagen';

    /**
     * Borra los temporales del parseo manual de multipart al terminar la
     * request. Publico solo porque lo invoca register_shutdown_function().
     *
     * @return void
     */
    public static function cleanup_temp_files()
    {
        foreach (self::$temp_files as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
        self::$temp_files = array();
    }

    /**
     * Registra las rutas CRUD de recursos (inventario) y la ruta de imagen
     * bajo /wp-json/pmi/v1/.
     *
     * @return void
     */
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

    /**
     * GET /resources: lista todos los recursos del inventario (sin la
     * imagen). Requiere sesion iniciada.
     *
     * @return WP_REST_Response Lista de recursos.
     */
    public static function get_resources()
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT ' . self::$select_fields . ' FROM ' . PMI_DB::recurso(), ARRAY_A);
        return rest_ensure_response($rows);
    }

    /**
     * GET /resources/{id}: obtiene un recurso por su id (sin la imagen).
     * Requiere sesion iniciada.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_REST_Response|WP_Error El recurso, o 404 si no existe.
     */
    public static function get_resource(WP_REST_Request $request)
    {
        global $wpdb;
        $id = urldecode($request->get_param('id'));

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT ' . self::$select_fields . ' FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id),
            ARRAY_A
        );

        if (!$row) {
            $raw_id = $request->get_param('id');
            $row = $wpdb->get_row(
                $wpdb->prepare('SELECT ' . self::$select_fields . ' FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $raw_id),
                ARRAY_A
            );
        }

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
     *
     * @param WP_REST_Request $request Request PUT; se le inyectan los body params y file params parseados.
     * @return void
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

        if (!preg_match('/boundary=([^;\s]+)/i', $content_type, $matches)) {
            return;
        }
        $boundary = trim($matches[1], '"\'');

        $raw = $request->get_body();
        if (!$raw) {
            return;
        }

        $blocks = preg_split('/-{2}' . preg_quote($boundary, '/') . '/', $raw);
        $fields = array();
        $files = array();

        foreach ($blocks as $block) {
            $block = ltrim($block, "\r\n");
            if ($block === '' || $block === '--') {
                continue;
            }

            if (strpos($block, "\r\n\r\n") !== false) {
                list($headers, $content) = explode("\r\n\r\n", $block, 2);
                $content = preg_replace('/\r\n$/', '', $content);
            } elseif (strpos($block, "\n\n") !== false) {
                list($headers, $content) = explode("\n\n", $block, 2);
                $content = preg_replace('/\n$/', '', $content);
            } else {
                continue;
            }

            if (!preg_match('/name="([^"]+)"/', $headers, $name_match)) {
                continue;
            }
            $name = $name_match[1];

            if (preg_match('/filename="([^"]*)"/', $headers, $filename_match) && $filename_match[1] !== '') {
                preg_match('/Content-Type:\s*([^\r\n]+)/i', $headers, $type_match);
                $tmp_path = tempnam(sys_get_temp_dir(), 'pmi');
                file_put_contents($tmp_path, $content);

                // A diferencia de los archivos que sube PHP por si mismo,
                // estos los creamos nosotros y nadie los limpia: sin esto la
                // carpeta temporal del servidor crece con cada edicion.
                if (empty(self::$temp_files)) {
                    register_shutdown_function(array(__CLASS__, 'cleanup_temp_files'));
                }
                self::$temp_files[] = $tmp_path;

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

    /**
     * Extrae y valida el archivo de imagen ("Imagen") de una request de
     * creacion/edicion de recurso: valida tamano maximo (MAX_IMAGE_BYTES) y
     * que el mime-type sea de imagen.
     *
     * @param WP_REST_Request $request Request con los file params ya poblados.
     * @return array|WP_Error [bytes, mime] si hay imagen valida, [null, null] si no se envio imagen, o WP_Error 400 si es invalida.
     */
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

        // Lista blanca en vez de aceptar cualquier "image/*": image/svg+xml
        // tambien empieza por "image/", y estos bytes se sirven despues tal
        // cual desde GET /resources/{id}/imagen, en el mismo origen del sitio.
        // Un SVG con <script> seria XSS almacenado con la sesion de WordPress.
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, self::ALLOWED_IMAGE_TYPES, true)) {
            return new WP_Error('pmi_bad_request', 'Formato de imagen no permitido: usa JPG, PNG, GIF o WebP', array('status' => 400));
        }

        $bytes = file_get_contents($file['tmp_name']);
        return array($bytes, $mime);
    }

    /**
     * POST /resources: crea un recurso nuevo en el inventario, con imagen
     * opcional (multipart/form-data). Requiere rol Trabajador.
     *
     * @param WP_REST_Request $request Request con body_params (idRecurso, Nombre, Ubicacion, Estado, Dia_compra, Tipo, Cantidad_total, Cantidad_disponible, activo) y opcionalmente file_params["Imagen"].
     * @return WP_REST_Response|WP_Error Confirmacion con el idRecurso creado, o 400/409 si faltan datos o el recurso ya existe.
     */
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

        $estado = sanitize_textarea_field($body['Estado'] ?? 'Disponible');
        $cantidad_total = isset($body['Cantidad_total']) ? (int) $body['Cantidad_total'] : null;

        // cantidad_disponible es un valor derivado de los estados por unidad,
        // no un dato que el formulario pueda contradecir (ver PMI_Inventario).
        $cantidad_disponible = PMI_Inventario::disponibles(array('id_recurso' => $id, 'estado' => $estado));

        $wpdb->hide_errors();
        $inserted = $wpdb->insert(
            PMI_DB::recurso(),
            array(
                'id_recurso' => $id,
                'nombre' => sanitize_text_field($body['Nombre'] ?? ''),
                'ubicacion' => sanitize_text_field($body['Ubicacion'] ?? ''),
                'estado' => $estado,
                'dia_compra' => !empty($body['Dia_compra']) ? sanitize_text_field($body['Dia_compra']) : null,
                'tipo' => sanitize_text_field($body['Tipo'] ?? ''),
                'cantidad_total' => $cantidad_total,
                'cantidad_disponible' => $cantidad_disponible,
                'activo' => sanitize_textarea_field($body['activo'] ?? 'N/A'),
                'imagen' => $imagen,
                'imagen_tipo' => $imagen_tipo,
            ),
            array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s')
        );
        $wpdb->show_errors();

        if ($wpdb->last_error || !$inserted) {
            return new WP_Error('pmi_db_error', 'No se pudo crear el recurso en base de datos: ' . ($wpdb->last_error ?: 'Error desconocido'), array('status' => 500));
        }

        return rest_ensure_response(array('message' => 'Recurso creado', 'idRecurso' => $id));
    }

    /**
     * PUT /resources/{id}: actualiza un recurso existente (actualizacion
     * parcial), con reemplazo opcional de imagen via multipart/form-data.
     * Requiere rol Trabajador.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id" y los campos a actualizar (body params, posiblemente parseados a mano desde multipart).
     * @return WP_REST_Response|WP_Error Confirmacion, o 404/400 si el recurso no existe o la imagen es invalida.
     */
    public static function edit_resource(WP_REST_Request $request)
    {
        global $wpdb;
        self::maybe_parse_multipart_put($request);
        $id = urldecode($request->get_param('id'));
        $body = $request->get_body_params();

        $current = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id), ARRAY_A);
        if (!$current) {
            $raw_id = $request->get_param('id');
            $current = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $raw_id), ARRAY_A);
            if ($current) {
                $id = $raw_id;
            } else {
                return new WP_Error('pmi_not_found', 'Recurso no encontrado', array('status' => 404));
            }
        }

        $image = self::extract_image($request);
        if (is_wp_error($image)) {
            return $image;
        }
        list($imagen, $imagen_tipo) = $image;

        $activo = array_key_exists('activo', $body) ? sanitize_textarea_field($body['activo']) : ($current['activo'] ?? 'N/A');
        $estado = sanitize_textarea_field($body['Estado'] ?? $current['estado']);
        $new_id = !empty($body['idRecurso']) ? sanitize_textarea_field($body['idRecurso']) : $id;

        $data = array(
            'nombre' => sanitize_text_field($body['Nombre'] ?? $current['nombre']),
            'ubicacion' => sanitize_text_field($body['Ubicacion'] ?? $current['ubicacion']),
            'estado' => $estado,
            'dia_compra' => !empty($body['Dia_compra']) ? sanitize_text_field($body['Dia_compra']) : $current['dia_compra'],
            'tipo' => sanitize_text_field($body['Tipo'] ?? $current['tipo']),
            'cantidad_total' => array_key_exists('Cantidad_total', $body) ? (int) $body['Cantidad_total'] : $current['cantidad_total'],
            // Derivado de los estados por unidad, no de lo que mande el
            // formulario (ver PMI_Inventario).
            'cantidad_disponible' => PMI_Inventario::disponibles(array('id_recurso' => $new_id, 'estado' => $estado)),
            'activo' => $activo,
        );
        $formats = array('%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s');

        if ($imagen !== null) {
            $data['imagen'] = $imagen;
            $data['imagen_tipo'] = $imagen_tipo;
            $formats[] = '%s';
            $formats[] = '%s';
        }

        if ($new_id !== $id) {
            $data['id_recurso'] = $new_id;
            $formats[] = '%s';
            $wpdb->update(PMI_DB::detalle_prestamo(), array('recurso_id' => $new_id), array('recurso_id' => $id), array('%s'), array('%s'));
        }

        $wpdb->hide_errors();
        $updated = $wpdb->update(PMI_DB::recurso(), $data, array('id_recurso' => $id), $formats, array('%s'));
        $wpdb->show_errors();

        if ($wpdb->last_error) {
            return new WP_Error('pmi_db_error', 'No se pudo actualizar el recurso: ' . $wpdb->last_error, array('status' => 500));
        }

        return rest_ensure_response(array('message' => 'Recurso Actualizado', 'idRecurso' => $new_id));
    }

    /**
     * DELETE /resources/{id}: elimina un recurso del inventario. Requiere
     * rol Trabajador.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_REST_Response|WP_Error Confirmacion, o 404/409 si no existe o esta asociado a prestamos.
     */
    public static function delete_resource(WP_REST_Request $request)
    {
        global $wpdb;
        $id = urldecode($request->get_param('id'));

        $row = $wpdb->get_row($wpdb->prepare('SELECT id_recurso FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id), ARRAY_A);
        if (!$row) {
            $raw_id = $request->get_param('id');
            $row = $wpdb->get_row($wpdb->prepare('SELECT id_recurso FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $raw_id), ARRAY_A);
            if ($row) {
                $id = $raw_id;
            } else {
                return new WP_Error('pmi_not_found', 'Recurso no encontrado', array('status' => 404));
            }
        }

        // Un recurso que aparece en algun prestamo NO se puede borrar: borrar
        // sus detalles en cascada (como se hacia antes para esquivar el error
        // de llave foranea) destruye el historial de que se presto, a quien y
        // cuando, incluso de prestamos ya cerrados.
        $en_uso = (int) $wpdb->get_var($wpdb->prepare(
            'SELECT COUNT(*) FROM ' . PMI_DB::detalle_prestamo() . ' WHERE recurso_id = %s',
            $id
        ));

        if ($en_uso > 0) {
            return new WP_Error(
                'pmi_conflict',
                'No se puede eliminar el recurso porque aparece en ' . $en_uso . ' prestamo(s). Su historial debe conservarse.',
                array('status' => 409)
            );
        }

        $deleted = $wpdb->delete(PMI_DB::recurso(), array('id_recurso' => $id), array('%s'));

        if (!$deleted) {
            return new WP_Error('pmi_delete_error', 'No se pudo eliminar el recurso', array('status' => 500));
        }

        return rest_ensure_response(array('message' => 'Recurso eliminado correctamente'));
    }

    /**
     * GET /resources/{id}/imagen: sirve los bytes crudos de la imagen de un
     * recurso con su Content-Type original, escribiendo la respuesta
     * directamente y terminando la ejecucion (no pasa por WP_REST_Response
     * porque esta siempre serializa a JSON). Requiere sesion iniciada.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_Error 404 si el recurso no existe o no tiene imagen; en caso de exito la funcion termina la ejecucion con exit y no retorna.
     */
    public static function get_resource_image(WP_REST_Request $request)
    {
        global $wpdb;
        $id = urldecode($request->get_param('id'));

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT imagen, imagen_tipo FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $id),
            ARRAY_A
        );

        if (!$row) {
            $raw_id = $request->get_param('id');
            $row = $wpdb->get_row(
                $wpdb->prepare('SELECT imagen, imagen_tipo FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s', $raw_id),
                ARRAY_A
            );
        }

        if (!$row || !$row['imagen']) {
            return new WP_Error('pmi_not_found', 'Imagen no encontrada', array('status' => 404));
        }

        // El tipo guardado se acota a la lista blanca de subida: si una fila
        // vieja o importada a mano trae otra cosa, se sirve como binario
        // generico en vez de dejar que el navegador lo interprete.
        $tipo = in_array($row['imagen_tipo'], self::ALLOWED_IMAGE_TYPES, true)
            ? $row['imagen_tipo']
            : 'application/octet-stream';

        // WP_REST_Response siempre serializa $data como JSON, asi que para
        // servir bytes crudos escribimos la respuesta directamente y
        // detenemos la ejecucion de WordPress aqui.
        status_header(200);
        header('Content-Type: ' . $tipo);
        header('Content-Length: ' . strlen($row['imagen']));
        // Sin nosniff, un navegador puede ignorar el Content-Type y ejecutar
        // el contenido como HTML/SVG en el origen del sitio.
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline');
        // La foto no cambia a cada rato y sale de la base en cada peticion, asi
        // que se cachea en privado un rato corto: si el MediaLab reemplaza una
        // imagen, el cambio se ve en minutos y no se re-descarga en cada
        // navegacion por el catalogo.
        header('Cache-Control: private, max-age=300');
        echo $row['imagen'];
        exit;
    }
}
