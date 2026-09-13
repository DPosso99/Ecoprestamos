-- Definiciones de tabla en formato compatible con dbDelta().
-- %%PREFIX%% se reemplaza en tiempo de ejecucion por $wpdb->prefix . 'pmi_'
-- %%CHARSET%% se reemplaza por $wpdb->get_charset_collate()
--
-- Reglas de dbDelta que deben respetarse en este archivo (no tocar el formato):
--  - Cada columna en su propia linea.
--  - Dos espacios entre "PRIMARY KEY" y la definicion de la llave.
--  - Usar KEY en vez de INDEX.
--  - Sin comillas ni backticks en nombres de columna.
--  - Tipos de dato en minuscula, palabras clave SQL en mayuscula.
--  - dbDelta NO soporta FOREIGN KEY: esas se agregan aparte en 003-constraints.sql

CREATE TABLE %%PREFIX%%usuario (
  correo varchar(150) NOT NULL,
  numero varchar(20) NOT NULL,
  contrasena varchar(100) NOT NULL,
  rol varchar(20) NOT NULL DEFAULT 'Estudiante',
  nombre varchar(100) NOT NULL,
  baneado tinyint(1) NOT NULL DEFAULT 0,
  trabajo varchar(20) DEFAULT NULL,
  PRIMARY KEY  (correo)
) %%CHARSET%%;

CREATE TABLE %%PREFIX%%recurso (
  id_recurso varchar(500) NOT NULL,
  nombre varchar(255) NOT NULL,
  ubicacion varchar(40) NOT NULL,
  estado text NOT NULL,
  dia_compra date DEFAULT NULL,
  tipo varchar(30) NOT NULL,
  cantidad_total int DEFAULT NULL,
  cantidad_disponible int DEFAULT NULL,
  activo text DEFAULT NULL,
  imagen longblob,
  imagen_tipo varchar(50) DEFAULT NULL,
  PRIMARY KEY  (id_recurso)
) %%CHARSET%%;

-- Ciclo de vida de un prestamo, en tres estados. Son columnas distintas a
-- proposito: confundirlas hace que el stock se libere cuando no debe.
--  - entregado/hora_entrega:  el equipo salio hacia el solicitante. Sigue fuera del inventario.
--  - devuelto/hora_devolucion: el equipo volvio al laboratorio. Aqui se libera el stock.
--  - fecha_devolucion:        fecha PREVISTA de retorno (nula si es_indefinido = 1).
CREATE TABLE %%PREFIX%%prestamo (
  id_prestamo bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  notas text,
  fecha_prestamo datetime NOT NULL,
  hora_entrega datetime DEFAULT NULL,
  entregado tinyint(1) NOT NULL DEFAULT 0,
  usuario_solicitante varchar(150) NOT NULL,
  usuario_responsable varchar(150) NOT NULL,
  fecha_devolucion datetime DEFAULT NULL,
  es_indefinido tinyint(1) NOT NULL DEFAULT 0,
  devuelto tinyint(1) NOT NULL DEFAULT 0,
  hora_devolucion datetime DEFAULT NULL,
  PRIMARY KEY  (id_prestamo),
  KEY usuario_solicitante (usuario_solicitante),
  KEY usuario_responsable (usuario_responsable)
) %%CHARSET%%;

CREATE TABLE %%PREFIX%%detalle_prestamo (
  id_detalle bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  prestamo_id bigint(20) unsigned NOT NULL,
  recurso_id varchar(500) NOT NULL,
  cantidad_prestada int DEFAULT NULL,
  unidades varchar(500) DEFAULT NULL,
  PRIMARY KEY  (id_detalle),
  KEY prestamo_id (prestamo_id),
  KEY recurso_id (recurso_id)
) %%CHARSET%%;
