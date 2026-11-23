#!/usr/bin/env python3
"""
One-time migration of the Py Nación master database to version 2.

Merges the two MinTIC answers received in 2026 into
`data/views/proyectos-tic.json`:

  * mintic-2026-01  Rad. 262030528 (30-ene-2026), corte enero 2026
  * mintic-2026-10  Rad. 262178074 (28-oct-2026), corte septiembre 2026

Rule: for every project the most recent source that carries a
per-municipio breakdown wins. Projects the 2026 answers do not cover keep
the data of the 2024 report (Rad. 6965). Superseded figures are kept
under `historico_*` keys so nothing is lost.

The per-municipio tables below were transcribed from the PDFs. Running the
script twice is safe: it refuses to migrate a database already at v2.

Usage:
    python3 scripts/ingest-mintic-2026.py
    python3 scripts/regen-nacion.py
"""
from __future__ import annotations

import json
import pathlib
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = ROOT / 'data' / 'views' / 'proyectos-tic.json'
DB_COPY = ROOT / 'data' / 'views' / 'data.json'
ANALISIS = ROOT / 'data' / 'views' / 'nacion' / 'vista-analisis-municipios.json'
DASHBOARD = ROOT / 'data' / 'dashboards' / 'tic-narino.json'


def key(name: str) -> str:
    s = unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().upper()
    return ' '.join(s.replace('.', ' ').split())


ALIAS = {
    'TABLON GOMEZ': 'EL TABLON DE GOMEZ',
    'TUMACO': 'SAN ANDRES DE TUMACO',
    'MAGUI': 'MAGUI',
}

# ----------------------------------------------------------------------
# Transcribed tables
# ----------------------------------------------------------------------

# mintic-2026-01 · Centros Digitales asignados y en operación (total 923).
# The PDF lists OSPINA, ROBERTO PAYÁN and SAN ANDRÉS DE TUMACO twice; the
# rows are added up here.
CD_ENE_2026 = [
    ('ALBAN', 15), ('ALDANA', 7), ('ANCUYA', 10), ('ARBOLEDA', 8), ('BARBACOAS', 30), ('BELEN', 3),
    ('BUESACO', 37), ('CHACHAGUI', 9), ('COLON', 7), ('CONSACA', 7), ('CONTADERO', 9), ('CORDOBA', 17),
    ('CUASPUD CARLOSAMA', 7), ('CUMBAL', 21), ('CUMBITARA', 18), ('EL CHARCO', 2), ('EL PENOL', 5),
    ('EL ROSARIO', 12), ('EL TABLON DE GOMEZ', 9), ('EL TAMBO', 11), ('FRANCISCO PIZARRO', 4), ('FUNES', 7),
    ('GUACHUCAL', 17), ('GUAITARILLA', 7), ('GUALMATAN', 3), ('ILES', 6), ('IMUES', 9), ('IPIALES', 22),
    ('LA CRUZ', 7), ('LA FLORIDA', 8), ('LA LLANADA', 4), ('LA TOLA', 7), ('LA UNION', 14), ('LEIVA', 10),
    ('LINARES', 10), ('LOS ANDES', 23), ('MAGUI', 2), ('MALLAMA', 13), ('MOSQUERA', 7), ('NARINO', 1),
    ('OLAYA HERRERA', 5), ('OSPINA', 10), ('OSPINA', 1), ('PASTO', 66), ('POLICARPA', 37), ('POTOSI', 15),
    ('PROVIDENCIA', 9), ('PUERRES', 10), ('PUPIALES', 19), ('RICAURTE', 16), ('ROBERTO PAYAN', 3),
    ('ROBERTO PAYAN', 1), ('SAMANIEGO', 27), ('SAN ANDRES DE TUMACO', 124), ('SAN ANDRES DE TUMACO', 1),
    ('SAN BERNARDO', 13), ('SAN LORENZO', 28), ('SAN PABLO', 14), ('SAN PEDRO DE CARTAGO', 7),
    ('SANDONA', 13), ('SANTA BARBARA', 4), ('SANTACRUZ', 6), ('SAPUYES', 5), ('TAMINANGO', 16),
    ('TANGUA', 12), ('TUQUERRES', 24), ('YACUANQUER', 12),
]

