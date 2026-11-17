# Calorías — PWA de registro de calorías y nutrientes

Aplicación web instalable (PWA) para llevar el registro personal de calorías,
macros y micronutrientes desde Chrome en Android. **Sin cuentas ni servidor**:
todos los datos se guardan solo en el dispositivo (IndexedDB).

- Escaneo de códigos de barras con la cámara (`BarcodeDetector`: EAN-13, EAN-8, UPC-A, UPC-E) y captura manual de respaldo.
- Datos de [Open Food Facts](https://world.openfoodfacts.org) por código y búsqueda por nombre en Open Food Facts y [USDA FoodData Central](https://fdc.nal.usda.gov).
- Alimentos manuales y edición de cualquier valor (por 100 g o por porción).
- Registro por comida (desayuno, comida, cena, snack) en gramos o porciones, con fecha y hora; edición, borrado (con “Deshacer”), recientes y favoritos.
- Metas calculadas con Mifflin-St Jeor × factor de actividad, déficit o superávit configurable, macros por kg de peso y fibra de 14 g/1000 kcal. Todas se pueden editar a mano.
- Registro de peso con gráfica, promedio móvil de 7 días y propuesta de recálculo de metas (pide confirmación).
- Gráficas (Chart.js): calorías por día, dona de macros, tendencia semanal y mensual, y micronutrientes frente a la meta.
- Funciona sin conexión, tiene modo oscuro y exporta e importa en JSON y CSV.

> Las metas son estimaciones generales y no sustituyen el consejo de un profesional de la salud.

## Estructura del proyecto

No hay paso de compilación: son módulos ES nativos que se sirven tal cual.

```
.
├── index.html               # Página única: barra superior, vista, navegación, FAB
├── manifest.webmanifest     # Manifest de la PWA (nombre, iconos, atajos)
├── sw.js                    # Service worker: precarga de la app y caché de imágenes
├── .nojekyll                # Para que GitHub Pages sirva los archivos tal cual
├── css/
│   └── styles.css           # Estilos mobile-first, variables de tema claro/oscuro
├── icons/                   # icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
├── vendor/
│   └── chart.umd.min.js     # Chart.js 4.4.7 (copia local para uso offline, licencia MIT)
└── js/
    ├── app.js               # Arranque, router por hash (#/hoy, #/buscar…), registro del SW
    ├── state.js             # Estado compartido (fecha, perfil, metas) y bus de eventos
    ├── db.js                # IndexedDB: alimentos, entradas, pesos, ajustes
    ├── nutrients.js         # Catálogo de nutrientes, unidades, escalado y sumas
    ├── goals.js             # Mifflin-St Jeor, actividad, objetivo, macros, valores de referencia
    ├── foods.js             # Búsqueda combinada (caché local + OFF + USDA), comidas
    ├── scanner.js           # Cámara + BarcodeDetector, validación del dígito de control
    ├── backup.js            # Exportar/importar JSON y CSV
    ├── charts.js            # Ayudantes de Chart.js con colores del tema
    ├── theme.js             # Tema automático/claro/oscuro
    ├── utils.js             # Fechas, formato, DOM, avisos, iconos
    ├── api/
    │   ├── openfoodfacts.js # Producto por código y búsqueda → modelo interno
    │   └── usda.js          # Búsqueda en FoodData Central → modelo interno
    └── views/
        ├── today.js         # Pantalla "Hoy": anillo, barras y comidas
        ├── search.js        # Alimentos: búsqueda, recientes, favoritos, crear manual
        ├── stats.js         # Gráficas
        ├── weight.js        # Peso, promedio móvil y recálculo de metas
        ├── profile.js       # Perfil, metas editables, tema, clave USDA, respaldo
        ├── foodDialogs.js   # Agregar al diario, editar entrada, editor de alimentos
        ├── scan.js          # Diálogo del escáner y flujo "producto no encontrado"
        └── sheet.js         # Hojas inferiores y confirmaciones (<dialog>)
```

### Modelo de datos (IndexedDB `calorias`)

| Almacén    | Clave            | Contenido |
|------------|------------------|-----------|
| `foods`    | `id` (`off:<código>`, `usda:<fdcId>`, `manual:<uuid>`) | nombre, marca, código, porción, `per100` (nutrientes por 100 g), favorito, último uso |
| `entries`  | `id` autoincremental, índice `date` | fecha, hora, comida, gramos, cantidad y unidad, y **copia** de `per100` (corregir un alimento después no altera el historial; desde “Editar entrada” se pueden aplicar los datos nuevos) |
| `weights`  | `date`           | kg |
| `settings` | `key`            | `profile`, `goalOverrides`, `theme`, `usdaKey` |

### Cálculo de metas

- **Basal (Mifflin-St Jeor):** hombre `10·kg + 6.25·cm − 5·edad + 5`; mujer `… − 161`.
- **Mantenimiento:** basal × 1.2 / 1.375 / 1.55 / 1.725 (sedentario, ligero, moderado, alto).
- **Objetivo:** bajar = −15 % y subir = +10 % por defecto, ajustable de 5 a 25 %.
- **Proteína:** 1.6 g/kg (0.8–2.2). **Grasa:** 0.8 g/kg (0.5–1.5). **Carbohidratos:** las calorías restantes ÷ 4.
- **Fibra:** 14 g por cada 1000 kcal. **Azúcares y grasa saturada:** máximo del 10 % de las kcal. **Sodio:** máximo 2300 mg.
- **Micronutrientes:** valores de referencia generales para adultos según sexo y edad (IOM/NASEM).

## Probar en local

Necesitas cualquier servidor estático (los módulos ES y el service worker no funcionan abriendo el archivo con `file://`).

```bash
# Opción 1: Python
python3 -m http.server 8080

# Opción 2: Node
npx serve -l 8080 .
```

Abre `http://localhost:8080` en Chrome de escritorio. `localhost` cuenta como
origen seguro, así que el service worker funciona. Con las DevTools en modo
dispositivo puedes simular el móvil. En Application → Manifest / Service Workers
puedes revisar la instalación.

### Probar en el teléfono Android (cámara incluida)

La cámara y el service worker exigen **HTTPS** (o `localhost`). Hay dos formas de cumplirlo:

1. **Redirección de puertos por USB (recomendado para desarrollo):**
   - En el teléfono, activa *Opciones de desarrollador → Depuración USB* y conéctalo al ordenador.
   - En Chrome de escritorio abre `chrome://inspect/#devices`, pulsa **Port forwarding** y añade `8080 → localhost:8080`.
   - En Chrome del teléfono abre `http://localhost:8080`. Como es `localhost`, la cámara y la instalación funcionan.
2. **Publicarlo en GitHub Pages** (ver abajo), que ya sirve por HTTPS.

> Si cambias archivos y no ves los cambios, es el service worker sirviendo la versión anterior. Sube `VERSION` en `sw.js` (la app mostrará “Nueva versión disponible → Actualizar”), o en DevTools → Application → Service Workers marca “Update on reload”.

## Publicar en GitHub Pages (HTTPS)

Todas las rutas son relativas (`./`), así que la app funciona igual en
`https://<usuario>.github.io/<repositorio>/`.

1. Sube el código a la rama que vas a publicar (por ejemplo, fusiona esta rama en `main`):
   ```bash
   git checkout main
   git merge claude/pwa-calorie-nutrition-tracker-r1iwv9
   git push origin main
   ```
2. En GitHub, ve a **Settings → Pages**.
3. En **Build and deployment → Source**, elige **Deploy from a branch**.
4. Selecciona la rama `main` y la carpeta `/ (root)`, y pulsa **Save**.
5. Espera uno o dos minutos. La URL aparecerá arriba de esa página, por ejemplo
   `https://black3241.github.io/Calorias/`. Marca **Enforce HTTPS** si aparece la opción (en `github.io` viene activado).
6. En el teléfono, abre la URL en Chrome y elige **Menú ⋮ → Instalar app** (o “Añadir a pantalla de inicio”).

**Para publicar una actualización:** cambia `VERSION` en `sw.js` (por ejemplo `v1.0.1`), haz commit y push. Al abrir la app instalada aparecerá el aviso para actualizar.

El archivo `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll.

## Notas

- **USDA:** sin clave se usa `DEMO_KEY`, que permite pocas búsquedas por hora. Consigue una clave gratuita en <https://api.data.gov/signup/> y guárdala en *Perfil → Ajustes*. Se guarda solo en el dispositivo.
- **Caché offline:** todo alimento que consultas, escaneas o registras se guarda en IndexedDB. Sin conexión puedes escanear productos ya vistos y buscar en “Mis alimentos”.
- **Persistencia:** la app pide almacenamiento persistente (`navigator.storage.persist()`) para que Chrome no borre los datos, pero **haz respaldos** (Perfil → Respaldo → Exportar JSON): si desinstalas la app o borras los datos del sitio, se pierde todo.
- **Formatos de respaldo:**
  - JSON: copia completa (alimentos, diario, pesos y ajustes). Al importar puedes *combinar* o *reemplazar todo*.
  - CSV: diario (nutrientes totales por entrada), peso y alimentos (valores por 100 g). Se reconocen al importarlos.
- **ml frente a g:** las porciones en ml se tratan como gramos, una aproximación habitual.
- **Calidad de los datos:** los datos de Open Food Facts son colaborativos y a veces están incompletos. La app avisa cuando faltan calorías o macros y permite corregirlos con “Editar datos”.
- Datos de alimentos: Open Food Facts (licencia ODbL) y USDA FoodData Central (dominio público). Chart.js con licencia MIT.
