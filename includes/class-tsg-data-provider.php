<?php
/**
 * Data provider for TIC Suite views.
 *
 * Loads view definitions from JSON files under /data/views/*.json and
 * normalizes them into a single canonical shape, regardless of whether
 * the file was authored in the native plugin format or in the TIC Suite
 * publication format (`vista`, `titulo`, `datos`, …).
 *
 * Shapes accepted:
 *
 *  A) Native plugin format
 *     {
 *       "id": "slug",
 *       "name": "…",
 *       "description": "…",
 *       "category": "categorical|temporal|geographic|hierarchical|network|statistical",
 *       "dimensions": ["field", …],
 *       "measures":   ["field", …],
 *       "data":       [ { … }, … ],
 *       "edges":      [ … ]        // optional
 *     }
 *
 *  B) TIC Suite publication format (auto-detected)
 *     {
 *       "vista":                "slug_vista",
 *       "titulo":               "…",
 *       "descripcion":          "…",
 *       "tipo_grafico_sugerido": "bar|bar_stacked|doughnut|radar|bar_horizontal",
 *       "municipios"|"datos"|"data"|"items": [ { municipio: …, medida: … }, … ],
 *       …
 *     }
 *     Dimensions / measures / category are inferred from the first row:
 *       - string fields  → dimensions
 *       - numeric fields → measures
 *       - if a dimension is named "municipio"/"departamento" → category=geographic
 *       - if any dim has a date-ish name → category=temporal
 *       - otherwise                                         → categorical
 *
 * @package TicSuite\Graficos
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TSG_Data_Provider
 *
 * One instance per TIC Suite project (`nacion`, `ondas`, …). Each instance
 * scans its own /data/views/{project}/ directory so projects stay isolated
 * — view ids can even collide across projects.
 */
class TSG_Data_Provider {

	private const CACHE_GROUP = 'tsg_views';
	private const VIEWS_DIR   = 'views';

	/**
	 * Data keys we'll probe (in order) looking for a row array in the
	 * TIC Suite publication format.
	 */
	private const DATA_KEY_CANDIDATES = [ 'data', 'datos', 'municipios', 'items', 'rows' ];

	private TSG_Security $security;
	private string $project;

	public function __construct( TSG_Security $security, string $project = 'nacion' ) {
		$this->security = $security;
		$this->project  = $this->sanitize_project( $project );
	}

	/**
	 * Return this provider's project slug.
	 */
	public function project(): string {
		return $this->project;
	}

	/**
	 * Return the absolute path to this project's views directory.
	 */
	public function views_path(): string {
		return TSG_DATA_DIR . self::VIEWS_DIR . '/' . $this->project . '/';
	}

	/**
	 * Return the absolute path to the shared topo directory.
	 */
	public function topo_path(): string {
		return TSG_DATA_DIR . 'topo/';
	}

	/**
	 * Whitelist project slugs — only lowercase letters, digits and hyphens.
	 */
	private function sanitize_project( string $slug ): string {
		$slug = strtolower( $slug );
		$slug = preg_replace( '/[^a-z0-9\-]/', '', $slug );
		return $slug ?: 'nacion';
	}

	/**
	 * Cache key, project-scoped.
	 */
	private function cache_key( string $suffix ): string {
		return $this->project . ':' . $suffix;
	}

