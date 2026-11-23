<?php
/**
 * Auto-actualización desde las releases de GitHub.
 *
 * Usa Plugin Update Checker (MIT) para que WordPress muestre el aviso
 * "Hay una nueva versión disponible" en Plugins y actualice EN LA MISMA
 * carpeta, sin instalar una copia nueva. Solo se consideran releases
 * publicadas que adjunten el asset `suite-tic.zip` (generado por el
 * workflow .github/workflows/release.yml).
 *
 * @package TicSuite\Graficos
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class TSG_Updater {

	public const REPO_URL = 'https://github.com/GobernaciondeNarino/suite-tic/';
	public const ASSET_RE = '/^suite-tic\.zip$/i';

	/**
	 * Registra el verificador de actualizaciones. Si la librería no está
	 * disponible, el plugin sigue funcionando sin auto-actualización.
	 */
	public static function init(): void {
		$loader = TSG_PLUGIN_DIR . 'includes/lib/plugin-update-checker/plugin-update-checker.php';
		if ( ! is_readable( $loader ) ) {
			return;
		}
		require_once $loader;

		if ( ! class_exists( '\YahnisElsts\PluginUpdateChecker\v6\PucFactory' ) ) {
			return;
		}

		$checker = \YahnisElsts\PluginUpdateChecker\v6\PucFactory::buildUpdateChecker(
			self::REPO_URL,
			TSG_PLUGIN_FILE,
			'suite-tic'
		);

		// Solo releases con el zip de carpeta fija; nunca el zip de rama.
		$api = $checker->getVcsApi();
		if ( $api ) {
			$api->enableReleaseAssets( self::ASSET_RE, \YahnisElsts\PluginUpdateChecker\v6p0\Vcs\Api::REQUIRE_RELEASE_ASSETS );
		}
	}
}
