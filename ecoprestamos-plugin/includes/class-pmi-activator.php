<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Crea/actualiza el esquema de base de datos del plugin en la activacion:
 *  1. Tablas base via dbDelta() (sql/001-tables.sql).
 *  2. Restricciones FOREIGN KEY via $wpdb->query() (sql/003-constraints.sql),
 *     porque dbDelta() no soporta FOREIGN KEY.
 *  3. Triggers de inventario via $wpdb->query() (sql/002-triggers.sql),
 *     replicando la logica que en el proyecto original vivia en MySQL.
 *
 * Si el usuario de base de datos no tiene privilegios para CREATE TRIGGER o
 * para agregar FOREIGN KEY (comun en algunos hostings compartidos), el fallo
 * se guarda como aviso de administrador en vez de tumbar la activacion.
 */
class PMI_Activator
{
    const DB_VERSION_OPTION = 'pmi_db_version';
    const DB_VERSION = '1.0.0';
    const NOTICES_OPTION = 'pmi_activation_notices';

    /**
     * Corre en register_activation_hook(): crea/actualiza tablas, restricciones
     * y triggers, genera el secreto de autenticacion si falta, y deja
     * registrada la version de esquema y los avisos de administrador que
     * hayan resultado del proceso.
     *
     * @return void
     */
    public static function activate()
    {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $notices = array();

        self::create_tables();
        self::create_constraints($notices);
        self::create_triggers($notices);

        if (!get_option('pmi_auth_secret')) {
            add_option('pmi_auth_secret', wp_generate_password(64, true, true), '', 'no');
        }

        update_option(self::DB_VERSION_OPTION, self::DB_VERSION);
        update_option(self::NOTICES_OPTION, $notices);
    }

    /**
     * Lee un archivo .sql de la carpeta sql/ del plugin y reemplaza los
     * placeholders %%PREFIX%% y %%CHARSET%% por el prefijo de tabla real y
     * el charset/collate del sitio.
     *
     * @param string $filename Nombre del archivo dentro de la carpeta sql/.
     * @return string Contenido del archivo SQL con los placeholders resueltos.
     */
    private static function read_sql_file($filename)
    {
        global $wpdb;

        $path = PMI_PLUGIN_DIR . 'sql/' . $filename;
        $sql = file_get_contents($path);

        $sql = str_replace('%%PREFIX%%', PMI_DB::prefix(), $sql);
        $sql = str_replace('%%CHARSET%%', $wpdb->get_charset_collate(), $sql);

        return $sql;
    }

    /**
     * dbDelta() tiene un problema conocido de WordPress core: al comparar
     * los indices ya existentes de una tabla (en particular los que MySQL
     * crea automaticamente para soportar las FOREIGN KEY de
     * 003-constraints.sql, que dbDelta no reconoce por no venir declarados
     * en 001-tables.sql) su parseo de "SHOW INDEX FROM" genera warnings
     * "Undefined array key" en PHP 8+. La tabla igual queda bien creada o
     * actualizada -- son solo ruido -- pero si esta funcion se llama en
     * medio de un request HTTP (ej. desde el boton "Verificar y reparar")
     * ese output rompe la respuesta con "headers already sent" antes del
     * redirect. Se silencian puntualmente esos warnings sin tocar el core.
     *
     * @return void
     */
    private static function create_tables()
    {
        $sql = self::read_sql_file('001-tables.sql');

        $previous_level = error_reporting();
        error_reporting($previous_level & ~E_WARNING);
        dbDelta($sql);
        error_reporting($previous_level);
    }

    /**
     * Quita las lineas de comentario (que empiezan con "--") de un bloque SQL,
     * preservando opcionalmente una linea exacta (usada como marcador de
     * separacion). Es indispensable hacer esto ANTES de partir el SQL por
     * ";" o por un marcador: los comentarios explicativos de los archivos
     * .sql mencionan literalmente ";" y el marcador "-- @@TRIGGER@@" como
     * texto de ejemplo, y un split ingenuo los confundiria con separadores
     * reales.
     *
     * @param string      $sql       Bloque SQL con posibles lineas de comentario "--".
     * @param string|null $keep_line Linea exacta (ya recortada) que se debe conservar aunque empiece con "--".
     * @return string SQL sin lineas de comentario, preservando $keep_line si se indico.
     */
    private static function strip_comment_lines($sql, $keep_line = null)
    {
        $lines = preg_split('/\r\n|\r|\n/', $sql);
        $kept = array();

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($keep_line !== null && $trimmed === $keep_line) {
                $kept[] = $line;
                continue;
            }
            if (strpos($trimmed, '--') === 0) {
                continue;
            }
            $kept[] = $line;
        }

        return implode("\n", $kept);
    }

    /**
     * Ejecuta las sentencias de sql/003-constraints.sql (restricciones
     * FOREIGN KEY, que dbDelta() no soporta) una por una, ignorando el error
     * si la restriccion ya existe y acumulando en $notices cualquier otro
     * fallo (ej. falta de privilegios) para mostrarlo luego en el admin.
     *
     * @param array $notices Lista de avisos de administrador, se le agregan mensajes por referencia.
     * @return void
     */
    private static function create_constraints(array &$notices)
    {
        global $wpdb;

        $sql = self::strip_comment_lines(self::read_sql_file('003-constraints.sql'));
        $statements = array_filter(array_map('trim', explode(';', $sql)));

        foreach ($statements as $statement) {
            if ($statement === '') {
                continue;
            }

            // Evita error si el plugin se reactiva y la restriccion ya existe.
            $wpdb->hide_errors();
            $wpdb->query($statement);
            $wpdb->show_errors();

            if ($wpdb->last_error && strpos($wpdb->last_error, 'Duplicate') === false) {
                $notices[] = sprintf(
                    'PMI: no se pudo crear una restriccion de llave foranea (%s). El plugin seguira funcionando, pero sin ese chequeo a nivel de base de datos.',
                    $wpdb->last_error
                );
            }
        }
    }

    /**
     * Recrea los triggers de inventario de sql/002-triggers.sql (los borra
     * primero con DROP TRIGGER IF EXISTS y los vuelve a crear), acumulando en
     * $notices un aviso legible por cada trigger que no se pudo crear (ej.
     * falta el privilegio TRIGGER en la base de datos).
     *
     * @param array $notices Lista de avisos de administrador, se le agregan mensajes por referencia.
     * @return void
     */
    private static function create_triggers(array &$notices)
    {
        global $wpdb;

        $marker = '-- @@TRIGGER@@';
        $sql = self::strip_comment_lines(self::read_sql_file('002-triggers.sql'), $marker);
        $blocks = explode($marker, $sql);

        $trigger_names = array('pmi_after_detalle_insert', 'pmi_after_prestamo_cierre');

        foreach ($blocks as $index => $block) {
            $block = trim($block);
            if ($block === '') {
                continue;
            }

            if (isset($trigger_names[$index])) {
                $wpdb->query('DROP TRIGGER IF EXISTS ' . $trigger_names[$index]);
            }

            $wpdb->hide_errors();
            $wpdb->query($block);
            $wpdb->show_errors();

            if ($wpdb->last_error) {
                $notices[] = sprintf(
                    'PMI: no se pudo crear el trigger de inventario "%s" (%s). El usuario de la base de datos probablemente no tiene el privilegio TRIGGER. La app seguira funcionando, pero las cantidades de recurso NO se ajustaran automaticamente al prestar/devolver: revisa los permisos de tu base de datos MySQL.',
                    isset($trigger_names[$index]) ? $trigger_names[$index] : ('#' . $index),
                    $wpdb->last_error
                );
            }
        }
    }
}
