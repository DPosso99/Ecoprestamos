-- Restricciones de llave foranea. dbDelta() no soporta FOREIGN KEY, asi que
-- se ejecutan aparte con $wpdb->query() durante la activacion del plugin.
-- %%PREFIX%% se reemplaza en tiempo de ejecucion por $wpdb->prefix . 'pmi_'
--
-- Cada sentencia debe terminar en ";" y no debe contener ";" internos,
-- porque el activador las separa haciendo split por ";".
--
-- Los nombres de restriccion tambien llevan %%PREFIX%%: en MySQL el nombre de
-- una FOREIGN KEY es unico en toda la base de datos, no por tabla. En una red
-- multisitio todos los subsitios comparten base de datos, asi que con nombres
-- fijos el segundo subsitio fallaba con "Duplicate foreign key constraint
-- name" y se quedaba sin integridad referencial (el activador ignora los
-- errores de duplicado, asi que ocurria en silencio).

ALTER TABLE %%PREFIX%%prestamo ADD CONSTRAINT %%PREFIX%%fk_prestamo_solicitante FOREIGN KEY (usuario_solicitante) REFERENCES %%PREFIX%%usuario (correo);
ALTER TABLE %%PREFIX%%prestamo ADD CONSTRAINT %%PREFIX%%fk_prestamo_responsable FOREIGN KEY (usuario_responsable) REFERENCES %%PREFIX%%usuario (correo);
ALTER TABLE %%PREFIX%%detalle_prestamo ADD CONSTRAINT %%PREFIX%%fk_detalle_prestamo FOREIGN KEY (prestamo_id) REFERENCES %%PREFIX%%prestamo (id_prestamo);
ALTER TABLE %%PREFIX%%detalle_prestamo ADD CONSTRAINT %%PREFIX%%fk_detalle_recurso FOREIGN KEY (recurso_id) REFERENCES %%PREFIX%%recurso (id_recurso);
