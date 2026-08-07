<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Nombres de tabla y helpers de base de datos compartidos por todo el plugin.
 */
class PMI_DB
{
    public static function prefix()
    {
        global $wpdb;
        return $wpdb->prefix . 'pmi_';
    }

    public static function usuario()
    {
        return self::prefix() . 'usuario';
    }

    public static function recurso()
    {
        return self::prefix() . 'recurso';
    }

    public static function prestamo()
    {
        return self::prefix() . 'prestamo';
    }

    public static function detalle_prestamo()
    {
        return self::prefix() . 'detalle_prestamo';
    }
}
