<?php
/**
 * Main plugin bootstrap.
 *
 * @package TicSuite\Graficos
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TSG_Plugin
 *
 * Wires every sub-module of the plugin once WordPress is ready. Manages
 * one TSG_Data_Provider per project (nacion, ondas, …).
 */
final class TSG_Plugin {

	/**
	 * Project registry — slug → human label. The first one is the default.
	 */
	public const PROJECTS = [
		'nacion' => 'Py Nación',
		'ondas'  => 'Py Ondas',
	];

	public const DEFAULT_PROJECT = 'nacion';

	/**
	 * Singleton instance.
	 *
	 * @var TSG_Plugin|null
	 */
	private static ?TSG_Plugin $instance = null;

	public TSG_Security $security;
	public TSG_Chart_Types $chart_types;
	public TSG_Shortcode $shortcode;
	public TSG_Admin $admin;
	public TSG_Rest_Api $rest_api;
	public TSG_Dashboard $dashboard;

	/**
	 * Data providers keyed by project slug.
	 *
	 * @var array<string, TSG_Data_Provider>
	 */
	private array $data_providers = [];

	/**
	 * Get the singleton.
	 */
	public static function instance(): TSG_Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor.
	 */
	private function __construct() {
		$this->security    = new TSG_Security();
		$this->chart_types = new TSG_Chart_Types();

		foreach ( array_keys( self::PROJECTS ) as $project ) {
			$this->data_providers[ $project ] = new TSG_Data_Provider( $this->security, $project );
		}

		$this->shortcode = new TSG_Shortcode( $this, $this->chart_types, $this->security );
		$this->admin     = new TSG_Admin( $this, $this->chart_types, $this->security );
		$this->rest_api  = new TSG_Rest_Api( $this, $this->chart_types, $this->security );
		$this->dashboard = new TSG_Dashboard( $this->security );
	}

	/**
	 * Return the data provider for the given project (or the default).
	 */
	public function data_provider( ?string $project = null ): TSG_Data_Provider {
		$slug = $this->normalize_project( $project );
		return $this->data_providers[ $slug ];
	}

	/**
	 * Whitelist a project slug against PROJECTS — returns the default slug
	 * when the input is unknown.
	 */
	public function normalize_project( ?string $project ): string {
		$slug = sanitize_key( (string) ( $project ?? self::DEFAULT_PROJECT ) );
		return isset( self::PROJECTS[ $slug ] ) ? $slug : self::DEFAULT_PROJECT;
	}

	/**
	 * List every project as [ slug => label, … ].
	 *
	 * @return array<string, string>
	 */
	public function projects(): array {
		return self::PROJECTS;
	}

