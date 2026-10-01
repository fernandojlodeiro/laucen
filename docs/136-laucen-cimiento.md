# 136 — Laucen — Sesión 1: Cimiento del ERP / e-commerce

Fecha: 01/10/2026 · Autor: Cowork (sesión "Arquitectura e-commerce") · Para: Code, sesión "Cimiento"

Documento de referencia (visión completa, fases y sesiones): https://claude.ai/code/artifact/57f09d9f-5515-4f9d-bc4f-38f9d86ae579

Antes de empezar: leer AGENTS.md del repo entero y las entradas nuevas de la bitácora. Abrir en la bitácora un hilo raíz tipo `orden`, título "136 — Cimiento", `pide_lectura = true`, y responder ahí "Me encargo yo" antes de tocar código.

---

## 1. Qué es esta sesión y qué no es

Laucen deja de ser sólo el buscador de productos de China y pasa a ser el sistema de gestión de Fer: reemplaza a Virtual Seller (facturación, pedidos, stock, envíos) y es el backend de una tienda web propia. Son cinco sesiones de Code; **esta es la primera y corre sola**: construye la base de datos y la API sobre las que después trabajan en paralelo las sesiones de Mercado Libre, Tienda web y Depósito/Facturación.

**Esta sesión NO construye**: la integración con Mercado Libre (pedidos, stock, pausas, envíos), la tienda web, el picking con escaneo, la facturación contra ARCA, compras, cuentas corrientes, bancos, contabilidad. Todo eso lo hacen otras sesiones sobre lo que esta deja hecho. Si algo de esta orden hace falta para esas sesiones y no está contemplado acá, se anota en la bitácora y se agrega; no se adelanta trabajo de otras sesiones.

**Todo lo que se cree en esta sesión nace con**: columna `organizacion_id` (multi-cliente, el login multi-organización ya existe: `db/tenancy.ts`, `lib/tenancy.ts`), `ENABLE ROW LEVEL SECURITY` en la misma migración, importes guardados en pesos y en dólares (ver §3), y permisos de función según `lib/permisos.ts`.

Convenciones de interfaz, números, botones, edición en fila: las de AGENTS.md. No repetirlas acá.

## 2. Organización, usuarios y roles

Ya existe de CadaMes. No rehacer. Solo verificar que:

- Toda tabla nueva de esta orden lleva `organizacion_id` y sus políticas RLS filtran por organización.
- Existe al menos una pantalla mínima para que Fer vea usuarios y roles de su organización (si ya existe, no tocarla). Los permisos de las funciones nuevas (Productos, Listas de precios, Canales, Depósitos, Importar) se agregan a `FUNCIONES` en `lib/permisos.ts`.

Previsto para que el sistema se venda llave en mano a otras organizaciones; nada en el código debe asumir que la organización es la de Fer.

## 2 bis. Layout y menú de navegación (parte del cimiento)

Se arma **antes** que cualquier pantalla de esta orden, y todas las pantallas de esta y las próximas sesiones viven adentro. Es un punto de partida: Fer lo va a ajustar cuando lo vea; por eso tiene que ser fácil de reordenar (el árbol del menú en un solo archivo de configuración, `lib/menu.ts`, no desparramado en componentes).

**PC (modo principal):**
- **Barra de menú superior**, estilo Excel u otras aplicaciones de oficina: las secciones a lo largo de la barra, y al hacer clic (o pasar el mouse) cada una despliega sus opciones hacia abajo. No es menú lateral. Ocupa poco lugar en alto.
- **Pantalla de inicio = dashboard** de cuestiones pendientes de realizar (pedidos sin preparar, preguntas sin responder, stock por debajo del umbral, facturas pendientes, etc.). Qué datos exactos muestra se define después con Fer; en esta sesión se arma la estructura (tarjetas/paneles configurables) con dos o tres tarjetas reales que ya se puedan calcular con las tablas de esta orden (ej. pedidos por estado, productos bajo umbral) y el resto como "próximamente".
- **Barra de estado fija** (abajo o arriba, elegir y anotar en bitácora), siempre a la vista en todas las pantallas: moneda activa (pesos/dólares) con el interruptor, tipo de cambio del día, organización y usuario, y un lugar para contadores que las próximas sesiones van a prender (pedidos nuevos, preguntas sin responder).
- Buscador global en la barra superior (producto, pedido, cliente).

