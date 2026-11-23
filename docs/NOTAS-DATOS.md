# Notas de datos — Py Nación (base v2, corte septiembre 2026)

## Fuentes

| Clave | Documento | Radicado | Fecha | Corte |
|---|---|---|---|---|
| `informe-2024` | Informe Gestión TIC en las Regiones – Nariño 2024 | 6965 | 2024-12-09 | dic-2024 |
| `mintic-2026-01` | Respuesta MinTIC a derecho de petición (Rad. 261002674) | 262030528 | 2026-01-30 | ene-2026 |
| `mintic-2026-10` | Respuesta MinTIC a comunicado (Rad. 261111891) | 262178074 | 2026-10-28 | sep-2026 |

**Criterio:** en cada proyecto prevalece la fuente más reciente que trae detalle por municipio. Lo reemplazado queda en claves `historico_*` dentro de `data/views/proyectos-tic.json`.

## Flujo

```
data/views/proyectos-tic.json            ← base (única fuente de verdad)
        │  python3 scripts/regen-views.py
        ├─ data/views/nacion/vista-analisis-municipios.json   (analítica por municipio)
        ├─ data/views/nacion/vista-*.json                     (vistas de los shortcodes)
        └─ data/dashboards/tic-narino.json                    (dataset del Dashboard)
```

`scripts/ingest-mintic-2026.py` hizo la migración v1 → v2 (una sola vez) con las tablas transcritas de los dos oficios de 2026.

## Proyecto por proyecto

| Proyecto | Fuente usada | Cambio |
|---|---|---|
| Centros Digitales | ene-2026 (detalle), oct-2026 (total) | 923 en operación en 64 municipios (antes 905 asignados, 820 en operación). |
| ConectiVIDAd (hogares) | oct-2026 | Reemplaza "conectividad_hogares": meta, accesos instalados y operativos por acuerdo (AE2 en 11 municipios, AE4 en Tumaco). 5.774 operativos de 11.567. |
| Zonas Comunitarias para la Paz | ene-2026 | 211 en operación en los 16 municipios PDET (sin cambio). |
| Escuelas PotencIA 5G | ene-2026 | Nueva estructura con estado y asignatario: 10 en operación, 2 en instalación, 28 en planeación. |
| Juntas de Internet | oct-2026 + estado ene-2026 | Nueva estructura: 23 juntas del Acuerdo Específico No. 5 en 15 municipios, 1.935 hogares previstos. El prerregistro y el diseño de 2024 pasan a histórico. |
| Centros PotencIA | oct-2026 + ene-2026 | Pasto y Tumaco, pendientes (estudios y diseños). |
| Despliegue 5G, Talento Tech, SENATIC, Colombia Programa, AvanzaTEC, Computadores para Educar, convenios | informe-2024 | Sin datos nuevos en los oficios de 2026. |
| Inversión por programa | informe-2024 | Los oficios de 2026 no la reportan para Nariño. |

## Inconsistencias encontradas en los oficios

1. **Centros Digitales (oct-2026):** anuncia 925 centros, pero la tabla viene sin filas. Se usa el detalle de enero (923); los 2 centros de diferencia no se pueden asignar a ningún municipio.
2. **Centros Digitales (ene-2026):** habla de "67 municipios" porque repite Ospina, Roberto Payán y San Andrés de Tumaco. Sus filas se suman.
3. **ZCP (oct-2026):** anuncia 225 ZCP, pero la tabla lista 11 municipios no PDET con 2 unidades cada uno: son exactamente los municipios del AE2 de ConectiVIDAd. Se mantiene el detalle de enero (211). La tabla se guarda en `conectividad_para_cambiar_vidas.tabla_oct_2026_rotulada_zcp` y no se usa en indicadores.
4. **ConectiVIDAd AE2 (oct-2026):** anuncia una meta de 9.219 accesos, pero la tabla suma 4.117. En enero se reportaban 9.179 contratados, con 5.000 en Ipiales y 810 en Pupiales (en octubre aparecen con 128 y 580).
5. **Escuelas 5G (ene-2026):** dice 16 municipios; la tabla trae 13 municipios distintos (16 filas por asignatario).
6. **Juntas de Internet:** el PBS de Santacruz y Santa Bárbara cambia entre oficios; se usa el de octubre.
7. **Computadores para Educar:** la tabla municipal suma 5.998 equipos, igual al resumen oficial. El análisis anterior sumaba 6.019 porque atribuía 20 equipos a San Lorenzo y 1 a San Pablo.

Conviene pedir al MinTIC la tabla municipal de Centros Digitales del oficio de octubre y aclarar las inconsistencias 3 y 4.

## Índice de presencia

Mide 12 programas: 7 de conectividad (Centros Digitales, ConectiVIDAd, ZCP, Escuelas 5G, Despliegue 5G, Juntas de Internet, Centros PotencIA) y 5 de educación digital (Talento Tech, SENATIC, Colombia Programa, AvanzaTEC, Computadores para Educar).

El promedio baja de 6,0 a 4,5. Esto no indica menos oferta: las juntas de 2024 (prerregistro y diseño) contaban como dos programas y llegaban a 61 y 47 municipios, mientras que las 23 juntas en implementación llegan a 15.

Categorías: baja ≤ 3, media 4–5, media alta 6–8, alta ≥ 9.

## Vistas retiradas

`juntas_prereg` y `juntas_diseno` se reemplazan por `juntas_internet`. Los shortcodes que usen las vistas retiradas deben cambiarse a `view="juntas_internet"`.
