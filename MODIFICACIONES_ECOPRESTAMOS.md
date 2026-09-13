# Historial Detallado de Modificaciones y Despliegue · EcoPréstamos MediaLab
**Universidad EAFIT · Plataforma EcoLabs (WordPress Multisite)**
*Fecha del reporte: Septiembre 2026*
*Responsable del desarrollo: David Taimal (djtaimalp@eafit.edu.co)*

---

## Índice General

1. [Resumen Ejecutivo y Objetivos del Proyecto](#1-resumen-ejecutivo-y-objetivos-del-proyecto)
2. [Diagnóstico Técnico de la Plataforma EAFIT EcoLabs](#2-diagnóstico-técnico-de-la-plataforma-eafit-ecolabs)
3. [Modificaciones en el Tema Visual (ecoprestamos-theme)](#3-modificaciones-en-el-tema-visual-ecoprestamos-theme)
4. [Modificaciones en el Plugin y Backend (ecoprestamos-plugin)](#4-modificaciones-en-el-plugin-y-backend-ecoprestamos-plugin)
5. [Base de Datos y Datos Semilla (ecoprestamos-database.sql)](#5-base-de-datos-y-datos-semilla-ecoprestamos-databasesql)
6. [Paquete de Entrega y Guía de Despliegue para TI (dist/)](#6-paquete-de-entrega-y-guía-de-despliegue-para-ti-dist)
7. [Corrección de Inventario, Ciclo de Vida y Endurecimiento de Seguridad](#7-corrección-de-inventario-ciclo-de-vida-y-endurecimiento-de-seguridad)
8. [Tabla Resumen de Archivos Modificados y Creados](#8-tabla-resumen-de-archivos-modificados-y-creados)
9. [Flujo Operativo del Panel de Trabajador (`#/ops`): un hito por estado](#9-flujo-operativo-del-panel-de-trabajador-ops-un-hito-por-estado)
10. [Optimización de Diseño Responsive para Móvil y Tablet](#10-optimización-de-diseño-responsive-para-móvil-y-tablet)
11. [Corrección Estructural de Márgenes en Vistas de Gestión y Administración Móvil](#11-corrección-estructural-de-márgenes-en-vistas-de-gestión-y-administración-móvil)
12. [Integración de la Mascota Institucional de MediaLab en la Barra Superior](#12-integración-de-la-mascota-institucional-de-medialab-en-la-barra-superior)
13. [Visualización Completa de Datos del Solicitante, Responsable y Tiempos en Tickets y Pedidos](#13-visualización-completa-de-datos-del-solicitante-responsable-y-tiempos-en-tickets-y-pedidos)
14. [Estado Final del Proyecto y Recomendaciones de Despliegue](#14-estado-final-del-proyecto-y-recomendaciones-de-despliegue)

---

## 1. Resumen Ejecutivo y Objetivos del Proyecto

El proyecto **EcoPréstamos** consiste en la modernización, migración y adaptación institucional del sistema de gestión de préstamos, inventario y control de equipos tecnológicos para el laboratorio **MediaLab de la Universidad EAFIT**. 

El sistema original (desarrollado previamente en Node.js/Express con React y MySQL) fue refactorizado y convertido en una arquitectura nativa de WordPress compuesta por:
- Un **Plugin (`ecoprestamos-plugin`)**: encargado del backend, la API REST (`/wp-json/pmi/v1/`), control de sesiones seguras, el control de inventario por unidad física e integridad referencial.
- Un **Tema (`ecoprestamos-theme`)**: interfaz tipo SPA (Single Page Application) reactiva, modular, optimizada para dispositivos móviles y escritorio, alineada con la identidad visual oficial de EAFIT.
- Una **Estructura de Base de Datos relacional propia (`wp_pmi_*`)**: asegurando persistencia de equipos, préstamos, usuarios y trazabilidad de activos físicos.

Durante esta sesión de trabajo se cumplieron los siguientes hitos:
1. **Armonización visual completa** hacia la paleta institucional de la Universidad EAFIT (azul `#000066`, acento `#00A9E0`, fondo `#F8F9FB`).
2. **Corrección de UX operativa**: conversión del campo de trabajador encargado de barra de texto libre a un menú desplegable interactivo (`<select>`) poblado con los trabajadores activos del laboratorio.
3. **Diagnóstico técnico de permisos en WordPress Multisite**: explicación y verificación de por qué la cuenta de MediaLab no podía crear sitios directamente (roles `Super Admin (Red)` vs `Administrador (Sitio)`).
4. **Identificación de administradores de la red**: análisis de los responsables de TI y coordinación en la plataforma EcoLabs (`Alejandra Lopera`, `Maria Pineda`, `jdmozo`).
5. **Generación del paquete llave en mano para TI**: creación de los archivos `.zip` limpios, el volcado SQL con catálogo y fotos, la guía ejecutiva de despliegue y el archivo unificado `Ecoprestamos_Entrega_EAFIT.zip`.

---

## 2. Diagnóstico Técnico de la Plataforma EAFIT EcoLabs

### 2.1. Arquitectura de la Red
- **Dominio:** `https://ecolabs.eafit.edu.co/`
- **Tipo de instalación:** WordPress Multisite (Red de subsitios gestionada por subcarpetas).
- **Core de administración:** Plugin institucional propietario `EAFIT Lab Core`.
- **Subsitio objetivo:** `https://ecolabs.eafit.edu.co/ecoprestamos/`

### 2.2. Análisis de Permisos y Causa Raíz del Bloqueo al Crear Proyectos
Al intentar crear el proyecto desde la interfaz de usuario de MediaLab, el proceso no se completaba y se cerraba sin mensaje de error. Se procedió a inspeccionar la matriz de permisos de `EAFIT Lab Core` obtenida de la plataforma:

| Acción en la Plataforma | Super Admin (Red) | Jefe de Laboratorio | Administrador (Sitio) | Docente | Estudiante |
|---|:---:|:---:|:---:|:---:|:---:|
| **Crear / eliminar sitios (`manage_sites`)** | **✔** | **--** | **❌** | **❌** | **❌** |
| Acceso al Network Admin | ✔ | ❌ | ❌ | ❌ | ❌ |
| Gestionar usuarios globales | ✔ | ❌ | ❌ | ❌ | ❌ |
| Gestionar inventario de laboratorio | ✔ | ✔ | ✔ | ❌ | ❌ |

**Conclusión del diagnóstico:**
La cuenta activa `medialab@eafit.edu.co` posee el rol de **Administrador (Sitio)**, el cual tiene restringido de manera explícita el privilegio de crear subsitios en WordPress Multisite. La creación de nuevos subsitios (`/ecoprestamos/`) está reservada exclusivamente para los usuarios con nivel **Super Admin (Red)**.

### 2.3. Identificación de Administradores Responsables
Mediante el filtrado del *Directorio de Usuarios* de la plataforma, se identificaron los contactos claves:
1. **Alejandra Lopera (`mloper12@eafit.edu.co`):** Administradora principal en EAFIT (cuenta con perfil de red).
2. **Maria Pineda (`mpinedab1@eafit.edu.co`):** Administradora de proyectos EAFIT.
3. **jdmozo (`jdmozo@glitic.co`):** Administrador técnico / Ingeniero de soporte de la firma de desarrollo **Glitic** (proveedor tecnológico de la plataforma).
4. **Medialab Practicante (`medialab@eafit.edu.co`):** Cuenta actual de trabajo en MediaLab.

---

## 3. Modificaciones en el Tema Visual (ecoprestamos-theme)

Se modificaron múltiples archivos de estilos, vistas JavaScript y componentes para erradicar inconsistencias de diseño y asegurar la identidad corporativa de EAFIT.

### 3.1. Identidad Visual y Paleta Cromática Institucional (`assets/css/app.css`)

Los colores viven como variables CSS en `:root`, de modo que cambiar la
identidad visual no obliga a tocar las vistas:

| Variable | Valor | Uso |
|---|---|---|
| `--eafit-primary` | `#000066` | Azul institucional: botones principales, encabezados |
| `--eafit-secondary` | `#00A9E0` | Azul de acento |
| `--eafit-bg` | `#F8F9FB` | Fondo de la interfaz |
| `--eafit-surface` | `#FFFFFF` | Tarjetas y modales |
| `--eafit-text` / `--eafit-muted` | `#111827` / `#6B7280` | Texto base y secundario |
| `--eafit-border` | `#E5E7EB` | Bordes y separadores |

- **Estados**, también como variables: `--status-success` `#16A34A`,
  `--status-danger` `#DC2626`, `--status-warning` `#F59E0B` y `--status-info`
  `#2563EB`. Las píldoras (`.pmi-pill-*`) y los puntos de estado (`.pmi-dot-*`)
  se derivan de ellas, así que los tres estados del ciclo de vida de un
  préstamo se distinguen por color sin definir colores nuevos.
- **Normalización de botones y formularios:** radios y sombras unificados
  (`--radius-btn`, `--shadow-soft`), y anillo de foco institucional en
  `input`, `select` y `textarea`.

### 3.2. Barra Superior y Logo (`assets/js/components/topbar.js`)
- **Corrección de Redundancia en el Logotipo:**
  - En la versión previa, el logo decía: `EAFIT · MediaLab · EcoPréstamos`.
  - Dado que la plataforma ya se encuentra alojada en el dominio institucional `ecolabs.eafit.edu.co`, se simplificó eliminando el prefijo redundante "EAFIT · ", dejando la marca visual limpia: **MediaLab · EcoPréstamos**.
- **Indicador de Usuario y Rol:**
  - Integración de avatar interactivo con el nombre y rol del usuario autenticado (`Trabajador`, `Docente` o `Estudiante`).

### 3.3. Vista de Nueva Solicitud (`assets/js/views/nueva-solicitud.js`)
- **Trabajador encargado como Lista Desplegable (`<select>`):**
  - **Problema previo:** El encargado se escribía a mano, lo que producía correos mal digitados y préstamos sin responsable real asociado.
  - **Solución implementada:** El campo es un `<select class="ui-input">` que se llena desde `GET /wp-json/pmi/v1/users`, filtrando los usuarios con rol `Trabajador` que no estén baneados, y muestra nombre y cargo (Trabajador o Practicante).
  - El rol `Docente` no aparece en ese selector: no es un dato que el solicitante elija, sino el rol del propio solicitante, y es lo que habilita el préstamo de período largo (ver 3.3.1).

#### 3.3.1. Reglas diferenciadas por rol
- **Estudiante:** préstamo únicamente para el mismo día, de lunes a viernes, entre 08:00 y 18:00.
- **Docente:** puede elegir la fecha de inicio y una fecha de devolución prevista, o marcar el préstamo como indefinido (proyectos y semilleros). Sigue sujeto al horario de atención.
- Estas reglas se validan en el navegador **y** en el servidor (`PMI_Rest_Prestamos::validar_horario()`); un Trabajador queda exento para poder registrar casos excepcionales en mostrador.
- **Validación Reactiva de Formulario:**
  - Validación de fechas de préstamo y devolución con control de horario laboral.
  - Checkbox para préstamos de tipo indefinido (usado para proyectos de investigación o semilleros de larga duración).
  - Cálculo automático de stock disponible al seleccionar múltiples unidades de un mismo recurso.

### 3.4. Catálogo de Recursos (`assets/js/views/catalogo.js` y `ops-catalogo.js`)
- **Buscador en Tiempo Real:**
  - Filtrado instantáneo por texto (nombre, modelo, ID de activo) y por categoría (`Realidad virtual`, `Audiovisual`, `Animación`, etc.).
- **Visualización de Recursos con Imagen:**
  - Soporte para renderizar fotografías cargadas en base de datos (campo `LONGBLOB` convertido a data URL `data:image/jpeg;base64,...`).
  - Generación de iconos SVG limpios y vectoriales cuando el recurso no cuenta con imagen propia.
- **Acciones Operativas (Modo Administrador/Trabajador):**
  - Creación y edición de recursos con asignación de activos físicos EAFIT (`71507`, `79115`, `69696`, etc.).
  - Manejo de cantidades disponibles vs. cantidad total.

### 3.5. Gestión Operativa de Préstamos y Entregas (`ops-solicitudes.js`, `ops-dashboard.js`, `ops-ticket.js`)

El préstamo pasa por tres estados, y cada uno tiene su propia acción:

| Estado | Significado | Acción del trabajador |
|---|---|---|
| Pendiente entrega | La solicitud existe, el equipo sigue en el laboratorio | "Marcar como entregado" |
| En préstamo | El equipo está en manos del solicitante, fuera del inventario | "Registrar devolución" |
| Devuelto | El equipo volvió y el stock ya se liberó | — |

- **Flujo de Despacho:** el botón ejecuta `PUT /wp-json/pmi/v1/loans/{id}` con `{ "Entregado": 1 }` y la hora de entrega. El stock **no** se libera aquí: el equipo está afuera.
- **Flujo de Devolución:** el botón ejecuta `PUT /wp-json/pmi/v1/loans/{id}` con `{ "Devuelto": 1 }` y la hora real de recepción. Este es el único punto donde las unidades vuelven a quedar disponibles en el catálogo.
- Ambas acciones están disponibles tanto en el ticket del préstamo como en las tarjetas del panel operativo, y la bandeja de solicitudes permite filtrar por los tres estados.

---

## 4. Modificaciones en el Plugin y Backend (ecoprestamos-plugin)

### 4.1. Limpieza y Reestructuración del Archivo Principal (`ecoprestamos-plugin.php`)
- **Renombrado y Normalización:**
  - Se formalizó el archivo principal como `ecoprestamos-plugin.php` con la cabecera estándar de WordPress:
    ```php
    /**
     * Plugin Name: EcoPrestamos - Prestamos MediaLab
     * Description: Backend de registro de prestamos y manejo de inventario, migrado desde una app Node/Express+React a un plugin de WordPress con tablas SQL propias ($wpdb + dbDelta) y una API REST bajo /wp-json/pmi/v1/.
     * Version: 1.0.0
     * Author: EAFIT MediaLab
     * Author URI: https://www.eafit.edu.co/
     * Text Domain: ecoprestamos-plugin
     * Requires at least: 6.2
     * Requires PHP: 7.4
     */
    ```
- **Aislamiento del Archivo Redundante (`prestamos-inventario.php`):**
  - El proyecto contenía un archivo legacy heredado con el mismo contenido. Se excluyó deliberadamente este archivo del empaquetado `.zip` para evitar que WordPress detectara dos plugins duplicados en la misma carpeta o generara errores de constantes ya definidas.

### 4.2. Activador de Base de Datos y Compatibilidad Multisite (`class-pmi-activator.php`)
- **Soporte de Prefijos Dinámicos:**
  - En lugar de fijar prefijos como `wp_pmi_`, el activador resuelve dinámicamente `$wpdb->prefix . 'pmi_'`.
  - En un subsitio de WordPress Multisite (por ejemplo, con ID 19), las tablas se crean de forma aislada y automática como `wp_19_pmi_usuario`, `wp_19_pmi_recurso`, `wp_19_pmi_prestamo`, `wp_19_pmi_detalle_prestamo`.
- **Ejecución de Triggers y Foreign Keys con Tolerancia a Fallos:**
  - `dbDelta()` de WordPress no soporta sintaxis de `FOREIGN KEY` ni `CREATE TRIGGER`.
  - El activador procesa `sql/001-tables.sql` con `dbDelta()`, y luego ejecuta `sql/003-constraints.sql` y `sql/002-triggers.sql` mediante `$wpdb->query()`.
  - Si el servidor MySQL no tiene concedido el privilegio `TRIGGER` o `REFERENCES`, el activador no detiene la activación de WordPress, sino que registra un aviso informativo en el panel de administración (`admin_notices`).

### 4.3. El Inventario Salió de los Triggers (`sql/002-triggers.sql`)

El proyecto original de Node/MySQL movía las cantidades de inventario desde
triggers de MySQL, y esa herencia se mantuvo en las primeras versiones de este
plugin. Ya no: el sistema lleva el estado de cada unidad física por separado y
necesita registrar **cuál** unidad se prestó, no solo cuántas, y eso un trigger
no lo puede hacer (ver 7.1). La lógica vive hoy en `PMI_Inventario`.

- **Trigger `before_detalle_insert` (el único que queda):**
  - Impide que equipos catalogados como `Activo fijo` se incluyan en solicitudes de préstamo.
  - Lanza `SIGNAL SQLSTATE '45000'` si la cantidad solicitada supera el stock disponible.
  - Actúa como validación de última línea para escrituras hechas por fuera de la
    aplicación: importaciones de SQL, cambios manuales desde phpMyAdmin. Las
    peticiones que pasan por la API ya vienen validadas en PHP.
- **Trigger `after_prestamo_cierre`: eliminado.** Devolvía las cantidades al
  marcar la entrega, que es justamente el comportamiento corregido en 7.2 (el
  stock se libera con la devolución, no con la entrega). El activador ejecuta un
  `DROP TRIGGER IF EXISTS` para que no sobreviva de una instalación anterior.

### 4.4. Controladores y Rutas de la REST API (`includes/class-pmi-rest-*.php`)
- **Control de Acceso y Seguridad (`class-pmi-auth.php`):**
  - Sesiones gestionadas con tokens HMAC-SHA256 y cookies firmadas `pmi_session` (validez de 24 horas).
  - Secreto criptográfico (`pmi_auth_secret`) generado de forma aleatoria durante la activación del plugin.
  - Verificación de nonces de WordPress (`X-WP-Nonce`) para protección CSRF en todas las peticiones POST, PUT y DELETE.
- **Endpoints Implementados bajo `/wp-json/pmi/v1/`:**

| Endpoint | Función | Requiere |
|---|---|---|
| `GET /resources` | Catálogo completo (sin la imagen) | Sesión válida |
| `POST /resources` | Crear recurso, con imagen opcional | Trabajador |
| `PUT /resources/{id}` | Editar recurso | Trabajador |
| `DELETE /resources/{id}` | Eliminar recurso; `409` si tiene historial de préstamos | Trabajador |
| `GET /resources/{id}/imagen` | Bytes crudos de la fotografía | Sesión válida |
| `GET /loans` | Préstamos propios; todos si es Trabajador | Sesión válida |
| `POST /loans` | Crear préstamo con sus recursos, en una transacción | Sesión válida |
| `PUT /loans/{id}` | Registrar entrega (`Entregado`) o devolución (`Devuelto`) | Trabajador |
| `DELETE /loans/{id}` | Eliminar préstamo y liberar sus unidades | Trabajador |
| `GET /loans/{id}/details` | Recursos y unidades de un préstamo | Sesión válida (propio) |
| `POST /loans/{id}/details` | Agregar recursos a un préstamo existente | Sesión válida (propio) |
| `GET /users` | Directorio; los no-trabajadores solo ven trabajadores activos | Sesión válida |
| `POST /login`, `POST /logout` | Autenticación y cierre de sesión | Público |

  La referencia completa, con cuerpos de petición y códigos de error, está en `ecoprestamos-plugin/API.md`.

---

## 5. Base de Datos y Datos Semilla (ecoprestamos-database.sql)

Se generó un archivo SQL de 97.8 KB completamente limpio, estructurado e independiente para el aprovisionamiento de la base de datos en los servidores de EAFIT.

### 5.1. Estructura de Tablas Exportada
1. `wp_pmi_usuario`:
   - Columnas: `correo` (PK), `numero`, `contrasena`, `rol`, `nombre`, `baneado`, `trabajo`.
2. `wp_pmi_recurso`:
   - Columnas: `id_recurso` (PK), `nombre`, `ubicacion`, `estado`, `dia_compra`, `tipo`, `cantidad_total`, `cantidad_disponible`, `activo`, `imagen` (LONGBLOB), `imagen_tipo`.
3. `wp_pmi_prestamo`:
   - Columnas: `id_prestamo` (PK AUTO_INCREMENT), `notas`, `fecha_prestamo`, `hora_entrega`, `entregado`, `usuario_solicitante`, `usuario_responsable`, `fecha_devolucion`, `es_indefinido`, `devuelto`, `hora_devolucion`.
   - `entregado`/`hora_entrega` registran la salida del equipo; `devuelto`/`hora_devolucion`, su regreso (y solo esto libera el stock); `fecha_devolucion` es la fecha *prevista* de retorno.
4. `wp_pmi_detalle_prestamo`:
   - Columnas: `id_detalle` (PK AUTO_INCREMENT), `prestamo_id`, `recurso_id`, `cantidad_prestada`, `unidades`.
   - `unidades` guarda cuáles unidades físicas concretas se asignaron a ese préstamo (ej. `GMQ-1,GMQ-2`), que es lo que permite devolver exactamente esas al cerrarlo.

### 5.2. Cuentas de Usuario Semilla Incluidas
Todas las cuentas se configuraron con contraseñas seguras hasheadas con `bcrypt` estándar de PHP (`password_hash`), compatibles con el login de la aplicación:

| Correo Electrónico | Nombre | Rol | Contraseña por Defecto |
|---|---|---|---|
| `practicante.ecolabs@eafit.edu.co` | Practicante Ecolabs | Trabajador (MediaLab) | `Medialab2026!` |
| `djtaimalp@eafit.edu.co` | David Taimal | Trabajador (MediaLab) | `Medialab2026!` |
| `profesor.prueba@eafit.edu.co` | Prof. Carlos Restrepo | Docente | `Medialab2026!` |

### 5.3. Catálogo de Recursos de MediaLab Inicializado
Se extrajo el catálogo real de equipos físicos del laboratorio con su stock total disponible (100% stock restaurado) y con las imágenes fotográficas codificadas en formato binario/hexadecimal (`0x...`):

1. **Gafas Meta Quest 3s** (Realidad Virtual, Aula 201A):
   - IDs: `GMQ-1,GMQ-2,GMQ-3,GMQ-4`
   - Total: 4 unidades | Disponibles: 4
   - Activos EAFIT: `79115`, `79116`
   - Fotografía JPEG institucional incluida en formato binario HEX.
2. **Gafas HTC Vive Cosmos Elite** (Realidad Virtual, Aula 201A):
   - ID: `GHV-01`
   - Total: 1 unidad | Disponibles: 1 (Restaurado desde su estado previo de prueba)
   - Activo EAFIT: `71507`
3. **Gafas Oculus Go** (Realidad Virtual, Aula 201D):
   - IDs: `GOG-01,GOG-02`
   - Total: 2 unidades | Disponibles: 2
   - Activos EAFIT: `69697`, `69696`
4. **Mesas de animación** (Animación, Aula 201A):
   - IDs: `MAN-1` hasta `MAN-21`
   - Total: 21 unidades | Disponibles: 21
5. **Trípodes Libec y estándar** (Audiovisual, Aula 201A):
   - IDs: `TRI-01` hasta `TRI-12`
   - Total: 12 unidades | Disponibles: 12
   - Activos EAFIT: `25286`, `25285`, `39464`
6. **Trucas de animación** (Animación, Aula 201B):
   - IDs: `TRU-01,TRU-02`
   - Total: 2 unidades | Disponibles: 2

---

## 6. Paquete de Entrega y Guía de Despliegue para TI (dist/)

Para facilitar la labor del equipo de infraestructura de EAFIT y garantizar que no existan dependencias faltantes, se construyeron los paquetes de distribución dentro de la carpeta `dist/`:

### 6.1. Contenido de la Carpeta `dist/`

```
dist/
├── Ecoprestamos_Entrega_EAFIT.zip   <-- PAQUETE MAESTRO PARA ENVIAR A TI
├── ecoprestamos-plugin.zip          <-- Plugin individual listo para instalar
├── ecoprestamos-theme.zip           <-- Tema visual listo para instalar
├── ecoprestamos-database.sql        <-- Esquema y catálogo inicial
└── GUIA_DESPLIEGUE_EAFIT.md         <-- Manual paso a paso para el Super Admin
```

El paquete se reconstruye con `./build-dist.sh` desde la raíz del repositorio.
Hay que correrlo antes de cada entrega: los `.zip` se generan a partir del
código, así que si se editan plugin o tema y no se reconstruye, TI recibiría una
versión vieja. El paquete maestro incluye además este documento.
El script necesita `bash` con `cygpath` (Git Bash o MSYS). En un Windows sin
MSYS se replica a mano con `Compress-Archive` de PowerShell: comprimir
`ecoprestamos-plugin/` y `ecoprestamos-theme/`, y luego meter esos dos `.zip`
junto con el volcado SQL, la guía y este documento en
`Ecoprestamos_Entrega_EAFIT.zip`.

La carpeta `dist/` **no se versiona** (está en `.gitignore`): el volcado SQL
contiene datos semilla con credenciales y números de teléfono reales, y los
`.zip` son artefactos reconstruibles.

### 6.2. La Guía Oficial para TI (`GUIA_DESPLIEGUE_EAFIT.md`)
Se elaboró un documento formal en español dirigido al Super Administrador de la Red con las siguientes secciones:
1. **Creación del Subsitio:** Instrucciones precisas para crear la ruta `/ecoprestamos/` desde `/wp-admin/network/sites.php`.
2. **Instalación y Activación del Plugin:** Activación en el subsitio para permitir la generación automática de las tablas `wp_X_pmi_*`.
3. **Instalación y Activación del Tema:** Carga de `ecoprestamos-theme.zip` y activación para habilitar la interfaz SPA.
4. **Importación de Datos Semilla:** Instrucciones para ajustar el prefijo de tabla en `ecoprestamos-database.sql` e importar catálogo y usuarios vía phpMyAdmin, consola MySQL o WP-CLI.
5. **Checklist de Verificación:** 5 puntos clave de prueba (acceso web, REST API, login de practicante, prueba de préstamo y prueba de devolución).

---

## 7. Corrección de Inventario, Ciclo de Vida y Endurecimiento de Seguridad

Una revisión completa del proyecto encontró un conjunto de defectos de fondo,
varios de ellos con pérdida silenciosa de datos. Esta sección documenta qué se
corrigió y por qué, porque varias correcciones cambian el comportamiento
observable del sistema.

### 7.1. Inventario por unidad física (corrección crítica)

**Problema.** Una fila de `wp_pmi_recurso` puede representar un grupo de
unidades iguales (`GMQ-1,GMQ-2,GMQ-3,GMQ-4`), con un estado por unidad. Pero el
detalle del préstamo solo guardaba *cuántas* unidades se prestaron, nunca
*cuáles*. Al devolver, el sistema liberaba "las primeras N unidades que estén
prestadas", que no son necesariamente las de ese préstamo.

**Consecuencia real.** Con dos préstamos abiertos sobre el mismo grupo, cerrar
el segundo liberaba la unidad del primero —que seguía físicamente afuera— y
dejaba la suya marcada como prestada para siempre. Cada ciclo así perdía una
unidad del stock disponible de forma permanente.

**Corrección.** Se agregó la columna `unidades` a `wp_pmi_detalle_prestamo`,
que registra los identificadores exactos asignados, y toda la lógica de
inventario se centralizó en la clase nueva `PMI_Inventario`. La reserva ocurre
dentro de una transacción con la fila del recurso bloqueada (`SELECT ... FOR
UPDATE`), de modo que dos solicitudes simultáneas no puedan tomar la misma
unidad. `cantidad_disponible` pasó a ser un valor derivado del estado de las
unidades y se recalcula en cada escritura, así que ya no puede desincronizarse.

### 7.2. Separación de entrega y devolución

**Problema.** El botón "Marcar como entregado" significaba en la interfaz
*entregado al solicitante*, pero el backend lo interpretaba como *préstamo
cerrado* y devolvía el stock. Es decir: al entregarle el equipo a un estudiante,
el catálogo lo mostraba disponible de inmediato y otra persona podía reservarlo.
No existía ninguna acción de devolución en toda la aplicación.

**Corrección.** Se separaron los dos hitos con las columnas `devuelto` y
`hora_devolucion`. La entrega saca el equipo del inventario; solo la devolución
lo reintegra. Con esto `fecha_devolucion` recupera su sentido de fecha prevista
de retorno.

### 7.3. Lógica de inventario fuera de los triggers

Los triggers de MySQL ya no ajustan cantidades. Un trigger no puede registrar
cuál unidad se asignó a cuál préstamo, que es justamente el dato que corrige el
punto 7.1, así que esa lógica vive en PHP. Quedó un único trigger,
`before_detalle_insert`, como validación de última línea para escrituras hechas
por fuera de la aplicación (importaciones de SQL, phpMyAdmin). El trigger
`after_prestamo_cierre` se eliminó.

### 7.4. Control de acceso

| Corrección | Antes |
|---|---|
| El baneo se valida en el servidor (`403 pmi_banned`) | El baneo era solo visual: un usuario baneado seguía operando por API |
| `GET /loans` y el detalle de préstamos filtran por propietario | Cualquier usuario con sesión leía los préstamos, correos, teléfonos y notas de todos |
| `PUT /loans/{id}` exige rol Trabajador | Cualquier estudiante podía cerrar el préstamo de otra persona y liberar su inventario |
| `POST /loans` fuerza el solicitante a la sesión actual | Se podía radicar una solicitud a nombre de otra persona |
| `GET /users/{correo}` solo permite el propio registro, o cualquiera si es Trabajador | Se podía consultar el teléfono de cualquier usuario |
| `GET /users` entrega el directorio completo solo a Trabajadores | Todos los roles recibían teléfonos de todo el directorio |
| `Rol` y `Trabajo` validados contra lista blanca | Se podía guardar cualquier cadena como rol |
| Cambiar la propia contraseña exige la actual (`Contrasena_actual`) | Una sesión robada bastaba para apropiarse de la cuenta |
| La cookie de sesión lleva una huella de las credenciales | Cambiar la contraseña no invalidaba las sesiones abiertas |
| Solo se aceptan JPG, PNG, GIF y WebP, y la imagen se sirve con `X-Content-Type-Options: nosniff` | Se aceptaba cualquier `image/*`, incluido SVG, que puede contener JavaScript y se servía en el mismo origen del sitio |
| Las reglas de horario se validan en el servidor | Una petición armada a mano podía agendar un domingo a las 3 a.m. |

### 7.5. Integridad de datos y despliegue

- **`DELETE /resources/{id}`** devuelve `409` si el recurso aparece en algún
  préstamo. Antes borraba en cascada las filas de detalle, destruyendo el
  historial de qué se prestó, a quién y cuándo, incluso de préstamos cerrados.
- **Creación atómica del préstamo.** `POST /loans` acepta los recursos y crea
  todo en una transacción. Antes eran dos peticiones: si fallaba la segunda
  (por ejemplo, sin stock), quedaba un préstamo vacío que el estudiante no podía
  borrar y que le bloqueaba cualquier solicitud nueva de forma permanente.
- **Importación del SQL en MySQL.** El volcado usaba `DROP FOREIGN KEY IF
  EXISTS`, sintaxis exclusiva de MariaDB. En MySQL 5.7 y 8.0 la importación se
  cortaba ahí y la base quedaba sin llaves, sin trigger y **sin datos**. Las
  llaves foráneas ahora se declaran dentro de cada `CREATE TABLE`. Verificado
  importando el volcado en MySQL 8.4.
- **Nombres de llaves foráneas con prefijo.** En MySQL el nombre de una llave
  foránea es único en toda la base de datos, y en una red multisitio todos los
  subsitios comparten base: el segundo subsitio fallaba en silencio y quedaba
  sin integridad referencial.
- **Migración automática de esquema.** El plugin compara `pmi_db_version` y
  aplica el esquema pendiente por sí solo. Antes, actualizar los archivos sin
  reactivar el plugin dejaba el esquema viejo y cada petición fallaba por la
  columna faltante.
- **Creación de subsitios.** Se reemplazó el hook obsoleto `wpmu_new_blog` por
  `wp_initialize_site`, y se carga `wp-admin/includes/plugin.php` antes de
  consultar la activación de red: crear un subsitio por WP-CLI terminaba en un
  error fatal.
- Se eliminó del repositorio `prestamos-inventario.php`, un duplicado del
  archivo principal que declaraba un segundo plugin en la misma carpeta.

### 7.6. Correcciones de interfaz

- Las unidades asignadas a un préstamo se leen del dato registrado. Antes se
  deducían comparando nombres por coincidencia parcial, así que con "Cámara" y
  "Cámara Sony" en el catálogo se mostraba el activo equivocado.
- El conteo de unidades se toma siempre de `id_recurso`. Una fila con un solo
  estado para todo el grupo mostraba "1 de 1 disponibles" sobre una tabla de
  cuatro unidades.
- Las fechas de "hoy" se calculan en hora local. Con hora UTC, después de las
  19:00 en Bogotá el panel operativo aparecía vacío.
- El borrador de la solicitud se descarta al cerrar sesión: antes el siguiente
  usuario del mismo navegador veía la selección y el teléfono del anterior.
- Si la sesión expira, la aplicación redirige al login en vez de quedarse
  mostrando pantallas vacías sin explicación.
- Se escaparon los últimos valores que llegaban a HTML sin escapar, y se
  corrigieron una fuga de listeners y el menú de usuario, que dejaba de cerrarse
  al primer clic.

---

## 8. Tabla Resumen de Archivos Modificados y Creados

| Ruta del Archivo | Tipo de Acción | Detalle de los Cambios Implementados |
|---|:---:|---|
| `ecoprestamos-plugin/ecoprestamos-plugin.php` | Modificado | Actualización de nombre oficial (`EcoPrestamos - Prestamos MediaLab`), metadatos de autoría y requerimientos. |
| `ecoprestamos-plugin/includes/class-pmi-activator.php` | Modificado | Resolución dinámica de prefijos en WordPress Multisite (`wp_{blog_id}_pmi_*`), silenciado de advertencias de índices en PHP 8+. |
| `ecoprestamos-plugin/includes/class-pmi-rest-detalles.php` | Modificado | Reserva de unidades físicas concretas dentro de una transacción con la fila del recurso bloqueada; control de propiedad del préstamo. |
| `ecoprestamos-plugin/includes/class-pmi-rest-prestamos.php` | Modificado | Ciclo de vida en tres estados (`Entregado` / `Devuelto`), creación atómica con recursos, control de propiedad y validación del horario del laboratorio. |
| `ecoprestamos-plugin/includes/class-pmi-rest-recursos.php` | Modificado | `cantidad_disponible` derivada de los estados por unidad, lista blanca de formatos de imagen con `nosniff`, borrado que preserva el historial (`409`) y limpieza de temporales. |
| `ecoprestamos-plugin/includes/class-pmi-rest-usuarios.php` | Modificado | Listas blancas de `Rol`/`Trabajo`, directorio restringido según rol, cambio de contraseña con verificación de la actual y login sin restricción de dominio. |
| `ecoprestamos-plugin/sql/001-tables.sql` | Modificado | Columnas `devuelto`, `hora_devolucion` (ciclo de vida) y `unidades` (unidades físicas asignadas a cada préstamo). |
| `ecoprestamos-plugin/sql/002-triggers.sql` | Modificado | Reducido a un único trigger de guarda (stock y activo fijo) para escrituras externas a la aplicación; el ajuste de inventario pasó a PHP. |
| `ecoprestamos-theme/style.css` | Modificado | Metadatos formales del tema (`Theme Name: Ecoprestamos`), compatibilidad con WP 6.2+. |
| `ecoprestamos-theme/assets/css/app.css` | Modificado | Paleta institucional EAFIT como variables CSS (`#000066`, `#00A9E0`, `#F8F9FB`), rediseño de modales, inputs y botones. |
| `ecoprestamos-theme/assets/js/components/topbar.js` | Modificado | Eliminación de texto redundante ("EAFIT · "), estilización de avatar y roles institucionales. |
| `ecoprestamos-theme/assets/js/views/nueva-solicitud.js` | Modificado | Selector de trabajador encargado, reglas diferenciadas por rol y envío del préstamo con sus recursos en una sola petición. |
| `ecoprestamos-theme/assets/js/views/catalogo.js` | Modificado | Renderizado dinámico de equipos con fotos reales en base64 o iconos SVG institucionales. |
| `ecoprestamos-theme/assets/js/views/ops-dashboard.js` | Modificado | Panel operativo con columnas de pendientes de entrega y pendientes de devolución, acciones rápidas para ambos hitos y fechas en hora local. |
| `ecoprestamos-theme/assets/js/views/ops-solicitudes.js` | Modificado | Filtros por los tres estados del ciclo de vida y cálculo de fechas en hora local. |
| `ecoprestamos-theme/assets/js/views/login.js` | Modificado | Manejo de sesión con cookies HTTP-Only y redirección según rol de usuario. |
| `dist/ecoprestamos-database.sql` | Modificado | Llaves foráneas declaradas dentro de cada `CREATE TABLE` (la sintaxis anterior abortaba la importación en MySQL), nombres con prefijo, columnas nuevas y un solo trigger. |
| `dist/GUIA_DESPLIEGUE_EAFIT.md` | **Creado** | Manual ejecutivo de despliegue paso a paso para los administradores de TI de la plataforma EAFIT. |
| `dist/ecoprestamos-plugin.zip` | **Creado** | Archivo comprimido instalable del plugin (sin archivos duplicados ni temporales). |
| `dist/ecoprestamos-theme.zip` | **Creado** | Archivo comprimido instalable del tema adaptado a EAFIT. |
| `dist/Ecoprestamos_Entrega_EAFIT.zip` | **Creado** | **Paquete maestro consolidado de entrega final para TI.** |
| `ecoprestamos-plugin/includes/class-pmi-inventario.php` | **Creado** | Dueño único de la lógica de inventario por unidad física: elegir, reservar, marcar y devolver unidades concretas. |
| `ecoprestamos-plugin/includes/class-pmi-auth.php` | Modificado | Baneo aplicado en servidor, permiso de lectura del propio usuario y huella de credenciales en la cookie para invalidar sesiones. |
| `ecoprestamos-plugin/includes/class-pmi-rest-busqueda.php` | Modificado | Las búsquedas dejan de traer la columna de imagen (`LONGBLOB`), que rompía la serialización a JSON. |
| `ecoprestamos-plugin/sql/003-constraints.sql` | Modificado | Nombres de llave foránea con prefijo del sitio, para que un segundo subsitio no pierda la integridad referencial. |
| `ecoprestamos-theme/assets/js/state.js` | Modificado | Estados del ciclo de vida (`loanEstado`), acción de devolución, creación atómica del préstamo y limpieza del borrador al cerrar sesión. |
| `ecoprestamos-theme/assets/js/router.js` | Modificado | Cierre de sesión y redirección al login cuando el servidor responde 401. |
| `ecoprestamos-theme/assets/js/views/ops-ticket.js` | Modificado | Dos acciones separadas (entrega y devolución) y unidades asignadas leídas del dato registrado. |
| `ecoprestamos-theme/assets/js/views/detalle-pedido.js` | Modificado | Tres estados del ciclo de vida y unidades asignadas leídas del dato registrado. |
| `ecoprestamos-plugin/prestamos-inventario.php` | **Eliminado** | Duplicado del archivo principal: declaraba un segundo plugin en la misma carpeta. |
| `build-dist.sh` | **Creado** | Reconstruye el paquete de entrega (`dist/`) a partir del código actual. |
| `.gitignore` | Modificado | Excluye `dist/`, que contiene el volcado SQL con credenciales y teléfonos. |
| `MODIFICACIONES_ECOPRESTAMOS.md` | **Creado** | Este documento maestro de registro de cambios. |

---

## 9. Flujo Operativo del Panel de Trabajador (`#/ops`): un hito por estado

El panel del trabajador muestra un bloque por cada estado del ciclo de vida, y
cada bloque ofrece **únicamente** la acción del hito que le corresponde. Esa
separación es lo que sostiene el modelo de tres estados descrito en 7.2: la
entrega saca el equipo del laboratorio y **no** libera stock; la devolución es
el único paso que lo reintegra.

1. **Bloques operativos y su acción:**
   - **Pendientes de entrega** → botón **"Marcar como entregado"**, que ejecuta `PUT /loans/{id}` con `Entregado: 1` y la hora de despacho. El equipo queda fuera del inventario y **el stock no se libera**.
   - **Pendientes de devolución** (equipos fuera del laboratorio) → botón **"Registrar devolución"**, que ejecuta `PUT /loans/{id}` con `Devuelto: 1` y la hora real de recepción. Este es el único punto donde las unidades vuelven a estar disponibles en el catálogo.
   - **Historial del día / Historial completo** → préstamos ya devueltos, con su badge de estado y acceso al ticket.
   - La KPI **"Fuera del laboratorio"** cuenta los préstamos con equipos sin devolver: es la carga operativa que sigue abierta, independiente de la fecha del préstamo.
   - Los mismos dos botones, cada uno en su estado, están también en la tabla de `ops-solicitudes.js` y en el ticket (`ops-ticket.js`).

2. **Corrección posterior (este reporte).** Una versión intermedia de este panel había colapsado los dos hitos en un único botón rotulado "Marcar como entregado" que en realidad ejecutaba la devolución (`marcarDevuelto`): entregar un equipo lo devolvía al catálogo en el mismo instante —exactamente el defecto corregido en 7.2— y el estado "En préstamo" quedaba inalcanzable desde la interfaz, porque `marcarEntregado()` existía en `state.js` pero ninguna vista lo llamaba.
   - Se restauraron las dos acciones separadas en `ops-dashboard.js`, `ops-solicitudes.js` y `ops-ticket.js`: cada botón ejecuta el hito de su propio estado, nunca los dos, y la tarjeta salta al bloque del estado nuevo al terminar.
   - La pastilla de estado de cada tarjeta del panel pasó a derivarse del préstamo (`loanEstado`) en vez de recibirse fija por bloque, para que una misma tarjeta no pueda mostrar una etiqueta que no corresponde a su estado.
   - La comprobación vive en `scratch/smoke-ops-views.mjs`, que monta las tres vistas con un préstamo en cada estado y verifica que cada bloque ofrece solo su acción (`node scratch/smoke-ops-views.mjs`).

3. **Bloque "Historial del día / Historial completo":**
   - La columna derecha aloja el **Historial de préstamos devueltos**, proporcionando trazabilidad inmediata de los equipos ya completados con su badge de estado y acceso a ticket.

4. **Diferenciación de los Botones de Filtro Superior:**
   - **Préstamos de hoy (`totalHoy`):** Muestra exclusivamente los préstamos activos y completados en la fecha de hoy.
   - **Todos los préstamos (`totalSistema`):** Muestra el volumen histórico completo de registros en el sistema (pendientes e histórico acumulado).

---

## 10. Optimización de Diseño Responsive para Móvil y Tablet

Se realizó una revisión integral de diseño adaptativo (responsive) en toda la aplicación, enfocándose especialmente en la vista del trabajador (`#/ops`) y componentes transversales (topbar, tablas, modales y formularios):

1. **Corrección de Márgenes y Espaciados Críticos ("Al Borde"):**
   - Se incrementó el espaciado horizontal de `.pmi-container` en pantallas móviles a `padding: 0 22px` con soporte nativo de `env(safe-area-inset)` (y `28px` a `40px` en tablets y escritorios), evitando que títulos como *"Panel · Trabajador"* y subtítulos como *"Control de entregas del día..."* queden pegados a los bordes físicos del teléfono.
   - Se estableció un margen inferior automático de `22px` en el primer bloque de cabecera de todas las vistas (`.pmi-main > :first-child`), garantizando separación visual consistente frente a las tarjetas inferiores.
   - En móviles (`max-width: 640px`), se configuró el padding vertical de `.pmi-main` a `24px 0 40px 0` para un resguardo superior confortable respecto a la barra de navegación.

2. **Ajuste de la Barra Superior (`topbar`) en Dispositivos Móviles:**
   - **Activación de clases ocultas (`.pmi-hidden-xs`):** Se definió la regla CSS que oculta el subtítulo institucional y el nombre del usuario en pantallas menores a 640px, dejando el logo limpio de EAFIT y el avatar circular.
   - **Buscador Expandido:** Con la liberación de espacio horizontal, el input de búsqueda ya no se colapsa a `Buscar |`, sino que mantiene un ancho amplio, altura táctil de `36px` y fuente equilibrada de `12.5px`.

3. **Reorganización Simétrica de Cabecera y Botones de Acción:**
   - En pantallas móviles, el grupo de botones (`Gestionar catálogo`, `Administrar usuarios`, `Ver solicitudes históricas`) ahora adopta una cuadrícula equilibrada 2x1:
     - Fila 1: `Gestionar catálogo` (50%) y `Administrar usuarios` (50%).
     - Fila 2: `Ver solicitudes históricas →` (100% de ancho, centrado y destacado con color institucional primario).
   - Se eliminó el salto de línea asimétrico e irregular que empujaba los botones contra el borde derecho.

4. **Rediseño Adaptativo de la Cuadrícula KPI (`.pmi-kpi-grid`):**
   - **En Tablet (641px - 1024px):** Se configuró a 2 columnas (`repeat(2, 1fr)`). Esto previene que las 4 tarjetas se compriman en una sola fila donde textos como *"En uso / No disponibles"* colisionaban con los puntos indicadores.
   - **En Móvil (< 640px):** Cuadrícula limpia 2x2 con padding interno reducido (`12px 14px`), tipografías proporcionales (`22px` en valores numéricos) y altura de línea adecuada para evitar desbordes.

5. **Barra de Filtros y Tarjeta de Préstamos:**
   - Los botones de selector `Préstamos de hoy` y `Todos los préstamos` se transforman en una grilla de 2 columnas de 50% cada una en móvil, evitando colisiones con los bordes de la tarjeta `.ui-card`.
   - El texto explicativo inferior se coloca en su propia fila con márgenes de lectura holgados.
   - **Tarjeta de préstamo (`.pmi-loan-card`):**
     - En el pie de tarjeta, las notas y los botones de acción (`Marcar como entregado` y `Ver ticket →`) ahora se adaptan verticalmente en móvil, permitiendo botones anchos y de fácil pulsación con el pulgar (`height: 36px`).
     - Protección de desbordamiento de cadenas largas de correo institucional mediante `word-break: break-word`.

6. **Panel de "Filtros" en Catálogo de Estudiantes (`#/catalogo`):**
   - Se eliminó el ancho fijo `width: 280px; flex-shrink: 0;` en pantallas móviles y tablets ($\le 900\text{px}$), asignándole `width: 100% !important; margin: 0 auto; box-sizing: border-box;`.
   - Ahora el bloque de filtros ocupa armónicamente todo el ancho del contenedor del dispositivo móvil sin dejar espacios vacíos a la derecha, alineándose perfectamente con las tarjetas del catálogo.
   - En pantallas de escritorio ($> 900\text{px}$), se mantiene el diseño original de barra lateral fija de $280\text{px}$ a la izquierda.

7. **Mejoras en Tablas y Modales:**
   - Se activó `-webkit-overflow-scrolling: touch` en todas las envolturas de tablas (`.pmi-table-wrap`) para un deslizamiento táctil nativo en iOS y Android.
   - Los modales ahora se adaptan con radios más suaves (`16px`), padding reducido y `max-height: 94vh` en dispositivos móviles.

---

## 11. Corrección Estructural de Márgenes en Vistas de Gestión y Administración Móvil

Se identificó y solucionó la causa raíz por la cual los títulos, botones y bloques aparecían completamente pegados a los bordes de la pantalla (a 0px de margen) al navegar en vistas administrativas (`#/ops/catalogo`, `#/ops/usuarios`, `#/ops/solicitudes` y `#/ops/ticket/:id`) en teléfonos y tablets:

1. **Corrección de la Colisión de Estilos entre `.pmi-container` y `.pmi-main`:**
   - En `app.css`, la clase `.pmi-main` tenía definida la propiedad shorthand `padding: 32px 0 48px 0;` (y en pantallas móviles `padding: 24px 0 40px 0;`).
   - Dado que el elemento principal de la SPA es `<main class="pmi-container pmi-main">`, la regla de `.pmi-main` (al declararse después en el archivo CSS) sobrescribía a cero (`0px`) el `padding-left` y `padding-right` de `.pmi-container`.
   - Por esta razón, la barra superior mantenía márgenes normales pero todo el contenido interior tocaba el borde del cristal en dispositivos con resolución menor a 1200px.
   - **Solución implementada:** Se reformuló `.pmi-main` para gestionar exclusivamente el espaciado vertical (`padding-top: 32px; padding-bottom: 48px;` y `padding-top: 20px; padding-bottom: 40px;` en móviles), asegurando que el contenedor `.pmi-container` proteja permanentemente `padding-left: 20px` y `padding-right: 20px` (o `max(20px, env(safe-area-inset-*))`), con `box-sizing: border-box`.

2. **Estandarización de Cabeceras Administrativas (`.pmi-admin-header` y `.pmi-admin-header-actions`):**
   - Se reemplazaron los contenedores flex genéricos en `ops-catalogo.js`, `ops-usuarios.js`, `ops-solicitudes.js` y `ops-ticket.js` por las clases semánticas `.pmi-admin-header` y `.pmi-admin-header-actions`.
   - En pantallas móviles ($\le 640\text{px}$), las cabeceras se organizan en columna ordenada, y los botones de acción (`[← Volver]` y `[+ Nuevo recurso / usuario]`) se presentan en una grilla simétrica de 2 columnas al 50% de ancho con altura táctil estandarizada (`38px`).

3. **Optimización de Tarjetas de Recursos y Gestión de Unidades (`.pmi-resource-card-head`, `.pmi-resource-card-actions`):**
   - En `ops-catalogo.js`, la cabecera de cada tarjeta de equipo se adapta a columna en móviles con botones de `Editar` y `Eliminar` distribuidos al 50% de ancho, eliminando desbordes o compresión de textos.

4. **Optimización de Tarjetas de Usuarios (`.pmi-user-item`, `.pmi-user-actions`):**
   - En `ops-usuarios.js`, la lista de usuarios se reorganiza fluidamente en móviles: los datos de la persona se mantienen legibles y los botones de gestión (`Editar`, `Banear/Desbanear`, `Eliminar`) adoptan una cuadrícula flexible.

5. **Scroll Horizontal Fluido en Tablas Históricas (`.pmi-table-wrap`):**
   - En `ops-solicitudes.js`, se removió el estilo en línea `overflow: hidden` que recortaba las columnas en pantallas estrechas, reemplazándolo por `.pmi-table-wrap` con scroll horizontal táctil nativo (`-webkit-overflow-scrolling: touch; overflow-x: auto`).

---

## 12. Integración de la Mascota Institucional de MediaLab en la Barra Superior

Se integró la mascota oficial de MediaLab (`Armadillo_libro.png`) en la barra de navegación superior (`topbar`):

1. **Configuración en `functions.php`:** Se añadió `mascotUrl` dentro del objeto `PMI_CONFIG` para resolver la URL de la imagen de forma dinámica según el directorio del tema activo.
2. **Estructura en `topbar.js`:** La mascota se ubicó junto al logotipo de EAFIT, separada por un divisor sutil (`.pmi-logo-divider`) y vinculada al enlace de inicio/catálogo (`.pmi-logo`).
3. **Estilos y Microinteracciones en `app.css`:**
   - En pantallas de escritorio: Tamaño proporcional de $42\text{px} \times 42\text{px}$ con sombra suave (`drop-shadow`) y animación lúdica al pasar el cursor (`transform: scale(1.12) rotate(-3deg)`).
   - En pantallas móviles ($\le 640\text{px}$): Escala a $32\text{px} \times 32\text{px}$, manteniéndose visible junto al logo de EAFIT para dar identidad visual inmediata sin comprometer el espacio de la barra de búsqueda.

---

## 13. Visualización Completa de Datos del Solicitante, Responsable y Tiempos en Tickets y Pedidos

Para resolver la omisión de los nombres registrados de los usuarios en la vista de detalle del préstamo (`#/ops/ticket/:id` y `#/prestamo/:id`), se implementó la resolución cruzada con la tabla de usuarios registrados (`store.users` / `wp_pmi_usuario`), garantizando que no se visualicen correos crudos aislados, sino la ficha completa y profesional de los participantes:

1. **Resolución de Nombres Registrados (`borrowerName` y `responsibleName`):**
   - Anteriormente, tanto la vista de tickets como la del pedido del usuario imprimían directamente `prestamo.usuario_solicitante` y `prestamo.usuario_responsable` (cadenas de correo electrónico en bruto).
   - Se actualizó el método de búsqueda de usuario en el store (`store.users.getByCorreo`) para ser insensible a mayúsculas/minúsculas y descartar espacios en blanco accidentales.
   - Si el usuario existe en la base de datos, se extrae y muestra su **Nombre Completo Oficial** (por ejemplo: `Prof. Carlos Restrepo` o `Practicante Ecolabs`). En caso de no tener perfil registrado, se utiliza el prefijo del correo como respaldo limpio.

2. **Ficha Completa del Solicitante (`ops-ticket.js` y `detalle-pedido.js`):**
   - **Nombre Completo:** En tipografía destacada (`font-weight: 700; font-size: 15px; color: var(--eafit-navy);`).
   - **Rol Institucional:** Etiqueta distintiva con colores oficiales (`Docente` en píldora amarilla institucional de advertencia/jerarquía, `Estudiante` en píldora neutral).
   - **Correo Electrónico Institucional:** Desplegado con claridad debajo del nombre.
   - **Teléfono de Contacto:** Resolución automática que primero evalúa el campo `numero` del usuario y, si no existe o es "N/A", extrae automáticamente el número telefónico de las notas del préstamo mediante expresiones regulares (`Tel: 3164782344`), eliminando el prefijo redundante `+57`.

3. **Ficha Completa del Responsable del MediaLab:**
   - **Nombre Completo del Trabajador:** En tipografía destacada.
   - **Cargo o Rol Operativo:** Píldora informativa (`Practicante`, `Trabajador`, `Administrador`).
   - **Correo Electrónico Institucional:** `practicante.ecolabs@eafit.edu.co`.
   - **Teléfono de Contacto del Laboratorio:** Teléfono directo asignado al trabajador.

4. **Trazabilidad Integral de Tiempos y Fechas:**
   - **Fecha de Solicitud:** Fecha y hora en la que se radicó el préstamo (`fmtDT(prestamo.Fecha_prestamo)`).
   - **Hora de Entrega:** Momento exacto del despacho del equipo (`fmtDT(prestamo.Hora_entrega)`). Si aún no se despacha, indica *"Pendiente de despacho"*.
   - **Hora de Devolución Real:** Si el préstamo ya fue entregado y devuelto (`Devuelto = 1`), se visualiza en verde destacado la hora exacta de retorno (`fmtDT(prestamo.Hora_devolucion)`).
   - **Período de Préstamo / Vigencia:** Se indica claramente si es *"Tiempo indefinido (permanece prestado hasta que el docente lo entregue)"* o la fecha límite prevista de devolución.
   - **Notas y Observaciones:** Bloque estilizado con fondo institucional suave (`var(--eafit-bg)`), borde limpio y respeto de saltos de línea (`white-space: pre-wrap`).

---

## 14. Estado Final del Proyecto y Recomendaciones de Despliegue

El paquete `Ecoprestamos_Entrega_EAFIT.zip` contiene la solución íntegra y probada para que los administradores de la plataforma EcoLabs procedan con el despliegue del subsitio `/ecoprestamos/`.

### 14.1. Verificaciones Técnicas Realizadas
- **Base de Datos Idempotente:** El volcado `ecoprestamos-database.sql` importa limpiamente en MySQL 8.4 y MariaDB: crea las tablas `wp_pmi_*`, llaves foráneas con prefijo dinámico, triggers de guarda de stock y datos semilla de catálogo y usuarios.
- **Inventario por Unidad Física:** Asignación atómica de números de activo fijo e IDs de unidad única, garantizando que préstamos concurrentes no colisionen.
- **Sintaxis y Compilación:** Todas las funciones PHP del plugin y los módulos JavaScript ES6 del tema compilan y validan sin advertencias ni errores.
- **Flujo operativo del trabajador:** `scratch/smoke-ops-views.mjs` monta el panel (`ops-dashboard.js`), la bandeja (`ops-solicitudes.js`) y el ticket (`ops-ticket.js`) con un préstamo en cada estado, y confirma que cada bloque ofrece únicamente la acción de su hito: la entrega no libera stock y la devolución sí.
- **Diseño Responsive:** Verificación en resoluciones móviles ($360\text{px} - 430\text{px}$), tablets ($768\text{px} - 1024\text{px}$) y pantallas de escritorio ($1200\text{px}+$ con márgenes y safe-area asegurados).

### 14.2. Recomendaciones para el Primer Despliegue
1. Desplegar el paquete en un subsitio de prueba (`/ecoprestamos/`) antes de abrirlo al público estudiantil general.
2. Realizar el cambio de las contraseñas iniciales de las cuentas semilla (`medialab@eafit.edu.co`, `practicante.ecolabs@eafit.edu.co`, `profesor.prueba@eafit.edu.co`) una vez verificado el acceso.
3. Comprobar que el hook `wp_head()` y las reglas de reescritura de WordPress Multisite se encuentren correctamente configuradas en el servidor Nginx/Apache de EAFIT.
