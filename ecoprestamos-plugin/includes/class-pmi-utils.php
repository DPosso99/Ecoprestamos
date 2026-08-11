<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Helpers varios compartidos por los endpoints REST del plugin.
 */
class PMI_Utils
{
    /**
     * Convierte un datetime recibido del frontend (string local, sin offset,
     * ej. "2026-07-06T14:30:00") a formato MySQL DATETIME, sin pasar por UTC.
     *
     * El proyecto original tuvo varios bugs de desfase horario (ver commits
     * "Fix: fechas de prestamos en hora local") causados por convertir a UTC
     * y de vuelta. Aqui se interpreta el string como hora local del sitio
     * (wp_timezone()) y se reformatea directamente, sin reconversion.
     *
     * @param string|DateTime|null $val Datetime local recibido del frontend, o un DateTime ya construido.
     * @return string|null Fecha en formato "Y-m-d H:i:s" para MySQL, o null si $val esta vacio o es invalido.
     */
    public static function to_mysql_datetime($val)
    {
        if (empty($val)) {
            return null;
        }

        if ($val instanceof DateTime) {
            return $val->format('Y-m-d H:i:s');
        }

        try {
            $date = new DateTime($val, wp_timezone());
        } catch (Exception $e) {
            return null;
        }

        return $date->format('Y-m-d H:i:s');
    }

    /**
     * Fecha y hora actual del sitio en formato MySQL DATETIME.
     *
     * @return string Fecha/hora actual en formato "Y-m-d H:i:s".
     */
    public static function now_mysql_datetime()
    {
        return current_time('mysql');
    }
}