# mintic-2026-01 · ZCP en operación (211 en los 16 municipios PDET).
ZCP_ENE_2026 = [
    ('BARBACOAS', 17), ('CUMBITARA', 16), ('EL CHARCO', 18), ('EL ROSARIO', 9), ('FRANCISCO PIZARRO', 7),
    ('LA TOLA', 7), ('LEIVA', 12), ('LOS ANDES', 1), ('MAGUI', 16), ('MOSQUERA', 14), ('OLAYA HERRERA', 18),
    ('POLICARPA', 7), ('RICAURTE', 14), ('ROBERTO PAYAN', 21), ('SAN ANDRES DE TUMACO', 15), ('SANTA BARBARA', 19),
]

# mintic-2026-01 · Escuelas PotencIA Subasta 5G (asignatario, municipio,
# instalación, operación, planeación) — total 2 / 10 / 28 = 40.
E5G_ENE_2026 = [
    ('COMCEL S.A.', 'ALDANA', 0, 2, 0), ('COMCEL S.A.', 'ARBOLEDA', 0, 4, 0), ('COMCEL S.A.', 'CONSACA', 0, 3, 0),
    ('COMCEL S.A.', 'CUASPUD CARLOSAMA', 0, 1, 0), ('TELECALL', 'EL ROSARIO', 0, 0, 1),
    ('TIGO-MOVISTAR', 'CORDOBA', 1, 0, 0), ('TIGO-MOVISTAR', 'CUMBITARA', 0, 0, 0),
    ('TIGO-MOVISTAR', 'MOSQUERA', 0, 0, 0), ('TIGO-MOVISTAR', 'PASTO', 0, 0, 0),
    ('TIGO-MOVISTAR', 'SAN ANDRES DE TUMACO', 1, 0, 0), ('WOM', 'ARBOLEDA', 0, 0, 4), ('WOM', 'BUESACO', 0, 0, 9),
    ('WOM', 'CONSACA', 0, 0, 1), ('WOM', 'EL CHARCO', 0, 0, 1), ('WOM', 'MAGUI', 0, 0, 1),
    ('WOM', 'SAN ANDRES DE TUMACO', 0, 0, 11),
]

