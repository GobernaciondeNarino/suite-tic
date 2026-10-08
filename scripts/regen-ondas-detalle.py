#!/usr/bin/env python3
"""
Regenerate Py Ondas views from the detailed master file
`data/views/ondas/ondas-narino-detalle.json`.

Produces views covering:
  - Grupos de investigación por año (timeline)
  - Grupos por municipio (geomap/bar)
  - Grupos por línea de investigación (donut/pie)
  - Grupos por línea × año (stacked bar)
  - Instituciones por municipio (geomap/bar)
  - Presupuesto por entidad (donut/pie)
  - Presupuesto por entidad × año (stacked bar/line)

Usage:
    python3 scripts/regen-ondas-detalle.py
"""
from __future__ import annotations
import json
import os
import pathlib
import unicodedata

ROOT   = pathlib.Path(__file__).resolve().parent.parent
VIEWS  = ROOT / 'data' / 'views' / 'ondas'
MASTER = VIEWS / '_ondas-narino-detalle.json'


def load_master() -> dict:
    with MASTER.open() as f:
        return json.load(f)


def write_view(filename: str, payload: dict) -> None:
    path = VIEWS / filename
    with path.open('w') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    rows = len(payload.get('data', payload.get('municipios', [])))
    size = os.path.getsize(path)
    print(f'  wrote {filename:50s}  rows={rows:3d}  size={size:,}B')


def _i(v) -> int:
    try: return int(v or 0)
    except: return 0


def _f(v) -> float:
    try: return float(v or 0.0)
    except: return 0.0


# ----------------------------------------------------------------------
# Line of research normalization
# ----------------------------------------------------------------------

LINEA_MAP = {
    'ciencias naturales': 'Ciencias Naturales',
    'ciencias nasturales': 'Ciencias Naturales',
    'ciencias sociales': 'Ciencias Sociales y Humanas',
    'ciencias sociales y humanas': 'Ciencias Sociales y Humanas',
    'ciencias sociales y humanidades': 'Ciencias Sociales y Humanas',
    'ciencias humanas y sociales': 'Ciencias Sociales y Humanas',
    'ciencias agricolas': 'Ciencias Agrícolas',
    'ciencias agricola': 'Ciencias Agrícolas',
    'ingenierias y tecnologias': 'Ingenierías y Tecnologías',
    'ingenieria y tecnologia': 'Ingenierías y Tecnologías',
    'ingenierias y tecnologia': 'Ingenierías y Tecnologías',
    'tecnologia e ingenieria': 'Ingenierías y Tecnologías',
    'ciencias medicas y de la salud': 'Ciencias Médicas y de la Salud',
    'ciencias medicas y de salud': 'Ciencias Médicas y de la Salud',
    'ciencia, tecnologia e innovacion agropecuaria': 'Ciencias Agrícolas',
    'energias renovables escolares': 'Ingenierías y Tecnologías',
    'robotica': 'Ingenierías y Tecnologías',
    'artes y ciencias ambientales': 'Ciencias Naturales',
    'ambiental': 'Ciencias Naturales',
    'jovenes en accion ante el cambio climatico': 'Ciencias Naturales',
    'cultura, educacion y tradiciones': 'Ciencias Sociales y Humanas',
    'bienestar infantil y juvenil - nacho derecho': 'Ciencias Sociales y Humanas',
    'educacion fisica, neuroeducacion y desarrollo integral': 'Ciencias Sociales y Humanas',
}

def normalize_linea(s) -> str:
    if not s or str(s).strip() in ('__', '-', ''):
        return 'Sin clasificar'
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    key = s.strip().lower()
    if key in LINEA_MAP:
        return LINEA_MAP[key]
    # Fuzzy match: look for substring in keys
    for substring, label in LINEA_MAP.items():
        if substring in key or key in substring:
            return label
    # Preestructurado programs → fold into "Preestructurado"
    if 'preestructurado' in key or key.startswith('pre esctructurado'):
        return 'Preestructurado (Nacho Derecho / Ondas Bio / JCC)'
    if 'nacho derecho' in key or 'ondas bio' in key:
        return 'Preestructurado (Nacho Derecho / Ondas Bio / JCC)'
    return 'Otros'


# ----------------------------------------------------------------------
# Views
# ----------------------------------------------------------------------