	/**
	 * Register hooks for each submodule.
	 */
	public function run(): void {
		load_plugin_textdomain( 'tic-suite-graficos', false, dirname( TSG_PLUGIN_BASENAME ) . '/languages' );

		// Frontend & shortcode.
		$this->shortcode->register();

		// Admin UI.
		if ( is_admin() ) {
			$this->admin->register();
		}

		// Dashboards (shortcode, REST route, admin screen).
		$this->dashboard->register();

		// REST API.
		add_action( 'rest_api_init', [ $this->rest_api, 'register_routes' ] );

		// Assets.
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_public_assets' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_assets' ] );

		// Settings link on plugins page.
		add_filter( 'plugin_action_links_' . TSG_PLUGIN_BASENAME, [ $this, 'plugin_action_links' ] );
	}

	/**
	 * Activation hook: seed default options and prepare storage.
	 */
	public static function activate(): void {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		add_option(
			'tsg_settings',
			[
				'allow_shortcode_roles' => [ 'administrator', 'editor' ],
				'default_theme'         => 'tic-suite',
				'enable_cache'          => true,
				'cache_ttl'             => 600,
			]
		);
		if ( ! file_exists( TSG_DATA_DIR ) ) {
			wp_mkdir_p( TSG_DATA_DIR );
		}
	}

	/**
	 * Deactivation hook.
	 */
	public static function deactivate(): void {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		wp_cache_flush();
	}

	/**
	 * Enqueue public (frontend) assets. d3plus is registered but only loaded
	 * on pages that actually contain a TSG shortcode — see TSG_Shortcode.
	 */
	public function enqueue_public_assets(): void {
		wp_register_script(
			'd3plus',
			TSG_D3PLUS_URL,
			[],
			TSG_D3PLUS_VERSION,
			true
		);

		wp_register_script(
			'tsg-renderer',
			TSG_PLUGIN_URL . 'assets/js/renderer.js',
			[ 'd3plus' ],
			TSG_VERSION,
			true
		);

		wp_register_script(
			'tsg-frontend',
			TSG_PLUGIN_URL . 'assets/js/frontend.js',
			[ 'd3plus', 'tsg-renderer' ],
			TSG_VERSION,
			true
		);

		wp_register_style(
			'tsg-frontend',
			TSG_PLUGIN_URL . 'assets/css/frontend.css',
			[],
			TSG_VERSION
		);

		wp_localize_script(
			'tsg-frontend',
			'TSG_FRONTEND',
			[
				'restUrl' => esc_url_raw( rest_url( TSG_REST_NAMESPACE . '/render' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => [
					'loading' => __( 'Cargando gráfico…', 'tic-suite-graficos' ),
					'error'   => __( 'No fue posible renderizar el gráfico.', 'tic-suite-graficos' ),
					'empty'   => __( 'Sin datos para mostrar.', 'tic-suite-graficos' ),
				],
			]
		);
	}

	/**
	 * Enqueue admin assets only on TSG admin screens.
	 *
	 * @param string $hook Current admin screen hook.
	 */
	public function enqueue_admin_assets( string $hook ): void {
		// WP uses hooks like "toplevel_page_tic-suite",
		// "tic-suite_page_tic-suite-ondas", "tic-suite_page_tic-suite-shortcodes",
		// "tic-suite_page_tic-suite-datos". Any TIC Suite screen contains
		// the `tic-suite` substring.
		if ( strpos( $hook, 'tic-suite' ) === false ) {
			return;
		}

		wp_enqueue_script(
			'd3plus',
			TSG_D3PLUS_URL,
			[],
			TSG_D3PLUS_VERSION,
			true
		);

		wp_enqueue_script(
			'tsg-renderer',
			TSG_PLUGIN_URL . 'assets/js/renderer.js',
			[ 'd3plus' ],
			TSG_VERSION,
			true
		);

		wp_enqueue_script(
			'tsg-admin',
			TSG_PLUGIN_URL . 'assets/js/admin.js',
			[ 'd3plus', 'tsg-renderer', 'wp-i18n' ],
			TSG_VERSION,
			true
		);

		// Load the frontend stylesheet inside the admin too so the builder
		// preview renders with the exact same look as the public output.
		wp_enqueue_style(
			'tsg-frontend',
			TSG_PLUGIN_URL . 'assets/css/frontend.css',
			[ 'dashicons' ],
			TSG_VERSION
		);

		wp_enqueue_style(
			'tsg-admin',
			TSG_PLUGIN_URL . 'assets/css/admin.css',
			[ 'tsg-frontend', 'dashicons' ],
			TSG_VERSION
		);

		wp_localize_script(
			'tsg-admin',
			'TSG_ADMIN',
			[
				'restUrl'     => esc_url_raw( rest_url( TSG_REST_NAMESPACE ) ),
				'nonce'       => wp_create_nonce( 'wp_rest' ),
				'adminNonce'  => wp_create_nonce( TSG_NONCE_ACTION ),
				'chartTypes'  => $this->chart_types->all_for_js(),
				'i18n'        => [
					'selectView'      => __( 'Selecciona una vista', 'tic-suite-graficos' ),
					'selectChart'     => __( 'Selecciona un tipo de gráfico', 'tic-suite-graficos' ),
					'copied'          => __( '¡Shortcode copiado!', 'tic-suite-graficos' ),
					'copyFailed'      => __( 'No se pudo copiar al portapapeles.', 'tic-suite-graficos' ),
					'noCompatible'    => __( 'Esta vista no tiene gráficos compatibles.', 'tic-suite-graficos' ),
					'loading'         => __( 'Cargando…', 'tic-suite-graficos' ),
					'preview'         => __( 'Vista previa', 'tic-suite-graficos' ),
					'changeChart'     => __( 'Cambiar tipo de gráfico', 'tic-suite-graficos' ),
					'typeLabel'       => __( 'Tipo', 'tic-suite-graficos' ),
				],
			]
		);
	}

	/**
	 * Add a "Configuración" link next to the plugin on the plugins list.
	 *
	 * @param array $links Existing links.
	 */
	public function plugin_action_links( array $links ): array {
		$url = admin_url( 'admin.php?page=tic-suite-nacion' );
		array_unshift(
			$links,
			sprintf(
				'<a href="%1$s">%2$s</a>',
				esc_url( $url ),
				esc_html__( 'Abrir TIC Suite', 'tic-suite-graficos' )
			)
		);
		return $links;
	}
}
