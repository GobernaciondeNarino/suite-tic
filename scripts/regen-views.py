#!/usr/bin/env python3
"""
Regenerate every Py Nación artefact from the master database
`data/views/proyectos-tic.json`:

  1. `data/views/nacion/vista-analisis-municipios.json` — per-municipio
     analytics (12-program presence index, coverage category, normalised
     scores, gaps against the departmental mean).
  2. One view per program, the presence index, the multi-program
     comparative and the investment view (`data/views/nacion/vista-*.json`).
  3. `data/dashboards/tic-narino.json` — the dataset of the Dashboard
     module, so the dashboard and the shortcodes read the same input.

All views cover the 64 municipios of Nariño — no "Top N" filtering.

Usage:
    python3 scripts/regen-views.py
"""
from __future__ import annotations

import json
import os
import pathlib
from typing import Callable

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = ROOT / 'data' / 'views' / 'proyectos-tic.json'
VIEWS = ROOT / 'data' / 'views' / 'nacion'
DASHBOARD = ROOT / 'data' / 'dashboards' / 'tic-narino.json'

# Views retired in the v2 database (structure replaced, see docs/NOTAS-DATOS.md).
RETIRED = [ 'vista-juntas-prereg.json', 'vista-juntas-diseno.json' ]

# The 12 programs of the presence index. `g`: con = conectividad,
# edu = educación digital. `n`: long name, `c`: short label.
PROGRAMAS = [
    { 'k': 'centros_digitales',    'g': 'con', 'n': 'Centros Digitales',                'c': 'Centros Digitales' },
    { 'k': 'conectividad_hogares', 'g': 'con', 'n': 'ConectiVIDAd (hogares)',           'c': 'Hogares conectados' },
    { 'k': 'zonas_paz',            'g': 'con', 'n': 'Zonas Comunitarias para la Paz',   'c': 'Zonas de Paz' },
    { 'k': 'escuelas_5g',          'g': 'con', 'n': 'Escuelas PotencIA 5G',             'c': 'Escuelas 5G' },
    { 'k': 'despliegue_5g',        'g': 'con', 'n': 'Despliegue 5G',                    'c': 'Despliegue 5G' },
    { 'k': 'juntas_internet',      'g': 'con', 'n': 'Juntas de Internet',               'c': 'Juntas de Internet' },
    { 'k': 'centros_potencia',     'g': 'con', 'n': 'Centros PotencIA',                 'c': 'Centros PotencIA' },
    { 'k': 'talento_tech',         'g': 'edu', 'n': 'Talento Tech',                     'c': 'Talento Tech' },
    { 'k': 'senatic',              'g': 'edu', 'n': 'SENATIC (I.E.)',                   'c': 'SENATIC' },
    { 'k': 'colombia_programa',    'g': 'edu', 'n': 'Colombia Programa',                'c': 'Colombia Programa' },
    { 'k': 'avanzatec',            'g': 'edu', 'n': 'AvanzaTEC',                        'c': 'AvanzaTEC' },
    { 'k': 'computadores',         'g': 'edu', 'n': 'Computadores para Educar',         'c': 'Computadores' },
]
KEYS = [ p['k'] for p in PROGRAMAS ]