	/**
	 * Return all available view summaries.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function list_views(): array {
		$cached = wp_cache_get( $this->cache_key( 'all_summaries' ), self::CACHE_GROUP );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$out = [];
		$dir = $this->views_path();
		if ( ! is_dir( $dir ) ) {
			return $out;
		}

		$files = glob( $dir . '*.json' );
		if ( ! is_array( $files ) ) {
			return $out;
		}
		// Skip source/master files prefixed with underscore (e.g.
		// _proyecto-ondas.json, _ondas-narino-detalle.json). They stay
		// in the folder for the regen scripts to read but don't appear
		// as views.
		$files = array_filter( $files, static fn( $p ) => strpos( basename( $p ), '_' ) !== 0 );
		foreach ( $files as $file ) {
			$view = $this->load_view_file( $file );
			if ( empty( $view ) ) {
				continue;
			}
			$out[] = [
				'id'          => (string) $view['id'],
				'name'        => (string) $view['name'],
				'description' => (string) $view['description'],
				'category'    => (string) $view['category'],
				'dimensions'  => $view['dimensions'],
				'measures'    => $view['measures'],
				'rows'        => count( $view['data'] ),
			];
		}

		usort(
			$out,
			static fn( $a, $b ) => strcasecmp( (string) $a['name'], (string) $b['name'] )
		);

		wp_cache_set( $this->cache_key( 'all_summaries' ), $out, self::CACHE_GROUP, 300 );
		return $out;
	}

	/**
	 * Return a single full view by id.
	 *
	 * @param string $id View id.
	 */
	public function get_view( string $id ): array {
		$id = $this->security->sanitize_view_id( $id );
		if ( '' === $id ) {
			return [];
		}

		$cached = wp_cache_get( $this->cache_key( 'view_' . $id ), self::CACHE_GROUP );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		// The id may equal either the internal `id`/`vista` field or the file
		// basename, so we scan every file and match on the normalized id.
		$dir   = $this->views_path();
		$files = glob( $dir . '*.json' );
		if ( ! is_array( $files ) ) {
			return [];
		}
		$files = array_filter( $files, static fn( $p ) => strpos( basename( $p ), '_' ) !== 0 );
		foreach ( $files as $file ) {
			$view = $this->load_view_file( $file );
			if ( empty( $view ) ) {
				continue;
			}
			if ( $view['id'] === $id ) {
				wp_cache_set( $this->cache_key( 'view_' . $id ), $view, self::CACHE_GROUP, 300 );
				return $view;
			}
		}

		return [];
	}

