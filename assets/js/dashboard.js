/* global d3plus, TSG_DASH */
/**
 * TIC Suite · Dashboard TIC Nariño.
 *
 * Port of dashboard-tic-narino-v2 (Chart.js + Leaflet) to d3plus v4. Every
 * [tsg_dashboard] instance is an independent root: element ids are prefixed
 * with the root's data-uid, and the theme lives on the root, not on <html>.
 */
( function () {
	'use strict';

	/* ══════════════ Pure helpers (shared) ══════════════ */
	const norm = ( t ) => t ? String( t ).toLowerCase().normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' ).replace( /\(.*?\)/g, ' ' ).replace( /\s+/g, ' ' ).trim() : '';
	const geoId = ( t ) => String( t || '' ).normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' ).toUpperCase().trim().replace( /\s+/g, ' ' );
	const esc = ( s ) => String( s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );
	function fmt( n, dec ) {
		dec = dec || 0; n = Number( n ) || 0;
		const neg = n < 0, p = Math.abs( n ).toFixed( dec ).split( '.' );
		p[ 0 ] = p[ 0 ].replace( /\B(?=(\d{3})+(?!\d))/g, '.' );
		return ( neg ? '−' : '' ) + p[ 0 ] + ( p[ 1 ] ? ',' + p[ 1 ] : '' );
	}
	const MINUS = new Set( [ 'de', 'del', 'la', 'las', 'los', 'y' ] );
	const titulo = ( s ) => s.toLowerCase().split( ' ' ).map( ( w, i ) => i && MINUS.has( w ) ? w : w.charAt( 0 ).toUpperCase() + w.slice( 1 ) ).join( ' ' );
	const sum = ( a ) => a.reduce( ( x, y ) => x + y, 0 );
	const prom = ( rows, k ) => rows.length ? sum( rows.map( ( r ) => r[ k ] ) ) / rows.length : 0;
	function median( a ) { if ( ! a.length ) { return 0; } const s = [ ...a ].sort( ( x, y ) => x - y ), m = s.length >> 1; return s.length % 2 ? s[ m ] : ( s[ m - 1 ] + s[ m ] ) / 2; }
	function gini( a ) { const s = [ ...a ].sort( ( x, y ) => x - y ), n = s.length, t = sum( s ); if ( ! t || ! n ) { return 0; } let acc = 0; s.forEach( ( v, i ) => { acc += ( 2 * ( i + 1 ) - n - 1 ) * v; } ); return acc / ( n * t ); }
	const r1 = ( x ) => Math.round( x * 10 ) / 10;
	const fmtN = ( x ) => Number.isInteger( x ) ? fmt( x ) : fmt( x, 1 );
	const nivelGini = ( g ) => g < 0.3 ? 'Baja' : g < 0.5 ? 'Moderada' : g < 0.7 ? 'Alta' : 'Muy alta';
	const tile = ( l, v, s ) => '<div class="tile"><div class="tl">' + esc( l ) + '</div><div class="tv">' + esc( v ) + '</div><div class="ts">' + esc( s ) + '</div></div>';
	const TEMA_KEY = 'tic-narino-tema';

	/** Wait until the d3plus UMD bundle has attached itself. */
	function whenD3plus() {
		return new Promise( ( resolve, reject ) => {
			const t0 = Date.now();
			( function tick() {
				if ( window.d3plus && window.d3plus.Geomap ) { return resolve(); }
				if ( Date.now() - t0 > 10000 ) { return reject( new Error( 'd3plus no disponible' ) ); }
				setTimeout( tick, 80 );
			}() );
		} );
	}

	/* ══════════════ One dashboard instance ══════════════ */
	function initDashboard( root ) {
		if ( root.dataset.tsgReady ) { return; }
		root.dataset.tsgReady = '1';
		const U = root.dataset.uid;
		const $ = ( id ) => document.getElementById( U + '-' + id );

		try {
			const t = localStorage.getItem( TEMA_KEY );
			if ( t === 'light' || t === 'dark' ) { root.setAttribute( 'data-theme', t ); }
		} catch ( e ) { /* storage unavailable */ }

		const cfg = window.TSG_DASH || {};
		const url = cfg.restUrl + encodeURIComponent( root.dataset.dashboard || 'tic-narino' );
		Promise.all( [
			fetch( url, { headers: { 'X-WP-Nonce': cfg.nonce || '' }, credentials: 'same-origin' } ).then( ( r ) => { if ( ! r.ok ) { throw new Error( 'HTTP ' + r.status ); } return r.json(); } ),
			fetch( cfg.topojsonUrl ).then( ( r ) => { if ( ! r.ok ) { throw new Error( 'HTTP ' + r.status ); } return r.json(); } ),
			whenD3plus(),
		] ).then( ( [ payload, topo ] ) => build( root, $, payload, topo ) ).catch( ( err ) => {
			console.error( '[TSG dashboard]', err );
			const lbl = $( 'mapLabel' );
			if ( lbl ) { lbl.textContent = 'No se pudo cargar el dashboard'; }
		} );
	}

	function build( root, $, D, TOPO ) {
		const DATA = D.data, SUBREGIONES = D.subregiones, PROGRAMAS = D.programas, INDICES = D.indices, INVERSION = D.inversion, TIPOS = D.tipos;
		const METRICA = {};
		[ ...INDICES, ...PROGRAMAS ].forEach( ( m ) => { METRICA[ m.k ] = m; } );

		/* ── Analítica: variables derivadas por municipio ── */
		const subDe = {};
		Object.entries( SUBREGIONES ).forEach( ( [ s, l ] ) => l.forEach( ( m ) => { subDe[ norm( m ) ] = s; } ) );
		const porId = {}, porGeo = {};
		DATA.forEach( ( r ) => {
			r.id = norm( r.municipio ); r.gid = geoId( r.municipio ); r.nom = titulo( r.municipio ); r.sub = subDe[ r.id ] || 'Sin subregión';
			r.ip = PROGRAMAS.reduce( ( a, p ) => a + ( r[ p.k ] > 0 ? 1 : 0 ), 0 );
			r.p = {}; porId[ r.id ] = r; porGeo[ r.gid ] = r;
		} );
		PROGRAMAS.forEach( ( p ) => {
			const vals = DATA.map( ( r ) => r[ p.k ] );
			DATA.forEach( ( r ) => { r.p[ p.k ] = vals.filter( ( v ) => v < r[ p.k ] ).length / ( DATA.length - 1 ) * 100; } );
		} );
		const P_CON = PROGRAMAS.filter( ( p ) => p.g === 'con' ), P_EDU = PROGRAMAS.filter( ( p ) => p.g === 'edu' );
		DATA.forEach( ( r ) => { r.ic = r1( sum( P_CON.map( ( p ) => r.p[ p.k ] ) ) / P_CON.length ); r.ie = r1( sum( P_EDU.map( ( p ) => r.p[ p.k ] ) ) / P_EDU.length ); } );
		const MED_C = median( DATA.map( ( r ) => r.ic ) ), MED_E = median( DATA.map( ( r ) => r.ie ) );
		DATA.forEach( ( r ) => { r.tipo = r.ic >= MED_C ? ( r.ie >= MED_E ? 'A' : 'B' ) : ( r.ie >= MED_E ? 'C' : 'D' ); } );
		const rankOf = ( r, k ) => 1 + DATA.filter( ( x ) => x[ k ] > r[ k ] ).length;

		/* ── Estado ── */
		let selMun = null, selSub = null, mapMode = 'metrica', tabActiva = 'resumen', CL = [], TM = null;
		const charts = {}, TABLAS = {}, pendientes = {}, redibujar = {};
		const metrica = () => $( 'metric' ).value;
		const alcance = () => selSub ? DATA.filter( ( r ) => r.sub === selSub ) : DATA;
		const temaActual = () => root.getAttribute( 'data-theme' ) === 'light' ? 'light' : 'dark';

		function leerTema() {
			const cs = getComputedStyle( root ), v = ( n ) => cs.getPropertyValue( n ).trim();
			return { text: v( '--text' ), text2: v( '--text-2' ), muted: v( '--muted' ), grid: v( '--grid' ), axis: v( '--axis' ),
				brand: v( '--brand' ), brandHi: v( '--brand-hi' ), deemph: v( '--deemph' ), surface: v( '--surface-2' ), sel: v( '--sel' ),
				mapBg: v( '--map-bg' ), polyLine: v( '--poly-line' ), zero: v( '--zero' ), tipBg: v( '--tip-bg' ), tipText: v( '--tip-text' ),
				seq: [ 1, 2, 3, 4, 5 ].map( ( i ) => v( '--seq-' + i ) ), tipo: { A: v( '--t-a' ), B: v( '--t-b' ), C: v( '--t-c' ), D: v( '--t-d' ) } };
		}

		/* ══════════ d3plus base ══════════ */
		function theme( bg ) {
			return { base: temaActual(), background: bg || TM.surface, text: TM.text2, axis: TM.muted, gridline: TM.grid,
				tooltip: { background: TM.tipBg, text: TM.tipText, border: TM.axis } };
		}
		function base( bg ) {
			// detectVisible:false — v4 otherwise defers drawing until the chart
			// scrolls into the viewport and unloads it again when it leaves,
			// which leaves charts inside the scrolling sidebar blank.
			return { legend: false, saveControl: false, search: false, tableView: false, zoom: false,
				detectVisible: false, detectResize: false, duration: 250, theme: theme( bg ) };
		}
		const ttRow = ( l, v ) => '<div class="tt-r"><span>' + esc( l ) + '</span><b>' + esc( v ) + '</b></div>';
		/** Custom HTML tooltip: d3plus calls title(d) and body(d) on hover. */
		const tooltip = ( title, body ) => ( { tooltipConfig: { className: 'tsg-dash-tt', title: ( d ) => esc( title( d ) ), body: ( d ) => body( d ), tbody: [] } } );
		const ejeNum = ( extra ) => Object.assign( { gridConfig: { stroke: TM.grid } }, extra || {} );

		/**
		 * (Re)draw a chart. A chart inside a hidden tab or table view has no
		 * width yet, so its draw is deferred until mostrarTab/toggle shows it.
		 */
		function nuevo( key, Ctor, conf ) {
			const el = $( 'c-' + key );
			if ( ! el ) { return; }
			redibujar[ key ] = () => nuevo( key, Ctor, conf );
			pintarTabla( key );
			if ( ! el.offsetWidth ) { pendientes[ key ] = () => nuevo( key, Ctor, conf ); return; }
			delete pendientes[ key ];
			el.innerHTML = '';
			const viz = new Ctor().select( el ).config( Object.assign( base(), conf ) );
			viz.render();
			charts[ key ] = viz;
		}
		function correrPendientes() {
			Object.keys( pendientes ).forEach( ( k ) => { const el = $( 'c-' + k ); if ( el && el.offsetWidth ) { pendientes[ k ](); } } );
		}
		const enfasis = ( esFoco, hayFoco ) => ( d ) => ! hayFoco || esFoco( d ) ? TM.brand : TM.deemph;
		function leyenda( key, items ) {
			const el = $( 'lg-' + key );
			if ( el ) { el.innerHTML = items.map( ( i ) => '<span><i class="' + ( i.f || '' ) + '" style="background:' + i.c + '"></i>' + esc( i.t ) + '</span>' ).join( '' ); }
		}
		function pintarTabla( key ) {
			const card = root.querySelector( '.card[data-chart="' + key + '"]' );
			if ( ! card ) { return; }
			const w = card.querySelector( '.tbl-wrap' ), t = TABLAS[ key ];
			if ( ! w || w.hidden || ! t ) { return; }
			w.innerHTML = '<table class="tv' + ( t.txt ? ' txt' : '' ) + '"><thead><tr>' + t.head.map( ( h ) => '<th>' + esc( h ) + '</th>' ).join( '' ) + '</tr></thead><tbody>' +
				t.rows.map( ( r ) => '<tr>' + r.map( ( c ) => '<td>' + esc( c ) + '</td>' ).join( '' ) + '</tr>' ).join( '' ) + '</tbody></table>';
		}

		/* ══════════ Mapa (d3plus.Geomap) ══════════ */
		function clases( k ) {
			const pos = DATA.map( ( r ) => r[ k ] ).filter( ( v ) => v > 0 ).sort( ( a, b ) => a - b );
			if ( ! pos.length ) { return []; }
			const u = [ ...new Set( pos ) ];
			let cortes;
			if ( u.length <= 5 ) { cortes = u.slice( 1 ); } else {
				cortes = [];
				for ( let i = 1; i < 5; i++ ) { const c = pos[ Math.floor( i * pos.length / 5 ) ]; if ( c > pos[ 0 ] && ! cortes.includes( c ) ) { cortes.push( c ); } }
			}
			const lim = [ pos[ 0 ], ...cortes ], cl = [];
			lim.forEach( ( ini, i ) => {
				const fin = i < lim.length - 1 ? lim[ i + 1 ] : Infinity, m = pos.filter( ( v ) => v >= ini && v < fin );
				if ( m.length ) { cl.push( { min: m[ 0 ], max: m[ m.length - 1 ], n: m.length } ); }
			} );
			cl.porValor = u.length <= 5;
			return cl;
		}
		const claseDe = ( v, cl ) => { for ( let i = cl.length - 1; i >= 0; i-- ) { if ( v >= cl[ i ].min ) { return i; } } return -1; };
		const paso = ( i, k ) => k === 1 ? 3 : Math.round( i * 4 / ( k - 1 ) );
		function colorDe( r ) {
			if ( ! r ) { return TM.zero; }
			if ( mapMode === 'tipologia' ) { return TM.tipo[ r.tipo ]; }
			const v = r[ metrica() ], c = v > 0 ? claseDe( v, CL ) : -1;
			return c >= 0 ? TM.seq[ paso( c, CL.length ) ] : TM.zero;
		}
		const filaDe = ( d ) => d ? ( porGeo[ d.id ] || porGeo[ d.gid ] || null ) : null;

		function pintarMapa() {
			CL = clases( metrica() );
			const k = metrica(), M = METRICA[ k ];
			$( 'mapLabel' ).textContent = mapMode === 'tipologia' ? 'Tipología municipal' : M.n;
			const el = $( 'map' );
			if ( ! el.offsetWidth ) { return; }
			el.innerHTML = '';
			const enSub = selSub ? new Set( DATA.filter( ( r ) => r.sub === selSub ).map( ( r ) => r.gid ) ) : null;
			const conf = Object.assign( base( TM.mapBg ), {
				zoom: true,
				data: DATA.map( ( r ) => ( { id: r.gid } ) ),
				groupBy: 'id',
				topojson: TOPO, topojsonKey: 'municipios', topojsonId: ( f ) => f.id,
				topojsonFill: TM.zero, tiles: false, ocean: 'transparent',
				shapeConfig: { Path: {
					// Municipios outside the selected subregion are muted to the "no data" tone.
					fill: ( d ) => { const r = filaDe( d ); return enSub && ( ! r || ! enSub.has( r.gid ) ) ? TM.zero : colorDe( r ); },
					fillOpacity: ( d ) => { const r = filaDe( d ); return enSub && ( ! r || ! enSub.has( r.gid ) ) ? 0.45 : 1; },
					stroke: ( d ) => { const r = filaDe( d ); return selMun && r && r.id === selMun.id ? TM.sel : TM.polyLine; },
					strokeWidth: ( d ) => { const r = filaDe( d ); return selMun && r && r.id === selMun.id ? 3 : 1.2; },
				} },
				on: { 'click.shape': ( d ) => { const r = filaDe( d ); if ( r ) { seleccionar( r.id ); } } },
			}, tooltip(
				( d ) => { const r = filaDe( d ); return r ? r.nom + ( r.pdet ? ' · PDET' : '' ) : 'Sin datos'; },
				( d ) => {
					const r = filaDe( d );
					if ( ! r ) { return ''; }
					return '<div class="tt-s">' + esc( r.sub ) + ' · ' + esc( TIPOS[ r.tipo ].n ) + '</div>' +
						ttRow( M.c, fmt( r[ k ], M.dec ) ) + ttRow( 'Puesto', rankOf( r, k ) + ' de ' + DATA.length ) + ttRow( 'Índice de presencia', r.ip + '/12' );
				}
			) );
			// Passing fitFilter: undefined breaks the projection fit, so only set it when filtering.
			if ( enSub ) { conf.fitFilter = ( f ) => enSub.has( f.id ); }
			const viz = new d3plus.Geomap().select( el ).config( conf );
			viz.render();
			charts.map = viz;
			pintarLeyenda();
		}
		function pintarLeyenda() {
			let h = '';
			if ( mapMode === 'tipologia' ) {
				h += '<div class="leg-t">Tipología municipal</div>';
				[ 'A', 'B', 'C', 'D' ].forEach( ( t ) => { h += '<div class="leg-r"><i style="background:' + TM.tipo[ t ] + '"></i>' + esc( TIPOS[ t ].n ) + '<em>' + DATA.filter( ( r ) => r.tipo === t ).length + '</em></div>'; } );
				h += '<div class="leg-n">Según la mediana departamental de los subíndices de conectividad y educación digital.</div>';
			} else {
				const M = METRICA[ metrica() ], k = CL.length;
				h += '<div class="leg-t">' + esc( M.c ) + '</div>';
				for ( let i = k - 1; i >= 0; i-- ) {
					const c = CL[ i ], rango = c.min === c.max ? fmt( c.min, M.dec ) : fmt( c.min, M.dec ) + ' – ' + fmt( c.max, M.dec );
					h += '<div class="leg-r"><i style="background:' + TM.seq[ paso( i, k ) ] + '"></i>' + rango + '<em>' + c.n + '</em></div>';
				}
				const ceros = DATA.filter( ( r ) => ! ( r[ metrica() ] > 0 ) ).length;
				if ( ceros ) { h += '<div class="leg-r"><i style="background:' + TM.zero + '"></i>Sin presencia<em>' + ceros + '</em></div>'; }
				h += '<div class="leg-n">' + ( CL.porValor ? 'Una clase por valor' : 'Clases por cuantiles' ) + ' · a la derecha, número de municipios.</div>';
			}
			$( 'leyenda' ).innerHTML = h;
		}

		/* ══════════ Selección y filtros ══════════ */
		function seleccionar( id ) {
			const r = porId[ id ];
			if ( ! r ) { return; }
			selMun = r;
			if ( selSub && r.sub !== selSub ) { selSub = null; $( 'subregion' ).value = ''; }
			mostrarTab( 'municipio' ); pintarTodo();
		}
		function fijarSubregion( s ) {
			selSub = s || null; $( 'subregion' ).value = selSub || '';
			if ( selMun && selSub && selMun.sub !== selSub ) { selMun = null; }
			pintarTodo();
		}
		function limpiar() {
			selMun = null; selSub = null; $( 'subregion' ).value = ''; $( 'q' ).value = '';
			if ( tabActiva === 'municipio' ) { mostrarTab( 'resumen' ); }
			pintarTodo();
		}
		function mostrarTab( t ) {
			tabActiva = t;
			root.querySelectorAll( '.tab' ).forEach( ( b ) => b.setAttribute( 'aria-selected', b.dataset.tab === t ? 'true' : 'false' ) );
			[ 'resumen', 'analitica', 'ranking', 'municipio' ].forEach( ( p ) => { $( 'p-' + p ).hidden = p !== t; } );
			correrPendientes();
		}

		/* ══════════ Cabecera ══════════ */
		function pintarCabecera() {
			const rows = alcance();
			let nombre, chips = '', t;
			if ( selMun ) {
				const r = selMun; nombre = r.nom;
				chips = ( r.pdet ? '<span class="chip">PDET</span>' : '' ) + '<span class="chip">' + esc( r.sub ) + '</span><span class="chip"><i style="background:' + TM.tipo[ r.tipo ] + '"></i>' + esc( TIPOS[ r.tipo ].n ) + '</span>';
				t = tile( 'Centros Digitales', fmt( r.centros_digitales ), r.cd_operacion + ' en operación' ) +
					tile( 'Talento Tech', fmt( r.talento_tech ), 'puesto ' + rankOf( r, 'talento_tech' ) + ' de ' + DATA.length ) +
					tile( 'Índice de presencia', r.ip + '/12', 'puesto ' + rankOf( r, 'ip' ) + ' de ' + DATA.length ) +
					tile( 'Conectividad', fmt( r.ic, 1 ), 'mediana dptal. ' + fmt( MED_C, 1 ) ) +
					tile( 'Educación digital', fmt( r.ie, 1 ), 'mediana dptal. ' + fmt( MED_E, 1 ) ) +
					tile( 'Inv. Centros Digitales', '$' + fmt( r.inv_cd ) + ' M', 'millones COP' );
			} else {
				const cd = sum( rows.map( ( r ) => r.centros_digitales ) ), op = sum( rows.map( ( r ) => r.cd_operacion ) ), nP = rows.filter( ( r ) => r.pdet ).length;
				nombre = selSub ? 'Subregión ' + selSub : 'Nariño · vista departamental';
				if ( selSub ) { chips = '<span class="chip">' + rows.length + ' municipios</span>' + ( nP ? '<span class="chip">' + nP + ' PDET</span>' : '' ); }
				t = tile( 'Municipios', String( rows.length ), nP + ' PDET' ) +
					tile( 'Centros Digitales', fmt( cd ), fmt( op ) + ' en operación' ) +
					tile( 'Talento Tech', fmt( sum( rows.map( ( r ) => r.talento_tech ) ) ), 'inscritos' ) +
					tile( 'Zonas de Paz', fmt( sum( rows.map( ( r ) => r.zonas_paz ) ) ), rows.filter( ( r ) => r.zonas_paz > 0 ).length + ' municipios' ) +
					tile( 'Índice de presencia', fmt( prom( rows, 'ip' ), 1 ), 'promedio sobre 12' ) +
					( selSub ? tile( 'Inv. Centros Digitales', '$' + fmt( sum( rows.map( ( r ) => r.inv_cd ) ) ) + ' M', 'millones COP' )
						: tile( 'Inversión MinTIC', '$' + fmt( sum( INVERSION.map( ( i ) => i.v ) ) ) + ' M', INVERSION.length + ' programas' ) );
			}
			$( 'scopeName' ).textContent = nombre; $( 'scopeChips' ).innerHTML = chips; $( 'kpis' ).innerHTML = t;
			$( 'btnLimpiar' ).hidden = ! ( selMun || selSub );
		}

		/* ══════════ Resumen ══════════ */
		function pintarLectura() {
			const k = metrica(), M = METRICA[ k ], rows = alcance(), n = rows.length, vals = rows.map( ( r ) => r[ k ] );
			const ord = [ ...rows ].sort( ( a, b ) => b[ k ] - a[ k ] ), P = rows.filter( ( r ) => r.pdet ), Q = rows.filter( ( r ) => ! r.pdet );
			$( 't-lectura' ).textContent = M.n;
			$( 's-lectura' ).textContent = ( selSub ? 'Subregión ' + selSub : 'Departamento' ) + ' · ' + n + ' municipios';
			$( 'descMetrica' ).textContent = M.d;
			let t = '';
			const l = [];
			if ( M.idx ) {
				t = tile( 'Promedio', fmt( prom( rows, k ), 1 ), '' ) + tile( 'Mediana', fmt( median( vals ), 1 ), '' ) +
					tile( 'Mínimo', fmt( Math.min( ...vals ), M.dec ), ord[ n - 1 ].nom ) + tile( 'Máximo', fmt( Math.max( ...vals ), M.dec ), ord[ 0 ].nom );
			} else {
				const tot = sum( vals ), cob = vals.filter( ( v ) => v > 0 ).length, g = gini( vals ), m = Math.min( 5, n );
				t = tile( 'Total', fmt( tot ), '' ) + tile( 'Cobertura', cob + '/' + n, fmt( cob / n * 100 ) + ' % de municipios' ) +
					tile( 'Mayor aporte', tot ? fmt( ord[ 0 ][ k ] / tot * 100 ) + ' %' : '—', tot ? ord[ 0 ].nom : '' ) +
					tile( 'Concentración', tot ? nivelGini( g ) : '—', tot ? 'Gini ' + fmt( g, 2 ) : '' );
				if ( tot && n > 5 ) { l.push( 'Los ' + m + ' primeros municipios suman el <b>' + fmt( sum( ord.slice( 0, m ).map( ( r ) => r[ k ] ) ) / tot * 100 ) + ' %</b> del total.' ); }
			}
			if ( P.length && Q.length ) { l.push( 'Mediana por municipio: <b>' + fmtN( median( P.map( ( r ) => r[ k ] ) ) ) + '</b> en PDET frente a <b>' + fmtN( median( Q.map( ( r ) => r[ k ] ) ) ) + '</b> en el resto.' ); }
			if ( ! selSub ) {
				const subs = Object.keys( SUBREGIONES ).map( ( s ) => { const rs = DATA.filter( ( r ) => r.sub === s ); return { s, v: M.idx ? prom( rs, k ) : sum( rs.map( ( r ) => r[ k ] ) ) }; } ).sort( ( a, b ) => b.v - a.v );
				const d = M.idx ? 1 : 0, ult = subs[ subs.length - 1 ];
				l.push( 'Subregión con el valor más alto: <b>' + esc( subs[ 0 ].s ) + '</b> (' + fmt( subs[ 0 ].v, d ) + '); más bajo: <b>' + esc( ult.s ) + '</b> (' + fmt( ult.v, d ) + ').' );
			}
			$( 'tilesMetrica' ).innerHTML = t; $( 'lectura' ).innerHTML = l.map( ( x ) => '<p>' + x + '</p>' ).join( '' );
		}
		function pintarHallazgos() {
			const top = ( k ) => [ ...DATA ].sort( ( a, b ) => b[ k ] - a[ k ] )[ 0 ], cuota = ( k ) => top( k )[ k ] / ( sum( DATA.map( ( r ) => r[ k ] ) ) || 1 ) * 100;
			const P = DATA.filter( ( r ) => r.pdet ), Q = DATA.filter( ( r ) => ! r.pdet ), Dd = DATA.filter( ( r ) => r.tipo === 'D' );
			const subs = Object.keys( SUBREGIONES ).map( ( s ) => ( { s, v: prom( DATA.filter( ( r ) => r.sub === s ), 'ip' ) } ) ).sort( ( a, b ) => a.v - b.v );
			const cd = sum( DATA.map( ( r ) => r.centros_digitales ) ), op = sum( DATA.map( ( r ) => r.cd_operacion ) ), inst = sum( DATA.map( ( r ) => r.cd_instalacion ) );
			const pend = DATA.filter( ( r ) => r.cd_instalacion > 0 ).sort( ( a, b ) => b.cd_instalacion - a.cd_instalacion || a.nom.localeCompare( b.nom, 'es' ) );
			const cobs = PROGRAMAS.map( ( p ) => ( { p, c: DATA.filter( ( r ) => r[ p.k ] > 0 ).length } ) ).sort( ( a, b ) => a.c - b.c );
			const univ = cobs.filter( ( x ) => x.c === DATA.length ).map( ( x ) => x.p.n );
			const tt = top( 'talento_tech' ), hg = top( 'conectividad_hogares' ), cp = top( 'computadores' );
			const h = [
				[ 'Concentración', esc( tt.nom ) + ' reúne el ' + fmt( cuota( 'talento_tech' ) ) + ' % de los inscritos en Talento Tech. ' + esc( hg.nom ) + ' tiene el ' + fmt( cuota( 'conectividad_hogares' ) ) + ' % de los hogares conectados' + ( cp.id === hg.id ? ' y el ' + fmt( cuota( 'computadores' ) ) + ' % de los computadores.' : '; ' + esc( cp.nom ) + ', el ' + fmt( cuota( 'computadores' ) ) + ' % de los computadores.' ) ],
				[ 'Brecha PDET', 'Los ' + P.length + ' municipios PDET promedian ' + fmt( prom( P, 'ip' ), 1 ) + ' programas con presencia frente a ' + fmt( prom( Q, 'ip' ), 1 ) + ' del resto. En Talento Tech su mediana es de ' + fmtN( median( P.map( ( r ) => r.talento_tech ) ) ) + ' inscritos frente a ' + fmtN( median( Q.map( ( r ) => r.talento_tech ) ) ) + '.' ],
				[ 'Rezago', Dd.length + ' municipios quedan bajo la mediana departamental en conectividad y en educación digital. Las subregiones con menor índice de presencia promedio son ' + esc( subs[ 0 ].s ) + ' (' + fmt( subs[ 0 ].v, 1 ) + ') y ' + esc( subs[ 1 ].s ) + ' (' + fmt( subs[ 1 ].v, 1 ) + ').' ],
				[ 'Centros Digitales', fmt( op ) + ' de ' + fmt( cd ) + ' están en operación (' + fmt( op / cd * 100, 1 ) + ' %). Quedan ' + fmt( inst ) + ' por instalar en ' + pend.length + ' municipios' + ( pend.length > 1 ? '; los mayores pendientes son ' + esc( pend[ 0 ].nom ) + ' (' + pend[ 0 ].cd_instalacion + ') y ' + esc( pend[ 1 ].nom ) + ' (' + pend[ 1 ].cd_instalacion + ').' : '.' ) ],
				[ 'Cobertura', ( univ.length ? esc( univ.join( ' y ' ) ) + ( univ.length > 1 ? ' llegan' : ' llega' ) + ' a los ' + DATA.length + ' municipios; ' : '' ) + esc( cobs[ 0 ].p.n ) + ' solo a ' + cobs[ 0 ].c + ' y ' + esc( cobs[ 1 ].p.n ) + ' a ' + cobs[ 1 ].c + '.' ],
			];
			$( 'hallazgos' ).innerHTML = h.map( ( x ) => '<li><div><b>' + x[ 0 ] + '</b>' + x[ 1 ] + '</div></li>' ).join( '' );
		}

		/* ══════════ Gráficos (d3plus) ══════════ */

		// 1 · Concentración (curva acumulada) o valores ordenados (índices)
		function grafConcentracion() {
			const k = metrica(), M = METRICA[ k ], rows = [ ...alcance() ].sort( ( a, b ) => b[ k ] - a[ k ] || a.nom.localeCompare( b.nom, 'es' ) ), n = rows.length;
			const tot = sum( rows.map( ( r ) => r[ k ] ) );
			if ( M.idx || ! tot ) {
				$( 't-conc' ).textContent = 'Valores ordenados · ' + M.c;
				$( 's-conc' ).textContent = 'Municipios de mayor a menor';
				leyenda( 'conc', [] );
				TABLAS.conc = { txt: true, head: [ 'Puesto', 'Municipio', M.c ], rows: rows.map( ( r, i ) => [ i + 1, r.nom, fmt( r[ k ], M.dec ) ] ) };
				nuevo( 'conc', d3plus.AreaPlot, Object.assign( {
					data: rows.map( ( r, i ) => ( { serie: M.c, x: i + 1, y: r[ k ], nom: r.nom } ) ),
					groupBy: 'serie', x: 'x', y: 'y',
					xConfig: { title: 'Puesto' }, yConfig: ejeNum(),
					shapeConfig: { Area: { fill: TM.brand, fillOpacity: 0.18, stroke: TM.brand, strokeWidth: 2 } },
				}, tooltip( () => M.c, ( d ) => ttRow( 'Valores', n + ' municipios' ) ) ) );
				return;
			}
			const pts = [ { serie: 'Acumulado real', x: 0, y: 0 } ];
			let acc = 0;
			rows.forEach( ( r, i ) => { acc += r[ k ]; pts.push( { serie: 'Acumulado real', x: i + 1, y: acc / tot * 100, nom: r.nom, v: r[ k ] } ); } );
			$( 't-conc' ).textContent = 'Concentración · ' + M.c;
			$( 's-conc' ).textContent = 'Porcentaje acumulado del total, sumando municipios de mayor a menor';
			leyenda( 'conc', [ { c: TM.brand, t: 'Acumulado real', f: 'ln' }, { c: TM.deemph, t: 'Reparto uniforme', f: 'ln' } ] );
			TABLAS.conc = { txt: true, head: [ 'Puesto', 'Municipio', M.c, '% acumulado' ], rows: rows.map( ( r, i ) => [ i + 1, r.nom, fmt( r[ k ] ), fmt( pts[ i + 1 ].y, 1 ) + ' %' ] ) };
			nuevo( 'conc', d3plus.LinePlot, Object.assign( {
				data: pts.concat( [ { serie: 'Reparto uniforme', x: 0, y: 0 }, { serie: 'Reparto uniforme', x: n, y: 100 } ] ),
				groupBy: 'serie', x: 'x', y: 'y',
				xConfig: { title: 'Número de municipios' },
				yConfig: ejeNum( { domain: [ 0, 100 ], tickFormat: ( v ) => v + ' %' } ),
				shapeConfig: { Line: { stroke: ( d ) => d.serie === 'Reparto uniforme' ? TM.deemph : TM.brand, strokeWidth: ( d ) => d.serie === 'Reparto uniforme' ? 1 : 2, label: false } },
			}, tooltip(
				( d ) => d.serie === 'Reparto uniforme' ? 'Reparto uniforme' : fmt( d.y, 1 ) + ' % del total',
				( d ) => d.serie === 'Reparto uniforme' || ! d.x ? '' : ttRow( d.x === 1 ? 'El primer municipio' : 'Los ' + d.x + ' primeros', '' ) + ttRow( 'N.º ' + d.x, d.nom + ' (' + fmt( d.v ) + ')' )
			) ) );
		}

		// 2 · Tipología municipal (dispersión conectividad × educación digital)
		function grafTipologia() {
			const esSel = ( r ) => selMun && r.id === selMun.id, fuera = ( r ) => selSub && r.sub !== selSub;
			leyenda( 'tipo', [ 'A', 'B', 'C', 'D' ].map( ( t ) => ( { c: TM.tipo[ t ], t: TIPOS[ t ].n + ' (' + DATA.filter( ( r ) => r.tipo === t ).length + ')', f: 'ci' } ) ).concat( [ { c: TM.muted, t: 'PDET (cuadrado)' }, { c: TM.muted, t: 'No PDET', f: 'ci' } ] ) );
			TABLAS.tipo = { txt: true, head: [ 'Municipio', 'Subregión', 'Conectividad', 'Educación', 'Tipología' ],
				rows: [ ...DATA ].sort( ( a, b ) => a.nom.localeCompare( b.nom, 'es' ) ).map( ( r ) => [ r.nom, r.sub, fmt( r.ic, 1 ), fmt( r.ie, 1 ), TIPOS[ r.tipo ].n ] ) };
			const pts = DATA.map( ( r ) => ( { id: r.id, x: r.ic, y: r.ie } ) );
			const fila = ( d ) => porId[ d.id ];
			const tam = ( d ) => { const r = fila( d ); return esSel( r ) ? 7 : selSub && ! fuera( r ) ? 5.5 : r.pdet ? 5 : 4; };
			const shapeStyle = {
				fill: ( d ) => TM.tipo[ fila( d ).tipo ],
				fillOpacity: ( d ) => fuera( fila( d ) ) ? 0.18 : 1,
				stroke: ( d ) => { const r = fila( d ); return esSel( r ) ? TM.sel : fuera( r ) ? 'transparent' : TM.surface; },
				strokeWidth: ( d ) => esSel( fila( d ) ) ? 3 : 1.5,
				label: false,
			};
			nuevo( 'tipo', d3plus.Plot, Object.assign( {
				data: pts, groupBy: 'id', x: 'x', y: 'y',
				shape: ( d ) => fila( d ).pdet ? 'Rect' : 'Circle',
				referenceLines: [ { x: MED_C, label: 'Mediana ' + fmt( MED_C, 1 ) }, { y: MED_E, label: 'Mediana ' + fmt( MED_E, 1 ) } ],
				xConfig: ejeNum( { domain: [ 0, 100 ], title: 'Subíndice de conectividad' } ),
				yConfig: ejeNum( { domain: [ 0, 100 ], title: 'Subíndice de educación digital' } ),
				shapeConfig: { Circle: Object.assign( { r: tam }, shapeStyle ), Rect: Object.assign( { width: ( d ) => tam( d ) * 1.8, height: ( d ) => tam( d ) * 1.8 }, shapeStyle ) },
				on: { 'click.shape': ( d ) => { if ( d && d.id ) { setTimeout( () => seleccionar( d.id ), 0 ); } } },
			}, tooltip(
				( d ) => { const r = fila( d ); return r.nom + ( r.pdet ? ' · PDET' : '' ); },
				( d ) => { const r = fila( d ); return ttRow( 'Conectividad', fmt( r.ic, 1 ) ) + ttRow( 'Educación digital', fmt( r.ie, 1 ) ) + '<div class="tt-s">' + esc( TIPOS[ r.tipo ].n ) + ' · ' + esc( r.sub ) + '</div>'; }
			) ) );
		}

		/** Horizontal bar chart, first item on top. */
		function barrasH( key, items, opts ) {
			const n = items.length;
			nuevo( key, d3plus.BarChart, Object.assign( {
				data: items.map( ( it, i ) => Object.assign( { _o: i }, it ) ),
				groupBy: 'lbl', discrete: 'y', x: 'v', y: 'lbl',
				ySort: ( a, b ) => b._o - a._o,
				xConfig: ejeNum( opts.x || {} ),
				shapeConfig: { Bar: { fill: opts.fill || TM.brand, label: false } },
				on: opts.click ? { 'click.shape': ( d ) => { if ( d ) { setTimeout( () => opts.click( d ), 0 ); } } } : {},
			}, tooltip( opts.ttTitle || ( ( d ) => d.lbl ), opts.ttBody ), opts.extra || {} ) );
			return n;
		}

		// 3 · Subregiones
		function grafSubregiones() {
			const k = metrica(), M = METRICA[ k ], d = M.idx ? 1 : 0, foco = selSub || ( selMun && selMun.sub );
			const items = Object.keys( SUBREGIONES ).map( ( s ) => { const rs = DATA.filter( ( r ) => r.sub === s ); return { lbl: s, n: rs.length, v: M.idx ? prom( rs, k ) : sum( rs.map( ( r ) => r[ k ] ) ) }; } ).sort( ( a, b ) => b.v - a.v );
			$( 't-sub' ).textContent = M.c + ' por subregión';
			$( 's-sub' ).textContent = ( M.idx ? 'Promedio de sus municipios' : 'Total de la subregión' ) + '. Clic en una barra para filtrar.';
			TABLAS.sub = { head: [ 'Subregión', 'Municipios', M.idx ? 'Promedio' : 'Total' ], rows: items.map( ( i ) => [ i.lbl, i.n, fmt( i.v, d ) ] ) };
			barrasH( 'sub', items, {
				fill: enfasis( ( x ) => x.lbl === foco, !! foco ),
				x: { tickFormat: ( v ) => fmt( v ) },
				click: ( x ) => fijarSubregion( selSub === x.lbl ? null : x.lbl ),
				ttBody: ( x ) => ttRow( M.c, fmt( x.v, d ) ) + ttRow( 'Municipios', x.n ),
			} );
		}

		// 4 · Brecha PDET: % de municipios con presencia de cada programa
		function grafPdet() {
			const P = DATA.filter( ( r ) => r.pdet ), Q = DATA.filter( ( r ) => ! r.pdet );
			const cob = ( rows, k ) => rows.length ? rows.filter( ( r ) => r[ k ] > 0 ).length / rows.length * 100 : 0;
			const items = PROGRAMAS.map( ( p ) => ( { p, a: cob( P, p.k ), b: cob( Q, p.k ) } ) ).sort( ( x, y ) => ( y.a - y.b ) - ( x.a - x.b ) );
			leyenda( 'pdet', [ { c: TM.brand, t: 'PDET (' + P.length + ' municipios)' }, { c: TM.deemph, t: 'No PDET (' + Q.length + ' municipios)' } ] );
			TABLAS.pdet = { head: [ 'Programa', 'PDET', 'No PDET', 'Diferencia' ], rows: items.map( ( i ) => [ i.p.n, fmt( i.a ) + ' %', fmt( i.b ) + ' %', ( i.a - i.b > 0 ? '+' : '' ) + fmt( i.a - i.b ) + ' pp' ] ) };
			const data = [];
			items.forEach( ( it, o ) => {
				data.push( { _o: o, prog: it.p.c, nombre: it.p.n, serie: 'PDET', v: it.a } );
				data.push( { _o: o, prog: it.p.c, nombre: it.p.n, serie: 'No PDET', v: it.b } );
			} );
			nuevo( 'pdet', d3plus.BarChart, Object.assign( {
				data, groupBy: 'serie', discrete: 'y', x: 'v', y: 'prog',
				ySort: ( a, b ) => b._o - a._o,
				xConfig: ejeNum( { domain: [ 0, 100 ], tickFormat: ( v ) => v + ' %' } ),
				shapeConfig: { Bar: { fill: ( d ) => d.serie === 'PDET' ? TM.brand : TM.deemph, label: false } },
			}, tooltip( ( d ) => d.nombre, ( d ) => ttRow( d.serie, fmt( d.v ) + ' % de sus municipios' ) ) ) );
		}

		// 5 · Distribución del índice de presencia
		function grafDistribucion() {
			const rows = alcance(), todos = DATA.map( ( r ) => r.ip ), lo = Math.min( ...todos ), hi = Math.max( ...todos ), items = [];
			for ( let i = lo; i <= hi; i++ ) { items.push( { lbl: String( i ), ip: i, v: rows.filter( ( r ) => r.ip === i ).length } ); }
			$( 's-dist' ).textContent = 'Municipios según número de programas con presencia' + ( selSub ? ' · Subregión ' + selSub : '' ) + ( selMun ? ' · resaltado: ' + selMun.nom : '' );
			TABLAS.dist = { head: [ 'Programas con presencia', 'Municipios' ], rows: items.map( ( i ) => [ i.lbl, i.v ] ) };
			nuevo( 'dist', d3plus.BarChart, Object.assign( {
				data: items, groupBy: 'lbl', discrete: 'x', x: 'lbl', y: 'v',
				xSort: ( a, b ) => a.ip - b.ip,
				xConfig: { title: 'Programas con presencia (de 12)' },
				yConfig: ejeNum( { tickFormat: ( v ) => Number.isInteger( v ) ? fmt( v ) : '' } ),
				shapeConfig: { Bar: { fill: enfasis( ( x ) => selMun && x.ip === selMun.ip, !! selMun ), label: ( x ) => x.v ? String( x.v ) : '' } },
			}, tooltip( ( x ) => x.lbl + ' programas', ( x ) => ttRow( 'Municipios', x.v ) ) ) );
		}

		// 6 · Centros Digitales por instalar
		function grafCD() {
			const rows = alcance();
			const pend = rows.filter( ( r ) => r.cd_instalacion > 0 ).sort( ( a, b ) => b.cd_instalacion - a.cd_instalacion || a.nom.localeCompare( b.nom, 'es' ) ), top = pend.slice( 0, 10 );
			const cd = sum( rows.map( ( r ) => r.centros_digitales ) ), op = sum( rows.map( ( r ) => r.cd_operacion ) ), inst = sum( rows.map( ( r ) => r.cd_instalacion ) );
			$( 's-cd' ).textContent = inst ? fmt( inst ) + ' por instalar en ' + pend.length + ' municipios · ' + fmt( cd ? op / cd * 100 : 0, 1 ) + ' % en operación' + ( pend.length > 10 ? ' · se muestran los 10 mayores' : '' )
				: 'Todos los centros de este alcance están en operación';
			TABLAS.cd = { head: [ 'Municipio', 'Por instalar', 'En operación', 'Total' ], rows: pend.map( ( r ) => [ r.nom, r.cd_instalacion, r.cd_operacion, r.centros_digitales ] ) };
			if ( ! top.length ) { const el = $( 'c-cd' ); delete pendientes.cd; delete redibujar.cd; if ( el ) { el.innerHTML = '<div class="empty">Sin centros pendientes</div>'; } return; }
			const enTop = !! ( selMun && top.some( ( r ) => r.id === selMun.id ) );
			barrasH( 'cd', top.map( ( r ) => ( { lbl: r.nom, id: r.id, v: r.cd_instalacion, op: r.cd_operacion } ) ), {
				fill: enfasis( ( x ) => selMun && x.id === selMun.id, enTop ),
				x: { tickFormat: ( v ) => Number.isInteger( v ) ? fmt( v ) : '' },
				click: ( x ) => seleccionar( x.id ),
				ttBody: ( x ) => ttRow( 'Por instalar', x.v ) + ttRow( 'En operación', x.op ),
			} );
		}

		// 7 · Inversión por programa
		function grafInversion() {
			const items = [ ...INVERSION ].sort( ( a, b ) => b.v - a.v ), tot = sum( items.map( ( i ) => i.v ) );
			$( 's-inv' ).textContent = 'Millones de pesos · total $' + fmt( tot ) + ' M';
			TABLAS.inv = { head: [ 'Programa', 'Millones COP', '% del total' ], rows: items.map( ( i ) => [ i.n, '$' + fmt( i.v ), fmt( i.v / tot * 100, 1 ) + ' %' ] ) };
			barrasH( 'inv', items.map( ( i ) => ( { lbl: i.n, v: i.v } ) ), {
				x: { tickFormat: ( v ) => '$' + fmt( v / 1000 ) + ' mil M' },
				ttBody: ( x ) => ttRow( 'Millones COP', '$' + fmt( x.v ) ) + ttRow( 'Del total', fmt( x.v / tot * 100, 1 ) + ' %' ),
			} );
		}

		// 8 · Perfil del municipio seleccionado
		function grafPerfil() {
			if ( ! selMun ) { delete charts.perfil; delete pendientes.perfil; delete redibujar.perfil; return; }
			const r = selMun;
			barrasH( 'perfil', PROGRAMAS.map( ( p ) => ( { lbl: p.c, k: p.k, n: p.n, v: r.p[ p.k ] } ) ), {
				x: { domain: [ 0, 100 ] },
				ttTitle: ( x ) => x.n,
				ttBody: ( x ) => ttRow( 'Valor', fmt( r[ x.k ] ) ) + ttRow( 'Percentil', fmt( x.v ) ) + ttRow( 'Puesto', r[ x.k ] > 0 ? rankOf( r, x.k ) + ' de ' + DATA.length : 'Sin presencia' ),
			} );
		}

		/* ══════════ Ranking ══════════ */
		function pintarRanking() {
			const k = metrica(), M = METRICA[ k ], q = norm( $( 'q' ).value ), nz = $( 'onlyNZ' ).checked;
			const list = alcance().filter( ( r ) => r.id.includes( q ) ).filter( ( r ) => ! nz || r[ k ] > 0 ).sort( ( a, b ) => b[ k ] - a[ k ] || a.nom.localeCompare( b.nom, 'es' ) );
			const max = Math.max( ...list.map( ( r ) => r[ k ] ), 1 );
			$( 'rankInfo' ).textContent = list.length + ' municipios · ' + M.c + ( selSub ? ' · Subregión ' + selSub : '' );
			$( 'rankingList' ).innerHTML = list.length ? list.map( ( r ) =>
				'<button type="button" class="rank-row' + ( selMun && r.id === selMun.id ? ' sel' : '' ) + '" data-id="' + esc( r.id ) + '">' +
				'<span class="rp">' + rankOf( r, k ) + '</span><span class="rn">' + esc( r.nom ) + ( r.pdet ? '<span class="chip">PDET</span>' : '' ) + '</span>' +
				'<span class="rv">' + fmt( r[ k ], M.dec ) + '</span><span class="rb"><i style="width:' + ( r[ k ] > 0 ? Math.max( r[ k ] / max * 100, 2 ) : 0 ) + '%"></i></span></button>' ).join( '' )
				: '<div class="empty">Ningún municipio coincide con la búsqueda.</div>';
		}

		/* ══════════ Ficha municipal ══════════ */
		function pintarMunicipio() {
			const r = selMun;
			$( 'munVacio' ).hidden = !! r; $( 'munFicha' ).hidden = ! r;
			if ( ! r ) { grafPerfil(); return; }
			const k = metrica(), M = METRICA[ k ], enSub = DATA.filter( ( x ) => x.sub === r.sub );
			const fuertes = PROGRAMAS.filter( ( p ) => r[ p.k ] > 0 && r.p[ p.k ] >= 80 ).sort( ( a, b ) => r.p[ b.k ] - r.p[ a.k ] ).slice( 0, 3 ).map( ( p ) => p.n );
			const ausentes = PROGRAMAS.filter( ( p ) => ! ( r[ p.k ] > 0 ) ).map( ( p ) => p.n );
			const li = [
				[ '<b>' + esc( M.c ) + '</b>', fmt( r[ k ], M.dec ) + ' · puesto ' + rankOf( r, k ) + ' de ' + DATA.length + ' en el departamento.' ],
				[ '<b>Tipología: ' + esc( TIPOS[ r.tipo ].n ) + '</b>', 'Conectividad ' + fmt( r.ic, 1 ) + ' (mediana ' + fmt( MED_C, 1 ) + ') y educación digital ' + fmt( r.ie, 1 ) + ' (mediana ' + fmt( MED_E, 1 ) + ').' ],
				fuertes.length ? [ '<b>Destaca en</b>', esc( fuertes.join( ', ' ) ) + '.' ] : null,
				ausentes.length ? [ '<b>Sin presencia en</b>', esc( ausentes.join( ', ' ) ) + '.' ] : [ '<b>Presencia completa</b>', 'Tiene los ' + PROGRAMAS.length + ' programas.' ],
				[ '<b>En su subregión (' + esc( r.sub ) + ')</b>', 'Índice de presencia ' + r.ip + ' frente a un promedio de ' + fmt( prom( enSub, 'ip' ), 1 ) + ' en ' + enSub.length + ' municipios.' ],
			].filter( Boolean );
			$( 'lecturaMun' ).innerHTML = li.map( ( x ) => '<li><div>' + x[ 0 ] + x[ 1 ] + '</div></li>' ).join( '' );
			const fila = ( p ) => '<tr><td>' + esc( p.n ) + '</td><td>' + fmt( r[ p.k ] ) + '</td><td>' + ( r[ p.k ] > 0 ? rankOf( r, p.k ) + 'º' : '—' ) + '</td></tr>';
			$( 'tablaMun' ).innerHTML = '<table class="tv"><thead><tr><th>Conectividad</th><th>Valor</th><th>Puesto</th></tr></thead><tbody>' + P_CON.map( fila ).join( '' ) +
				'<tr><td>Centros en operación / por instalar</td><td>' + r.cd_operacion + ' / ' + r.cd_instalacion + '</td><td></td></tr>' +
				'<tr><td>Centro Potencia</td><td>' + ( r.centro_potencia > 0 ? 'Sí' : 'No' ) + '</td><td></td></tr></tbody>' +
				'<thead><tr><th>Educación digital</th><th>Valor</th><th>Puesto</th></tr></thead><tbody>' + P_EDU.map( fila ).join( '' ) + '</tbody>' +
				'<thead><tr><th>Inversión</th><th>Millones COP</th><th></th></tr></thead><tbody><tr><td>Centros Digitales</td><td>$' + fmt( r.inv_cd ) + '</td><td></td></tr></tbody></table>';
			grafPerfil();
		}

		/* ══════════ CSV ══════════ */
		function exportarCsv() {
			const campos = [ 'municipio', 'subregion', 'pdet', 'tipologia', 'indice_presencia', 'subindice_conectividad', 'subindice_educacion_digital',
				'conectividad_hogares', 'zonas_paz', 'desplige_5g', 'escuelas_5g', 'juntas_preregistradas', 'juntas_diseno', 'centros_digitales', 'cd_operacion', 'cd_instalacion',
				'centro_potencia', 'talento_tech', 'senatic', 'colombia_programa', 'avanzatech', 'computadores', 'inv_cd' ];
			const extra = ( r ) => ( { subregion: r.sub, tipologia: TIPOS[ r.tipo ].n, indice_presencia: r.ip, subindice_conectividad: r.ic, subindice_educacion_digital: r.ie } );
			const filas = [ ...DATA ].sort( ( a, b ) => a.nom.localeCompare( b.nom, 'es' ) ).map( ( r ) => { const x = extra( r ); return campos.map( ( c ) => JSON.stringify( c in x ? x[ c ] : ( r[ c ] ?? 0 ) ) ).join( ',' ); } );
			const a = document.createElement( 'a' );
			a.href = URL.createObjectURL( new Blob( [ '﻿' + [ campos.join( ',' ), ...filas ].join( '\n' ) ], { type: 'text/csv;charset=utf-8;' } ) );
			a.download = 'tic-narino-2024.csv'; document.body.appendChild( a ); a.click(); a.remove();
			setTimeout( () => URL.revokeObjectURL( a.href ), 1000 );
		}

		/* ══════════ Tema ══════════ */
		function aplicarTema( t, guardar ) {
			root.setAttribute( 'data-theme', t );
			if ( guardar ) { try { localStorage.setItem( TEMA_KEY, t ); } catch ( e ) { /* storage unavailable */ } }
			const oscuro = t === 'dark';
			$( 'icoSol' ).hidden = ! oscuro; $( 'icoLuna' ).hidden = oscuro;
			$( 'temaTxt' ).textContent = oscuro ? 'Claro' : 'Oscuro';
			$( 'btnTema' ).setAttribute( 'aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro' );
			TM = leerTema();
			pintarTodo();
		}

		/* ══════════ Render global ══════════ */
		function pintarTodo() {
			pintarCabecera(); pintarLectura(); pintarHallazgos();
			grafConcentracion(); grafTipologia(); grafSubregiones(); grafPdet(); grafDistribucion(); grafCD(); grafInversion();
			pintarRanking(); pintarMunicipio(); pintarMapa();
		}

		/* ══════════ Eventos e inicio ══════════ */
		$( 'metric' ).innerHTML = '<optgroup label="Índices">' + INDICES.map( ( m ) => '<option value="' + m.k + '">' + esc( m.n ) + '</option>' ).join( '' ) + '</optgroup>' +
			'<optgroup label="Conectividad">' + P_CON.map( ( m ) => '<option value="' + m.k + '">' + esc( m.n ) + '</option>' ).join( '' ) + '</optgroup>' +
			'<optgroup label="Educación digital">' + P_EDU.map( ( m ) => '<option value="' + m.k + '">' + esc( m.n ) + '</option>' ).join( '' ) + '</optgroup>';
		$( 'subregion' ).insertAdjacentHTML( 'beforeend', Object.keys( SUBREGIONES ).sort( ( a, b ) => a.localeCompare( b, 'es' ) ).map( ( s ) => '<option value="' + esc( s ) + '">' + esc( s ) + '</option>' ).join( '' ) );
		$( 'munList' ).innerHTML = [ ...DATA ].sort( ( a, b ) => a.nom.localeCompare( b.nom, 'es' ) ).map( ( r ) => '<option value="' + esc( r.nom ) + '">' ).join( '' );

		$( 'metric' ).addEventListener( 'change', pintarTodo );
		$( 'subregion' ).addEventListener( 'change', ( e ) => fijarSubregion( e.target.value ) );
		$( 'onlyNZ' ).addEventListener( 'change', pintarRanking );
		$( 'btnCsv' ).addEventListener( 'click', exportarCsv );
		$( 'btnLimpiar' ).addEventListener( 'click', limpiar );
		$( 'btnTema' ).addEventListener( 'click', () => aplicarTema( temaActual() === 'dark' ? 'light' : 'dark', true ) );
		$( 'q' ).addEventListener( 'input', ( e ) => {
			const r = porId[ norm( e.target.value ) ];
			if ( r ) { e.target.value = ''; seleccionar( r.id ); return; }
			if ( tabActiva !== 'ranking' ) { mostrarTab( 'ranking' ); }
			pintarRanking();
		} );
		root.querySelector( '.tabs' ).addEventListener( 'click', ( e ) => { const b = e.target.closest( '.tab' ); if ( b ) { mostrarTab( b.dataset.tab ); } } );
		root.querySelector( '.seg' ).addEventListener( 'click', ( e ) => {
			const b = e.target.closest( 'button' );
			if ( ! b ) { return; }
			mapMode = b.dataset.mode;
			root.querySelectorAll( '.seg button' ).forEach( ( x ) => x.setAttribute( 'aria-pressed', x === b ? 'true' : 'false' ) );
			pintarMapa();
		} );
		$( 'rankingList' ).addEventListener( 'click', ( e ) => { const b = e.target.closest( '.rank-row' ); if ( b ) { seleccionar( b.dataset.id ); } } );
		root.addEventListener( 'click', ( e ) => {
			const b = e.target.closest( '.tbl-btn' );
			if ( ! b ) { return; }
			const key = b.dataset.for, card = b.closest( '.card' ), on = b.getAttribute( 'aria-pressed' ) !== 'true';
			b.setAttribute( 'aria-pressed', on ? 'true' : 'false' ); b.textContent = on ? 'Gráfica' : 'Tabla';
			card.querySelector( '.chart-wrap' ).hidden = on;
			const lg = card.querySelector( '.lg' );
			if ( lg ) { lg.hidden = on; }
			card.querySelector( '.tbl-wrap' ).hidden = ! on;
			if ( on ) { pintarTabla( key ); } else { correrPendientes(); }
		} );

		// d3plus' own detectResize keeps re-rendering charts whose container
		// is hidden or was replaced (NaN sizes, null nodes), so resizing is
		// handled here: redraw once the dashboard width settles.
		let anchoPrevio = root.offsetWidth, tResize = 0;
		const alRedimensionar = () => {
			if ( root.offsetWidth === anchoPrevio ) { return; }
			anchoPrevio = root.offsetWidth;
			clearTimeout( tResize );
			tResize = setTimeout( () => { Object.keys( redibujar ).forEach( ( k ) => redibujar[ k ]() ); pintarMapa(); }, 200 );
		};
		if ( window.ResizeObserver ) { new ResizeObserver( alRedimensionar ).observe( root ); } else { window.addEventListener( 'resize', alRedimensionar ); }

		aplicarTema( temaActual(), false );
	}

	function boot() { document.querySelectorAll( '[data-tsg-dashboard]' ).forEach( initDashboard ); }
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
	window.TSGDashboard = { init: initDashboard };
}() );
