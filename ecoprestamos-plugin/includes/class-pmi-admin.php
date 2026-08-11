<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Menu de administracion de "Medialab Prestamos": una unica pantalla de
 * estado/configuracion (no hay ajustes de negocio que exponer aqui, la app
 * en si vive en el tema) para que un administrador pueda verificar de un
 * vistazo que el plugin, sus tablas y el tema esten correctamente
 * configurados en el sitio actual, y repararlos con un click si no.
 */
class PMI_Admin
{
    const MENU_SLUG = 'pmi-dashboard';
    const USERS_SLUG = 'pmi-users';

    /**
     * Mismo icono SVG que usa el menu "EAFIT Lab" (ver
     * wp-content/plugins/eafit-lab-core/eafit-lab-core.php), para que
     * "Medialab Prestamos" se vea como parte de la misma suite EAFIT en el
     * menu de administracion.
     */
    private $menu_icon = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDMyIDMyIj4KICA8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMzAuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogMi4xLjEgQnVpbGQgMTIzKSAgLS0+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5zdDAgewogICAgICAgIGZpbGw6ICNmZmY7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik0xNiwyLjI5Yy03LjU3LDAtMTMuNzEsNi4xNC0xMy43MSwxMy43MSwwLC4xNiwwLC4zMy4wMS40OS4yNyw1LjE0LDQuNjcsOS4xLDEwLjY3LDguODUsMS42Mi0uMDcsMy4wOS0uODQsNC4zMS0xLjkyLjM2LS4zMi44My0uNTIsMS4zNS0uNTIsMS4yOCwwLDIuMjksMS4xOSwxLjk4LDIuNTItLjE3Ljc1LS43OCwxLjM2LTEuNTMsMS41Mi0uMjYuMDYtLjUzLjA2LS43Ny4wMi0xLjA5LS4xNi0yLjE4LS4yNi0zLjI4LS4xNy00Ljg0LjQzLTkuMDEtMS40Ni0xMS42Mi01LjM0LDIuMTEsNC44Niw2Ljk1LDguMjUsMTIuNTgsOC4yNSw3LjU3LDAsMTMuNzEtNi4xNCwxMy43MS0xMy43MVMyMy41OCwyLjI5LDE2LDIuMjlaTTIyLjcyLDEwLjg1aC03Ljc2djFjLS4wMS4yNS0uMDIuNS0uMDQuNzV2LjE5Yy0uMDIuMTUtLjAzLjMtLjA0LjQ0aC4yOGMyLjExLS4wNiw0LjIxLS4wOSw2LjMyLS4wOC0uMDMuNDYtLjA2LjkxLS4wOSwxLjM3LS4wMS4xNi0uMDIuMzEtLjAzLjQ3LS4wMi4yMi0uMDMuNDUtLjA1LjY3di4yMXMtLjAzLjItLjAzLjJ2LjE3cS0uMDMuMTQtLjExLjI5bC02LjYuMDh2MWMwLC4yMS0uMDIuNDEtLjAzLjYybC0uMDIuMjljLS4wMi4xOS0uMDUuMzctLjEuNTVoLjIyYy43LS4wMiwxLjQtLjA0LDIuMDktLjA2LjM2LDAsLjcyLS4wMiwxLjA4LS4wM3EzLjA1LS4wOCw0LjQ0LS4wN2MwLC42My0uMDIsMS4yNS0uMDYsMS44OC0uMDEuMTYtLjAyLjMxLS4wMy40N2wtLjAyLjMtLjAyLjI3cS0uMDIuMjItLjEuNDVoLTEyLjljLjA1LS44NS4wOS0xLjcuMTgtMi41NS40MS00LjAzLjQ2LTguMDguNTktMTIuMTJoMTIuOThsLS4xNSwzLjIzWiIvPgo8L3N2Zz4=';

    /**
     * Engancha el menu de administracion y los handlers de admin-post.php
     * (reparar, correo de prueba, cambiar rol) a sus hooks de WordPress.
     */
    public function __construct()
    {
        add_action('admin_menu', array($this, 'register_menu'));
        add_action('admin_post_pmi_repair', array($this, 'handle_repair'));
        add_action('admin_post_pmi_test_email', array($this, 'handle_test_email'));
        add_action('admin_post_pmi_set_role', array($this, 'handle_set_role'));
    }