# mintic-2026-10 · ConectiVIDAd Acuerdo Específico No. 2
# (municipio, meta, instalados, operativos).
AE2_OCT_2026 = [
    ('ALBAN', 305, 305, 305), ('BUESACO', 674, 674, 674), ('EL TABLON DE GOMEZ', 62, 62, 62),
    ('EL TAMBO', 138, 138, 138), ('IPIALES', 128, 128, 128), ('LA FLORIDA', 175, 175, 175),
    ('LA UNION', 1400, 1400, 1400), ('NARINO', 194, 194, 194), ('PUPIALES', 580, 580, 580),
    ('SAN BERNARDO', 231, 231, 231), ('SAN PABLO', 230, 230, 230),
]
# mintic-2026-10 · Acuerdo Específico No. 4 (Tumaco).
AE4_OCT_2026 = [('SAN ANDRES DE TUMACO', 7450, 1657, 1657, 'MEGANET FIBRA SAS - PLUSNET TELECOMUNICACIONES - TECNISOLUCIONES DENAR')]
# mintic-2026-01 · AE2 accesos contratados / instalados (corte enero 2025).
AE2_ENE_2026 = [
    ('LA FLORIDA', 'ERC EXPLORER', 175, 175), ('NARINO', 'ERC EXPLORER', 194, 194),
    ('LA UNION', 'SAN MIGUEL TELECOMUNICACIONES', 1000, 1000), ('LA UNION', 'SAN MIGUEL', 400, 400),
    ('BUESACO', 'CONETXIA', 674, 674), ('EL TABLON DE GOMEZ', 'CONETXIA', 62, 62), ('ALBAN', 'CONETXIA', 285, 245),
    ('SAN BERNARDO', 'CONETXIA', 251, 191), ('SAN PABLO', 'SUNNOVA S.A.S', 190, 190), ('EL TAMBO', 'ERC EXPLORER', 138, 52),
    ('PUPIALES', 'DIROTRONIX SAS', 810, 0), ('IPIALES', 'UNIMOS S.A. E.S.P.', 5000, 0),
]
# mintic-2026-10 · table published under the ZCP heading. Its municipios are
# exactly the AE2 ones (none is PDET), so it is stored as-is, flagged, and
# not used in any indicator.
TABLA_OCT_2026_ZCP_ROTULADA = [
    ('ALBAN', 2, 2, 485230283.58), ('BUESACO', 2, 2, 1072279380.77), ('EL TABLON DE GOMEZ', 2, 2, 98636975.68),
    ('EL TAMBO', 2, 2, 219546816.83), ('IPIALES', 2, 2, 9672398170.37), ('LA FLORIDA', 2, 2, 278410818.45),
    ('LA UNION', 2, 2, 2227286547.60), ('NARINO', 2, 2, 308638278.74), ('PUPIALES', 2, 2, 1566928503.60),
    ('SAN BERNARDO', 2, 2, 367502280.35), ('SAN PABLO', 2, 2, 365911361.39),
]

# mintic-2026-10 · Juntas de Internet, Acuerdo Específico No. 5
# (municipio, junta, hogares previstos, PBS).
JUNTAS_OCT_2026 = [
    ('PASTO', 'SAN JUAN', 85, 'INRED'), ('PASTO', 'EL MOTILÓN', 61, 'INRED'),
    ('BARBACOAS', 'RENACER TELEMBÍ', 126, 'TSG'), ('EL CHARCO', 'PLAYA BASÁN', 153, 'TSG'),
    ('EL CHARCO', 'SAN PEDRO BOLÍVAR', 90, 'TSG'), ('EL TAMBO', 'ASOMUJERES', 96, 'INRED'),
    ('EL TAMBO', 'CHUZA', 65, 'INRED'), ('EL TAMBO', 'RICAURTE', 100, 'INRED'), ('EL TAMBO', 'SAN PEDRO', 153, 'INRED'),
    ('EL TAMBO', 'EL PLACER', 51, 'INRED'), ('LA UNION', 'CUCHILLAS PEÑAS BLANCAS', 150, 'INRED'),
    ('LEIVA', 'ASLICASA', 56, 'INRED'), ('LEIVA', 'LIMONAR', 48, 'INRED'), ('MALLAMA', 'LA OSCURANA', 56, 'INRED'),
    ('PROVIDENCIA', 'SANTA LUCÍA', 100, 'INRED'), ('PUPIALES', 'CASA FRÍA', 71, 'INRED'),
    ('SAMANIEGO', 'NORTE DE SAMANIEGO', 70, 'INRED'),
    ('SANTA BARBARA', 'SOLEDAD PUEBLITO ASOCIACIÓN ASOPROCAPI', 45, 'TSG'),
    ('SANTACRUZ', 'SANTA ROSA', 43, 'INRED'), ('TAMINANGO', 'LOMA LARGA', 40, 'INRED'),
    ('SAN ANDRES DE TUMACO', 'PINDALES', 100, 'INRED'), ('SAN ANDRES DE TUMACO', 'SENDEROS DE LA CEIBA 1', 100, 'INRED'),
    ('YACUANQUER', 'INANTAS BAJO', 76, 'INRED'),
]
# mintic-2026-01 · estado de las juntas por municipio
# (planeación del nodo, instalación, nodo habilitado pendiente aprobación, sin instalar).
JUNTAS_ESTADO_ENE_2026 = {
    'BARBACOAS': (1, 0, 0, 0), 'EL CHARCO': (2, 0, 0, 0), 'EL TAMBO': (0, 1, 4, 0), 'LA UNION': (0, 0, 0, 1),
    'LEIVA': (0, 1, 1, 0), 'MALLAMA': (0, 1, 0, 0), 'PASTO': (0, 0, 1, 1), 'PROVIDENCIA': (0, 0, 0, 1),
    'PUPIALES': (0, 0, 0, 1), 'SAMANIEGO': (0, 1, 0, 0), 'SANTA BARBARA': (1, 0, 0, 0), 'SANTACRUZ': (0, 0, 0, 1),
    'TAMINANGO': (0, 0, 0, 1), 'SAN ANDRES DE TUMACO': (0, 0, 2, 0), 'YACUANQUER': (0, 0, 0, 1),
}

