<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Inventario a nivel de unidad fisica.
 *
 * Una fila de pmi_recurso puede representar un grupo de unidades iguales:
 * id_recurso guarda la lista de identificadores fisicos separados por coma
 * ("GMQ-1,GMQ-2,GMQ-3,GMQ-4") y estado guarda el estado de cada unidad en el
 * mismo orden ("Prestado,Disponible,Disponible,Disponible").
 * cantidad_disponible es un valor derivado (cuantas unidades quedan en
 * "Disponible") y se recalcula en cada escritura de esta clase.
 *
 * Cada fila de pmi_detalle_prestamo registra en la columna "unidades" cuales
 * unidades concretas se le asignaron. Esa identidad es indispensable: sin
 * ella, dos prestamos abiertos sobre el mismo grupo se pisan al devolver
 * (el cierre del segundo liberaba la unidad del primero, que seguia afuera,
 * y dejaba la suya marcada como prestada para siempre).
 */
class PMI_Inventario
{
    const DISPONIBLE = 'Disponible';
    const ACTIVO_FIJO = 'Activo fijo';

    /**
     * Estados en los que una unidad esta fuera de circulacion por un prestamo.
     * "No disponible" es el que usan los prestamos de Docente; "Ocupado" viene
     * de datos creados por la version anterior del esquema.
     */
    const ESTADOS_PRESTADA = array('Prestado', 'Ocupado', 'No disponible');

    /**
     * Busca el recurso al que pertenece un identificador, que puede ser el id
     * de la fila completa ("GMQ-1,GMQ-2,GMQ-3") o el de una sola de sus
     * unidades ("GMQ-2").
     *
     * @param string $id          Identificador de recurso o de unidad.
     * @param bool   $for_update  Si true, bloquea la fila hasta el fin de la transaccion (SELECT ... FOR UPDATE).
     * @return array|null Fila de pmi_recurso, o null si no existe.
     */
    public static function find_recurso($id, $for_update = false)
    {
        global $wpdb;

        if ($id === null || $id === '') {
            return null;
        }

        $sql = 'SELECT * FROM ' . PMI_DB::recurso() . ' WHERE id_recurso = %s OR FIND_IN_SET(%s, id_recurso) > 0 LIMIT 1';
        if ($for_update) {
            $sql .= ' FOR UPDATE';
        }

        return $wpdb->get_row($wpdb->prepare($sql, $id, $id), ARRAY_A);
    }

    /**
     * Descompone una fila de recurso en sus unidades fisicas con el estado de
     * cada una. Tolera filas donde estado trae un unico valor para todo el
     * grupo (formato viejo o creadas a mano): ese estado aplica a todas.
     *
     * @param array $row Fila de pmi_recurso.
     * @return array Lista de array('id' => string, 'estado' => string) en el orden de id_recurso.
     */
    public static function unidades(array $row)
    {
        $ids = array_map('trim', explode(',', (string) $row['id_recurso']));
        $estados = array_map('trim', explode(',', (string) $row['estado']));
        $total = count($ids);

        if (count($estados) === 1) {
            $estados = array_fill(0, $total, $estados[0] !== '' ? $estados[0] : self::DISPONIBLE);
        } elseif (count($estados) < $total) {
            $estados = array_pad($estados, $total, self::DISPONIBLE);
        }

        $unidades = array();
        foreach ($ids as $i => $unit_id) {
            $unidades[] = array(
                'id' => $unit_id,
                'estado' => isset($estados[$i]) && $estados[$i] !== '' ? $estados[$i] : self::DISPONIBLE,
            );
        }

        return $unidades;
    }

    /**
     * Cuantas unidades del recurso estan disponibles para prestar.
     *
     * @param array $row Fila de pmi_recurso.
     * @return int Numero de unidades en estado "Disponible".
     */
    public static function disponibles(array $row)
    {
        $libres = 0;
        foreach (self::unidades($row) as $unidad) {
            if ($unidad['estado'] === self::DISPONIBLE) {
                $libres++;
            }
        }

        return $libres;
    }

    /**
     * True si todas las unidades del recurso son activo fijo (no prestable).
     *
     * @param array $row Fila de pmi_recurso.
     * @return bool
     */
    public static function es_activo_fijo(array $row)
    {
        foreach (self::unidades($row) as $unidad) {
            if ($unidad['estado'] !== self::ACTIVO_FIJO) {
                return false;
            }
        }

        return true;
    }

    /**
     * Elige que unidades concretas se van a prestar: las primeras $qty que
     * esten disponibles. No escribe en la base de datos.
     *
     * @param array $row Fila de pmi_recurso.
     * @param int   $qty Cantidad de unidades pedidas.
     * @return string[] Ids de las unidades elegidas, o arreglo vacio si no alcanzan las disponibles.
     */
    public static function elegir_unidades(array $row, $qty)
    {
        $qty = (int) $qty;
        $elegidas = array();

        foreach (self::unidades($row) as $unidad) {
            if (count($elegidas) >= $qty) {
                break;
            }
            if ($unidad['estado'] === self::DISPONIBLE) {
                $elegidas[] = $unidad['id'];
            }
        }

        return count($elegidas) === $qty ? $elegidas : array();
    }

