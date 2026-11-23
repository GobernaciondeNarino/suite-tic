<?php
/**
 * Dashboard module: full interactive dashboards built with d3plus.
 *
 * @package TicSuite\Graficos
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TSG_Dashboard
 *
 * Registers the [tsg_dashboard] shortcode, the public REST endpoint that
 * serves its dataset and the "Dashboard" admin screen. Each dashboard is a
 * template (templates/dashboard/<id>.html) plus a dataset
 * (data/dashboards/<id>.json); both are whitelisted in DASHBOARDS.
 */
final class TSG_Dashboard {

	/**
	 * Registered dashboards — id → human label.
	 */
	public const DASHBOARDS = [
		'tic-narino' => 'Dashboard TIC Nariño',
	];

	public const DEFAULT_ID = 'tic-narino';

	private TSG_Security $security;

	/**
	 * Whether a shortcode was rendered on the current request.
	 */
	private bool $needs_assets = false;

	/**
	 * Per-request instance counter for unique element ids.
	 */
	private int $instances = 0;

	public function __construct( TSG_Security $security ) {
		$this->security = $security;
	}

	/**
	 * Hook everything up.
	 */
	public function register(): void {
		add_shortcode( 'tsg_dashboard', [ $this, 'render_shortcode' ] );
		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );
		add_action( 'wp_footer', [ $this, 'maybe_enqueue_assets' ], 1 );
		if ( is_admin() ) {
			add_action( 'admin_menu', [ $this, 'register_menu' ], 20 );
			add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_assets' ] );
		}
	}

	/**
	 * Whitelist a dashboard id; returns '' when unknown.
	 */
	public function normalize_id( string $id ): string {
		$id = sanitize_key( $id );
		return isset( self::DASHBOARDS[ $id ] ) ? $id : '';
	}

	// ------------------------------------------------------------------
	// Assets
	// ------------------------------------------------------------------

	/**
	 * Register (not enqueue) the dashboard assets.
	 */
	public function register_assets(): void {
		if ( ! wp_script_is( 'd3plus', 'registered' ) ) {
			wp_register_script( 'd3plus', TSG_D3PLUS_URL, [], TSG_D3PLUS_VERSION, true );
		}
		wp_register_script(
			'tsg-dashboard',
			TSG_PLUGIN_URL . 'assets/js/dashboard.js',
			[ 'd3plus' ],
			TSG_VERSION,
			true
		);
		wp_register_style(
			'tsg-dashboard-font',
			'https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@400;500;600;700&display=swap',
			[],
			null // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
		);
		wp_register_style(
			'tsg-dashboard',
			TSG_PLUGIN_URL . 'assets/css/dashboard.css',
			[ 'tsg-dashboard-font' ],
			TSG_VERSION
		);
		wp_localize_script(
			'tsg-dashboard',
			'TSG_DASH',
			[
				'restUrl'     => esc_url_raw( rest_url( TSG_REST_NAMESPACE . '/dashboard/' ) ),
				'nonce'       => wp_create_nonce( 'wp_rest' ),
				'topojsonUrl' => esc_url_raw( plugins_url( 'data/topo/narino_municipios.topojson', TSG_PLUGIN_FILE ) ),
			]
		);
	}

	/**
	 * Enqueue on the frontend only if a shortcode was rendered.
	 */
	public function maybe_enqueue_assets(): void {
		if ( ! $this->needs_assets ) {
			return;
		}
		wp_enqueue_script( 'tsg-dashboard' );
		wp_enqueue_style( 'tsg-dashboard' );
	}

	/**
	 * Admin: load the assets on the Dashboard screen only.
	 *
	 * @param string $hook Current admin screen hook.
	 */
	public function enqueue_admin_assets( string $hook ): void {
		if ( strpos( $hook, 'tic-suite-dashboard' ) === false ) {
			return;
		}
		$this->register_assets();
		wp_enqueue_script( 'tsg-dashboard' );
		wp_enqueue_style( 'tsg-dashboard' );
	}

	// ------------------------------------------------------------------
	// Shortcode
	// ------------------------------------------------------------------

	/**
	 * [tsg_dashboard id="tic-narino" height="820"]
	 *
	 * @param array|string $atts Shortcode attributes.
	 */
	public function render_shortcode( $atts ): string {
		$a = shortcode_atts(
			[
				'id'     => self::DEFAULT_ID,
				'height' => '820',
				'theme'  => '',
			],
			$atts,
			'tsg_dashboard'
		);

		$id = $this->normalize_id( (string) $a['id'] );
		if ( '' === $id ) {
			return current_user_can( TSG_MIN_CAPABILITY )
				? '<p class="tsg-error">' . esc_html__( 'TIC Suite: dashboard no encontrado.', 'tic-suite-graficos' ) . '</p>'
				: '';
		}

		$html = $this->markup( $id, (int) $a['height'], (string) $a['theme'] );
		if ( '' === $html ) {
			return '';
		}

		$this->needs_assets = true;
		// Late shortcodes (after wp_head) still get assets via wp_footer.
		if ( did_action( 'wp_enqueue_scripts' ) ) {
			if ( ! wp_script_is( 'tsg-dashboard', 'registered' ) ) {
				$this->register_assets();
			}
			wp_enqueue_script( 'tsg-dashboard' );
			wp_enqueue_style( 'tsg-dashboard' );
		}
		return $html;
	}

	/**
	 * Build the dashboard markup from its template.
	 *
	 * @param string $id     Whitelisted dashboard id.
	 * @param int    $height Height in px (0 = default).
	 * @param string $theme  'light', 'dark' or '' (remember the visitor's choice).
	 */
	public function markup( string $id, int $height = 820, string $theme = '' ): string {
		$file = TSG_PLUGIN_DIR . 'templates/dashboard/' . $id . '.html';
		if ( ! is_readable( $file ) ) {
			return '';
		}
		$tpl = (string) file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

		$this->instances++;
		$uid    = 'tsgd' . $this->instances . '-' . substr( md5( $id . wp_rand() ), 0, 6 );
		$height = max( 480, min( 2000, $height ? $height : 820 ) );
		$theme  = in_array( $theme, [ 'light', 'dark' ], true ) ? $theme : 'dark';

		return sprintf(
			'<div class="tsg-dash" id="%1$s" data-tsg-dashboard="%2$s" data-uid="%1$s" data-theme="%3$s" style="--dash-h:%4$dpx">%5$s</div>',
			esc_attr( $uid ),
			esc_attr( $id ),
			esc_attr( $theme ),
			$height,
			str_replace( '__U__', $uid, $tpl )
		);
	}

	// ------------------------------------------------------------------
	// REST
	// ------------------------------------------------------------------

	public function register_routes(): void {
		register_rest_route(
			TSG_REST_NAMESPACE,
			'/dashboard/(?P<id>[a-z0-9\-]+)',
			[
				'methods'             => 'GET',
				'callback'            => [ $this, 'rest_get' ],
				'permission_callback' => [ $this->security, 'rest_public_permission' ],
				'args'                => [
					'id' => [
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					],
				],
			]
		);
	}

	/**
	 * Serve data/dashboards/<id>.json.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function rest_get( WP_REST_Request $request ) {
		$id = $this->normalize_id( (string) $request->get_param( 'id' ) );
		if ( '' === $id ) {
			return new WP_Error( 'tsg_dashboard_not_found', __( 'Dashboard no encontrado.', 'tic-suite-graficos' ), [ 'status' => 404 ] );
		}
		$file = TSG_DATA_DIR . 'dashboards/' . $id . '.json';
		$data = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'tsg_dashboard_data', __( 'Datos del dashboard no disponibles.', 'tic-suite-graficos' ), [ 'status' => 500 ] );
		}
		$response = new WP_REST_Response( $data );
		$response->header( 'Cache-Control', 'public, max-age=300' );
		return $response;
	}

	// ------------------------------------------------------------------
	// Admin
	// ------------------------------------------------------------------

	public function register_menu(): void {
		add_submenu_page(
			'tic-suite',
			__( 'Dashboard', 'tic-suite-graficos' ),
			__( 'Dashboard', 'tic-suite-graficos' ),
			TSG_MIN_CAPABILITY,
			'tic-suite-dashboard',
			[ $this, 'render_admin' ]
		);
	}

	public function render_admin(): void {
		if ( ! $this->security->can_manage() ) {
			wp_die( esc_html__( 'No tienes permisos para acceder a esta página.', 'tic-suite-graficos' ) );
		}
		$dashboards = self::DASHBOARDS;
		$selected   = isset( $_GET['dashboard'] ) ? $this->normalize_id( (string) wp_unslash( $_GET['dashboard'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$selected   = '' !== $selected ? $selected : self::DEFAULT_ID;
		$markup     = $this->markup( $selected );
		include TSG_PLUGIN_DIR . 'templates/admin/dashboard.php';
	}
}
