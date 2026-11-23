<?php
/**
 * Admin screen: dashboards (preview + shortcode).
 *
 * @package TicSuite\Graficos
 * @var array  $dashboards id → label.
 * @var string $selected   Selected dashboard id.
 * @var string $markup     Rendered dashboard markup (trusted plugin template).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$shortcode = sprintf( '[tsg_dashboard id="%s" height="820"]', esc_attr( $selected ) );
?>
<div class="wrap tsg-wrap">
	<header class="tsg-header">
		<div class="tsg-header__title">
			<span class="dashicons dashicons-dashboard" aria-hidden="true"></span>
			<h1><?php esc_html_e( 'Dashboard', 'tic-suite-graficos' ); ?></h1>
		</div>
		<p class="tsg-header__lede">
			<?php esc_html_e( 'Tableros interactivos completos (mapa, indicadores y gráficos d3plus). Copia el shortcode y pégalo en cualquier página o entrada; se recomienda una plantilla de ancho completo.', 'tic-suite-graficos' ); ?>
		</p>
	</header>

	<?php if ( count( $dashboards ) > 1 ) : ?>
		<form method="get" class="tsg-form-inline">
			<input type="hidden" name="page" value="tic-suite-dashboard" />
			<label for="tsg-dashboard-select"><?php esc_html_e( 'Dashboard:', 'tic-suite-graficos' ); ?></label>
			<select name="dashboard" id="tsg-dashboard-select" onchange="this.form.submit()">
				<?php foreach ( $dashboards as $slug => $name ) : ?>
					<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $selected, $slug ); ?>><?php echo esc_html( $name ); ?></option>
				<?php endforeach; ?>
			</select>
		</form>
	<?php endif; ?>

	<article class="tsg-shortcode-card" style="max-width:720px;margin:16px 0">
		<header class="tsg-shortcode-card__header">
			<span class="dashicons dashicons-shortcode" aria-hidden="true"></span>
			<h3><?php echo esc_html( $dashboards[ $selected ] ); ?></h3>
		</header>
		<p class="tsg-shortcode-card__desc">
			<?php esc_html_e( 'Atributos: id (dashboard), height (alto en píxeles, 480–2000) y theme ("light" o "dark", tema inicial).', 'tic-suite-graficos' ); ?>
		</p>
		<div class="tsg-shortcode-row">
			<input type="text" readonly value="<?php echo esc_attr( $shortcode ); ?>" aria-label="<?php esc_attr_e( 'Shortcode', 'tic-suite-graficos' ); ?>" />
			<button type="button" class="button tsg-copy-btn" data-tsg-copy>
				<span class="dashicons dashicons-admin-page" aria-hidden="true"></span>
				<?php esc_html_e( 'Copiar', 'tic-suite-graficos' ); ?>
			</button>
		</div>
	</article>

	<h2><?php esc_html_e( 'Vista previa', 'tic-suite-graficos' ); ?></h2>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static plugin template, ids escaped in TSG_Dashboard::markup(). ?>
</div>