FUENTES = {
    'informe-2024': {
        'documento': 'Informe Gestión TIC en las Regiones - Nariño 2024',
        'entidad': 'MinTIC', 'radicado': '6965', 'fecha': '2024-12-09', 'corte': '2024-12',
    },
    'mintic-2026-01': {
        'documento': 'Respuesta MinTIC a derecho de petición (Rad. 261002674)',
        'entidad': 'MinTIC - Dirección de Infraestructura', 'radicado': '262030528',
        'fecha': '2026-01-30', 'corte': '2026-01',
    },
    'mintic-2026-10': {
        'documento': 'Respuesta MinTIC a comunicado (Rad. 261111891)',
        'entidad': 'MinTIC - Dirección de Infraestructura', 'radicado': '262178074',
        'fecha': '2026-10-28', 'corte': '2026-09',
    },
}

OBSERVACIONES = [
    'Centros Digitales: el oficio de octubre de 2026 reporta 925 centros pero publica la tabla sin filas; se usa el detalle por municipio de enero de 2026 (923, todos en operación). La diferencia de 2 centros no se puede asignar a ningún municipio.',
    'Centros Digitales: el oficio de enero de 2026 habla de "67 municipios" porque repite Ospina, Roberto Payán y San Andrés de Tumaco; aquí se suman sus filas (64 municipios).',
    'ZCP: el oficio de octubre de 2026 anuncia 225 ZCP, pero la tabla que publica lista 11 municipios no PDET con 2 unidades cada uno (los mismos del Acuerdo Específico No. 2 de ConectiVIDAd). Se mantiene el detalle de enero de 2026 (211 ZCP en 16 municipios PDET, todas en operación) y la tabla de octubre se guarda aparte, sin usarla en indicadores.',
    'ConectiVIDAd AE2: el oficio de octubre de 2026 anuncia una meta de 9.219 accesos, pero su tabla suma 4.117. En enero de 2026 se reportaban 9.179 accesos contratados, incluidos 5.000 en Ipiales y 810 en Pupiales, que en octubre aparecen con 128 y 580.',
    'Escuelas PotencIA 5G: el oficio habla de 16 municipios, pero la tabla trae 13 municipios distintos (16 filas por asignatario).',
    'Juntas de Internet: el PBS de Santacruz y Santa Bárbara difiere entre los dos oficios; se usa el de octubre de 2026.',
    'Computadores para Educar: se usa la tabla municipal del proyecto, que suma 5.998 equipos como el resumen oficial; la versión anterior del análisis atribuía además 20 equipos a San Lorenzo y 1 a San Pablo (6.019).',
    'Índice de presencia: Juntas de Internet (prerregistro y diseño, 2024) se reemplaza por las 23 juntas del Acuerdo Específico No. 5 y se suma Centros PotencIA, de modo que el índice sigue midiendo 12 programas. Como las juntas de 2024 cubrían casi todos los municipios y las de 2026 solo 15, el índice promedio baja aunque la oferta no haya disminuido.',
    'Talento Tech, SENATIC, Colombia Programa, AvanzaTEC, Computadores para Educar, Despliegue 5G y convenios no aparecen en los oficios de 2026: conservan los datos del informe de 2024.',
]


