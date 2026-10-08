#!/usr/bin/env python3
"""
Regenerate the Py Ondas view files from the master
`data/views/ondas/proyecto-ondas.json`.

Emits flat views — one measure per municipio or per categorical bucket —
ready to be ingested by the TIC Suite plugin data provider.

Usage:
    python3 scripts/regen-ondas.py
"""
from __future__ import annotations
import json
import os
import pathlib
from typing import Callable

ROOT = pathlib.Path(__file__).resolve().parent.parent
VIEWS = ROOT / 'data' / 'views' / 'ondas'
MASTER = VIEWS / '_proyecto-ondas.json'


def load_master() -> dict:
    with MASTER.open() as f:
        return json.load(f)


def write_view(filename: str, payload: dict) -> None:
    path = VIEWS / filename
    with path.open('w') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    rows = len(payload.get('municipios', payload.get('datos', payload.get('data', []))))
    size = os.path.getsize(path)
    print(f'  wrote {filename:45s}  rows={rows:3d}  size={size:,}B')


def _i(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _f(v) -> float:
    try:
        return float(v or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _program_view(
    master: dict,
    *,
    slug: str,
    filename: str,
    titulo: str,
    descripcion: str,
    measure_field: str,
    getter: Callable[[dict], int],
    chart_hint: str = 'bar',
    extra_totales: dict | None = None,
) -> None:
    municipios = []
    total = 0
    zeros = 0
    for m in master['municipios']:
        value = getter(m)
        municipios.append({
            'municipio': m['nombre'],
            measure_field: value,
        })
        total += value
        if value == 0:
            zeros += 1

    totales = {
        'total_departamento': total,
        'municipios_con_presencia': len(municipios) - zeros,
        'municipios_sin_presencia': zeros,
    }
    if extra_totales:
        totales.update(extra_totales)

    write_view(filename, {
        'vista': slug,
        'titulo': titulo,
        'descripcion': descripcion,
        'tipo_grafico_sugerido': chart_hint,
        'total_municipios': len(municipios),
        'municipios': municipios,
        'totales': totales,
    })


# --- Geographic views ---

def regen_proyectos(master: dict) -> None:
    rows = []
    for m in master['municipios']:
        p = m.get('proyectos', {}) or {}
        rows.append({
            'municipio': m['nombre'],
            'proyectos_2024': _i(p.get('2024')),
            'proyectos_2025': _i(p.get('2025')),
            'total': _i(p.get('total')) or (_i(p.get('2024')) + _i(p.get('2025'))),
            'variacion_pct': _f(p.get('variacion_pct')),
        })
    write_view('vista-ondas-proyectos-municipio.json', {
        'vista': 'ondas_proyectos_municipio',
        'titulo': 'Ondas - Proyectos por Municipio (2024-2025)',
        'descripcion': 'Proyectos Ondas por municipio de Nariño, comparando las vigencias 2024 y 2025.',
        'tipo_grafico_sugerido': 'bar_stacked',
        'total_municipios': len(rows),
        'municipios': rows,
    })


def regen_profesores(master: dict) -> None:
    rows = []
    for m in master['municipios']:
        p = m.get('profesores', {}) or {}
        rows.append({
            'municipio': m['nombre'],
            'profesores_2024': _i(p.get('2024')),
            'profesores_2025': _i(p.get('2025')),
            'total': _i(p.get('total')) or (_i(p.get('2024')) + _i(p.get('2025'))),
        })
    write_view('vista-ondas-profesores-municipio.json', {
        'vista': 'ondas_profesores_municipio',
        'titulo': 'Ondas - Profesores por Municipio (2024-2025)',
        'descripcion': 'Profesores vinculados a Ondas por municipio de Nariño.',
        'tipo_grafico_sugerido': 'bar_stacked',
        'total_municipios': len(rows),
        'municipios': rows,
    })


def regen_ninos(master: dict) -> None:
    rows = []
    for m in master['municipios']:
        n = m.get('ninos_2025', {}) or {}
        rows.append({'municipio': m['nombre'], 'ninos_2025': _i(n.get('total'))})
    write_view('vista-ondas-ninos-municipio.json', {
        'vista': 'ondas_ninos_municipio',
        'titulo': 'Ondas - Niños Inscritos por Municipio (2025)',
        'descripcion': 'Niños y niñas inscritos en Ondas por municipio de Nariño en la vigencia 2025.',
        'tipo_grafico_sugerido': 'bar',
        'total_municipios': len(rows),
        'municipios': rows,
    })


def regen_instituciones(master: dict) -> None:
    rows = []
    for m in master['municipios']:
        ie = m.get('instituciones_educativas', {}) or {}
        rows.append({
            'municipio': m['nombre'],
            'ie_2024': _i(ie.get('2024_total_unicas')),
            'ie_2025': _i(ie.get('2025_total_unicas')),
            'ie_unicas_combinadas': _i(ie.get('total_unicas_combinadas')),
        })
    write_view('vista-ondas-instituciones-municipio.json', {
        'vista': 'ondas_instituciones_municipio',
        'titulo': 'Ondas - Instituciones Educativas por Municipio',
        'descripcion': 'Instituciones Educativas únicas con proyectos Ondas por municipio de Nariño.',
        'tipo_grafico_sugerido': 'bar',
        'total_municipios': len(rows),
        'municipios': rows,
    })


# --- Categorical views ---

def _distribution_view(slug, filename, titulo, descripcion, dim_label,
                       items, measure_field='cantidad', chart_hint='donut'):
    datos = [
        {dim_label: str(k), measure_field: _i(v)}
        for k, v in items.items()
        if _i(v) > 0
    ]
    write_view(filename, {
        'id': slug, 'name': titulo, 'description': descripcion,
        'category': 'categorical',
        'dimensions': [dim_label], 'measures': [measure_field],
        'data': datos,
        'tipo_grafico_sugerido': chart_hint,
    })


def regen_ninos_genero(t):
    _distribution_view('ondas_ninos_genero', 'vista-ondas-ninos-genero.json',
        'Ondas - Niños por Género (2025)', 'Distribución de género de los niños Ondas 2025.',
        'genero', t.get('distribucion_genero_ninos', {}), 'ninos', 'donut')

def regen_ninos_etnico(t):
    _distribution_view('ondas_ninos_etnico', 'vista-ondas-ninos-etnico.json',
        'Ondas - Niños por Grupo Étnico (2025)', 'Distribución étnica de los niños Ondas 2025.',
        'grupo_etnico', t.get('distribucion_etnica_ninos', {}), 'ninos', 'donut')

def regen_ninos_estrato(t):
    _distribution_view('ondas_ninos_estrato', 'vista-ondas-ninos-estrato.json',
        'Ondas - Niños por Estrato (2025)', 'Distribución por estrato de los niños Ondas 2025.',
        'estrato', t.get('distribucion_estrato_ninos', {}), 'ninos', 'bar')

def regen_ninos_grado(t):
    items = t.get('distribucion_grado_ninos', {}) or {}
    def _sk(k):
        try: return (0, int(k))
        except: return (1, 0)
    _distribution_view('ondas_ninos_grado', 'vista-ondas-ninos-grado.json',
        'Ondas - Niños por Grado Escolar (2025)', 'Distribución por grado escolar de los niños Ondas 2025.',
        'grado', dict(sorted(items.items(), key=lambda kv: _sk(kv[0]))), 'ninos', 'bar')

def regen_profesores_genero(t):
    _distribution_view('ondas_profesores_genero', 'vista-ondas-profesores-genero.json',
        'Ondas - Profesores por Género (2025)', 'Distribución de género de profesores Ondas 2025.',
        'genero', t.get('distribucion_genero_profesores', {}), 'profesores', 'donut')

def regen_profesores_areas(t):
    items = t.get('distribucion_areas_profesores', {}) or {}
    top = dict(sorted(items.items(), key=lambda kv: _i(kv[1]), reverse=True)[:15])
    _distribution_view('ondas_profesores_areas', 'vista-ondas-profesores-areas.json',
        'Ondas - Áreas de Profesores (Top 15, 2025)', 'Las 15 áreas con más profesores Ondas 2025.',
        'area', top, 'profesores', 'bar')


# --- Combined Sankey ---

def regen_ninos_sankey(totales: dict) -> None:
    """Sankey with shared intermediate nodes (Género, Grupo Étnico, Estrato).

    Two roots: Niños, Profesores. "Género" receives flow from both.
    Leaf nodes like "Femenino" aggregate combined flows.
    Edges with the same source+target pair are summed (deduped).
    """
    edges_raw: list[tuple[str, str, int]] = []

    def _add(src: str, tgt: str, val: int) -> None:
        if val > 0:
            edges_raw.append((src, tgt, val))

    # Niños → Género / Grupo Étnico / Estrato → leaves
    for dim, items in [
        ('Género',       totales.get('distribucion_genero_ninos', {})),
        ('Grupo Étnico', totales.get('distribucion_etnica_ninos', {})),
        ('Estrato',      totales.get('distribucion_estrato_ninos', {})),
    ]:
        dim_total = 0
        for cat, count in (items or {}).items():
            n = _i(count)
            _add(dim, cat, n)
            dim_total += n
        _add('Niños', dim, dim_total)

    # Profesores → Género → leaves
    for dim, items in [
        ('Género', totales.get('distribucion_genero_profesores', {})),
    ]:
        dim_total = 0
        for cat, count in (items or {}).items():
            n = _i(count)
            _add(dim, cat, n)
            dim_total += n
        _add('Profesores', dim, dim_total)

    # Deduplicate edges (sum values for same source→target).
    edge_map: dict[tuple[str, str], int] = {}
    for s, t, v in edges_raw:
        edge_map[(s, t)] = edge_map.get((s, t), 0) + v
    deduped = [{'source': s, 'target': t, 'value': v}
               for (s, t), v in edge_map.items()]

    # Build node data.
    # - Pure roots (only source, never target): use the max single
    #   outgoing edge value — NOT the sum, because each outgoing edge
    #   represents the same population distributed differently.
    # - All other nodes: sum of incoming edges.
    outgoing: dict[str, list[int]] = {}
    incoming: dict[str, int] = {}
    for s, t, v in edges_raw:
        outgoing.setdefault(s, []).append(v)
        incoming[t] = incoming.get(t, 0) + v
    all_ids = set(outgoing) | set(incoming)
    data_rows = []
    for nid in sorted(all_ids):
        if nid in incoming:
            val = incoming[nid]
        else:
            val = max(outgoing.get(nid, [0]))
        data_rows.append({'id': nid, 'cantidad': val})

    write_view('vista-ondas-ninos-sankey.json', {
        'id':          'ondas_ninos_sankey',
        'name':        'Ondas - Niños y Profesores: Género · Étnico · Estrato (Sankey)',
        'description': 'Diagrama Sankey con nodos compartidos: Niños y Profesores fluyen por Género, Grupo Étnico y Estrato.',
        'category':    'network',
        'dimensions':  ['id'],
        'measures':    ['cantidad'],
        'data':        data_rows,
        'edges':       deduped,
    })


def main() -> None:
    master = load_master()
    totales = master.get('totales_departamentales', {}) or {}
    print(f'Master: {len(master["municipios"])} municipios')
    print('Regenerating Py Ondas views:')
    regen_proyectos(master)
    regen_profesores(master)
    regen_ninos(master)
    regen_instituciones(master)
    regen_ninos_genero(totales)
    regen_ninos_etnico(totales)
    regen_ninos_estrato(totales)
    regen_ninos_grado(totales)
    regen_profesores_genero(totales)
    regen_profesores_areas(totales)
    regen_ninos_sankey(totales)
    print('Done.')


if __name__ == '__main__':
    main()