    /**
     * Se registra como menu de nivel superior en la posicion 3.1: justo
     * debajo de "EAFIT Lab" (posicion 3 en eafit-lab-core.php).
     *
     * @return void
     */
    public function register_menu()
    {
        add_menu_page(
            'Medialab Prestamos',
            'Medialab Prestamos',
            'manage_options',
            self::MENU_SLUG,
            array($this, 'render'),
            $this->menu_icon,
            3.1
        );

        // Renombra el submenu que WordPress duplica automaticamente del
        // add_menu_page() de arriba, para que no diga "Medialab Prestamos"
        // dos veces en el sidebar.
        add_submenu_page(self::MENU_SLUG, 'Medialab Prestamos - Estado', 'Estado', 'manage_options', self::MENU_SLUG, array($this, 'render'));

        add_submenu_page(self::MENU_SLUG, 'Medialab Prestamos - Usuarios', 'Usuarios', 'manage_options', self::USERS_SLUG, array($this, 'render_users'));
    }

    /**
     * Igual que menu_page_url(), pero funciona tambien desde admin-post.php:
     * ese endpoint nunca dispara el hook 'admin_menu', asi que las paginas
     * registradas por register_menu() no existen todavia en ese contexto y
     * menu_page_url() devuelve '' -- lo que hacia que add_query_arg() cayera
     * de vuelta a la URL actual (admin-post.php) en vez de la pagina real,
     * dejando al usuario varado ahi despues de guardar. admin_url() no
     * depende de ese registro y funciona en cualquier contexto.
     *
     * @param string $slug Slug de la pagina de administracion (ver MENU_SLUG/USERS_SLUG).
     * @param array  $args Argumentos de query string adicionales para la URL.
     * @return string URL absoluta de la pagina de administracion.
     */
    private function page_url($slug, array $args = array())
    {
        return add_query_arg($args, admin_url('admin.php?page=' . $slug));
    }

    /**
     * Mapa de etiqueta legible => nombre de tabla para las tablas propias
     * del plugin, usado por el panel de estado para verificar que existan.
     *
     * @return array Mapa etiqueta => nombre de tabla.
     */
    private function expected_tables()
    {
        return array(
            'usuario' => PMI_DB::usuario(),
            'recurso' => PMI_DB::recurso(),
            'prestamo' => PMI_DB::prestamo(),
            'detalle_prestamo' => PMI_DB::detalle_prestamo(),
        );
    }

    /**
     * Verifica si una tabla existe en la base de datos actual.
     *
     * @param string $table Nombre completo de la tabla.
     * @return bool True si la tabla existe.
     */
    private function table_exists($table)
    {
        global $wpdb;
        return (bool) $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
    }