**Celular (modo aparte, no la misma pantalla achicada):** navegación pensada para operar desde el teléfono (el depósito va a hacer picking y recepción con la cámara, sesión 4). Barra inferior con 4–5 accesos directos a lo que se usa en el teléfono y menú completo detrás de un botón. En esta sesión alcanza con que el layout detecte el tamaño y conmute entre los dos modos; las pantallas de celular las llena cada sesión según necesite.

**Árbol del menú** (lo que existe hoy del buscador de China pasa a "Sourcing"; los ítems de módulos que todavía no existen se muestran deshabilitados con "próximamente", como dice AGENTS.md; cada ítem es una función con su permiso en el rol, `lib/permisos.ts`):

- **Panel** (dashboard)
- **Ventas**: Pedidos · Clientes · Envíos · Preguntas y mensajes · Reclamos y devoluciones
- **Catálogo**: Productos · Familias · Listas de precios · Publicaciones · Cucardas
- **Stock**: Depósitos y ubicaciones · Consulta de stock · Picking · Recepción · Ajustes
- **Compras**: Proveedores · Facturas de compra · Despachos de importación
- **Administración**: Facturación · Cuentas corrientes · Bancos · Caja · Contabilidad
- **Sourcing**: Radar · Importaciones ARCA · Búsqueda en China
- **Configuración**: Canales · Medios de pago · Reglas comerciales · Cuotas · Tipo de cambio · Usuarios y roles · Importar datos
- **Coordinación** (solo Fer, por mail, `lib/admin.ts`): Bitácora · Para probar

Los ítems que esta orden prende: Panel, Pedidos (listado y detalle), Clientes, Productos, Familias, Listas de precios, Publicaciones (ABM mínimo), Cucardas, Depósitos y ubicaciones, Consulta de stock, Ajustes, Canales, Tipo de cambio, Usuarios y roles (si ya existe), Importar datos, y los de Sourcing y Coordinación que ya existen.

## 3. Bimoneda y tipo de cambio

- Tabla `tipo_cambio` (`fecha`, `tipo` = oficial por ahora, `compra`, `venta`, `origen`, `organizacion_id` NULL = global). Un cron diario de Vercel levanta el tipo de cambio oficial por API y lo guarda; si la API falla, se reintenta y se anota en la bitácora como `pending`. Elegir una fuente pública estable (p. ej. la API del BCRA o dolarapi.com); dejarla configurable y anotar en la bitácora cuál quedó.
- Todo importe de precio o costo se guarda con tres columnas: `importe_ars`, `importe_usd`, `moneda_origen` (en cuál se cargó). Al cargar en una moneda, la otra se calcula con el tipo de cambio del día y se guarda; no se recalcula sola después (el histórico queda congelado).
- Helper único `lib/moneda.ts`: `convertir(importe, de, a, fecha?)` y formateo con punto de miles según `lib/numeros.ts`.
- Interruptor global de pantalla "ver en pesos / ver en dólares" (preferencia por usuario, guardada), que todas las pantallas de esta y las próximas sesiones respetan.

## 4. Modelo de productos (tres capas)

Objetivo: compatibilidad total con cómo Mercado Libre, Amazon y Alibaba manejan variaciones, y que lo mismo sirva en la tienda propia.

### 4.1 Familias
`familia` (jerárquica, `padre_id` opcional): nombre, descripción. Las familias portan valores por defecto que los productos heredan si no los sobreescriben: porcentaje de descuento sobre precio de lista, planes de cuotas (fase 1 sesión Tienda; dejar la columna preparada), cucardas.

