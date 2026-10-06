# Store Floorplan Prototype

Prototipo de un editor 2D/3D para definir el plano semántico de una tienda. El usuario edita en 2D y puede cambiar a una vista 3D derivada del mismo documento, dejando el modelo listo como fuente de datos para futuros mapas de calor o simulaciones de recorridos.

## Decisión técnica

**Stack:** React + TypeScript + Vite + SVG + Three.js + Zustand + Immer + i18next + pnpm.

La UI vive en React, mientras que el documento editable vive en un store independiente. El plano usa coordenadas reales en metros y no píxeles. El render 2D se hace con SVG; la vista 3D se genera con Three.js a partir del MISMO documento, sin mantener un segundo plano duplicado.

### Por qué i18n sí tiene sentido aquí

Las claves semánticas no se traducen en el JSON. Por ejemplo, una zona se almacena como:

```json
{
  "category": "footwear",
  "name": "Sneakers premium"
}
```

La interfaz puede mostrar **Calzado** o **Footwear** según el idioma, pero la categoría estable sigue siendo `footwear`. Esto evita acoplar el motor de heatmap/simulación al idioma visible.

## Gestor de paquetes: por qué pnpm

Este proyecto usa **pnpm** en lugar de npm. Para este prototipo es el punto medio más conveniente:

- reutiliza un almacén global de paquetes y evita duplicar dependencias innecesariamente en disco;
- suele instalar dependencias más rápido, especialmente al trabajar con varios proyectos;
- mantiene resolución estricta de dependencias, reduciendo dependencias "fantasma";
- conserva el runtime estándar de Node + Vite, por lo que no cambia el código React ni añade una dependencia de runtime específica de Bun;
- funciona bien en GitHub Actions y en equipos Windows.

**Bun también es compatible con Vite y es muy rápido instalando paquetes**, pero para este repositorio se mantiene Node como runtime y pnpm como gestor para minimizar cambios y riesgo de compatibilidad. Bun puede evaluarse más adelante si se desea medir tiempos reales de instalación/build.

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
- Cambio 2D/3D desde la barra superior.
- Muros extruidos con grosor y altura reales.
- Áreas convertidas a superficies 3D con el mismo color semántico/heatmap.
- Objetos del catálogo representados en 3D con altura editable.
- Cámara orbital con zoom/pan y reencuadre.
- Selección por clic en 3D sincronizada con el panel de propiedades.

No incluye todavía:

- Reconocimiento automático de muros/áreas desde una imagen.
- Importación de PDF/DXF/DWG.
- Conversión de DXF arbitrario a muros semánticos.
- Calibración de escala sobre una imagen de referencia.
- Puertas/ventanas ancladas a muros y perforaciones reales en 3D.
- Simulación de agentes o analítica real de heatmap.

Esas funciones quedan como siguientes incrementos, sin contaminar el contrato de datos del prototipo.

## Modelo de datos

El documento se guarda con `schemaVersion: 2` y conserva unidades reales:

```ts
FloorPlanDocument {
  schemaVersion: 2
  units: 'm'
  widthM: number
  heightM: number
  gridSizeM: number
  walls: Wall[]       // thicknessM + heightM
  areas: Area[]       // semántica + heatValue
  fixtures: Fixture[] // widthM + lengthM + heightM + rotationDeg
  background?: BackgroundPlan
}
```

La versión 2 añade las alturas necesarias para levantar el modelo. El importador sigue aceptando proyectos `schemaVersion: 1` y completa alturas por defecto, así que los JSON anteriores no se pierden. Cada `Area` conserva `category`, `walkable`, `attractiveness` y `heatValue`.

## Ejecutar localmente con pnpm

Requisito recomendado: **Node.js 22.12 o superior**. Este repositorio fija **pnpm 12.9.0** mediante `packageManager` para que todos trabajen con la misma versión.

### Primera vez en el equipo

Con Node 22 puedes usar Corepack:

```bash
corepack enable
corepack prepare pnpm@12.9.0 --activate
pnpm --version
```

Si `corepack enable` requiere permisos de administrador en Windows, puedes instalar pnpm globalmente como alternativa:

```bash
npm install -g pnpm@12.9.0
```

### Instalar y ejecutar

```bash
pnpm install
pnpm run dev
```

La primera instalación generará `pnpm-lock.yaml`. **Conviene subir ese archivo a GitHub** para que futuras instalaciones sean reproducibles.

Vite mostrará la URL local, normalmente `http://localhost:5173`.

Para validar un build:

```bash
pnpm run build
pnpm run preview
```

> Cambiar de npm a pnpm mejora principalmente la instalación, el uso de disco, la caché y la consistencia de dependencias. No hace que el JavaScript de React sea automáticamente más rápido en el navegador.

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

## Vista 3D

En la barra superior usa el conmutador **2D / 3D**. La vista 3D es deliberadamente una visualización derivada: el usuario sigue creando geometría en 2D y Three.js transforma ese mismo estado en una escena tridimensional.

Controles:

- arrastrar con botón izquierdo: orbitar;
- rueda: zoom;
- botón derecho + arrastrar: desplazar;
- clic corto sobre muro/área/objeto: seleccionar;
- **Reencuadrar**: vuelve a una cámara general del local.

El mapa de calor también se refleja en el suelo 3D cuando se activa **Vista mapa de calor**.

### Referencia de arquitectura: react-planner

Se tomó como referencia conceptual `devksingh4/react-planner` (MIT), especialmente su separación entre escena 2D y `viewer3d`. En ese proyecto, `viewer3d.js` crea `WebGLRenderer`, cámara perspectiva, `OrbitControls` y raycasting; `scene-creator.js` levanta la escena desde el estado; `wall-factory-3d.js` extruye muros y `area-factory-3d.js` convierte polígonos en superficies.

Este prototipo NO integra su código legado ni sus dependencias React 16/Redux/Immutable. Reimplementa el mismo patrón con React moderno + Zustand + Three.js, manteniendo nuestro modelo semántico propio.

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
7. `feat: add Three.js 3D floorplan viewer`
8. `chore: add GitHub build workflow`

## CI en GitHub

Se incluye `.github/workflows/build.yml`. En cada push o Pull Request GitHub instala pnpm 12.9.0, instala las dependencias y ejecuta `pnpm run build`.

Mientras el repositorio aún no tenga `pnpm-lock.yaml`, el workflow usa `pnpm install --no-frozen-lockfile`. Después de ejecutar `pnpm install` localmente y subir el lockfile, se puede endurecer el CI a `pnpm install --frozen-lockfile`.

## Próximos incrementos recomendados

1. Calibración de escala sobre la imagen: seleccionar dos puntos, indicar distancia real y obtener px/metro.
2. Puertas como objetos anclados a un muro mediante offset normalizado `0..1` y apertura 3D.
3. Detección de ciclos de muros para derivar habitaciones automáticamente.
4. Separar `authoring model` y `navigation model` (rejilla de ocupación).
5. Alimentar `heatValue` desde datos reales y mover la vista de simulación a Canvas/WebGL.
6. Solo después evaluar DXF/PDF o reconocimiento automático de planos.

## Estructura

```text
src/
  components/
    FloorPlanCanvas.tsx
    FloorPlan3D.tsx
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