def regen_grupos_anio(d: dict) -> None:
    """Grupos de investigación por año (2024-2026)."""
    counts = {}
    for g in d['grupos']:
        counts[g['anio']] = counts.get(g['anio'], 0) + 1
    data = [{'anio': str(a), 'grupos': counts[a]} for a in sorted(counts)]
    write_view('vista-ondas-grupos-anio.json', {
        'id':          'ondas_grupos_anio',
        'name':        'Ondas - Grupos de Investigación por Año',
        'description': 'Número de grupos de investigación Ondas por vigencia (2024-2026).',
        'category':    'categorical',
        'dimensions':  ['anio'],
        'measures':    ['grupos'],
        'data':        data,
        'tipo_grafico_sugerido': 'bar',
    })


def regen_grupos_municipio(d: dict) -> None:
    """Grupos por municipio — soporta geomap + bar."""
    muni_by_id = {m['id']: m['nombre'] for m in d['municipios']}
    counts: dict[int, dict] = {}
    for g in d['grupos']:
        mid = g['municipio_id']
        if mid not in counts:
            counts[mid] = {'g_2024': 0, 'g_2025': 0, 'g_2026': 0, 'total': 0}
        key = f'g_{g["anio"]}'
        if key in counts[mid]:
            counts[mid][key] += 1
        counts[mid]['total'] += 1

    # Include all 64 municipios (even those with 0 grupos — the geomap
    # filter will drop them and show them as #fffcf3).
    rows = []
    for m in d['municipios']:
        c = counts.get(m['id'], {'g_2024': 0, 'g_2025': 0, 'g_2026': 0, 'total': 0})
        rows.append({
            'municipio':   m['nombre'].upper(),
            'grupos_2024': c['g_2024'],
            'grupos_2025': c['g_2025'],
            'grupos_2026': c['g_2026'],
            'total':       c['total'],
        })

    write_view('vista-ondas-grupos-municipio.json', {
        'vista':       'ondas_grupos_municipio',
        'titulo':      'Ondas - Grupos de Investigación por Municipio',
        'descripcion': 'Grupos Ondas por municipio de Nariño, desglosados por vigencia 2024, 2025, 2026.',
        'tipo_grafico_sugerido': 'bar_stacked',
        'total_municipios': len(rows),
        'municipios':  rows,
    })