    /**
     * Valida una lista de unidades elegidas explicitamente por quien pide el
     * prestamo (a diferencia de elegir_unidades(), que auto-asigna las
     * primeras libres). Si alguna de las pedidas no existe en el grupo o ya
     * no esta en "Disponible", se devuelve vacio: no hay reasignacion
     * silenciosa a otras unidades, porque eso traicionaria la eleccion
     * explicita de la persona (por ejemplo, si pidio el equipo con un numero
     * de activo especifico).
     *
     * @param array    $row              Fila de pmi_recurso.
     * @param string[] $unidades_pedidas Ids de unidad elegidos por el cliente.
     * @return string[] Las mismas unidades pedidas si todas siguen disponibles, o arreglo vacio si no.
     */
    public static function elegir_unidades_especificas(array $row, array $unidades_pedidas)
    {
        if (empty($unidades_pedidas)) {
            return array();
        }

        $estados = array();
        foreach (self::unidades($row) as $unidad) {
            $estados[$unidad['id']] = $unidad['estado'];
        }

        $elegidas = array_values(array_unique($unidades_pedidas));
        foreach ($elegidas as $uid) {
            if (!isset($estados[$uid]) || $estados[$uid] !== self::DISPONIBLE) {
                return array();
            }
        }

        return $elegidas;
    }

    /**
     * Cambia el estado de unas unidades concretas y recalcula
     * cantidad_disponible a partir de los estados resultantes.
     *
     * Las unidades marcadas como activo fijo no se tocan: si un trabajador
     * reclasifico una unidad como no prestable mientras estaba afuera, ese
     * cambio manda sobre la devolucion automatica.
     *
     * @param array    $row      Fila de pmi_recurso.
     * @param string[] $unidades Ids de las unidades a cambiar.
     * @param string   $estado   Estado destino, ej. "Prestado" o "Disponible".
     * @return void
     */
    public static function marcar(array $row, array $unidades, $estado)
    {
        global $wpdb;

        if (empty($unidades)) {
            return;
        }

        $objetivo = array_flip($unidades);
        $estados = array();
        $libres = 0;

        foreach (self::unidades($row) as $unidad) {
            $nuevo = $unidad['estado'];
            if (isset($objetivo[$unidad['id']]) && $nuevo !== self::ACTIVO_FIJO) {
                $nuevo = $estado;
            }
            if ($nuevo === self::DISPONIBLE) {
                $libres++;
            }
            $estados[] = $nuevo;
        }

        $wpdb->update(
            PMI_DB::recurso(),
            array('estado' => implode(',', $estados), 'cantidad_disponible' => $libres),
            array('id_recurso' => $row['id_recurso']),
            array('%s', '%d'),
            array('%s')
        );
    }

    /**
     * Devuelve al stock las unidades de un detalle de prestamo. Usa las
     * unidades que quedaron registradas en el detalle; los detalles creados
     * antes de que existiera esa columna caen a una aproximacion por estado
     * (ver unidades_sin_registro()).
     *
     * @param array $detalle Fila de pmi_detalle_prestamo (recurso_id, cantidad_prestada, unidades).
     * @return void
     */
    public static function devolver_detalle(array $detalle)
    {
        $row = self::find_recurso($detalle['recurso_id']);
        if (!$row) {
            return;
        }

        $registradas = self::parse_unidades($detalle['unidades'] ?? '');
        $unidades = !empty($registradas)
            ? $registradas
            : self::unidades_sin_registro($row, max(1, (int) ($detalle['cantidad_prestada'] ?? 1)));

        self::marcar($row, $unidades, self::DISPONIBLE);
    }

    /**
     * Unidades a devolver para un detalle de prestamo anterior a la columna
     * "unidades": no hay registro de cuales se entregaron, asi que se liberan
     * las primeras $qty que figuren como prestadas. Es una aproximacion y solo
     * aplica a datos ya existentes.
     *
     * @param array $row Fila de pmi_recurso.
     * @param int   $qty Cantidad que registra el detalle de prestamo.
     * @return string[] Ids de las unidades a liberar.
     */
    private static function unidades_sin_registro(array $row, $qty)
    {
        $elegidas = array();

        foreach (self::unidades($row) as $unidad) {
            if (count($elegidas) >= (int) $qty) {
                break;
            }
            if (in_array($unidad['estado'], self::ESTADOS_PRESTADA, true)) {
                $elegidas[] = $unidad['id'];
            }
        }

        return $elegidas;
    }

    /**
     * Convierte la lista de unidades guardada en un detalle de prestamo
     * ("GMQ-1,GMQ-3") en un arreglo de ids.
     *
     * @param string $csv Ids separados por coma.
     * @return string[] Ids no vacios.
     */
    private static function parse_unidades($csv)
    {
        if (empty($csv)) {
            return array();
        }

        return array_values(array_filter(array_map('trim', explode(',', (string) $csv)), 'strlen'));
    }
}
