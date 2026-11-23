# TIC Suite

**v1.6.0** — Plugin WordPress para **TIC Suite** (Gobernación de Nariño)
que permite generar **15 tipos de gráficos interactivos con
[@d3plus/core v3.1.4](https://d3plus.org/)** e insertarlos en cualquier
página o entrada mediante **shortcode**.

## Características

- **15 tipos de gráficos** (d3plus.js): barras, barras apiladas, línea, área, área apilada, pastel, dona, treemap, mapa coroplético, red, árbol, sankey, anillos, box-whisker, Priestley (línea temporal).
- **Detección de compatibilidad**: al seleccionar una vista, solo aparecen los tipos de gráficos coherentes con sus dimensiones, medidas, aristas o rango temporal.
- **Constructor visual** en tres paneles (Vista → Tipo → Vista previa + shortcode) con copia al portapapeles de un clic.
- **Galería de shortcodes**: bloque por vista con todas sus combinaciones posibles y preview tabular de los datos subyacentes.
- **Navegador de datos**: vista tabular cruda de cualquier vista registrada.
- **REST API propia** (`/wp-json/tic-suite/v1`) con permisos, nonces y whitelists.
- **Arquitectura segura**: sanitización profunda, escapado sistemático, path traversal protegido, permisos por capability, sin `eval` ni JSON inyectado en el HTML.
- **Experiencia minimalista** en admin y frontend con Dashicons y paleta contenida.

## Instalación

```bash
# Clonar en wp-content/plugins/
git clone https://github.com/GobernaciondeNarino/tic-suite.git tic-suite-graficos
```

Activa **TIC Suite · Gráficos** en Plugins → Instalados.

## Uso

### Desde el admin

1. **Gráficos → Constructor**: elige una vista a la izquierda; los tipos de gráfico compatibles aparecen en el centro; selecciónalos para ver la vista previa y obtener el shortcode.
2. **Gráficos → Shortcodes**: galería con todas las combinaciones listas para copiar, con una tabla de los datos de la vista debajo.
3. **Gráficos → Datos de vista**: navegador tabular de cualquier vista.

### Shortcode

```text
[tsg_grafico view="conectividad-municipios" type="bar" height="420" title="Conectividad por municipio" theme="tic-suite"]
```

Atributos:

| Atributo | Requerido | Descripción |
|----------|-----------|-------------|
| `view`   | sí        | Id de una vista en `/data/views/*.json` |
| `type`   | sí        | Uno de los 15 tipos registrados |
| `height` | no        | Altura mínima en píxeles (160–1600) |
| `title`  | no        | Encabezado del gráfico |
| `theme`  | no        | `tic-suite` (claro) o `dark` |

## Añadir una vista

Crea un archivo en `data/views/<slug>.json`:

```json
{
  "id": "mi-vista",
  "name": "Mi vista",
  "description": "Descripción corta.",
  "category": "categorical",
  "dimensions": ["campo_dim_1", "campo_dim_2"],
  "measures":   ["metrica_1"],
  "data": [
    { "campo_dim_1": "A", "campo_dim_2": "X", "metrica_1": 12 }
  ]
}
```

Categorías soportadas: `categorical`, `temporal`, `geographic`, `hierarchical`, `network`, `statistical`.

## Arquitectura

```
tic-suite-graficos.php        → Headers + bootstrap
includes/
  class-tsg-plugin.php        → Singleton que cablea todo
  class-tsg-security.php      → Sanitización, nonces, capabilities
  class-tsg-chart-types.php   → Registro de 15 tipos + compatibilidad
  class-tsg-data-provider.php → Lectura/caché de vistas JSON
  class-tsg-shortcode.php     → Shortcode [tsg_grafico]
  class-tsg-rest-api.php      → Rutas REST /tic-suite/v1
  class-tsg-admin.php         → Menús y pantallas de admin
templates/admin/              → Vistas del admin
assets/js/                    → admin.js, frontend.js, renderer.js
assets/css/                   → admin.css, frontend.css
data/views/*.json             → Vistas de ejemplo
```

## Seguridad

- Capability `manage_options` para todo acceso administrativo.
- Nonces `X-WP-Nonce` en cada llamada REST.
- `sanitize_key`, `sanitize_text_field`, `absint`, `sanitize_html_class` aplicados a todas las entradas.
- Whitelist estricta de `view` y `type` antes de cualquier consulta.
- Protección explícita contra path traversal al leer JSON (`realpath` dentro de `data/views/`).
- El shortcode **no** vuelca los datos en el HTML; el navegador los pide con nonce.
- `uninstall.php` limpia opciones sin tocar contenido del usuario.

## Integración con Claude Code

Para replicar el entorno con los skills de diseño recomendados, en tu terminal:

```bash
npx skills add anthropics/skills --skill frontend-design
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
```

Estos skills aportan guías de diseño que se aplican cuando Claude escribe CSS/HTML, manteniendo la experiencia minimalista y accesible.

## Changelog

### 1.10.0
- **Datos actualizados** con los oficios MinTIC de enero y octubre de 2026 (corte septiembre 2026). Base `data/views/proyectos-tic.json` v2: fuente y corte por proyecto, históricos conservados.
- **Un solo insumo**: `python3 scripts/regen-views.py` genera la analítica municipal, las vistas de los shortcodes y el dataset del Dashboard.
- Vista nueva `juntas_internet` (reemplaza `juntas_prereg` y `juntas_diseno`); ConectiVIDAd, Escuelas 5G y Centros Digitales con su nueva estructura.
- Decisiones e inconsistencias de las fuentes: `docs/NOTAS-DATOS.md`.

### 1.9.0
- **d3plus 4.13.0** (antes 3.0.x), cargado desde el bundle `full` de `@d3plus/core`.
- **Módulo Dashboard**: `[tsg_dashboard id="tic-narino" height="820"]`, REST `GET /tic-suite/v1/dashboard/{id}` y submenú *TIC Suite → Dashboard*.
  - Dashboard TIC Nariño 2024 rehecho con d3plus (antes Chart.js + Leaflet): mapa, KPIs, 8 gráficos, ranking, ficha municipal, CSV y tema claro/oscuro.
  - Datos en `data/dashboards/tic-narino.json`; plantilla en `templates/dashboard/tic-narino.html`.

### 1.6.0
- **Plugin renombrado a "TIC Suite"** — así aparece en el menú lateral de WordPress.
- **Arquitectura multi-proyecto** de Proyectos Nación:
  - **Py Nación** — 15 vistas del Informe Gestión TIC 2024.
  - **Py Ondas** — 10 vistas nuevas derivadas de `proyecto-ondas.json` (38 municipios con presencia del programa Ondas):
    - Proyectos / Profesores / Niños / IE por municipio (geographic)
    - Niños por género, grupo étnico, estrato, grado escolar (categórica)
    - Profesores por género, áreas (Top 15) (categórica)
- **Menú admin**: top-level "TIC Suite" → submenús **Py Nación** • **Py Ondas** • Shortcodes • Datos de vista. Los dos últimos llevan selector de proyecto.
- **Shortcode**: nuevo atributo `project="nacion|ondas"` (default: `nacion`). El builder de cada proyecto genera automáticamente `project="ondas"` cuando corresponde.
- **REST API**: parámetro `project` en todas las rutas, validado contra la whitelist `TSG_Plugin::PROJECTS`.
- **Data provider multi-instancia**: uno por proyecto, caché aislado (prefix `nacion:` / `ondas:`), path aislado (`data/views/nacion/` / `data/views/ondas/`).
- **Fix de adapter**: `is_int`/`is_float` reemplaza `is_numeric` → IDs numéricos string como DIVIPOLA `"52001"` ya no son promovidos a medidas por accidente.
- **Fix**: files maestros (con solo campos nested) ya no aparecen como vistas vacías; se filtran por "sin medidas promovidas".
- **`scripts/regen-ondas.py`**: regenerador reproducible de las 10 vistas de Py Ondas desde el maestro.

### 1.5.1
- **Municipios sin datos excluidos** del gráfico (excepto mapa + grafos):
  - `bar`, `pie`, `donut`, `treemap`, `tree`, `box_whisker`, `line`, `area` → se filtran rows con la medida principal en `0 / null / NaN`.
  - `stacked_bar`, `stacked_area` → se filtran solo los rows donde *todas* las medidas apilables son `0`.
  - `network`, `rings`, `sankey` → pass-through (la estructura del grafo tiene valor por sí misma).
- **Geomap**: los municipios con `0` o sin datos caen al fill de "polígono sin datos", ahora configurado como **`#fffcf3`** via `viz.topojsonFill("#fffcf3")`. Los municipios con datos reales se colorean según la escala normal.
- La leyenda en modo iconos aplica el mismo filtro para quedar sincronizada con el gráfico.
- Ventaja colateral: la escala de color del geomap ya no se ve aplastada por muchos ceros — los municipios con valores pequeños se distinguen mejor.

### 1.5.0
- **Chart-type swap en vivo** vía nueva acción `cambiar`: la toolbar del gráfico incluye un `<select>` con los tipos compatibles de la vista. Al cambiar, un fetch AJAX a `/render?view=…&type=…` trae el nuevo payload y reemplaza el SVG in-place (sin recargar la página ni el resto de la figura).
- **REST `/render`** ahora incluye el array `compatible` con la lista de tipos compatibles — el selector se pobla sin un segundo round-trip.
- **Builder admin**: nuevo chip "Cambiar tipo" en la fila de Acciones. Al habilitarlo, la preview muestra el select en la toolbar, y al elegir otro tipo se sincroniza la preview + el Panel 2 de chart types + el shortcode generado.
- **CSS**: nueva variante `.tsg-action--select` que superpone un `<select>` invisible sobre un `<label>` estilizado como botón, con indicador caret.
- Default de `actions` extendido de 5 → 6 elementos (`detalle,compartir,datos,imagen,descarga,cambiar`).

### 1.4.5
- **Geomap totalmente transparente**: el `<rect class="d3plus-geomap-ocean">` que d3plus pinta como fondo (gris azulado `#d4dadc`) ahora se emite con `fill="transparent"` via `viz.ocean("transparent")`. Los polígonos de los municipios quedan sobre la superficie de la figura contenedora sin rectángulo intermedio.

### 1.4.4
- **Geomap sin basemap**: `viz.tiles(false)` oculta la capa de tiles CARTO/OSM (`light_all`) que d3plus trae activa por defecto y que mostraba etiquetas de departamentos vecinos (Cauca, Huila, Putumayo, etc.). Ahora los mapas muestran solo los polígonos de los 64 municipios de Nariño sobre fondo transparente.

### 1.4.3
- **Leyenda anclada al bottom**: `viz.legendPosition("bottom")` en el base config del renderer, para que toda la flota de charts (bar, line, pie, donut, treemap, geomap, etc.) muestre la leyenda debajo del SVG, sin depender del aspect ratio. El modo "iconos" ya estaba debajo por orden del DOM.

### 1.4.2
- **Cobertura completa de los 12 proyectos TIC** del Informe Gestión 2024. Vistas nuevas:
  - `vista-indice-presencia.json` — Índice compuesto 0–12 por municipio
  - `vista-conectividad-hogares.json`
  - `vista-despliegue-5g.json`
  - `vista-escuelas-5g.json`
  - `vista-juntas-prereg.json`
  - `vista-juntas-diseno.json`
  - `vista-senatic.json`
  - `vista-colombia-programa.json`
  - `vista-avanzatec.json`
- **`vista-comparativo-municipios.json`** ampliada de 5 → 11 programas (wide-format, 64 × 11).
- Todas las vistas llevan los **64 municipios** + flag `pdet` booleano.
- `scripts/regen-views.py` extendido con 10 funciones `regen_*()` reproducibles desde el maestro.

### 1.4.1
- **Alcance departamental completo**: las 4 vistas que antes llevaban "Top N" (Top 12 / 15 / 16 / 20) ahora incluyen los **64 municipios** de Nariño, extraídos del archivo maestro `vista-analisis-municipios.json`. Los títulos fueron actualizados para reflejar el alcance completo.
- **`scripts/regen-views.py`**: script de sincronización que regenera las 4 vistas derivadas desde el maestro. Volver a correrlo cuando el maestro cambie.
- **`zcp_por_municipio`**: incluye los 64 municipios con un flag `pdet` booleano — los no-PDET muestran `zcp_asignadas = 0`.

### 1.4.0
- **Tooltips informativos**: cada gráfico ahora muestra un `tbody` con todas las dimensiones y medidas. Etiquetas en español (humanizadas + unidad detectada del nombre del campo: `(Millones COP)`, `(%)`); valores con `Intl.NumberFormat('es-CO')` (separadores de miles correctos); porcentajes con 1 decimal forzado.
- **Títulos de ejes**:
  - Atributos nuevos `x_title="..."` y `y_title="..."` en el shortcode.
  - Auto-detect: si están vacíos, el renderer genera el título a partir del nombre del campo (`humanizeKey`) más una sufijo de unidad si lo detecta. Ej: `inversion_millones_cop` → `Inversion (Millones COP)`.
  - Para `stacked_bar` / `stacked_area` el título Y muestra `Cantidad` o `Valor (Millones COP)` según el conjunto de medidas apiladas.
  - Charts sin ejes (`pie`, `donut`, `treemap`, `geomap`, `network`, `rings`, `sankey`, `tree`) se saltan la configuración de ejes automáticamente.
- **Tooltip por chart**:
  - `geomap`: título = nombre original del municipio con acentos.
  - `stacked_bar` / `stacked_area`: título = "Métrica — Municipio".
  - `network` / `rings` / `sankey`: título = id del nodo.
  - resto: título = valor de la primera dimensión.
- **Estilos del tooltip**: fondo blanco, borde `#cbd5e1`, padding 12/14, título en negrita con underline, body en `#334155 12px`.
- **Admin builder**: dos inputs nuevos en el fieldset "Opciones" para `Eje X` y `Eje Y`, con placeholder `auto` y actualización en vivo de la preview y el shortcode generado.

### 1.3.0
- **Topojson con detalle completo**: regenerado desde el geojson oficial sin `toposimplify`, solo con quantización. Los 64 municipios ahora conservan todas las delimitaciones originales (49 KB, 188 arcs únicos, 349 referencias compartidas entre vecinos — cada borde compartido aparece una sola vez).
- **Opciones de shortcode**: `legend`, `legend_style` (text|icons), `toolbar`, `actions` (lista). Ejemplo: `[tsg_grafico view="..." type="..." legend_style="icons" actions="datos,imagen"]`.
- **Leyenda en modo iconos**: tira de swatches de color sin texto, con tooltip al pasar el mouse (como en los dashboards de economia.gob).
- **Barra de acciones** encima del gráfico con 5 botones:
  - **Detalle** → modal con metadatos (tipo, categoría, dimensiones, medidas, filas)
  - **Compartir** → `navigator.share` si existe, sino copia URL
  - **Datos** → modal con tabla completa formateada (Intl.NumberFormat 'es-CO')
  - **Imagen** → exporta a PNG 2x usando canvas
  - **Descarga** → descarga payload (vista + datos) como JSON
- **Admin builder**: fieldset "Opciones" con switches (toggle) y chips (acciones). Los cambios reconfiguran la preview en vivo y regeneran el shortcode.
- **CSS compartido**: la preview del admin carga `frontend.css` para ser pixel-perfect idéntica al resultado publicado.

### 1.2.0
- **Vistas TIC Suite nativas**: el data provider acepta dos formatos — el nativo del plugin y el formato de publicación TIC Suite (`vista` / `titulo` / `descripcion` / `tipo_grafico_sugerido` / `municipios` | `datos`). Dimensiones / medidas / categoría se infieren de la primera fila.
- **Compatibilidad de gráficos ampliada**: las vistas geográficas ya no son exclusivas de `geomap` — ahora soportan también `bar`, `stacked_bar`, `pie`, `donut`, `treemap`, `tree`, `box_whisker`. Las 6 vistas del usuario producen 48 combinaciones válidas (promedio de 8 gráficos por vista).
- **Topojson local de Nariño**: `data/topo/narino_municipios.topojson` (14 KB, 4% del geojson original) con los 64 municipios, propiedades limpias (id, nombre, divipola) y geometría simplificada (toposimplify=0.002).
- **IDs normalizados para join**: el topojson usa id = `normalize(MPIO_CNMBR)` (uppercase, NFD sin acentos, whitespace colapsado). El renderer aplica la misma normalización al campo `municipio` de cada fila de datos y genera `_municipio_id` para que d3plus.Geomap haga el join sin configuración adicional.
- **Reshape wide→long**: `stacked_bar` y `stacked_area` ahora reshape filas anchas (`en_operacion`/`en_instalacion`/`en_planeacion`) a formato largo (una fila por métrica). Series derivadas (`total`, `pct_*`, `participacion_*`, `cobertura_*`) se omiten para evitar doble conteo.
- **humanizeKey()** convierte `en_operacion` → `En operacion` en las leyendas.

### 1.1.1
- **Fix crítico de CDN**: pasa de `/umd/d3plus-core.js` a `/umd/d3plus-core.full.js`. El primero requería 30+ peer deps (d3-array, d3-scale, d3-sankey, topojson-client, @floating-ui/dom, …) presentes en `window`, lo que hacía que `window.d3plus` se cargara como `{}` vacío y el renderer cayera en el fallback *"Tipo de gráfico no soportado"*.
- El bundle `full` (2 MB) embebe todas las dependencias y expone las 15 clases que usa el plugin: `BarChart`, `LinePlot`, `AreaPlot`, `StackedArea`, `Pie`, `Donut`, `Treemap`, `Geomap`, `Network`, `Tree`, `Sankey`, `Rings`, `BoxWhisker`, `Priestley`.

### 1.1.0
- Migrado a `@d3plus/core` v3.1.4 desde el CDN oficial (`cdn.jsdelivr.net/npm/@d3plus/core@3.1.4/umd/d3plus-core.js`).
- Renderer reescrito a la API v3 (chainable `.select()`, `.data()`, `.groupBy()`, etc.) con `.detectResize(true)` para responsive automático.
- `stacked_bar` ahora usa `BarChart` + `.stacked(true)` (en v3 no existe `StackedBarChart`).
- Cargador `waitForD3plus()` con timeout de 8 s y mensaje de error claro.
- CSS: `.tsg-chart` y `.tsg-preview__canvas` con altura explícita y SVG responsive al 100 %.
- Shortcode: añade `height` además de `min-height` para que el parent sea medible.

### 1.0.0
- Versión inicial.

## Licencia

GPL-2.0-or-later.