    /**
     * Callback de la pagina de menu "Medialab Prestamos > Estado": muestra
     * el estado del plugin, del tema y de las tablas de base de datos, y el
     * historial de errores recientes. Requiere capacidad manage_options.
     *
     * @return void
     */
    public function render()
    {
        if (!current_user_can('manage_options')) {
            wp_die('No autorizado.');
        }

        $theme = wp_get_theme();
        $is_pmi_theme = $theme->get_stylesheet() === 'ecoprestamos-theme';
        $theme_ok = !$is_pmi_theme || (get_option('template') === get_option('stylesheet'));

        $tables = array();
        $tables_ok = true;
        foreach ($this->expected_tables() as $label => $table) {
            $exists = $this->table_exists($table);
            $tables_ok = $tables_ok && $exists;
            $tables[] = array('label' => $label, 'table' => $table, 'exists' => $exists);
        }

        $all_ok = $tables_ok && $theme_ok;
        ?>
        <div class="wrap">
            <h1>Medialab Prestamos</h1>

            <?php if (isset($_GET['pmi_repaired'])) : ?>
                <div class="notice notice-success is-dismissible"><p>Verificacion completada.</p></div>
            <?php endif; ?>

            <?php if (isset($_GET['pmi_test_email_sent'])) : ?>
                <div class="notice notice-success is-dismissible"><p>Correo de prueba enviado a <?php echo esc_html(PMI_Error_Log::NOTIFY_EMAIL); ?>.</p></div>
            <?php endif; ?>

            <h2 class="title">Plugin</h2>
            <table class="widefat striped" style="max-width:640px;">
                <tbody>
                    <tr>
                        <td>Nombre</td>
                        <td>Medialab Prestamos</td>
                    </tr>
                    <tr>
                        <td>Version</td>
                        <td><?php echo esc_html(defined('PMI_VERSION') ? PMI_VERSION : '—'); ?></td>
                    </tr>
                </tbody>
            </table>

            <h2 class="title">Tema</h2>
            <table class="widefat striped" style="max-width:640px;">
                <tbody>
                    <tr>
                        <td>Tema activo</td>
                        <td><?php echo esc_html($theme->get('Name') . ' (' . $theme->get_stylesheet() . ')'); ?></td>
                    </tr>
                    <tr>
                        <td>Version del tema</td>
                        <td><?php echo esc_html($theme->get('Version')); ?></td>
                    </tr>
                    <tr>
                        <td>Configuracion</td>
                        <td>
                            <?php if (!$is_pmi_theme) : ?>
                                <span style="color:#996800;">⚠ El tema activo no es "ecoprestamos-theme"; la app de prestamos no se mostrara en este sitio.</span>
                            <?php elseif ($theme_ok) : ?>
                                <span style="color:#1a7f37;">✔ Correcta (template y stylesheet coinciden)</span>
                            <?php else : ?>
                                <span style="color:#b32d2e;">✘ Inconsistente: template="<?php echo esc_html(get_option('template')); ?>" vs stylesheet="<?php echo esc_html(get_option('stylesheet')); ?>". Esto hace que WordPress muestre las plantillas de otro tema en vez de la app.</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>

            <h2 class="title">Base de datos</h2>
            <table class="widefat striped" style="max-width:640px;">
                <thead>
                    <tr><th>Tabla</th><th>Estado</th></tr>
                </thead>
                <tbody>
                    <?php foreach ($tables as $t) : ?>
                        <tr>
                            <td><?php echo esc_html($t['table']); ?></td>
                            <td>
                                <?php if ($t['exists']) : ?>
                                    <span style="color:#1a7f37;">✔ Existe</span>
                                <?php else : ?>
                                    <span style="color:#b32d2e;">✘ Falta</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

            <p style="margin-top:16px;">
                <?php if ($all_ok) : ?>
                    <strong style="color:#1a7f37;">Todo esta correctamente configurado en este sitio.</strong>
                <?php else : ?>
                    <strong style="color:#b32d2e;">Hay problemas de configuracion en este sitio.</strong>
                <?php endif; ?>
            </p>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="pmi_repair" />
                <?php wp_nonce_field('pmi_repair'); ?>
                <button type="submit" class="button button-primary">Verificar y reparar</button>
            </form>
            <p class="description">Crea las tablas que falten y, si el tema es "ecoprestamos-theme", corrige la configuracion template/stylesheet si esta desalineada.</p>

            <h2 class="title">Errores recientes</h2>
            <p class="description">
                Cada vez que la API devuelve un error tecnico (500) o hay un fatal error del plugin/tema,
                queda registrado aqui y se avisa por correo a <strong><?php echo esc_html(PMI_Error_Log::NOTIFY_EMAIL); ?></strong>
                (maximo un correo cada 15 minutos por tipo de error, para no saturar el buzon).
            </p>
            <?php $errors = PMI_Error_Log::get_recent(20); ?>
            <?php if (empty($errors)) : ?>
                <p><em>Sin errores registrados.</em></p>
            <?php else : ?>
                <table class="widefat striped" style="max-width:900px;">
                    <thead>
                        <tr><th>Fecha</th><th>Codigo</th><th>Mensaje</th></tr>
                    </thead>
                    <tbody>
                        <?php foreach ($errors as $err) : ?>
                            <tr>
                                <td style="white-space:nowrap;"><?php echo esc_html($err['time']); ?></td>
                                <td><code><?php echo esc_html($err['code']); ?></code></td>
                                <td><?php echo esc_html($err['message']); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:12px;">
                <input type="hidden" name="action" value="pmi_test_email" />
                <?php wp_nonce_field('pmi_test_email'); ?>
                <button type="submit" class="button">Enviar correo de prueba</button>
            </form>
            <p class="description">Manda un correo de prueba a <?php echo esc_html(PMI_Error_Log::NOTIFY_EMAIL); ?> para confirmar que las notificaciones llegan (usa el envio de correo configurado en el sitio, ej. WP Mail SMTP).</p>
        </div>
        <?php
    }

