/* global d3plus */
/**
 * TIC Suite · Gráficos — d3plus v3 renderer.
 *
 * Uses @d3plus/core v3 API: chainable config methods + .render().
 * Responsive via .detectResize(true) (ResizeObserver on parent +
 * window resize).
 *
 * Exposes window.TSGRenderer.render( containerId, payload, options ).
 *
 * Options:
 *   legend  (bool)    — show/hide d3plus' native legend (default true)
 *   xTitle  (string)  — custom X-axis title (auto if empty)
 *   yTitle  (string)  — custom Y-axis title (auto if empty)
 */
( function () {
	'use strict';

	const PALETTE = [
		'#2563eb', '#0ea5e9', '#14b8a6', '#22c55e',
		'#eab308', '#f97316', '#ef4444', '#a855f7',
		'#ec4899', '#6366f1',
	];

	// es-CO number formatters, lazily built once.
	const NF_DECIMAL = new Intl.NumberFormat( 'es-CO', { maximumFractionDigits: 2 } );
	const NF_INT     = new Intl.NumberFormat( 'es-CO', { maximumFractionDigits: 0 } );
	const NF_PCT     = new Intl.NumberFormat( 'es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 } );

	const Renderer = {
		// ==============================================================
		// Lifecycle
		// ==============================================================

		waitForD3plus( timeoutMs = 8000 ) {
			return new Promise( ( resolve, reject ) => {
				if ( window.d3plus ) {
					return resolve();
				}
				const start = Date.now();
				const tick  = () => {
					if ( window.d3plus ) {
						return resolve();
					}
					if ( Date.now() - start > timeoutMs ) {
						return reject( new Error( 'd3plus timeout' ) );
					}
					setTimeout( tick, 80 );
				};
				tick();
			} );
		},

		async render( containerId, payload, options ) {
			const el = document.getElementById( containerId );
			if ( ! el || ! payload ) {
				return;
			}
			el.innerHTML = '';

			const opts = Object.assign( { legend: true, legendStyle: 'text', xTitle: '', yTitle: '' }, options || {} );

			try {
				await this.waitForD3plus();
			} catch ( e ) {
				el.innerHTML = '<p class="tsg-empty">d3plus no disponible.</p>';
				return;
			}

			const Ctor = window.d3plus[ payload.chart.class ];
			if ( typeof Ctor !== 'function' ) {
				el.innerHTML = `<p class="tsg-empty">Tipo de gráfico no soportado: ${ payload.chart.class }</p>`;
				return;
			}

			try {
				const viz = new Ctor();

				// A legend with dozens of entries (e.g. one per municipio)
				// eats the plot area and repeats the axis labels; skip it.
				const showLegend = Boolean( opts.legend ) && this.legendGroupCount( payload ) <= 12;

				viz
					.select( '#' + containerId )
					.detectResize( true )
					.legend( showLegend );

				// d3plus v4 adds its own download/search/table/zoom buttons
				// to every chart; the plugin toolbar already covers them.
				// Zoom stays on the map only, as in v3.
				this.safeCall( viz, 'saveControl', false );
				this.safeCall( viz, 'search', false );
				this.safeCall( viz, 'tableView', false );
				if ( payload.chart.key !== 'geomap' ) {
					this.safeCall( viz, 'zoom', false );
				}

				// Always anchor the legend at the bottom.
				if ( typeof viz.legendPosition === 'function' ) {
					viz.legendPosition( 'bottom' );
				}

				// "Icons" mode: keep d3plus native legend (with its
				// interactivity — click to highlight/hide) but hide the
				// text labels so only the colored shapes show.
				if ( showLegend && opts.legendStyle === 'icons' && typeof viz.legendConfig === 'function' ) {
					viz.legendConfig( {
						label: () => '',
						shapeConfig: {
							labelConfig: {
								fontSize: () => 0,
								padding: 0,
							},
							width: 24,
							height: 24,
						},
						padding: 4,
					} );
				}

				this.configure( viz, payload, opts );
				this.applyTimeline( viz, payload );
				this.applyAxes( viz, payload, opts );
				this.applyTooltip( viz, payload );
				this.applyShape( viz );

				viz.render();

				window.requestAnimationFrame( () => {
					try {
						if ( typeof viz.resize === 'function' ) {
							viz.resize();
						}
					} catch ( _e ) { /* noop */ }
				} );
			} catch ( err ) {
				console.error( '[TSG] render error', err );
				el.innerHTML = '<p class="tsg-empty">No fue posible renderizar el gráfico.</p>';
			}
		},

		// ==============================================================
		// Per-chart configuration
		// ==============================================================

		configure( viz, payload /* , opts */ ) {
			const { mapping, view, chart } = payload;
			const dims     = view.dimensions || [];
			const measures = view.measures   || [];

			// Prune rows whose primary measure(s) are 0 / null / NaN so the
			// chart only shows municipios with actual data. Geomap keeps
			// the prune too — polygons without matching data fall back to
			// `topojsonFill` (set below to #fffcf3).
			const data = this.filterMeaningful( payload.data, chart.key, measures );
			// Store for downstream (applyTimeline reads it instead of
			// the raw payload.data, keeping the zero-filter consistent).
			payload._filteredData = data;

			switch ( chart.key ) {
				case 'bar':
					viz
						.data( data )
						.groupBy( dims[ 0 ] )
						.x( dims[ 0 ] )
						.y( measures[ 0 ] );
					break;

				case 'stacked_bar': {
					const long = this.reshapeWideToLong( data, dims, measures );
					viz
						.data( long )
						.groupBy( [ '_metric', dims[ 0 ] ] )
						.x( dims[ 0 ] )
						.y( '_value' )
						.stacked( true );
					break;
				}

				case 'line':
				case 'area': {
					// When the view has year-suffixed measures, reshape to
					// long format with _year on X and one line per entity.
					const yearCols = this.detectYears( measures );
					if ( yearCols.length >= 2 ) {
						const yearMeasures = measures.filter( ( m ) => /_(20\d{2})$/.test( m ) );
						const long = [];
						( data || [] ).forEach( ( row ) => {
							yearCols.forEach( ( y ) => {
								const col = yearMeasures.find( ( m ) => m.endsWith( '_' + y ) );
								if ( ! col ) {
									return;
								}
								long.push( Object.assign( {}, row, {
									_year:  String( y ),
									_value: Number( row[ col ] ) || 0,
								} ) );
							} );
						} );
						viz
							.data( long )
							.groupBy( dims[ 0 ] )
							.x( '_year' )
							.y( '_value' );
					} else {
						viz
							.data( data )
							.groupBy( dims[ 1 ] || dims[ 0 ] )
							.x( dims[ 0 ] )
							.y( measures[ 0 ] );
					}
					break;
				}

				case 'stacked_area': {
					const long = this.reshapeWideToLong( data, dims, measures );
					viz
						.data( long )
						.groupBy( '_metric' )
						.x( dims[ 0 ] )
						.y( '_value' );
					break;
				}

				case 'pie':
				case 'donut':
					viz
						.data( data )
						.groupBy( dims[ 0 ] )
						.value( measures[ 0 ] );
					break;

				case 'treemap':
					viz
						.data( data )
						.groupBy( [ dims[ 0 ] ] )
						.sum( measures[ 0 ] );
					break;

				case 'priestley': {
					// Priestley: horizontal bars spanning a time range.
					// When the view has year-based measures (e.g. profesores_2024,
					// profesores_2025), reshape to one row per entity with
					// start = first year, end = last year, size = total.
					const years = this.detectYears( measures );
					if ( years.length >= 2 ) {
						const firstY = String( Math.min( ...years ) );
						const lastY  = String( Math.max( ...years ) );
						const totalM = measures.find( ( m ) => /^total$/i.test( m ) ) || measures[ 0 ];
						const pData  = ( data || [] ).map( ( row ) => Object.assign( {}, row, {
							_start: firstY,
							_end:   lastY,
						} ) );
						viz
							.data( pData )
							.groupBy( dims[ 0 ] );
						this.safeCall( viz, 'start', '_start' );
						this.safeCall( viz, 'end', '_end' );
						if ( typeof viz.value === 'function' ) {
							viz.value( totalM );
						}
					} else {
						viz.data( data ).groupBy( dims[ 0 ] );
						if ( typeof viz.start === 'function' && measures[ 0 ] ) {
							viz.start( measures[ 0 ] );
						}
						if ( typeof viz.end === 'function' && measures[ 1 ] ) {
							viz.end( measures[ 1 ] );
						}
					}
					break;
				}

				case 'network': {
					const nodes = this.buildNodes( data, dims[ 0 ] );
					this.safeCall( viz, 'nodes', nodes );
					this.safeCall( viz, 'links', mapping.links || view.edges || [] );
					viz.groupBy( dims[ 0 ] );
					if ( measures[ 0 ] ) {
						viz.size( measures[ 0 ] );
					}
					break;
				}

				case 'rings': {
					const nodes = this.buildNodes( data, dims[ 0 ] );
					this.safeCall( viz, 'nodes', nodes );
					this.safeCall( viz, 'links', mapping.links || view.edges || [] );
					if ( nodes.length && typeof viz.center === 'function' ) {
						viz.center( nodes[ 0 ].id );
					}
					break;
				}

				case 'sankey': {
					// If the view has explicit edges, use those (network data).
					const hasEdges = ( view.edges && view.edges.length > 0 )
						|| ( mapping.links && mapping.links.length > 0 );
					if ( hasEdges ) {
						const nodes = this.buildNodes( data, dims[ 0 ] );
						this.safeCall( viz, 'nodes', nodes );
						this.safeCall( viz, 'links', mapping.links || view.edges || [] );
					} else {
						// Categorical data: synthesize a root → category flow.
						// Each row becomes a leaf node; "Total" is the root.
						const dim     = dims[ 0 ];
						const measure = measures[ 0 ];
						const nodes   = [ { id: 'Total' } ];
						const links   = [];
						( data || [] ).forEach( ( row ) => {
							const label = String( row[ dim ] || '' );
							const val   = Number( row[ measure ] ) || 0;
							if ( ! label || val <= 0 ) {
								return;
							}
							nodes.push( { id: label } );
							links.push( { source: 'Total', target: label, value: val } );
						} );
						this.safeCall( viz, 'nodes', nodes );
						this.safeCall( viz, 'links', links );
					}
					break;
				}

				case 'geomap': {
					const joinField = mapping.join || dims[ 0 ] || 'municipio';
					const normData  = ( data || [] ).map( ( row ) => Object.assign(
						{},
						row,
						{ _municipio_id: Renderer.normalizeMuni( row[ joinField ] ) }
					) );
					viz
						.data( normData )
						.groupBy( '_municipio_id' )
						.colorScale( measures[ 0 ] );
					// Hide the CARTO / OpenStreetMap basemap; we only want
					// the municipio polygons of Nariño to show.
					if ( typeof viz.tiles === 'function' ) {
						viz.tiles( false );
					}
					// d3plus defaults the "ocean" background rect to #d4dadc;
					// make it fully transparent so the figure's own
					// background shows through.
					if ( typeof viz.ocean === 'function' ) {
						viz.ocean( 'transparent' );
					}
					// Paint polygons whose municipio has no matching data
					// (or was pruned as zero) with a soft neutral color.
					if ( typeof viz.topojsonFill === 'function' ) {
						viz.topojsonFill( '#fffcf3' );
					}
					if ( typeof viz.topojson === 'function' && mapping.topojson ) {
						viz.topojson( mapping.topojson );
					}
					if ( typeof viz.topojsonId === 'function' && mapping.topojsonId ) {
						viz.topojsonId( mapping.topojsonId );
					}
					if ( typeof viz.topojsonKey === 'function' && mapping.topojsonKey ) {
						viz.topojsonKey( mapping.topojsonKey );
					}
					if ( typeof viz.topojsonFilter === 'function' ) {
						viz.topojsonFilter( () => true );
					}
					if ( typeof viz.label === 'function' ) {
						viz.label( ( d ) => d[ joinField ] || d._municipio_id || '' );
					}
					break;
				}

				default:
					if ( dims[ 0 ] ) {
						viz.groupBy( dims[ 0 ] );
					}
					if ( measures[ 0 ] ) {
						viz.y( measures[ 0 ] );
					}
			}
		},

		// ==============================================================
		// Axes
		// ==============================================================

		/**
		 * Apply X / Y axis titles. Skips chart types that have no axes
		 * (pie, donut, treemap, geomap, network, rings, sankey, tree).
		 */
		// ==============================================================
		// Timeline (d3plus .time() scrubber)
		// ==============================================================

		/**
		 * If the view has year-suffixed measures (e.g. proyectos_2024,
		 * proyectos_2025) and the chart type is bar / pie / donut /
		 * treemap / geomap, reshape to long format with a `_year` column
		 * and call `.time("_year")`. d3plus then renders a Timeline
		 * scrubber at the bottom.
		 *
		 * We skip stacked_bar / stacked_area because their own reshape
		 * already handles the years as stacked series. Also skip line/area
		 * where the X axis IS the time axis already.
		 */
		applyTimeline( viz, payload ) {
			if ( typeof viz.time !== 'function' ) {
				return;
			}
			const { chart, view } = payload;
			const SKIP = [ 'stacked_bar', 'stacked_area', 'line', 'area', 'priestley', 'sankey', 'network', 'rings', 'geomap' ];
			if ( SKIP.includes( chart.key ) ) {
				return;
			}
			const measures = view.measures || [];
			const years    = this.detectYears( measures );
			if ( years.length < 2 ) {
				return;
			}

			// Reshape: for each row × year, emit one long-format row.
			// Use the filtered data so zero-only rows stay excluded.
			const dims    = view.dimensions || [];
			const rawData = payload._filteredData || payload.data || [];
			const long    = [];
			const yearMeasures = measures.filter( ( m ) => /_(20\d{2})$/.test( m ) );
			const baseName     = yearMeasures[ 0 ].replace( /_(20\d{2})$/, '' );

			( rawData.length ? rawData : ( payload.data || [] ) ).forEach( ( row ) => {
				years.forEach( ( y ) => {
					const col = yearMeasures.find( ( m ) => m.endsWith( '_' + y ) );
					if ( ! col ) {
						return;
					}
					long.push( Object.assign( {}, row, {
						_year:  String( y ),
						_value: Number( row[ col ] ) || 0,
					} ) );
				} );
			} );

			if ( long.length ) {
				viz.data( long );
				viz.time( '_year' );
				viz.timeline( true );

				// Update groupBy / x / y to use the reshaped columns.
				if ( typeof viz.y === 'function' && typeof viz.x === 'function' ) {
					viz.x( dims[ 0 ] || '_year' );
					viz.y( '_value' );
					viz.groupBy( dims[ 0 ] || '_year' );
				}
				if ( typeof viz.value === 'function' && [ 'pie', 'donut' ].includes( chart.key ) ) {
					viz.value( '_value' );
				}
				if ( typeof viz.sum === 'function' && chart.key === 'treemap' ) {
					viz.sum( '_value' );
				}
			}
		},

		/**
		 * Extract year numbers from measure names matching `*_YYYY` pattern.
		 */
		/**
		 * Number of entries the color legend would show. Geomap uses a
		 * color scale, graphs label their nodes, and stacked charts are
		 * colored by their few metrics, so those always count as 0.
		 */
		legendGroupCount( payload ) {
			const key      = payload.chart.key;
			const dims     = payload.view.dimensions || [];
			const measures = payload.view.measures || [];
			if ( [ 'geomap', 'sankey', 'network', 'rings', 'stacked_bar', 'stacked_area' ].includes( key ) ) {
				return 0;
			}
			const rows  = this.filterMeaningful( payload.data, key, measures );
			const field = ( key === 'line' || key === 'area' ) && this.detectYears( measures ).length < 2
				? ( dims[ 1 ] || dims[ 0 ] )
				: dims[ 0 ];
			return new Set( ( rows || [] ).map( ( r ) => r[ field ] ) ).size;
		},

		detectYears( measures ) {
			const years = new Set();
			( measures || [] ).forEach( ( m ) => {
				const match = String( m ).match( /_(20\d{2})$/ );
				if ( match ) {
					years.add( Number( match[ 1 ] ) );
				}
			} );
			return Array.from( years ).sort();
		},

		// ==============================================================
		// Axes
		// ==============================================================

		applyAxes( viz, payload, opts ) {
			if ( typeof viz.xConfig !== 'function' || typeof viz.yConfig !== 'function' ) {
				return;
			}

			const { chart, view } = payload;
			const dims     = view.dimensions || [];
			const measures = view.measures   || [];

			// Charts without conventional X/Y axes — skip even if the methods exist.
			const NO_AXES = [ 'pie', 'donut', 'treemap', 'geomap', 'network', 'rings', 'sankey', 'tree' ];
			if ( NO_AXES.includes( chart.key ) ) {
				return;
			}

			// Detect if the timeline reshaped the data (year-based measures).
			const years   = this.detectYears( measures );
			const hasTime = years.length >= 2 && ! [ 'stacked_bar', 'stacked_area', 'priestley' ].includes( chart.key );

			// Default field used on each axis, mirroring configure()'s logic.
			let xField, yField;
			switch ( chart.key ) {
				case 'stacked_bar':
				case 'stacked_area':
					xField = dims[ 0 ];
					yField = '_value';
					break;
				case 'priestley':
					xField = dims[ 0 ];
					yField = '';
					break;
				case 'line':
				case 'area':
					if ( hasTime ) {
						xField = '_year';
						yField = '_value';
					} else {
						xField = dims[ 0 ];
						yField = measures[ 0 ];
					}
					break;
				default:
					xField = hasTime ? dims[ 0 ] : dims[ 0 ];
					yField = hasTime ? '_value' : measures[ 0 ];
			}

			// Auto-generated titles, overridable via opts.xTitle / opts.yTitle.
			let xTitle, yTitle;
			if ( hasTime ) {
				// After timeline reshape: X = municipio, Y = the base metric
				// name without the year suffix (e.g. "Proyectos" not "Proyectos 2024").
				const yearMeasures = measures.filter( ( m ) => /_(20\d{2})$/.test( m ) );
				const baseName     = yearMeasures.length
					? yearMeasures[ 0 ].replace( /_(20\d{2})$/, '' )
					: measures[ 0 ];
				xTitle = ( opts && opts.xTitle ) || (
					chart.key === 'line' || chart.key === 'area'
						? 'Vigencia'
						: this.autoAxisTitle( dims[ 0 ] )
				);
				yTitle = ( opts && opts.yTitle ) || this.autoAxisTitle( baseName );
			} else {
				xTitle = ( opts && opts.xTitle ) || this.autoAxisTitle( xField );
				yTitle = ( opts && opts.yTitle ) || (
					( chart.key === 'stacked_bar' || chart.key === 'stacked_area' )
						? this.measureGroupTitle( measures )
						: this.autoAxisTitle( yField )
				);
			}

			// No fontFamily: d3plus v4 measures text on a canvas, which
			// rejects CSS keywords such as "inherit".
			const titleConfig = {
				fontSize:   () => 13,
				fontWeight: () => 600,
				fontColor:  () => '#0f172a',
			};

			viz.xConfig( {
				title:       xTitle,
				titleConfig: titleConfig,
			} );
			viz.yConfig( {
				title:       yTitle,
				titleConfig: titleConfig,
			} );
		},

		/**
		 * Build an axis title from a field name, appending a unit hint when
		 * one is encoded in the name (`_cop`, `_pct`, etc).
		 */
		autoAxisTitle( field ) {
			if ( ! field || field === '_value' ) {
				return 'Valor';
			}
			const lower = String( field ).toLowerCase();
			let unit  = '';
			let clean = String( field );

			if ( /millones[_ ]?cop$/.test( lower ) ) {
				unit  = '(Millones COP)';
				clean = clean.replace( /[_ ]?millones[_ ]?cop$/i, '' );
			} else if ( /_cop$/.test( lower ) || /\bcop\b/.test( lower ) ) {
				unit  = '(COP)';
				clean = clean.replace( /[_ ]?cop$/i, '' );
			} else if ( /(_pct|pct_|porcentaje|cobertura_pct|participacion_pct)/.test( lower ) ) {
				unit  = '(%)';
				clean = clean.replace( /[_ ]?(pct|porcentaje)/gi, '' );
			}

			let label = this.humanizeKey( clean ) || this.humanizeKey( field );
			return unit ? `${ label } ${ unit }` : label;
		},

		/**
		 * For stacked charts the Y axis represents whichever measures are
		 * stacked. Pick the most common unit hint among them.
		 */
		measureGroupTitle( measures ) {
			const filtered = ( measures || [] ).filter( ( m ) => ! /^(total|pct_|participacion|cobertura)|(_pct|_total)$/i.test( m ) );
			const sample   = filtered.length ? filtered[ 0 ] : ( measures || [] )[ 0 ] || '';
			if ( /cop|inversion/i.test( sample ) ) {
				return 'Valor (Millones COP)';
			}
			return 'Cantidad';
		},

		// ==============================================================
		// Tooltip
		// ==============================================================

		/**
		 * Build a tooltipConfig with a tbody table that lists every
		 * dimension + measure in the row, with Spanish labels and
		 * locale-formatted values.
		 */
		applyTooltip( viz, payload ) {
			if ( typeof viz.tooltipConfig !== 'function' ) {
				return;
			}

			const { chart, view } = payload;
			const dims     = view.dimensions || [];
			const measures = view.measures   || [];

			const titleAccessor = this.tooltipTitleAccessor( chart.key, dims, view );
			const tbody         = this.tooltipTbody( chart.key, dims, measures );

			viz.tooltipConfig( {
				title: titleAccessor,
				tbody: tbody,
				titleStyle: {
					'max-width':   '260px',
					'font-size':   '14px',
					'font-weight': '600',
					'color':       '#0f172a',
					'border-bottom': '1px solid #e2e8f0',
					'padding-bottom': '6px',
					'margin-bottom': '4px',
				},
				tbodyStyle: {
					'font-size': '12px',
					'color':     '#334155',
				},
				tdStyle: {
					'padding': '2px 4px',
					'vertical-align': 'top',
				},
				background:   '#ffffff',
				border:       '1px solid #cbd5e1',
				borderRadius: '8px',
				padding:      '12px 14px',
			} );
		},

		/**
		 * Title accessor for a given chart type.
		 */
		tooltipTitleAccessor( chartKey, dims, view ) {
			const dim = dims[ 0 ];
			switch ( chartKey ) {
				case 'stacked_bar':
				case 'stacked_area':
					return ( d ) => {
						const left  = d && d._metric ? d._metric : '';
						const right = d && dim && d[ dim ] !== undefined ? d[ dim ] : '';
						return [ left, right ].filter( Boolean ).join( ' — ' ) || ( view.name || '' );
					};
				case 'geomap':
					// Show the original municipio name (with accents) instead
					// of the normalized id used for the join.
					return ( d ) => ( d && ( d.municipio || d[ dim ] ) ) || '';
				case 'pie':
				case 'donut':
				case 'treemap':
				case 'box_whisker':
				case 'bar':
				case 'tree':
					return ( d ) => ( d && dim && d[ dim ] !== undefined ? String( d[ dim ] ) : ( view.name || '' ) );
				case 'line':
				case 'area':
					return ( d ) => {
						const xField = dims[ 0 ];
						const groupField = dims[ 1 ] || dims[ 0 ];
						const xv = d && xField ? d[ xField ] : '';
						const gv = d && groupField && groupField !== xField ? d[ groupField ] : '';
						return [ gv, xv ].filter( ( v ) => v !== undefined && v !== '' ).join( ' · ' ) || ( view.name || '' );
					};
				case 'network':
				case 'rings':
				case 'sankey':
					return ( d ) => ( d && ( d.id || ( dim && d[ dim ] ) ) ) || '';
				default:
					return ( d ) => ( d && dim && d[ dim ] !== undefined ? String( d[ dim ] ) : ( view.name || '' ) );
			}
		},

		/**
		 * Build the tbody rows for a tooltip.
		 *
		 * Each row is `[label, accessorFn]`. d3plus calls the accessor with
		 * the data point at hover time.
		 */
		tooltipTbody( chartKey, dims, measures ) {
			const rows = [];

			if ( chartKey === 'stacked_bar' || chartKey === 'stacked_area' ) {
				if ( dims[ 0 ] ) {
					rows.push( [ this.humanizeLabel( dims[ 0 ] ), ( d ) => this.formatCell( d && d[ dims[ 0 ] ] ) ] );
				}
				rows.push( [ 'Métrica', ( d ) => ( d && d._metric ) || '—' ] );
				rows.push( [ 'Valor',   ( d ) => this.formatValue( '_value', d && d._value ) ] );
				return rows;
			}

			// Generic: list every dimension first, then every measure.
			dims.forEach( ( field ) => {
				rows.push( [
					this.humanizeLabel( field ),
					( d ) => this.formatCell( d && d[ field ] ),
				] );
			} );
			measures.forEach( ( field ) => {
				rows.push( [
					this.humanizeLabel( field ),
					( d ) => this.formatValue( field, d && d[ field ] ),
				] );
			} );
			return rows;
		},

		/**
		 * Friendly label for a tooltip row. Strips unit suffixes and adds
		 * the unit at the end.
		 */
		humanizeLabel( field ) {
			if ( ! field ) {
				return '';
			}
			const lower = String( field ).toLowerCase();
			let unit    = '';
			let clean   = String( field );

			if ( /millones[_ ]?cop$/.test( lower ) ) {
				unit  = '(Millones COP)';
				clean = clean.replace( /[_ ]?millones[_ ]?cop$/i, '' );
			} else if ( /_cop$|\bcop\b/.test( lower ) ) {
				unit  = '(COP)';
				clean = clean.replace( /[_ ]?cop$/i, '' );
			} else if ( /(_pct|pct_|porcentaje)/.test( lower ) ) {
				unit  = '(%)';
				clean = clean.replace( /[_ ]?(pct|porcentaje)/gi, '' );
			}
			const label = this.humanizeKey( clean ) || this.humanizeKey( field );
			return unit ? `${ label } ${ unit }` : label;
		},

		/**
		 * Format a numeric value according to the field name's unit hint.
		 * Falls back to `formatCell()` for non-numerics.
		 */
		formatValue( field, value ) {
			if ( value === null || value === undefined || value === '' ) {
				return '—';
			}
			if ( typeof value !== 'number' && isNaN( Number( value ) ) ) {
				return this.formatCell( value );
			}
			const num   = Number( value );
			const lower = String( field || '' ).toLowerCase();
			if ( /pct|porcentaje|cobertura|participacion/.test( lower ) ) {
				return NF_PCT.format( num ) + ' %';
			}
			if ( Number.isInteger( num ) ) {
				return NF_INT.format( num );
			}
			return NF_DECIMAL.format( num );
		},

		/**
		 * Format a generic cell value for tooltip / legend display.
		 */
		formatCell( v ) {
			if ( v === null || v === undefined || v === '' ) {
				return '—';
			}
			if ( typeof v === 'number' ) {
				return Number.isInteger( v ) ? NF_INT.format( v ) : NF_DECIMAL.format( v );
			}
			if ( typeof v === 'boolean' ) {
				return v ? 'Sí' : 'No';
			}
			return String( v );
		},

		// ==============================================================
		// Shared helpers
		// ==============================================================

		applyShape( viz ) {
			if ( typeof viz.shapeConfig === 'function' ) {
				viz.shapeConfig( {
					fill: ( _d, i ) => PALETTE[ i % PALETTE.length ],
				} );
			}
		},

		/**
		 * Drop rows that have no meaningful data — primary measure is 0,
		 * null, undefined or NaN. For stacked charts the rule is "all
		 * stackable measures are zero"; if any has data the row stays.
		 *
		 * Geomap gets the same treatment: a municipio with a zero measure
		 * disappears from the data so d3plus falls back to topojsonFill
		 * (set to #fffcf3) on its polygon — visually marking "no data".
		 *
		 * Network/graph charts skip the filter because the graph structure
		 * itself carries meaning even when individual measures are 0.
		 */
		filterMeaningful( rows, chartKey, measures ) {
			if ( ! Array.isArray( rows ) || ! rows.length ) {
				return rows || [];
			}
			if ( ! Array.isArray( measures ) || ! measures.length ) {
				return rows;
			}
			if ( chartKey === 'network' || chartKey === 'rings' || chartKey === 'sankey' ) {
				return rows;
			}

			let relevant;
			if ( chartKey === 'stacked_bar' || chartKey === 'stacked_area' ) {
				const stackable = measures.filter(
					( m ) => ! /^(total|pct_|participacion|cobertura)|(_pct|_total)$/i.test( m )
				);
				relevant = stackable.length >= 2 ? stackable : measures.slice( 0, 3 );
			} else {
				// For views with year-based measures (e.g. proyectos_2024,
				// proyectos_2025), keep a row if ANY year has data — not
				// just measures[0] (which might be the 2024 column and zero
				// for municipios that only appear in 2025).
				const yearMeasures = measures.filter( ( m ) => /_(20\d{2})$/.test( m ) );
				if ( yearMeasures.length >= 2 ) {
					relevant = yearMeasures;
				} else {
					relevant = [ measures[ 0 ] ];
				}
			}

			return rows.filter( ( row ) => {
				return relevant.some( ( m ) => {
					const n = Number( row && row[ m ] );
					return Number.isFinite( n ) && n !== 0;
				} );
			} );
		},

		reshapeWideToLong( data, dims, measures ) {
			const stackable = ( measures || [] ).filter(
				( m ) => ! /^(total|pct_|participacion|cobertura)|(_pct|_total)$/i.test( m )
			);
			const useMeasures = stackable.length >= 2 ? stackable : ( measures || [] ).slice( 0, 3 );
			const out = [];
			( data || [] ).forEach( ( row ) => {
				useMeasures.forEach( ( m ) => {
					out.push( Object.assign( {}, row, {
						_metric: this.humanizeKey( m ),
						_value:  Number( row[ m ] ) || 0,
					} ) );
				} );
			} );
			return out;
		},

		humanizeKey( key ) {
			if ( ! key ) {
				return '';
			}
			return String( key )
				.replace( /[_\-]+/g, ' ' )
				.replace( /\s+/g, ' ' )
				.trim()
				.replace( /^./, ( c ) => c.toUpperCase() );
		},

		normalizeMuni( value ) {
			if ( value === null || value === undefined ) {
				return '';
			}
			return String( value )
				.normalize( 'NFD' )
				.replace( /[\u0300-\u036f]/g, '' )
				.toUpperCase()
				.trim()
				.replace( /\s+/g, ' ' );
		},

		buildNodes( data, field ) {
			const seen = new Set();
			const out  = [];
			( data || [] ).forEach( ( row ) => {
				const id = row.id || row[ field ];
				if ( ! id || seen.has( id ) ) {
					return;
				}
				seen.add( id );
				out.push( Object.assign( { id }, row ) );
			} );
			return out;
		},

		safeCall( viz, method, value ) {
			if ( typeof viz[ method ] === 'function' ) {
				try {
					viz[ method ]( value );
				} catch ( err ) {
					console.warn( `[TSG] viz.${ method }() failed`, err );
				}
			}
		},
	};

	window.TSGRenderer = Renderer;
} )();
