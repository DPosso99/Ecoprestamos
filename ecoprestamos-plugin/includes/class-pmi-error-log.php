<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Manejo centralizado de errores del backend: registra cada error en un
 * buffer rotativo (visible en el panel "Medialab Prestamos" del admin) y
 * avisa por correo a medialab@eafit.edu.co cuando algo realmente se rompe
 * (500, fatal error), en vez de que el usuario solo vea un 500 generico en
 * la consola del navegador sin que nadie del equipo se entere.
 *
 * Deliberadamente NO se usa para errores esperables del negocio (400/401/
 * 403/404/409 como "correo ya existe" o "prestamo no encontrado"): esos ya
 * llegan al usuario con un mensaje claro y no requieren intervencion.
 */
class PMI_Error_Log
{
    const OPTION = 'pmi_error_log';
    const MAX_ENTRIES = 100;
    const NOTIFY_EMAIL = 'medialab@eafit.edu.co';

    /** Evita reenviar el mismo correo mas de una vez cada 15 minutos. */
    const NOTIFY_THROTTLE = 15 * MINUTE_IN_SECONDS;

    /**
     * Punto de entrada principal: registra el error y, si no esta
     * throttled, envia el correo de aviso.
     *
     * @param string $code    Identificador corto y estable (ej. "pmi_db_error").
     * @param string $message Descripcion legible del problema.
     * @param array  $context Datos adicionales (endpoint, sql, etc.).
     * @return array La entrada de log registrada (ver estructura en log()).
     */
    public static function report($code, $message, array $context = array())
    {
        $entry = self::log($code, $message, $context);
        self::maybe_notify($entry);
        return $entry;
    }

    /**
     * Guarda el error en el buffer rotativo sin enviar correo. Usar
     * report() salvo que el llamador quiera controlar el envio aparte.
     *
     * @param string $code    Identificador corto y estable (ej. "pmi_db_error").
     * @param string $message Descripcion legible del problema.
     * @param array  $context Datos adicionales (endpoint, sql, etc.).
     * @return array Entrada de log con time, code, message, context, site y blog_id.
     */
    public static function log($code, $message, array $context = array())
    {
        $entry = array(
            'time' => current_time('mysql'),
            'code' => (string) $code,
            'message' => (string) $message,
            'context' => $context,
            'site' => home_url('/'),
            'blog_id' => function_exists('get_current_blog_id') ? get_current_blog_id() : 0,
        );

        $log = get_option(self::OPTION, array());
        if (!is_array($log)) {
            $log = array();
        }

        array_unshift($log, $entry);
        $log = array_slice($log, 0, self::MAX_ENTRIES);

        update_option(self::OPTION, $log, false);

        // Ademas al log de PHP normal, para quien busca en debug.log.
        error_log(sprintf('[Medialab Prestamos] %s: %s | contexto: %s', $entry['code'], $entry['message'], wp_json_encode($context)));

        return $entry;
    }

    /**
     * Devuelve las entradas mas recientes del buffer rotativo de errores.
     *
     * @param int $limit Numero maximo de entradas a devolver.
     * @return array Lista de entradas de log, mas reciente primero.
     */
    public static function get_recent($limit = 20)
    {
        $log = get_option(self::OPTION, array());
        if (!is_array($log)) {
            return array();
        }
        return array_slice($log, 0, $limit);
    }

    /**
     * Vacia por completo el buffer rotativo de errores.
     *
     * @return void
     */
    public static function clear()
    {
        delete_option(self::OPTION);
    }

    /**
     * Envia el correo de aviso para $entry si no esta dentro de la ventana
     * de throttle (NOTIFY_THROTTLE) para ese mismo codigo de error y sitio.
     *
     * @param array $entry Entrada de log (ver log()).
     * @return void
     */
    private static function maybe_notify(array $entry)
    {
        $throttle_key = 'pmi_err_notified_' . md5($entry['code'] . '|' . $entry['blog_id']);
        if (get_transient($throttle_key)) {
            return;
        }
        set_transient($throttle_key, 1, self::NOTIFY_THROTTLE);

        self::send_email($entry);
    }

    /**
     * Compone y envia el correo de aviso de error a NOTIFY_EMAIL con los
     * datos de $entry.
     *
     * @param array $entry Entrada de log (ver log()).
     * @return void
     */
    private static function send_email(array $entry)
    {
        $subject = sprintf('[Medialab Prestamos] Error en %s: %s', parse_url($entry['site'], PHP_URL_HOST), $entry['code']);

        $lines = array(
            'Se detecto un error en el plugin Medialab Prestamos.',
            '',
            'Sitio: ' . $entry['site'],
            'Fecha: ' . $entry['time'],
            'Codigo: ' . $entry['code'],
            'Mensaje: ' . $entry['message'],
        );

        if (!empty($entry['context'])) {
            $lines[] = '';
            $lines[] = 'Contexto:';
            foreach ($entry['context'] as $key => $value) {
                if (is_array($value)) {
                    $value = wp_json_encode($value);
                }
                $lines[] = '- ' . $key . ': ' . $value;
            }
        }

        $lines[] = '';
        $lines[] = 'Revisa el panel Medialab Prestamos > Errores recientes en wp-admin para mas detalle e historial.';

        wp_mail(self::NOTIFY_EMAIL, $subject, implode("\n", $lines));
    }

    /**
     * Envia un correo de prueba a NOTIFY_EMAIL (usado desde el boton
     * "Enviar correo de prueba" del panel de administracion), sin registrar
     * nada en el buffer de errores.
     *
     * @return void
     */
    public static function send_test_email()
    {
        self::send_email(array(
            'time' => current_time('mysql'),
            'code' => 'pmi_test',
            'message' => 'Correo de prueba enviado manualmente desde el panel de administracion.',
            'context' => array(),
            'site' => home_url('/'),
            'blog_id' => get_current_blog_id(),
        ));
    }

    /**
     * Captura errores fatales de PHP originados dentro del plugin (o del
     * tema de la app) que de otro modo solo dejarian un 500 sin rastro,
     * y los reporta igual que un error manejado.
     *
     * @return void
     */
    public static function register_fatal_handler()
    {
        register_shutdown_function(function () {
            $error = error_get_last();
            if (!$error || !in_array($error['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR), true)) {
                return;
            }

            $is_ours = (defined('PMI_PLUGIN_DIR') && strpos($error['file'], PMI_PLUGIN_DIR) === 0)
                || strpos($error['file'], 'ecoprestamos-theme') !== false;

            if (!$is_ours) {
                return;
            }

            self::report('pmi_fatal_error', $error['message'], array(
                'file' => $error['file'],
                'line' => $error['line'],
                'request_uri' => isset($_SERVER['REQUEST_URI']) ? sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])) : '',
            ));
        });
    }
}
