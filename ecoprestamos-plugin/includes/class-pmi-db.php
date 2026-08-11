<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Nombres de tabla y helpers de base de datos compartidos por todo el plugin.
 */
class PMI_DB
{
    /**
     * Prefijo comun de todas las tablas del plugin (prefijo de tabla de
     * WordPress + "pmi_", respetando el prefijo por sitio en instalaciones multisite).
     *
     * @return string Prefijo de tabla, ej. "wp_pmi_".
     */
    public static function prefix()
    {
        global $wpdb;
        return $wpdb->prefix . 'pmi_';
    }

    /**
     * Nombre completo de la tabla de usuarios.
     *
     * @return string Nombre de tabla.
     */
    public static function usuario()
    {
        return self::prefix() . 'usuario';
    }

    /**
     * Nombre completo de la tabla de recursos (inventario).
     *
     * @return string Nombre de tabla.
     */
    public static function recurso()
    {
        return self::prefix() . 'recurso';
    }

    /**
     * Nombre completo de la tabla de prestamos.
     *
     * @return string Nombre de tabla.
     */
    public static function prestamo()
    {
        return self::prefix() . 'prestamo';
    }

    /**
     * Nombre completo de la tabla de detalle de prestamo (recursos asociados a cada prestamo).
     *
     * @return string Nombre de tabla.
     */
    public static function detalle_prestamo()
    {
        return self::prefix() . 'detalle_prestamo';
    }
}
