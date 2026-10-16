<?php
/**
 * Uninstall handler.
 *
 * Removes any option the plugin wrote. Does NOT delete user-provided
 * JSON views under /data/views — those are treated as content.
 *
 * @package TicSuite\Graficos
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Deleting a duplicate copy must not wipe settings used by the copy that
// stays active (same main file, different folder name).
foreach ( (array) get_option( 'active_plugins', [] ) as $tsg_active ) {
	if ( $tsg_active !== WP_UNINSTALL_PLUGIN && '/tic-suite-graficos.php' === substr( $tsg_active, -23 ) ) {
		return;
	}
}

delete_option( 'tsg_settings' );
wp_cache_flush();