def main() -> None:
    db = json.loads(DB.read_text())
    if db.get('metadata', {}).get('version') == 2:
        sys.exit('proyectos-tic.json ya está en la versión 2; no se migra de nuevo.')
    analisis = json.loads(ANALISIS.read_text())
    dash = json.loads(DASHBOARD.read_text())
    old = db['proyectos']

    # Canonical names (with accents) of the 64 municipios.
    canon = {key(m['municipio']): m['municipio'] for m in analisis['municipios']}
    pdet = {m['municipio']: bool(m['pdet']) for m in analisis['municipios']}
    sub_of = {}
    for sub, lst in dash['subregiones'].items():
        for name in lst:
            sub_of[key(name)] = sub

    def C(name: str) -> str:
        k = key(name)
        k = ALIAS.get(k, k)
        if k not in canon:
            raise SystemExit(f'Municipio desconocido: {name!r}')
        return canon[k]

    A = {m['municipio']: m for m in analisis['municipios']}

    # --- municipios de referencia -------------------------------------
    ref = [{'municipio': n, 'pdet': pdet[n], 'subregion': sub_of[key(n)]} for n in canon.values()]

    # --- Centros Digitales --------------------------------------------
    cd = {}
    for n, v in CD_ENE_2026:
        cd[C(n)] = cd.get(C(n), 0) + v
    assert sum(cd.values()) == 923, sum(cd.values())
    old_cd = {m['municipio']: m for m in old['centros_digitales']['municipios']}
    centros_digitales = {
        'nombre': 'Centros Digitales', 'programa': 'Conectividad', 'vigencias': '2022-2029',
        'descripcion': old['centros_digitales']['descripcion'],
        'fuente': 'mintic-2026-01', 'fuente_total': 'mintic-2026-10',
        'operador': 'UNIÓN TEMPORAL ETB NET COLOMBIA CONECTADA (Región B, Contrato de Aporte No. 749 de 2022)',
        'resumen': {
            'cd_asignados': sum(cd.values()), 'cd_en_operacion': sum(cd.values()), 'cd_en_instalacion': 0,
            'cd_reportados_oct_2026': 925, 'municipios_cobertura': sum(1 for v in cd.values() if v),
            'inversion_narino_millones_cop': old['centros_digitales']['resumen']['inversion_narino_millones_cop'],
            'nota_inversion': 'Inversión estimada del informe 2024; los oficios de 2026 no la detallan.',
        },
        'municipios': [{
            'municipio': n, 'asignados': cd.get(n, 0), 'en_operacion': cd.get(n, 0), 'en_instalacion': 0,
            'inversion_millones_cop': old_cd.get(n, {}).get('inversion_millones_cop', 0),
        } for n in canon.values()],
        'historico_2024': {'fuente': 'informe-2024', 'resumen': old['centros_digitales']['resumen'],
                           'municipios': old['centros_digitales']['municipios']},
    }

    # --- ZCP ------------------------------------------------------------
    old_zcp = {m['municipio']: m for m in old['zonas_comunitarias_paz']['municipios']}
    zcp_rows = [{'municipio': C(n), 'zcp_asignada': v, 'operacion': v,
                 'inversion_millones_cop': old_zcp.get(C(n), {}).get('inversion_millones_cop', 0)} for n, v in ZCP_ENE_2026]
    assert sum(r['operacion'] for r in zcp_rows) == 211
    zcp = dict(old['zonas_comunitarias_paz'])
    zcp.update({
        'fuente': 'mintic-2026-01', 'operador': 'RED DE INGENIERÍA SAS (Región Sur A)',
        'resumen': dict(old['zonas_comunitarias_paz']['resumen'], zcp_reportadas_oct_2026=225),
        'municipios': zcp_rows,
    })

    # --- Escuelas PotencIA 5G ------------------------------------------
    e5 = {}
    for asig, n, ins, op, pl in E5G_ENE_2026:
        r = e5.setdefault(C(n), {'municipio': C(n), 'total': 0, 'operacion': 0, 'instalacion': 0, 'planeacion': 0, 'asignatarios': []})
        r['operacion'] += op; r['instalacion'] += ins; r['planeacion'] += pl; r['total'] += op + ins + pl
        r['asignatarios'].append(asig)
    for r in e5.values():
        r['asignatarios'] = ', '.join(dict.fromkeys(r['asignatarios']))
    assert sum(r['total'] for r in e5.values()) == 40
    escuelas = {
        'nombre': 'Escuelas PotencIA Subasta 5G', 'programa': 'Conectividad', 'vigencias': '2024-2042',
        'descripcion': 'Conexión por 18 años de sedes educativas rurales como obligación de hacer de la subasta 5G (operadores COMCEL, TIGO-MOVISTAR, WOM y TELECALL).',
        'fuente': 'mintic-2026-01',
        'resumen': {
            'sedes_previstas': 40, 'en_operacion': 10, 'en_instalacion': 2, 'en_planeacion': 28,
            'municipios_con_sedes': sum(1 for r in e5.values() if r['total']),
            'nota': 'TELECALL tiene proceso administrativo por presunto incumplimiento; WOM inicia obligaciones el 1 de enero de 2028.',
        },
        'detalle': [{'asignatario': a, 'municipio': C(n), 'instalacion': i, 'operacion': o, 'planeacion': p} for a, n, i, o, p in E5G_ENE_2026],
        'municipios': sorted(e5.values(), key=lambda r: r['municipio']),
        'historico_2024': {'fuente': 'informe-2024', 'resumen': old['escuelas_potencia_5g']['resumen'],
                           'municipios': old['escuelas_potencia_5g']['municipios']},
    }

    # --- Despliegue 5G (sin actualización) ------------------------------
    despliegue = dict(old['despliegue_5g'])
    despliegue.update({
        'fuente': 'informe-2024',
        'municipios': [{'municipio': n, 'antenas': A[n]['conectividad']['despliegue_5g']} for n in canon.values() if A[n]['conectividad']['despliegue_5g']],
    })

    # --- ConectiVIDAd (reemplaza "conectividad_hogares") ---------------
    hog = {}
    for n, meta, ins, op in AE2_OCT_2026:
        hog[C(n)] = {'municipio': C(n), 'acuerdo': 'AE2', 'meta_accesos': meta, 'accesos_instalados': ins, 'accesos_operativos': op, 'isp': ''}
    for n, meta, ins, op, isp in AE4_OCT_2026:
        hog[C(n)] = {'municipio': C(n), 'acuerdo': 'AE4', 'meta_accesos': meta, 'accesos_instalados': ins, 'accesos_operativos': op, 'isp': isp}
    isp_ene = {}
    for n, isp, _c, _i in AE2_ENE_2026:
        isp_ene.setdefault(C(n), []).append(isp)
    for n, r in hog.items():
        if not r['isp']:
            r['isp'] = ', '.join(dict.fromkeys(isp_ene.get(n, [])))
    conectividad = {
        'nombre': 'ConectiVIDAd para Cambiar Vidas', 'programa': 'Conectividad', 'vigencias': '2023-2026',
        'descripcion': 'Internet fijo para hogares de estratos 1 y 2 con Internexa S.A. (Convenio Interadministrativo Marco No. 790 de 2023), mediante ISP locales conectados a la red troncal fortalecida.',
        'fuente': 'mintic-2026-10',
        'resumen': {
            'meta_accesos': sum(r['meta_accesos'] for r in hog.values()),
            'accesos_instalados': sum(r['accesos_instalados'] for r in hog.values()),
            'accesos_operativos': sum(r['accesos_operativos'] for r in hog.values()),
            'municipios': len(hog),
            'meta_ae2_reportada_oct_2026': 9219,
            'inversion_nacional_ae2_millones_cop': 270588,
        },
        'municipios': sorted(hog.values(), key=lambda r: r['municipio']),
        'tabla_oct_2026_rotulada_zcp': {
            'nota': 'Publicada bajo el título ZCP en el oficio de octubre de 2026; sus municipios coinciden con los del AE2. No se usa en indicadores.',
            'filas': [{'municipio': C(n), 'cantidad_asignada': a, 'en_operacion': o, 'inversion_estimada_cop': inv} for n, a, o, inv in TABLA_OCT_2026_ZCP_ROTULADA],
        },
        'historico_ene_2026': {
            'fuente': 'mintic-2026-01', 'corte': '2025-01',
            'ae2_contratados_instalados': [{'municipio': C(n), 'isp': isp, 'accesos_contratados': c, 'accesos_instalados': i} for n, isp, c, i in AE2_ENE_2026],
            'ae4_tumaco': {'accesos_contratados': 7450, 'accesos_instalados': 293},
        },
        'historico_2024': {
            'fuente': 'informe-2024', 'campo': 'conectividad_hogares',
            'municipios': [{'municipio': n, 'hogares': A[n]['conectividad']['hogares']} for n in canon.values() if A[n]['conectividad']['hogares']],
        },
    }

    # --- Juntas de Internet (Acuerdo Específico No. 5) -----------------
    juntas = [{'municipio': C(n), 'junta': j, 'hogares_previstos': h, 'pbs': pbs} for n, j, h, pbs in JUNTAS_OCT_2026]
    assert len(juntas) == 23 and sum(j['hogares_previstos'] for j in juntas) == 1935
    jm = {}
    for j in juntas:
        r = jm.setdefault(j['municipio'], {'municipio': j['municipio'], 'juntas': 0, 'hogares_previstos': 0, 'pbs': []})
        r['juntas'] += 1; r['hogares_previstos'] += j['hogares_previstos']; r['pbs'].append(j['pbs'])
    for n, (pl, ins, nodo, sin) in JUNTAS_ESTADO_ENE_2026.items():
        r = jm[C(n)]
        r.update({'nodo_en_planeacion': pl, 'en_instalacion': ins, 'nodo_habilitado': nodo, 'sin_instalar': sin})
    for r in jm.values():
        r['pbs'] = ', '.join(dict.fromkeys(r['pbs']))
    juntas_proj = {
        'nombre': 'Juntas de Internet - Comunidades de Conectividad', 'programa': 'Conectividad', 'vigencias': '2024-2026',
        'descripcion': 'Redes comunitarias de Internet fijo construidas, operadas y sostenidas por las propias comunidades rurales (Acuerdo Específico No. 5, ConectiVIDAd).',
        'fuente': 'mintic-2026-10', 'fuente_estado': 'mintic-2026-01',
        'resumen': {
            'juntas': len(juntas), 'hogares_previstos': 1935, 'municipios': len(jm),
            'accesos_hogares_instalados_ene_2026': 584,
            'estado_ene_2026': {'nodo_en_planeacion': 4, 'en_instalacion': 4, 'nodo_habilitado': 8, 'sin_instalar': 7},
        },
        'juntas': juntas,
        'municipios': sorted(jm.values(), key=lambda r: r['municipio']),
        'historico_2024': {'fuente': 'informe-2024', 'resumen': old['juntas_de_internet']['resumen'],
                           'municipios': old['juntas_de_internet']['municipios']},
    }

    # --- Centros PotencIA ----------------------------------------------
    potencia = {
        'nombre': 'Centros PotencIA', 'programa': 'Conectividad', 'vigencias': '2024-',
        'descripcion': 'Microcentros de inteligencia artificial con acceso gratuito a Internet, capacitación y servicios TIC (Contrato Interadministrativo No. 1872 de 2024 con Findeter).',
        'fuente': 'mintic-2026-10', 'fuente_detalle': 'mintic-2026-01',
        'resumen': {'centros_previstos': 2, 'municipios': 2, 'estado': 'Pendiente (estudios y diseños)'},
        'municipios': [
            {'municipio': C('PASTO'), 'centros': 1, 'estado': 'PENDIENTE', 'viabilidad_predio': 'Técnica y jurídica viable', 'convenio': '321 de 8 de octubre de 2025'},
            {'municipio': C('SAN ANDRES DE TUMACO'), 'centros': 1, 'estado': 'PENDIENTE', 'viabilidad_predio': 'Técnica y jurídica viable', 'convenio': '0378 del 19/12/24', 'avance': 'Etapa I Estudios y Diseños (CONSORCIO TECLA 156)'},
        ],
    }

    # --- Educación digital (sin actualización: informe 2024) -----------
    def edu_list(field: str, out: str) -> list:
        return [{'municipio': n, out: A[n]['educacion_digital'][field]} for n in canon.values() if A[n]['educacion_digital'][field]]

    talento = dict(old['talento_tech'], fuente='informe-2024')
    senatic = {k: v for k, v in old['senatic'].items() if k != 'municipios_parcial'}
    senatic.update({'fuente': 'informe-2024', 'municipios': edu_list('senatic_ie', 'ie_inscritas'),
                    'detalle_parcial_2024': old['senatic']['municipios_parcial']})
    colombia = dict(old['colombia_programa'], fuente='informe-2024')
    avanzatec = dict(old['avanzatec'], fuente='informe-2024')
    cpe = dict(old['computadores_para_educar'], fuente='informe-2024')
    convenios = dict(old['convenios'], fuente='informe-2024')

    inversion = json.loads((ROOT / 'data' / 'views' / 'nacion' / 'vista-inversion-por-proyecto.json').read_text())

    new = {
        'metadata': {
            'titulo': 'Base de proyectos MinTIC en Nariño',
            'version': 2,
            'actualizado': '2026-11-23',
            'corte_mas_reciente': '2026-09',
            'departamento': 'NARIÑO',
            'total_municipios': 64,
            'pilares': db['metadata']['pilares'],
            'criterio': 'Para cada proyecto prevalece la fuente más reciente que trae detalle por municipio; los datos reemplazados se conservan en claves historico_*.',
            'fuentes': FUENTES,
            'observaciones': OBSERVACIONES,
            'metadata_2024': db['metadata'],
        },
        'municipios': ref,
        'proyectos': {
            'centros_digitales': centros_digitales,
            'conectividad_para_cambiar_vidas': conectividad,
            'zonas_comunitarias_paz': zcp,
            'despliegue_5g': despliegue,
            'escuelas_potencia_5g': escuelas,
            'juntas_de_internet': juntas_proj,
            'centros_potencia': potencia,
            'talento_tech': talento,
            'senatic': senatic,
            'colombia_programa': colombia,
            'avanzatec': avanzatec,
            'computadores_para_educar': cpe,
            'convenios': convenios,
        },
        'inversion': {
            'fuente': 'informe-2024', 'unidad': 'millones COP',
            'nota': 'Los oficios de 2026 no reportan inversión por programa para Nariño.',
            'programas': inversion['datos'],
        },
    }
    text = json.dumps(new, ensure_ascii=False, indent=2) + '\n'
    DB.write_text(text)
    DB_COPY.write_text(text)
    print(f'proyectos-tic.json migrado a v2 ({len(text):,} bytes)')


if __name__ == '__main__':
    main()