	/**
	 * Read + decode a view file defensively.
	 *
	 * @param string $file Absolute path.
	 */
	private function load_view_file( string $file ): array {
		// Path-traversal guard.
		$real_dir  = realpath( $this->views_path() );
		$real_file = realpath( $file );
		if ( ! $real_dir || ! $real_file || strpos( $real_file, $real_dir ) !== 0 ) {
			return [];
		}

		$raw = file_get_contents( $real_file ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( false === $raw ) {
			return [];
		}

		$raw_view = $this->security->decode_json( $raw );
		if ( empty( $raw_view ) ) {
			return [];
		}

		$view = $this->adapt( $raw_view, basename( $real_file, '.json' ) );
		if ( empty( $view ) ) {
			return [];
		}

		return $this->normalize_view( $view );
	}

	/**
	 * Detect the file shape and convert it to the canonical plugin shape.
	 *
	 * @param array  $raw      Decoded JSON.
	 * @param string $fallback Fallback id (filename).
	 */
	private function adapt( array $raw, string $fallback ): array {
		// A) Native plugin format — has id + name + data[].
		if ( isset( $raw['id'], $raw['name'], $raw['data'] ) && is_array( $raw['data'] ) ) {
			return $raw;
		}

		// B) TIC Suite publication format — has vista + titulo + row array.
		if ( isset( $raw['vista'], $raw['titulo'] ) ) {
			$data = $this->extract_rows( $raw );
			if ( empty( $data ) ) {
				return [];
			}

			$fields   = $this->infer_fields( $data[0] );
			$category = $this->infer_category( $fields['dimensions'] );
			$hint     = isset( $raw['tipo_grafico_sugerido'] ) ? (string) $raw['tipo_grafico_sugerido'] : '';

			return [
				'id'                    => (string) $raw['vista'],
				'name'                  => (string) $raw['titulo'],
				'description'           => (string) ( $raw['descripcion'] ?? '' ),
				'category'              => $category,
				'dimensions'            => $fields['dimensions'],
				'measures'              => $fields['measures'],
				'data'                  => $data,
				'tipo_grafico_sugerido' => $hint,
			];
		}

		// C) Anonymous dataset — no vista/titulo/id but has a row array.
		// Use the filename as id and a prettified version as name.
		// Skip files whose rows have no numeric measures at top level
		// (they're nested master files like proyecto-ondas.json).
		$data = $this->extract_rows( $raw );
		if ( ! empty( $data ) ) {
			$fields   = $this->infer_fields( $data[0] );
			if ( empty( $fields['measures'] ) ) {
				return [];
			}
			$category = $this->infer_category( $fields['dimensions'] );
			return [
				'id'          => $fallback,
				'name'        => $this->humanize_id( $fallback ),
				'description' => (string) ( $raw['fuente'] ?? $raw['descripcion'] ?? '' ),
				'category'    => $category,
				'dimensions'  => $fields['dimensions'],
				'measures'    => $fields['measures'],
				'data'        => $data,
			];
		}

		return [];
	}

	/**
	 * Turn a slug like "vista-analisis-municipios" into "Análisis municipios".
	 */
	private function humanize_id( string $id ): string {
		$name = preg_replace( '/^vista[-_]/', '', $id );
		$name = str_replace( [ '-', '_' ], ' ', (string) $name );
		return ucfirst( trim( (string) $name ) );
	}

	/**
	 * Pull the row array out of a publication-format file.
	 *
	 * Special-case: `vista-comparativo-municipios.json` has BOTH a
	 * `municipios` array (strings) and a `datos` array (rows). We want `datos`.
	 */
	private function extract_rows( array $raw ): array {
		// Prefer `data` / `datos` over `municipios` when both exist and
		// `municipios` is a list of strings.
		if ( isset( $raw['datos'] ) && is_array( $raw['datos'] ) && $this->is_row_list( $raw['datos'] ) ) {
			return array_values( $raw['datos'] );
		}
		foreach ( self::DATA_KEY_CANDIDATES as $key ) {
			if ( isset( $raw[ $key ] ) && is_array( $raw[ $key ] ) && $this->is_row_list( $raw[ $key ] ) ) {
				return array_values( $raw[ $key ] );
			}
		}
		return [];
	}

	/**
	 * True if $arr is a non-empty list whose first element is an associative
	 * array (i.e. a row object, not a list of scalars).
	 */
	private function is_row_list( array $arr ): bool {
		if ( empty( $arr ) ) {
			return false;
		}
		$first = reset( $arr );
		return is_array( $first ) && ! empty( $first ) && count( array_filter( array_keys( $first ), 'is_string' ) ) > 0;
	}

	/**
	 * Infer dimensions + measures from the first row.
	 *
	 * - Numeric values → measures
	 * - String values  → dimensions
	 * - Nested arrays/objects are flattened one level deep.
	 *
	 * @param array $row Representative row.
	 * @return array{dimensions: array<int,string>, measures: array<int,string>}
	 */
	private function infer_fields( array $row ): array {
		$dimensions = [];
		$measures   = [];
		foreach ( $row as $field => $value ) {
			if ( is_string( $field ) === false ) {
				continue;
			}
			// Use is_int/is_float (not is_numeric) so ID-like numeric
			// strings such as "52001" (DIVIPOLA code) stay as dimensions
			// instead of being promoted to measures.
			if ( is_int( $value ) || is_float( $value ) ) {
				$measures[] = $field;
			} elseif ( is_string( $value ) || is_bool( $value ) ) {
				$dimensions[] = $field;
			}
			// Nested arrays/objects are not auto-flattened here.
		}
		return [ 'dimensions' => $dimensions, 'measures' => $measures ];
	}

	/**
	 * Infer the high-level category from dimension names.
	 *
	 * @param array $dimensions Dimension field names.
	 */
	private function infer_category( array $dimensions ): string {
		$lower = array_map( 'strtolower', $dimensions );
		foreach ( $lower as $d ) {
			if ( in_array( $d, [ 'municipio', 'municipios', 'departamento', 'departamentos', 'municipio_id' ], true ) ) {
				return 'geographic';
			}
		}
		$date_hints = [ 'fecha', 'mes', 'anio', 'año', 'year', 'date', 'periodo', 'vigencia' ];
		foreach ( $lower as $d ) {
			foreach ( $date_hints as $hint ) {
				if ( false !== strpos( $d, $hint ) ) {
					return 'temporal';
				}
			}
		}
		return 'categorical';
	}

	/**
	 * Final normalization + sanitization pass.
	 *
	 * @param array $view Adapted view.
	 */
	private function normalize_view( array $view ): array {
		$view['id']          = $this->security->sanitize_view_id( (string) ( $view['id'] ?? '' ) );
		$view['name']        = sanitize_text_field( (string) ( $view['name'] ?? '' ) );
		$view['description'] = sanitize_text_field( (string) ( $view['description'] ?? '' ) );
		$view['category']    = sanitize_key( (string) ( $view['category'] ?? '' ) );
		$view['dimensions']  = array_values( array_map( 'sanitize_text_field', (array) ( $view['dimensions'] ?? [] ) ) );
		$view['measures']    = array_values( array_map( 'sanitize_text_field', (array) ( $view['measures'] ?? [] ) ) );
		$view['temporal_range'] = ! empty( $view['temporal_range'] );
		$view['edges']       = ! empty( $view['edges'] ) ? array_values( (array) $view['edges'] ) : [];
		$view['data']        = is_array( $view['data'] ?? null ) ? array_values( $view['data'] ) : [];

		if ( isset( $view['tipo_grafico_sugerido'] ) ) {
			$view['tipo_grafico_sugerido'] = sanitize_text_field( (string) $view['tipo_grafico_sugerido'] );
		}

		return $view;
	}
}
