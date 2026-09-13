-- Trigger de guarda del inventario. Se ejecuta via $wpdb->query() durante la
-- activacion del plugin. No requiere la sintaxis "DELIMITER $$" del cliente
-- mysql: el CREATE TRIGGER completo se manda como una sola sentencia.
--
-- %%PREFIX%% se reemplaza en tiempo de ejecucion por $wpdb->prefix . 'pmi_'
--
-- El activador separa los triggers con el marcador de linea propia
-- "-- @@TRIGGER@@" (no usar ";": el cuerpo de un trigger contiene varios ";").
--
-- Por que aqui NO se ajustan cantidades:
-- el proyecto original movia cantidad_disponible desde estos triggers, pero
-- el inventario pasó a llevarse por unidad fisica (ver PMI_Inventario), donde
-- lo que importa es CUAL unidad se presto, no solo cuantas. Un trigger de SQL
-- no puede registrar esa asignacion en el detalle del prestamo, asi que la
-- logica vive en PHP y esto queda como una sola validacion de ultima linea,
-- para escrituras que no pasen por la API REST (importaciones, phpMyAdmin).

CREATE TRIGGER %%PREFIX%%before_detalle_insert
BEFORE INSERT ON %%PREFIX%%detalle_prestamo
FOR EACH ROW
BEGIN
    DECLARE stock_disp INT DEFAULT 0;
    DECLARE estado_recurso LONGTEXT;

    SELECT cantidad_disponible, estado INTO stock_disp, estado_recurso
    FROM %%PREFIX%%recurso
    WHERE id_recurso = NEW.recurso_id
       OR FIND_IN_SET(NEW.recurso_id, id_recurso) > 0
    LIMIT 1;

    IF estado_recurso = 'Activo fijo' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los recursos de tipo Activo fijo no pueden prestarse';
    ELSEIF stock_disp IS NULL OR stock_disp < NEW.cantidad_prestada THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No hay suficiente cantidad disponible';
    END IF;
END