def regen_grupos_linea(d: dict) -> None:
    """Grupos por línea de investigación (normalizada)."""
    counts = {}
    for g in d['grupos']:
        linea = normalize_linea(g.get('linea'))
        counts[linea] = counts.get(linea, 0) + 1
    data = [{'linea': k, 'grupos': v}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    write_view('vista-ondas-grupos-linea.json', {
        'id':          'ondas_grupos_linea',
        'name':        'Ondas - Grupos por Línea de Investigación',
        'description': 'Distribución de grupos Ondas por línea de investigación (normalizada).',
        'category':    'categorical',
        'dimensions':  ['linea'],
        'measures':    ['grupos'],
        'data':        data,
        'tipo_grafico_sugerido': 'donut',
    })


def regen_grupos_linea_anio(d: dict) -> None:
    """Grupos por línea × año (stacked bar)."""
    # Build map: linea → {anio: count}
    matrix: dict[str, dict[int, int]] = {}
    for g in d['grupos']:
        linea = normalize_linea(g.get('linea'))
        anio = g['anio']
        matrix.setdefault(linea, {})[anio] = matrix.get(linea, {}).get(anio, 0) + 1

    data = []
    for linea in sorted(matrix.keys(), key=lambda l: -sum(matrix[l].values())):
        row = {
            'linea':        linea,
            'grupos_2024':  matrix[linea].get(2024, 0),
            'grupos_2025':  matrix[linea].get(2025, 0),
            'grupos_2026':  matrix[linea].get(2026, 0),
            'total':        sum(matrix[linea].values()),
        }
        data.append(row)

    write_view('vista-ondas-grupos-linea-anio.json', {
        'id':          'ondas_grupos_linea_anio',
        'name':        'Ondas - Grupos por Línea × Vigencia',
        'description': 'Grupos Ondas desglosados por línea de investigación y vigencia (2024-2026).',
        'category':    'categorical',
        'dimensions':  ['linea'],
        'measures':    ['grupos_2024', 'grupos_2025', 'grupos_2026', 'total'],
        'data':        data,
        'tipo_grafico_sugerido': 'bar_stacked',
    })


def regen_instituciones_municipio(d: dict) -> None:
    """Instituciones educativas por municipio."""
    muni_by_id = {m['id']: m['nombre'] for m in d['municipios']}
    counts: dict[int, dict] = {}
    for ie in d['instituciones']:
        mid = ie['municipio_id']
        counts.setdefault(mid, {'total': 0, 'georref': 0})
        counts[mid]['total'] += 1
        if ie.get('georreferenciada'):
            counts[mid]['georref'] += 1

    rows = []
    for m in d['municipios']:
        c = counts.get(m['id'], {'total': 0, 'georref': 0})
        rows.append({
            'municipio':      m['nombre'].upper(),
            'instituciones':  c['total'],
            'georreferenciadas': c['georref'],
        })

    write_view('vista-ondas-instituciones-municipio.json', {
        'vista':       'ondas_instituciones_municipio',
        'titulo':      'Ondas - Instituciones Educativas por Municipio',
        'descripcion': 'Instituciones Educativas con proyectos Ondas por municipio de Nariño (250 IE, 230 georreferenciadas).',
        'tipo_grafico_sugerido': 'bar',
        'total_municipios': len(rows),
        'municipios':  rows,
    })


def regen_presupuesto_entidad(d: dict) -> None:
    """Presupuesto total por entidad (donut)."""
    data = [
        {
            'entidad':    e['nombre'],
            'tipo':       e.get('tipo', ''),
            'valor_cop':  int(e['valor_total']),
        }
        for e in d['presupuesto']['entidades']
    ]
    write_view('vista-ondas-presupuesto-entidad.json', {
        'id':          'ondas_presupuesto_entidad',
        'name':        'Ondas - Presupuesto por Entidad (COP)',
        'description': 'Ejecución presupuestal consolidada de Ondas Nariño por entidad aportante (SGR, Gobernación, CESMAG, Minciencias).',
        'category':    'categorical',
        'dimensions':  ['entidad', 'tipo'],
        'measures':    ['valor_cop'],
        'data':        data,
        'tipo_grafico_sugerido': 'donut',
    })


def regen_presupuesto_anio(d: dict) -> None:
    """Presupuesto total por año."""
    totales = d['presupuesto']['total_por_anio']
    data = [{'anio': a, 'presupuesto_cop': int(v)}
            for a, v in sorted(totales.items())]
    write_view('vista-ondas-presupuesto-anio.json', {
        'id':          'ondas_presupuesto_anio',
        'name':        'Ondas - Presupuesto Ejecutado por Año (COP)',
        'description': 'Presupuesto consolidado ejecutado por vigencia 2024-2026.',
        'category':    'categorical',
        'dimensions':  ['anio'],
        'measures':    ['presupuesto_cop'],
        'data':        data,
        'tipo_grafico_sugerido': 'bar',
    })


def regen_presupuesto_entidad_anio(d: dict) -> None:
    """Presupuesto por entidad × año — stacked bar / line."""
    data = []
    for e in d['presupuesto']['entidades']:
        row = {
            'entidad':             e['nombre'],
            'tipo':                e.get('tipo', ''),
            'presupuesto_2024':    int(e['ejecucion'].get('2024', 0)),
            'presupuesto_2025':    int(e['ejecucion'].get('2025', 0)),
            'presupuesto_2026':    int(e['ejecucion'].get('2026', 0)),
            'total':               int(e['valor_total']),
        }
        data.append(row)
    write_view('vista-ondas-presupuesto-entidad-anio.json', {
        'id':          'ondas_presupuesto_entidad_anio',
        'name':        'Ondas - Presupuesto por Entidad × Vigencia (COP)',
        'description': 'Ejecución presupuestal por entidad aportante y vigencia (2024-2026).',
        'category':    'categorical',
        'dimensions':  ['entidad'],
        'measures':    ['presupuesto_2024', 'presupuesto_2025', 'presupuesto_2026', 'total'],
        'data':        data,
        'tipo_grafico_sugerido': 'bar_stacked',
    })


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main() -> None:
    master = load_master()
    print(f'Master: {len(master["municipios"])} municipios · '
          f'{len(master["instituciones"])} IE · '
          f'{len(master["grupos"])} grupos · '
          f'{len(master["imagenes"])} imagenes')
    print('Regenerating Py Ondas (detalle) views:')
    regen_grupos_anio(master)
    regen_grupos_municipio(master)
    regen_grupos_linea(master)
    regen_grupos_linea_anio(master)
    regen_instituciones_municipio(master)
    regen_presupuesto_entidad(master)
    regen_presupuesto_anio(master)
    regen_presupuesto_entidad_anio(master)
    print('Done.')


if __name__ == '__main__':
    main()