### 4.2 Producto (padre)
`producto`: `sku_base`, título, descripción larga (texto/markdown), `familia_id`, marca, `tipo` ∈ {simple, con_variaciones, kit}, estado (activo/pausado/archivado), `codigo_barras` (si es simple), peso y dimensiones (largo, ancho, alto en cm; peso en g; necesarios para envíos), fotos (tabla `producto_foto` con orden y URL; almacenar en Supabase Storage), cucardas (tabla `cucarda` con ABM: nuevo, novedad, última unidad, etc.; y tabla puente `producto_cucarda` con vigencia desde/hasta), `descuento_pct` (NULL = hereda de familia), atributos genéricos (tabla `producto_atributo`: nombre, valor; libre).

### 4.3 Variaciones
`variacion`: `producto_id`, `sku`, `codigo_barras`, combinación de atributos (tabla `variacion_atributo`: nombre, valor — ej. color=rojo, talle=M), título propio opcional (si NULL, se arma "título del padre + atributos"), fotos propias (`variacion_foto`; si no tiene, usa las del padre), `descuento_pct` propio opcional, estado.

Regla: **un producto simple es un producto con exactamente una variación "default"** creada automáticamente. Así todo el resto del sistema (stock, precios, publicaciones, líneas de pedido) apunta siempre a `variacion_id`, nunca a `producto_id`. Esto es importante: no crear dos caminos.

### 4.4 Kits
`kit_componente`: `variacion_kit_id`, `variacion_componente_id`, cantidad. Un kit es un producto tipo `kit` con su variación default. Su stock no se guarda: se calcula como `min(stock_componente / cantidad)` por depósito. Al vender un kit, el movimiento de stock descuenta cada componente (lo implementa la función de stock de §7, no la sesión de Mercado Libre).

### 4.5 Publicaciones (capa canal)
`publicacion`: `variacion_id`, `canal_id`, `id_externo` (ej. MLA123…), título para ese canal (opcional, si NULL usa el de la variación), `categoria_externa`, `tipo_publicacion` (ej. clásica/premium), `atributos_externos` (JSONB: los atributos que exige la categoría de Mercado Libre, que cambian por categoría), estado en el canal (activa/pausada/cerrada), `ultima_sincronizacion_ts`, `umbral_pausa` (entero, por defecto 1: el canal pausa cuando el stock disponible llega a este número; NULL = usa el del producto; y en producto NULL = usa el de la organización, por defecto 1).

Esta sesión crea la tabla y el ABM mínimo; la lógica de sincronizar con Mercado Libre la hace la sesión 2.

## 5. Listas de precios

- `lista_precios`: nombre, moneda base (ARS/USD), estado, orden. Ejemplos que va a cargar Fer: "Mercado Libre", "Web minorista", "Mayorista", "Local".
- `precio`: `lista_id`, `variacion_id`, `importe_ars`, `importe_usd`, `moneda_origen`, `vigente_desde`. Precio de lista (el que se muestra tachado). El precio de venta = precio de lista × (1 − descuento_pct efectivo), donde el descuento efectivo se resuelve: variación → producto → familia → 0.
- Función `precioDe(variacion_id, lista_id, fecha?)` en `lib/precios/` que devuelve `{lista, descuentoPct, venta}` en ambas monedas. Es la única forma de obtener un precio en todo el sistema.
- Pantalla: grilla de precios por lista con edición en fila; carga masiva por porcentaje sobre otra lista ("Mayorista = Web − 25 %").

## 6. Canales

`canal`: nombre, `tipo` ∈ {mercadolibre, web_minorista, web_mayorista, local, otro}, `lista_precios_id`, estado, `config` (JSONB para credenciales/ids que carga la sesión de cada canal), `umbral_pausa_default`.

`canal_deposito`: `canal_id`, `deposito_id`, prioridad. El **stock disponible para un canal** = suma del stock disponible de sus depósitos. Un canal puede tener varios depósitos (ej. una cuenta de Mercado Libre que vende desde el depósito propio y desde Full).