    /**
     * Callback de admin-post.php para la accion "pmi_test_email" (boton
     * "Enviar correo de prueba" del panel de estado). Requiere capacidad
     * manage_options y nonce valido.
     *
     * @return void
     */
    public function handle_test_email()
    {
        if (!current_user_can('manage_options') || !check_admin_referer('pmi_test_email')) {
            wp_die('No autorizado.');
        }

        PMI_Error_Log::send_test_email();

        wp_safe_redirect($this->page_url(self::MENU_SLUG, array('pmi_test_email_sent' => '1')));
        exit;
    }

    /**
     * Callback de admin-post.php para la accion "pmi_repair" (boton
     * "Verificar y reparar" del panel de estado): vuelve a correr la
     * activacion del plugin y corrige la configuracion template/stylesheet
     * si el tema activo es "ecoprestamos-theme" y esta desalineada.
     * Requiere capacidad manage_options y nonce valido.
     *
     * @return void
     */
    public function handle_repair()
    {
        if (!current_user_can('manage_options') || !check_admin_referer('pmi_repair')) {
            wp_die('No autorizado.');
        }

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        PMI_Activator::activate();

        $stylesheet = get_option('stylesheet');
        if ($stylesheet === 'ecoprestamos-theme' && get_option('template') !== $stylesheet) {
            switch_theme($stylesheet);
        }

        wp_safe_redirect($this->page_url(self::MENU_SLUG, array('pmi_repaired' => '1')));
        exit;
    }

