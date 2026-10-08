<?php
/**
 * Plugin Name:       TIC Suite
 * Plugin URI:        https://github.com/GobernaciondeNarino/tic-suite
 * Description:       Plugin profesional para la creación y publicación de gráficos interactivos con d3plus.js dentro de TIC Suite. Genera 15 tipos de gráficos, expone shortcodes reutilizables y ofrece una experiencia minimalista tanto para el administrador como para el usuario final.
 * Version:           1.8.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Gobernación de Nariño - Secretaría TIC
 * Author URI:        https://narino.gov.co
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       tic-suite-graficos
 * Domain Path:       /languages
 *
 * @package TicSuite\Graficos
 */

declare( strict_types=1 );

// Hard-stop direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// -----------------------------------------------------------------------------
// Plugin constants.
// -----------------------------------------------------------------------------
define( 'TSG_VERSION', '1.8.0' );
define( 'TSG_D3PLUS_VERSION', '3.1.4' );
// NOTE: must use the /full/ bundle — /umd/d3plus-core.js expects 30+
// peer deps to already be on window and fails silently with window.d3plus
// set to an empty object. The /full/ build embeds every dependency.
define( 'TSG_D3PLUS_URL', 'https://cdn.jsdelivr.net/npm/@d3plus/core@' . TSG_D3PLUS_VERSION . '/umd/d3plus-core.full.js' );
define( 'TSG_PLUGIN_FILE', __FILE__ );
define( 'TSG_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'TSG_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'TSG_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
define( 'TSG_MIN_CAPABILITY', 'manage_options' );
define( 'TSG_REST_NAMESPACE', 'tic-suite/v1' );
define( 'TSG_NONCE_ACTION', 'tsg_nonce_action' );
define( 'TSG_DATA_DIR', TSG_PLUGIN_DIR . 'data/' );

// -----------------------------------------------------------------------------
// PSR-4-ish autoloader for plugin classes.
// -----------------------------------------------------------------------------
spl_autoload_register(
	static function ( string $class ): void {
		if ( strpos( $class, 'TSG_' ) !== 0 ) {
			return;
		}
		$file = TSG_PLUGIN_DIR . 'includes/class-' . strtolower( str_replace( '_', '-', $class ) ) . '.php';
		if ( is_readable( $file ) ) {
			require_once $file;
		}
	}
);

// Core bootstrap.
require_once TSG_PLUGIN_DIR . 'includes/class-tsg-plugin.php';

// Activation / deactivation hooks.
register_activation_hook( __FILE__, [ 'TSG_Plugin', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'TSG_Plugin', 'deactivate' ] );

// Kickoff.
add_action(
	'plugins_loaded',
	static function (): void {
		TSG_Plugin::instance()->run();
	}
);