ABM completo con la convención de interfaz de AGENTS.md. Cargar de entrada, como datos de ejemplo borrables: un canal por cada tipo.

## 7. Depósitos, ubicaciones y stock

- `deposito`: nombre, `tipo` ∈ {propio, full_ml, tercerizado, caja_abierta}, `usa_ubicaciones` (bool), dirección, estado.
- `ubicacion`: `deposito_id`, código (ej. "A-03-2"), descripción, orden de recorrido (entero, para que el picking futuro ordene por él). Un depósito con `usa_ubicaciones = false` tiene una única ubicación "default" creada sola (misma regla que la variación default: un solo camino).
- `stock`: `variacion_id`, `ubicacion_id`, `cantidad`, `reservado`. Disponible = cantidad − reservado. Un producto puede estar en varias ubicaciones.
- `movimiento_stock`: toda variación de stock pasa por acá, nunca un UPDATE directo a `stock`. Campos: `variacion_id`, `ubicacion_origen_id` (NULL en ingreso), `ubicacion_destino_id` (NULL en egreso), cantidad, `tipo` ∈ {ingreso, egreso, transferencia, ajuste, reserva, liberacion, venta, devolucion}, referencia (tipo + id: pedido, compra, ajuste manual…), usuario, fecha, nota.
- Función única `moverStock(...)` en `lib/stock/` que inserta el movimiento y actualiza `stock` en una transacción, resuelve kits (§4.4) y, si el disponible de un canal cae al umbral de pausa, **emite un evento** `stock_bajo_umbral(variacion_id, canal_id)` en una tabla `eventos` (ver §9). Esta sesión no pausa nada en Mercado Libre; sólo deja el evento para que lo consuma la sesión 2.
- Pantallas: ABM de depósitos y ubicaciones; consulta de stock por producto (qué hay en cada depósito/ubicación); ajuste manual de stock con motivo (crea un movimiento tipo `ajuste`).

## 8. Clientes y pedidos (endpoint único)

### 8.1 Clientes
`cliente`: nombre/razón social, `tipo` ∈ {consumidor_final, mayorista}, email, teléfono, documento (tipo + número: DNI/CUIT), condición IVA, direcciones (tabla `cliente_direccion`), `lista_precios_id` opcional (para mayoristas; si NULL usa la del canal), `usuario_id` opcional (si tiene cuenta en la tienda), `id_externo` por canal (tabla `cliente_identidad`: canal_id + id externo, para enlazar al mismo cliente que compra en dos cuentas de Mercado Libre). Nadie carga clientes a mano en operación normal: los crean los pedidos; pero el ABM existe para corregir datos (sobre todo fiscales, cuando el cliente avisa que los cargó mal).

### 8.2 Pedidos
- `pedido`: `canal_id`, `cliente_id`, `id_externo` (nº de orden de Mercado Libre o de la tienda), fecha, `estado` (ver abajo), moneda del pedido, totales en ambas monedas, `medio_pago` (texto/catálogo; el ABM de medios de pago lo hace la sesión Tienda), `estado_pago` ∈ {pendiente, pagado, a_convenir, reembolsado}, `deposito_id` asignado para prepararlo, datos de envío (JSONB por ahora; la sesión de envíos lo normaliza), notas.
- `pedido_linea`: `pedido_id`, `variacion_id`, cantidad, precio unitario en ambas monedas, descuento, título tal como se vendió (congelado).
- `pedido_estado_historial`: pedido, estado anterior, estado nuevo, usuario o `sistema`, fecha.

Estados: `nuevo → pagado → en_preparacion → preparado → despachado → entregado`, más `cancelado` y `devuelto` desde cualquiera. Función única `cambiarEstado(pedido_id, nuevo, quien)` que valida la transición, escribe el historial y dispara efectos (al pasar a `pagado`: reserva stock en el depósito asignado; a `despachado`: convierte reserva en venta; a `cancelado`: libera). Mercado Libre va a llamar a esta función automáticamente; la tienda web la llama el operador. Un solo camino.

