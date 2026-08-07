-- Triggers que replican la logica de negocio de inventario del proyecto
-- original (Backend/Database/init.sql). Se ejecutan via $wpdb->query(),
-- uno por uno, durante la activacion del plugin. No requieren la sintaxis
-- "DELIMITER $$" del cliente mysql: cada CREATE TRIGGER completo se manda
-- como una sola sentencia al servidor.
--
-- %%PREFIX%% se reemplaza en tiempo de ejecucion por $wpdb->prefix . 'pmi_'
--
-- El activador separa los dos triggers usando el marcador de linea propia
-- "-- @@TRIGGER@@" (no usar ";" para separarlos: el cuerpo de cada trigger
-- contiene varios ";" internos).
--
-- Nota importante: dentro de una misma sentencia UPDATE, MySQL evalua las
-- clausulas SET de izquierda a derecha, asi que si una columna se referencia
-- dos veces (una para calcularla y otra dentro de un IF de otra columna), la
-- segunda referencia ve el valor YA actualizado, no el original. El proyecto
-- original tenia justo ese bug (restaba la cantidad prestada dos veces al
-- decidir si el recurso pasa a 'Ocupado', por lo que nunca llegaba a
-- mostrarlo). Aqui se evita precalculando el nuevo valor en una variable
-- (primer trigger) o separando en dos UPDATE consecutivos (segundo trigger,
-- que ademas es un UPDATE multi-tabla via JOIN, donde el orden de las
-- clausulas SET ni siquiera esta garantizado por la documentacion de MySQL).

CREATE TRIGGER pmi_after_detalle_insert
AFTER INSERT ON %%PREFIX%%detalle_prestamo
FOR EACH ROW
BEGIN
    DECLARE disponible INT;
    DECLARE estado_actual VARCHAR(20);
    DECLARE nuevo_disponible INT;
    SELECT cantidad_disponible, estado INTO disponible, estado_actual FROM %%PREFIX%%recurso WHERE id_recurso = NEW.recurso_id;

    IF estado_actual = 'Activo fijo' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los recursos de tipo Activo fijo no pueden prestarse';
    ELSEIF disponible >= NEW.cantidad_prestada THEN
        SET nuevo_disponible = disponible - NEW.cantidad_prestada;
        UPDATE %%PREFIX%%recurso
        SET cantidad_disponible = nuevo_disponible,
            estado = IF(nuevo_disponible = 0, 'Ocupado', 'Disponible')
        WHERE id_recurso = NEW.recurso_id;
    ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No hay suficiente cantidad disponible';
    END IF;
END

-- @@TRIGGER@@

CREATE TRIGGER pmi_after_prestamo_cierre
AFTER UPDATE ON %%PREFIX%%prestamo
FOR EACH ROW
BEGIN
    IF NEW.entregado = 1 AND OLD.entregado = 0 THEN
        UPDATE %%PREFIX%%recurso r
        JOIN %%PREFIX%%detalle_prestamo dp ON r.id_recurso = dp.recurso_id
        SET r.cantidad_disponible = r.cantidad_disponible + dp.cantidad_prestada
        WHERE dp.prestamo_id = NEW.id_prestamo;

        UPDATE %%PREFIX%%recurso r
        JOIN %%PREFIX%%detalle_prestamo dp ON r.id_recurso = dp.recurso_id
        SET r.estado = IF(r.estado = 'Activo fijo', 'Activo fijo', IF(r.cantidad_disponible > 0, 'Disponible', 'Ocupado'))
        WHERE dp.prestamo_id = NEW.id_prestamo;
    END IF;
END