def write_json(path: pathlib.Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')


def write_view(filename: str, payload: dict) -> None:
    path = VIEWS / filename
    write_json(path, payload)
    rows = len(payload.get('municipios', payload.get('datos', [])))
    print(f'  wrote {filename:45s}  rows={rows:3d}  size={os.path.getsize(path):,}B')


def by_mun(rows: list, field: str) -> dict:
    """Sum `field` per municipio over a project's rows."""
    out: dict[str, int] = {}
    for r in rows or []:
        out[r['municipio']] = out.get(r['municipio'], 0) + int(r.get(field) or 0)
    return out


def categoria(ip: int) -> str:
    if ip >= 9:
        return 'alta'
    if ip >= 6:
        return 'media_alta'
    if ip >= 4:
        return 'media'
    return 'baja'


# ----------------------------------------------------------------------
# 1 · Analytics master
# ----------------------------------------------------------------------

def build_master(db: dict) -> dict:
    P = db['proyectos']
    cd = { r['municipio']: r for r in P['centros_digitales']['municipios'] }
    hog = { r['municipio']: r for r in P['conectividad_para_cambiar_vidas']['municipios'] }
    e5 = { r['municipio']: r for r in P['escuelas_potencia_5g']['municipios'] }
    jun = { r['municipio']: r for r in P['juntas_de_internet']['municipios'] }
    zcp = by_mun( P['zonas_comunitarias_paz']['municipios'], 'operacion' )
    ant = by_mun( P['despliegue_5g']['municipios'], 'antenas' )
    pot = by_mun( P['centros_potencia']['municipios'], 'centros' )
    tt = by_mun( P['talento_tech']['municipios'], 'inscritos' )
    sen = by_mun( P['senatic']['municipios'], 'ie_inscritas' )
    col = by_mun( P['colombia_programa']['municipios'], 'ie_seleccionadas' )
    ava = by_mun( P['avanzatec']['municipios'], 'certificados' )
    cpe = { r['municipio']: r for r in P['computadores_para_educar']['municipios'] }

    municipios = []
    for ref in db['municipios']:
        n = ref['municipio']
        c, h, e, j, k = cd.get( n, {} ), hog.get( n, {} ), e5.get( n, {} ), jun.get( n, {} ), cpe.get( n, {} )
        total_cd = int( c.get( 'asignados', 0 ) )
        oper_cd = int( c.get( 'en_operacion', 0 ) )
        valores = {
            'centros_digitales': total_cd,
            'conectividad_hogares': int( h.get( 'accesos_operativos', 0 ) ),
            'zonas_paz': zcp.get( n, 0 ),
            'escuelas_5g': int( e.get( 'total', 0 ) ),
            'despliegue_5g': ant.get( n, 0 ),
            'juntas_internet': int( j.get( 'juntas', 0 ) ),
            'centros_potencia': pot.get( n, 0 ),
            'talento_tech': tt.get( n, 0 ),
            'senatic': sen.get( n, 0 ),
            'colombia_programa': col.get( n, 0 ),
            'avanzatec': ava.get( n, 0 ),
            'computadores': int( k.get( 'computadores', 0 ) ),
        }
        ip = sum( 1 for v in valores.values() if v > 0 )
        municipios.append( {
            'municipio': n,
            'subregion': ref['subregion'],
            'pdet': ref['pdet'],
            'indice_presencia': ip,
            'max_posible': len( PROGRAMAS ),
            'categoria_cobertura': categoria( ip ),
            'inversion_estimada_millones_cop': int( c.get( 'inversion_millones_cop', 0 ) ),
            'conectividad': {
                'centros_digitales': {
                    'total': total_cd, 'operacion': oper_cd, 'instalacion': int( c.get( 'en_instalacion', 0 ) ),
                    'pct_operacion': round( oper_cd / total_cd * 100, 1 ) if total_cd else 0.0,
                },
                'hogares': valores['conectividad_hogares'],
                'hogares_meta': int( h.get( 'meta_accesos', 0 ) ),
                'hogares_instalados': int( h.get( 'accesos_instalados', 0 ) ),
                'zonas_paz': valores['zonas_paz'],
                'escuelas_5g': valores['escuelas_5g'],
                'escuelas_5g_operacion': int( e.get( 'operacion', 0 ) ),
                'escuelas_5g_instalacion': int( e.get( 'instalacion', 0 ) ),
                'escuelas_5g_planeacion': int( e.get( 'planeacion', 0 ) ),
                'despliegue_5g': valores['despliegue_5g'],
                'juntas_internet': valores['juntas_internet'],
                'juntas_hogares_previstos': int( j.get( 'hogares_previstos', 0 ) ),
                'centros_potencia': valores['centros_potencia'],
            },
            'educacion_digital': {
                'talento_tech_inscritos': valores['talento_tech'],
                'senatic_ie': valores['senatic'],
                'colombia_programa_ie': valores['colombia_programa'],
                'avanzatec_certificados': valores['avanzatec'],
                'computadores': valores['computadores'],
                'laboratorios': int( k.get( 'labs', 0 ) ),
                'sedes_beneficiadas': int( k.get( 'sedes', 0 ) ),
                'matricula_beneficiada': int( k.get( 'matricula', 0 ) ),
            },
            '_valores': valores,
        } )

    n = len( municipios )
    tot = { p: sum( m['_valores'][p] for m in municipios ) for p in KEYS }
    prom = { p: round( tot[p] / n, 2 ) for p in KEYS }
    mx = { p: max( m['_valores'][p] for m in municipios ) for p in KEYS }
    for m in municipios:
        v = m.pop( '_valores' )
        m['scores_normalizados'] = { p: round( v[p] / mx[p] * 100, 1 ) if mx[p] else 0.0 for p in KEYS }
        m['vs_promedio'] = { p: round( v[p] - prom[p], 2 ) for p in KEYS }

    meta = db['metadata']
    return {
        'generado': meta['actualizado'],
        'corte': meta['corte_mas_reciente'],
        'fuente': 'Base proyectos-tic.json v2 — MinTIC: informe 2024 (Rad. 6965), oficios Rad. 262030528 (ene-2026) y Rad. 262178074 (oct-2026)',
        'total_municipios': n,
        'programas': PROGRAMAS,
        'promedios_departamentales': prom,
        'totales_departamentales': tot,
        'maximos': mx,
        'municipios': municipios,
    }


# ----------------------------------------------------------------------
# 2 · Views
# ----------------------------------------------------------------------

def program_view( master: dict, *, slug: str, filename: str, titulo: str, descripcion: str,
                  measures: list[tuple[str, Callable[[dict], int]]], chart_hint: str = 'bar',
                  extra_totales: dict | None = None ) -> None:
    """One row per municipio; the first measure is the headline one."""
    rows = []
    for m in master['municipios']:
        row = { 'municipio': m['municipio'] }
        for field, getter in measures:
            row[field] = int( getter( m ) )
        row['pdet'] = bool( m['pdet'] )
        rows.append( row )
    head = measures[0][0]
    totales = {
        'total_departamento': sum( r[head] for r in rows ),
        'municipios_con_presencia': sum( 1 for r in rows if r[head] > 0 ),
        'municipios_sin_presencia': sum( 1 for r in rows if r[head] == 0 ),
    }
    for field, _g in measures[1:]:
        totales['total_' + field] = sum( r[field] for r in rows )
    if extra_totales:
        totales.update( extra_totales )
    write_view( filename, {
        'vista': slug, 'titulo': titulo, 'descripcion': descripcion,
        'tipo_grafico_sugerido': chart_hint, 'total_municipios': len( rows ),
        'municipios': rows, 'totales': totales,
    } )


def con( key: str ) -> Callable[[dict], int]:
    return lambda m: m['conectividad'][key]


def edu( key: str ) -> Callable[[dict], int]:
    return lambda m: m['educacion_digital'][key]


def regen_views( master: dict, db: dict ) -> None:
    P = db['proyectos']
    F = db['metadata']['fuentes']
    corte = lambda proj: F[ P[proj]['fuente'] ]['corte']  # noqa: E731

    # Índice de presencia.
    rows = [ {
        'municipio': m['municipio'], 'indice_presencia': m['indice_presencia'], 'max_posible': m['max_posible'],
        'categoria_cobertura': m['categoria_cobertura'], 'pdet': bool( m['pdet'] ),
    } for m in master['municipios'] ]
    by_cat: dict[str, int] = {}
    for r in rows:
        by_cat[ r['categoria_cobertura'] ] = by_cat.get( r['categoria_cobertura'], 0 ) + 1
    write_view( 'vista-indice-presencia.json', {
        'vista': 'indice_presencia',
        'titulo': 'Índice de Presencia TIC (0-12)',
        'descripcion': 'Número de los 12 programas MinTIC con presencia en cada uno de los 64 municipios de Nariño (corte ' + master['corte'] + '). 0 = sin presencia, 12 = presencia completa.',
        'tipo_grafico_sugerido': 'bar', 'total_municipios': len( rows ), 'municipios': rows,
        'totales': {
            'promedio': round( sum( r['indice_presencia'] for r in rows ) / len( rows ), 2 ),
            'maximo': max( r['indice_presencia'] for r in rows ),
            'minimo': min( r['indice_presencia'] for r in rows ),
            'por_categoria': by_cat,
        },
    } )

    # Centros Digitales (estado).
    cdr = []
    for m in master['municipios']:
        c = m['conectividad']['centros_digitales']
        cdr.append( {
            'municipio': m['municipio'], 'en_operacion': c['operacion'], 'en_instalacion': c['instalacion'],
            'en_planeacion': max( 0, c['total'] - c['operacion'] - c['instalacion'] ), 'total': c['total'],
            'pct_operacion': c['pct_operacion'],
        } )
    write_view( 'vista-centros-digitales-estado.json', {
        'vista': 'centros_digitales_estado',
        'titulo': 'Centros Digitales - Estado de Implementación',
        'descripcion': f'Centros Digitales asignados y en operación en los 64 municipios de Nariño (MinTIC, corte {corte("centros_digitales")}). El oficio de octubre de 2026 reporta 925 en total sin detalle municipal.',
        'tipo_grafico_sugerido': 'bar_stacked', 'total_municipios': len( cdr ), 'municipios': cdr,
        'totales': {
            'cd_asignados': sum( x['total'] for x in cdr ), 'en_operacion': sum( x['en_operacion'] for x in cdr ),
            'en_instalacion': sum( x['en_instalacion'] for x in cdr ), 'en_planeacion': sum( x['en_planeacion'] for x in cdr ),
            'cd_reportados_oct_2026': P['centros_digitales']['resumen']['cd_reportados_oct_2026'],
        },
    } )

    program_view( master, slug='conectividad_hogares', filename='vista-conectividad-hogares.json',
                  titulo='ConectiVIDAd - Hogares conectados',
                  descripcion=f'Accesos de Internet fijo operativos en hogares de estratos 1 y 2 (ConectiVIDAd para Cambiar Vidas, acuerdos específicos 2 y 4; MinTIC, corte {corte("conectividad_para_cambiar_vidas")}).',
                  measures=[ ( 'hogares', con( 'hogares' ) ), ( 'meta_accesos', con( 'hogares_meta' ) ), ( 'accesos_instalados', con( 'hogares_instalados' ) ) ] )
    program_view( master, slug='zcp_por_municipio', filename='vista-zcp-municipios.json',
                  titulo='Zonas Comunitarias para la Paz - ZCP por Municipio',
                  descripcion=f'ZCP en operación en los municipios PDET de Nariño (MinTIC, corte {corte("zonas_comunitarias_paz")}).',
                  measures=[ ( 'zcp_asignadas', con( 'zonas_paz' ) ) ] )
    program_view( master, slug='escuelas_5g', filename='vista-escuelas-5g.json',
                  titulo='Escuelas PotencIA 5G',
                  descripcion=f'Sedes educativas previstas por la subasta 5G y su estado: operación, instalación o planeación (MinTIC, corte {corte("escuelas_potencia_5g")}).',
                  measures=[ ( 'escuelas_5g', con( 'escuelas_5g' ) ), ( 'en_operacion', con( 'escuelas_5g_operacion' ) ),
                             ( 'en_instalacion', con( 'escuelas_5g_instalacion' ) ), ( 'en_planeacion', con( 'escuelas_5g_planeacion' ) ) ] )
    program_view( master, slug='despliegue_5g', filename='vista-despliegue-5g.json', titulo='Despliegue 5G',
                  descripcion='Antenas 5G proyectadas por municipio (informe MinTIC 2024; meta departamental de 78 antenas a 2030).',
                  measures=[ ( 'despliegue_5g', con( 'despliegue_5g' ) ) ] )
    program_view( master, slug='juntas_internet', filename='vista-juntas-internet.json',
                  titulo='Juntas de Internet - Comunidades de Conectividad',
                  descripcion=f'Juntas de Internet del Acuerdo Específico No. 5 y hogares rurales que prevén conectar (MinTIC, corte {corte("juntas_de_internet")}).',
                  measures=[ ( 'juntas', con( 'juntas_internet' ) ), ( 'hogares_previstos', con( 'juntas_hogares_previstos' ) ) ] )

    # Talento Tech keeps its historical shape (participation share).
    tot_tt = sum( m['educacion_digital']['talento_tech_inscritos'] for m in master['municipios'] )
    tt_rows = [ {
        'municipio': m['municipio'], 'inscritos': m['educacion_digital']['talento_tech_inscritos'],
        'participacion_pct': round( m['educacion_digital']['talento_tech_inscritos'] / tot_tt * 100, 2 ) if tot_tt else 0.0,
        'pdet': bool( m['pdet'] ),
    } for m in master['municipios'] ]
    meta_tt = P['talento_tech']['resumen']['meta_certificados_cuatrienio']
    write_view( 'vista-talento-tech-inscritos.json', {
        'vista': 'talento_tech_inscritos', 'titulo': 'Talento Tech - Inscritos por Municipio',
        'descripcion': 'Inscritos en Talento Tech (bootcamps TIC) en los 64 municipios de Nariño (informe MinTIC 2024).',
        'tipo_grafico_sugerido': 'bar', 'total_municipios': len( tt_rows ), 'municipios': tt_rows,
        'totales': { 'inscritos_narino': tot_tt, 'meta_certificados': meta_tt, 'avance_pct': round( tot_tt / meta_tt * 100, 2 ) if meta_tt else 0.0 },
    } )
    program_view( master, slug='senatic_ie', filename='vista-senatic.json', titulo='SENATIC - Instituciones Educativas',
                  descripcion='Instituciones educativas con formación SENATIC por municipio (informe MinTIC 2024).',
                  measures=[ ( 'senatic_ie', edu( 'senatic_ie' ) ) ] )
    program_view( master, slug='colombia_programa_ie', filename='vista-colombia-programa.json', titulo='Colombia Programa - Instituciones Educativas',
                  descripcion='Instituciones educativas seleccionadas en Colombia Programa (informe MinTIC 2024).',
                  measures=[ ( 'colombia_programa_ie', edu( 'colombia_programa_ie' ) ) ] )
    program_view( master, slug='avanzatec', filename='vista-avanzatec.json', titulo='AvanzaTEC - Certificados',
                  descripcion='Certificados AvanzaTEC por municipio (informe MinTIC 2024).',
                  measures=[ ( 'avanzatec_certificados', edu( 'avanzatec_certificados' ) ) ] )

    # Comparative (wide format).
    datos = []
    for m in master['municipios']:
        c, e = m['conectividad'], m['educacion_digital']
        datos.append( {
            'municipio': m['municipio'],
            'centros_digitales': c['centros_digitales']['total'],
            'conectividad_hogares': c['hogares'],
            'zonas_paz': c['zonas_paz'],
            'escuelas_5g': c['escuelas_5g'],
            'despliegue_5g': c['despliegue_5g'],
            'juntas_internet': c['juntas_internet'],
            'centros_potencia': c['centros_potencia'],
            'talento_tech': e['talento_tech_inscritos'],
            'senatic_ie': e['senatic_ie'],
            'colombia_programa_ie': e['colombia_programa_ie'],
            'avanzatec': e['avanzatec_certificados'],
            'computadores': e['computadores'],
        } )
    write_view( 'vista-comparativo-municipios.json', {
        'vista': 'comparativo_programas_municipios',
        'titulo': 'Cobertura Multiproyecto por Municipio',
        'descripcion': 'Comparativo de los 12 programas MinTIC en los 64 municipios de Nariño.',
        'tipo_grafico_sugerido': 'radar', 'total_municipios': len( datos ),
        'municipios': [ d['municipio'] for d in datos ],
        'programas': [ p['n'] for p in PROGRAMAS ],
        'datos': datos,
    } )

    # Investment by program (no 2026 update available).
    inv = db['inversion']
    colores = [ '#1a5276', '#E8A020', '#2e86c1', '#17a589', '#d35400', '#8e44ad' ]
    write_view( 'vista-inversion-por-proyecto.json', {
        'vista': 'inversion_por_proyecto',
        'titulo': 'Inversión MinTIC por Programa – Nariño 2024',
        'descripcion': 'Distribución del presupuesto asignado a Nariño por cada programa MinTIC (informe 2024; los oficios de 2026 no reportan inversión por programa).',
        'tipo_grafico_sugerido': 'doughnut', 'unidad': inv['unidad'], 'datos': inv['programas'],
        'total_inversion_millones_cop': sum( d['inversion'] for d in inv['programas'] ),
        'colores_sugeridos': { d['proyecto']: colores[ i % len( colores ) ] for i, d in enumerate( inv['programas'] ) },
    } )

    for name in RETIRED:
        path = VIEWS / name
        if path.exists():
            path.unlink()
            print( f'  removed {name} (estructura reemplazada)' )


# ----------------------------------------------------------------------
# 3 · Dashboard dataset
# ----------------------------------------------------------------------

def fmt( n: float ) -> str:
    return f'{n:,.0f}'.replace( ',', '.' )


def regen_dashboard( master: dict, db: dict ) -> None:
    P = db['proyectos']
    F = db['metadata']['fuentes']
    R = lambda k: P[k]['resumen']  # noqa: E731
    desc = {
        'centros_digitales': f'Centros de acceso comunitario a Internet en sedes educativas rurales: {fmt(R("centros_digitales")["cd_en_operacion"])} en operación (MinTIC, corte {F["mintic-2026-01"]["corte"]}).',
        'conectividad_hogares': f'Accesos de Internet fijo operativos en hogares de estratos 1 y 2 de ConectiVIDAd: {fmt(R("conectividad_para_cambiar_vidas")["accesos_operativos"])} de una meta de {fmt(R("conectividad_para_cambiar_vidas")["meta_accesos"])} (corte {F["mintic-2026-10"]["corte"]}).',
        'zonas_paz': f'Zonas WiFi comunitarias en sedes educativas de municipios PDET: {R("zonas_comunitarias_paz")["zcp_en_operacion"]} en operación.',
        'escuelas_5g': f'Sedes educativas previstas por la subasta 5G: {R("escuelas_potencia_5g")["en_operacion"]} en operación, {R("escuelas_potencia_5g")["en_instalacion"]} en instalación y {R("escuelas_potencia_5g")["en_planeacion"]} en planeación.',
        'despliegue_5g': 'Antenas 5G proyectadas a 2030 (informe 2024). Meta departamental: 78 antenas.',
        'juntas_internet': f'Juntas de Internet comunitarias del Acuerdo Específico No. 5: {R("juntas_de_internet")["juntas"]} juntas que prevén conectar {fmt(R("juntas_de_internet")["hogares_previstos"])} hogares rurales.',
        'centros_potencia': 'Microcentros de inteligencia artificial previstos (en estudios y diseños).',
        'talento_tech': f'Inscritos en bootcamps de tecnología (informe 2024). Meta: {fmt(R("talento_tech")["meta_certificados_cuatrienio"])} certificados.',
        'senatic': 'Instituciones educativas con formación SENATIC (informe 2024).',
        'colombia_programa': 'Instituciones educativas seleccionadas como nodos de pensamiento computacional, con el British Council (informe 2024).',
        'avanzatec': 'Certificados en formación TIC gratuita (informe 2024).',
        'computadores': 'Equipos del programa Computadores para Educar (informe 2024).',
    }
    programas = [ dict( p, d=desc[ p['k'] ] ) for p in PROGRAMAS ]
    n_con = sum( 1 for p in PROGRAMAS if p['g'] == 'con' )
    n_edu = len( PROGRAMAS ) - n_con
    data = []
    for m in master['municipios']:
        c, e = m['conectividad'], m['educacion_digital']
        data.append( {
            'municipio': m['municipio'],
            'centros_digitales': c['centros_digitales']['total'],
            'cd_operacion': c['centros_digitales']['operacion'],
            'cd_instalacion': c['centros_digitales']['instalacion'],
            'conectividad_hogares': c['hogares'],
            'hogares_meta': c['hogares_meta'],
            'zonas_paz': c['zonas_paz'],
            'escuelas_5g': c['escuelas_5g'],
            'escuelas_5g_operacion': c['escuelas_5g_operacion'],
            'despliegue_5g': c['despliegue_5g'],
            'juntas_internet': c['juntas_internet'],
            'juntas_hogares': c['juntas_hogares_previstos'],
            'centros_potencia': c['centros_potencia'],
            'talento_tech': e['talento_tech_inscritos'],
            'senatic': e['senatic_ie'],
            'colombia_programa': e['colombia_programa_ie'],
            'avanzatec': e['avanzatec_certificados'],
            'computadores': e['computadores'],
            'inv_cd': m['inversion_estimada_millones_cop'],
            'pdet': bool( m['pdet'] ),
        } )
    subregiones: dict[str, list] = {}
    for ref in db['municipios']:
        subregiones.setdefault( ref['subregion'], [] ).append( ref['municipio'] )
    write_json( DASHBOARD, {
        'meta': {
            'titulo': 'Dashboard TIC Nariño',
            'corte': master['corte'],
            'etiqueta': 'MinTIC · corte sep. 2026',
            'actualizado': master['generado'],
            'fuentes': F,
            'observaciones': db['metadata']['observaciones'],
        },
        'data': data,
        'subregiones': subregiones,
        'programas': programas,
        'indices': [
            { 'k': 'ip', 'idx': True, 'dec': 0, 'n': f'Índice de presencia (0–{len(PROGRAMAS)})', 'c': 'Índice de presencia',
              'd': f'Número de programas MinTIC con presencia en el municipio, de 0 a {len(PROGRAMAS)}.' },
            { 'k': 'ic', 'idx': True, 'dec': 1, 'n': 'Subíndice de conectividad (0–100)', 'c': 'Conectividad',
              'd': f'Promedio del rango percentil del municipio en los {n_con} programas de conectividad. 100 = el valor más alto del departamento en todos ellos.' },
            { 'k': 'ie', 'idx': True, 'dec': 1, 'n': 'Subíndice de educación digital (0–100)', 'c': 'Educación digital',
              'd': f'Promedio del rango percentil del municipio en los {n_edu} programas de educación digital. 100 = el valor más alto del departamento en todos ellos.' },
        ],
        'inversion': [ { 'n': d['proyecto'], 'v': d['inversion'] } for d in sorted( db['inversion']['programas'], key=lambda d: -d['inversion'] ) ],
        'tipos': {
            'A': { 'n': 'Consolidado', 'd': 'Conectividad y educación digital sobre la mediana' },
            'B': { 'n': 'Conectado, falta formación', 'd': 'Conectividad sobre la mediana; educación digital por debajo' },
            'C': { 'n': 'Formado, falta conectividad', 'd': 'Educación digital sobre la mediana; conectividad por debajo' },
            'D': { 'n': 'Baja presencia', 'd': 'Conectividad y educación digital bajo la mediana' },
        },
    } )
    print( f'  wrote {DASHBOARD.relative_to( ROOT )}  rows={len( data )}' )


def main() -> None:
    db = json.loads( DB.read_text() )
    if db.get( 'metadata', {} ).get( 'version' ) != 2:
        raise SystemExit( 'proyectos-tic.json no está en v2: ejecute antes scripts/ingest-mintic-2026.py' )
    master = build_master( db )
    write_view( 'vista-analisis-municipios.json', master )
    print( 'Regenerating views:' )
    regen_views( master, db )
    print( 'Dashboard:' )
    regen_dashboard( master, db )
    print( 'Done.' )


if __name__ == '__main__':
    main()