### 8.3 API
Endpoint único `POST /api/pedidos` que recibe `{canal, cliente, lineas: [{variacion_id | sku, cantidad}], medio_pago, envio}` y crea cliente (si no existe, enlazado por `cliente_identidad`), pedido y líneas, resolviendo precios con `precioDe` según la lista del canal (o del cliente mayorista). Lo van a usar: carrito minorista, planilla mayorista, pedidos por WhatsApp, y la sincronización de Mercado Libre. Además: `GET /api/catalogo?canal=` (productos, variaciones, precios y stock disponible para ese canal, pensado para que la tienda lo consuma), `GET /api/pedidos/:id`, `POST /api/pedidos/:id/estado`.

Autenticación de la API: token por canal guardado en `canal.config` (la tienda web va a ser otro deploy de Vercel que habla con este backend; no asumir misma sesión).

## 9. Eventos

Tabla `evento`: tipo, payload JSONB, fecha, `procesado_ts`, `procesado_por`. Cola simple para que las sesiones siguientes reaccionen a cosas que pasan en el cimiento sin acoplarse: `stock_bajo_umbral`, `pedido_estado_cambiado`, `precio_cambiado`, `producto_cambiado`. Esta sesión sólo emite; nadie consume todavía.

## 10. Importación desde Excel (Virtual Seller)

Fer tiene más de 10 años de datos en Virtual Seller (ventas, clientes, productos) y los va a exportar a Excel. No tenemos el formato todavía.

- Módulo genérico `/importar`: subir .xlsx, elegir destino (productos, clientes, ventas históricas, stock inicial), mapear columnas del archivo a campos del sistema en una pantalla, guardar el mapeo con nombre para reutilizarlo, previsualizar las primeras 20 filas, ejecutar, y mostrar un informe de filas importadas / rechazadas con el motivo.
- Ventas históricas se importan como `pedido` + `pedido_linea` con `canal` = "histórico Virtual Seller" y estado `entregado`, sin tocar stock.
- Stock inicial se importa como movimientos tipo `ingreso` a la ubicación default del depósito propio.
- Dejar en la bitácora, cuando Fer suba el primer Excel, qué columnas trae y qué mapeo quedó guardado.

## 11. Orden de trabajo sugerido

1. Layout, barra de menú, barra de estado, dashboard vacío y conmutación PC/celular (§2 bis). Subirlo a main apenas ande, para que Fer lo vea y lo ajuste mientras se hace el resto.
2. Migraciones (`db/<módulo>.sql` idempotentes + `lib/<módulo>/esquema.ts`) en este orden: moneda → productos → precios → depósitos/stock → canales → clientes/pedidos → eventos → importación.
3. Funciones únicas: `convertir`, `precioDe`, `moverStock`, `cambiarEstado`, `POST /api/pedidos`. Con tests (en paralelo contra la misma base, según AGENTS.md).
4. Pantallas: Productos (con variaciones, kits, fotos, cucardas), Listas de precios, Canales, Depósitos/Ubicaciones/Stock, Clientes, Pedidos (sólo listado y detalle; nada de operación todavía), Importar.
5. Cron del tipo de cambio.
6. Interruptor pesos/dólares (ya en la barra de estado; conectarlo a todas las pantallas).

Cada paso que se sube a main: una fila en "para probar" y una entrada en la bitácora con qué quedó y qué queda abierto. Al terminar todo: "Terminado" en el hilo 136 y una entrada aparte con el **contrato de la API y de las funciones únicas** (firmas y ejemplos), porque es lo que van a leer las sesiones 2, 3 y 4 para arrancar sin releer este código.

## 12. Preguntas abiertas (para Fer, por la bitácora, no bloquean el arranque)

- Fuente del tipo de cambio oficial que prefiere (se arranca con una pública y se cambia si pide otra).
- Primer Excel de Virtual Seller para fijar el mapeo.
- Si quiere depósitos y ubicaciones cargados de verdad desde ahora (pasar los nombres) o seguir con datos de prueba.