    /**
     * Pantalla "Usuarios": todo usuario nuevo se auto-registra siempre como
     * Estudiante (ver create_user() en class-pmi-rest-usuarios.php, es una
     * regla de seguridad para que nadie se auto-asigne Trabajador desde el
     * formulario publico). Esta pantalla es la forma de que un administrador
     * de WordPress -- que no necesariamente tiene una cuenta Trabajador
     * dentro de la app -- pueda promover al primer Trabajador o corregir el
     * rol de alguien sin pasar por la app.
     *
     * Callback de la pagina de menu "Medialab Prestamos > Usuarios".
     * Requiere capacidad manage_options.
     *
     * @return void
     */
    public function render_users()
    {
        if (!current_user_can('manage_options')) {
            wp_die('No autorizado.');
        }

        if (!$this->table_exists(PMI_DB::usuario())) {
            ?>
            <div class="wrap">
                <h1>Usuarios</h1>
                <div class="notice notice-warning"><p>
                    La tabla de usuarios todavia no existe en este sitio.
                    Ve a <a href="<?php echo esc_url(menu_page_url(self::MENU_SLUG, false)); ?>">Medialab Prestamos &gt; Estado</a>
                    y usa "Verificar y reparar" primero.
                </p></div>
            </div>
            <?php
            return;
        }

        global $wpdb;
        $search = isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '';

        if ($search !== '') {
            $like = '%' . $wpdb->esc_like($search) . '%';
            $users = $wpdb->get_results($wpdb->prepare(
                'SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE correo LIKE %s OR nombre LIKE %s ORDER BY nombre ASC LIMIT 200',
                $like,
                $like
            ), ARRAY_A);
        } else {
            $users = $wpdb->get_results('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' ORDER BY nombre ASC LIMIT 200', ARRAY_A);
        }
        ?>
        <div class="wrap">
            <h1>Usuarios</h1>
            <p class="description">
                Todo registro publico crea al usuario como <strong>Estudiante</strong> (es una regla de seguridad,
                no un descuido). Desde aqui puedes cambiar el rol a <strong>Trabajador</strong> para dar acceso al
                panel de operaciones de la app, sin depender de que ya exista otro Trabajador que lo haga desde ahi.
            </p>

            <?php if (isset($_GET['pmi_role_updated'])) : ?>
                <div class="notice notice-success is-dismissible"><p>Rol actualizado.</p></div>
            <?php endif; ?>

            <form method="get" style="margin:16px 0;">
                <input type="hidden" name="page" value="<?php echo esc_attr(self::USERS_SLUG); ?>" />
                <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Buscar por nombre o correo..." class="regular-text" />
                <button type="submit" class="button">Buscar</button>
                <?php if ($search !== '') : ?>
                    <a href="<?php echo esc_url(menu_page_url(self::USERS_SLUG, false)); ?>" class="button">Limpiar</a>
                <?php endif; ?>
            </form>

            <?php if (empty($users)) : ?>
                <p><em>No hay usuarios<?php echo $search !== '' ? ' que coincidan con la busqueda' : ''; ?>.</em></p>
            <?php else : ?>
                <table class="widefat striped" style="max-width:1000px;">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Correo</th>
                            <th>Celular</th>
                            <th>Estado</th>
                            <th>Rol</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($users as $u) :
                            $row_id = 'pmi-role-' . md5($u['correo']);
                        ?>
                            <tr>
                                <td><?php echo esc_html($u['nombre']); ?></td>
                                <td><?php echo esc_html($u['correo']); ?></td>
                                <td><?php echo esc_html($u['numero']); ?></td>
                                <td><?php echo $u['baneado'] ? '<span style="color:#b32d2e;">Baneado</span>' : '—'; ?></td>
                                <td colspan="2">
                                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="pmi-role-form" style="display:flex; gap:8px; align-items:center;">
                                        <input type="hidden" name="action" value="pmi_set_role" />
                                        <input type="hidden" name="correo" value="<?php echo esc_attr($u['correo']); ?>" />
                                        <input type="hidden" name="s" value="<?php echo esc_attr($search); ?>" />
                                        <?php wp_nonce_field('pmi_set_role_' . $u['correo']); ?>
                                        <select name="rol" id="<?php echo esc_attr($row_id); ?>-rol">
                                            <option value="Estudiante" <?php selected($u['rol'], 'Estudiante'); ?>>Estudiante</option>
                                            <option value="Trabajador" <?php selected($u['rol'], 'Trabajador'); ?>>Trabajador</option>
                                        </select>
                                        <?php
                                        // Sin opcion vacia: si todavia no tiene un tipo asignado (ej. se
                                        // acaba de pasar de Estudiante a Trabajador), se preselecciona
                                        // "Trabajador" en vez de dejar el campo sin valor.
                                        $trabajo_actual = $u['trabajo'] ?: 'Trabajador';
                                        ?>
                                        <select name="trabajo" id="<?php echo esc_attr($row_id); ?>-trabajo" style="<?php echo $u['rol'] === 'Trabajador' ? '' : 'display:none;'; ?>">
                                            <option value="Trabajador" <?php selected($trabajo_actual, 'Trabajador'); ?>>Trabajador</option>
                                            <option value="Practicante" <?php selected($trabajo_actual, 'Practicante'); ?>>Practicante</option>
                                        </select>
                                        <button type="submit" class="button button-small">Guardar</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <?php if (count($users) === 200) : ?>
                    <p class="description">Se muestran los primeros 200 resultados. Usa el buscador para acotar.</p>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <script>
        (function () {
            document.querySelectorAll('.pmi-role-form').forEach(function (form) {
                var rol = form.querySelector('select[name="rol"]');
                var trabajo = form.querySelector('select[name="trabajo"]');
                rol.addEventListener('change', function () {
                    trabajo.style.display = rol.value === 'Trabajador' ? '' : 'none';
                });
            });
        })();
        </script>
        <?php
    }

    /**
     * Callback de admin-post.php para la accion "pmi_set_role" (formulario
     * de rol en la pantalla "Usuarios"): actualiza el Rol y Trabajo de un
     * usuario. Requiere capacidad manage_options y nonce valido por correo.
     *
     * @return void
     */
    public function handle_set_role()
    {
        if (!current_user_can('manage_options')) {
            wp_die('No autorizado.');
        }

        $correo = isset($_POST['correo']) ? sanitize_email(wp_unslash($_POST['correo'])) : '';
        if (!$correo || !check_admin_referer('pmi_set_role_' . $correo)) {
            wp_die('No autorizado.');
        }

        $rol = isset($_POST['rol']) && $_POST['rol'] === 'Trabajador' ? 'Trabajador' : 'Estudiante';
        $trabajo = $rol === 'Trabajador'
            ? (!empty($_POST['trabajo']) ? sanitize_text_field(wp_unslash($_POST['trabajo'])) : 'Trabajador')
            : null;

        global $wpdb;
        $wpdb->update(
            PMI_DB::usuario(),
            array('rol' => $rol, 'trabajo' => $trabajo),
            array('correo' => $correo),
            array('%s', '%s'),
            array('%s')
        );

        $args = array('pmi_role_updated' => '1');
        if (!empty($_POST['s'])) {
            $args['s'] = sanitize_text_field(wp_unslash($_POST['s']));
        }

        wp_safe_redirect($this->page_url(self::USERS_SLUG, $args));
        exit;
    }
}
