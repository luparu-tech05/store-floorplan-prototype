# Store Floorplan Prototype

Prototipo de un editor 2D para definir el plano semántico de una tienda y dejarlo listo como fuente de datos para una futura visualización de mapa de calor o simulación de recorridos.

## Decisión técnica

**Stack:** React + TypeScript + Vite + SVG + Zustand + Immer + i18next.

La UI vive en React, mientras que el documento editable vive en un store independiente. El plano usa coordenadas reales en metros y no píxeles. El render 2D se hace con SVG porque el alcance es de cientos de entidades, no miles de objetos animados.

### Por qué i18n sí tiene sentido aquí

Las claves semánticas no se traducen en el JSON. Por ejemplo, una zona se almacena como:

```json
{
  "category": "footwear",
  "name": "Sneakers premium"
}
```

La interfaz puede mostrar **Calzado** o **Footwear** según el idioma, pero la categoría estable sigue siendo `footwear`. Esto evita acoplar el motor de heatmap/simulación al idioma visible.

## Alcance del MVP

Incluye:

- Crear un plano vacío.
- Dibujar muros con snapping a rejilla y a extremos de muros existentes.
- Dibujar áreas poligonales y asignarles categoría semántica.
- Editar nombre, transitabilidad, atractivo e intensidad de calor de prueba.
- Seleccionar y eliminar muros/áreas.
- Pan, zoom y ajuste a vista completa.
- Undo/redo.
- Cargar PNG, JPG o SVG como plano de referencia bloqueado.
- Exportar el proyecto completo a JSON.
- Importar un JSON creado por el editor y recuperarlo como plano editable.
- Autosalvar el último borrador en `localStorage`.
- Cambiar la interfaz entre español e inglés con i18next.
- Vista opcional de "heat map preview" usando el valor manual `heatValue` de cada área.

No incluye todavía:

- Reconocimiento automático de muros/áreas desde una imagen.
- Importación de PDF/DXF/DWG.
- Conversión de DXF arbitrario a muros semánticos.
- Calibración de escala sobre una imagen de referencia.
- Puertas/ventanas ancladas a muros.
- Simulación de agentes o analítica real de heatmap.

Esas funciones quedan como siguientes incrementos, sin contaminar el contrato de datos del prototipo.

## Modelo de datos

El documento se guarda con `schemaVersion: 1` y conserva unidades reales:

```ts
FloorPlanDocument {
  schemaVersion: 1
  units: 'm'
  widthM: number
  heightM: number
  gridSizeM: number
  walls: Wall[]
  areas: Area[]
  background?: BackgroundPlan
}
```

Cada `Area` tiene `category`, `walkable`, `attractiveness` y `heatValue`. De esta forma, el editor ya produce información consumible por una fase posterior.

## Ejecutar localmente

Requisito recomendado: **Node.js 22.12 o superior**.

```bash
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

Para validar un build:

```bash
npm run build
npm run preview
```

## Cómo usar el prototipo

### 1. Crear desde cero

Selecciona **Crear plano nuevo**. Usa:

- `Muro`: primer clic = inicio, segundo clic = fin.
- `Área`: clic para cada vértice; cierra tocando el primer punto o presionando `Enter`.
- `Seleccionar`: permite elegir muros o áreas y editar propiedades.
- `Mover vista`: arrastra el lienzo.
- Rueda del mouse: zoom.
- `Esc`: cancela el dibujo que está en curso.
- `Ctrl/Cmd + Z`: undo.
- `Delete`: elimina la selección.

### 2. Partir de un plano existente

Selecciona **Usar plano de referencia** y carga PNG/JPG/SVG. La imagen queda como capa de fondo bloqueada y el usuario crea la geometría semántica encima.

Esto es intencional: una imagen no contiene automáticamente el concepto de "muro", "caja" o "calzado". Reconocer esa semántica exige otro pipeline de visión/vectorización.

### 3. Continuar un plano ya creado

Usa **Exportar JSON**. Ese archivo es el formato nativo de este prototipo. Luego, con **Importar JSON**, el editor reconoce el documento y recupera muros, áreas y propiedades de forma editable.

`public/sample-store.floorplan.json` sirve como ejemplo.

## Flujo recomendado en GitHub

### Primera publicación

```bash
git init
git add .
git commit -m "feat: bootstrap semantic floorplan editor prototype"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/store-floorplan-prototype.git
git push -u origin main
```

Si usas GitHub CLI y ya iniciaste sesión:

```bash
gh repo create store-floorplan-prototype --private --source=. --remote=origin --push
```

### Subir adelantos sin convertir `main` en un experimento

Para cada incremento:

```bash
git switch -c feat/semantic-areas
# realizar cambios
git add .
git commit -m "feat: add semantic store areas"
git push -u origin feat/semantic-areas
```

Luego abre un Pull Request hacia `main`. Para un prototipo académico o de investigación, esta secuencia deja una trazabilidad mucho mejor que subir todo en un único commit.

### Historial de avances sugerido

1. `feat: bootstrap React SVG floorplan editor`
2. `feat: add wall drawing and grid snapping`
3. `feat: add semantic polygon areas`
4. `feat: add project import export and background plan`
5. `feat: add bilingual UI with i18next`
6. `feat: add heatmap-ready area properties`
7. `chore: add GitHub build workflow`

## CI en GitHub

Se incluye `.github/workflows/build.yml`. En cada push o Pull Request GitHub instala dependencias y ejecuta `npm run build`.

## Próximos incrementos recomendados

1. Calibración de escala sobre la imagen: seleccionar dos puntos, indicar distancia real y obtener px/metro.
2. Puertas como objetos anclados a un muro mediante offset normalizado `0..1`.
3. Detección de ciclos de muros para derivar habitaciones automáticamente.
4. Separar `authoring model` y `navigation model` (rejilla de ocupación).
5. Alimentar `heatValue` desde datos reales y mover la vista de simulación a Canvas/WebGL.
6. Solo después evaluar DXF/PDF o reconocimiento automático de planos.

## Estructura

```text
src/
  components/
    FloorPlanCanvas.tsx
    PropertiesPanel.tsx
    StartScreen.tsx
    StatusBar.tsx
    ToolPalette.tsx
    TopBar.tsx
  store/
    useFloorPlanStore.ts
  types/
    floorplan.ts
  utils/
    files.ts
    geometry.ts
  App.tsx
  i18n.ts
  main.tsx
  styles.css
```

## Nota sobre reconocimiento

En este MVP, **"reconocer un plano ya creado" significa reconocer el JSON nativo del editor** y reconstruir su modelo editable. Una imagen existente se trata como referencia visual. Esta distinción es importante para no prometer reconocimiento semántico automático donde solo existen píxeles.
