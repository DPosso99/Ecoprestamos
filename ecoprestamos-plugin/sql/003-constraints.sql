-- Restricciones de llave foranea. dbDelta() no soporta FOREIGN KEY, asi que
-- se ejecutan aparte con $wpdb->query() durante la activacion del plugin.
-- %%PREFIX%% se reemplaza en tiempo de ejecucion por $wpdb->prefix . 'pmi_'
--
-- Cada sentencia debe terminar en ";" y no debe contener ";" internos,
-- porque el activador las separa haciendo split por ";".

ALTER TABLE %%PREFIX%%prestamo ADD CONSTRAINT fk_pmi_prestamo_solicitante FOREIGN KEY (usuario_solicitante) REFERENCES %%PREFIX%%usuario (correo);
ALTER TABLE %%PREFIX%%prestamo ADD CONSTRAINT fk_pmi_prestamo_responsable FOREIGN KEY (usuario_responsable) REFERENCES %%PREFIX%%usuario (correo);
ALTER TABLE %%PREFIX%%detalle_prestamo ADD CONSTRAINT fk_pmi_detalle_prestamo FOREIGN KEY (prestamo_id) REFERENCES %%PREFIX%%prestamo (id_prestamo);
ALTER TABLE %%PREFIX%%detalle_prestamo ADD CONSTRAINT fk_pmi_detalle_recurso FOREIGN KEY (recurso_id) REFERENCES %%PREFIX%%recurso (id_recurso);
