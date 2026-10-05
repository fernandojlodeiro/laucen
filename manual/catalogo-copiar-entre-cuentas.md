---
titulo: Copiar entre cuentas
menu: Catálogo › Copiar entre cuentas
ruta: /catalogo/publicaciones/copiar
rutas: /catalogo/publicaciones/copiar
permiso: publicaciones_ver
resumen: Ver en cuáles cuentas de Mercado Libre está cada producto y crear en otra cuenta las publicaciones que le faltan.
---

## Para qué sirve

Que las cinco cuentas de Mercado Libre tengan las mismas publicaciones. La pantalla muestra una fila por producto y una columna por cuenta (con el número de publicación y si está activa o pausada), y deja crear en otra cuenta las que le faltan, copiándolas de una cuenta que ya las tiene.

## Cómo se llega

Menú **Catálogo › Copiar entre cuentas**.

## Qué hay en la pantalla

- **Copiar desde / hacia**: la cuenta de origen y la de destino. Por defecto, BAIRES hacia TIENDAVIRTUAL S.
- **Publicaciones de origen**: sólo las activas (lo de siempre) o también las pausadas.
- **Mostrar**: sólo las que faltan en la cuenta de destino (lo de siempre) o todas.
- **Tipo**: todas, las que no son de catálogo o las de catálogo.
- **Buscador** por título o SKU, y títulos de columna que ordenan.
- **La grilla**: una casilla por producto (sólo se puede marcar si está activa en el origen, no es de catálogo, no tiene variaciones y todavía no está en el destino), el título, el SKU y una columna por cuenta. Un producto es el mismo en todas las cuentas si tiene el mismo SKU (sin el "DE-" de adelante) o, si no tiene SKU, el mismo título.
- **Variar el título** y **Cambiar la foto principal**: opciones para que la copia no sea idéntica. Variar el título deja la primera palabra donde está y pasa la segunda mitad del resto adelante. Cambiar la foto principal pasa la primera foto al final.

## Cómo se hace

### Copiar publicaciones a otra cuenta

1. Elegí la cuenta de origen y la de destino.
2. Filtrá o buscá los productos que te interesan y marcá las casillas (hasta 40 por vez).
3. Tildá si querés variar el título y/o la foto principal.
4. Apretá **Preparar copia**. El sistema comprueba cada publicación con Mercado Libre (sin publicar nada); las que Mercado Libre no acepta no entran y se avisa por qué.
5. Se abre el lote en la cola de Mercado Libre, **"Preparado, falta tu clic"**, con lo que se va a crear. Revisalo y apretá **Mandar a Mercado Libre**.
6. Al salir, cada publicación creada se trae a Laucen y se vincula sola con su producto por el SKU.

## Criterios y reglas

- **Nada sale a Mercado Libre sin tu clic** en el lote.
- **Qué se copia**: título (o su variante), categoría, precio, cantidad, tipo de publicación, condición, fotos, atributos, descripción, envío y condiciones de venta. **No se copia** lo propio de cada cuenta: tienda oficial, catálogo, Full/Flex, historial de ventas, opiniones ni preguntas. La publicación nueva arranca de cero.
- **Todas las publicaciones de estas cuentas son del modelo nuevo de Mercado Libre**: el título lo arma ML a partir del nombre de familia, por eso variar el título es variar ese nombre.
- **SKU**: la copia lleva **el mismo SKU** que la de origen, en todas las cuentas (sin prefijos). Para saber si un producto ya está en la otra cuenta se compara el SKU, ignorando un "DE-" viejo de adelante.
- **Envío**: la copia sale con Mercado Envíos 2 y nada más: el envío gratis (obligatorio por precio), su costo y el resto los decide Mercado Libre para esa cuenta. Si ML protesta por el envío, se vuelve a comprobar sin ese bloque. Los datos que ML calcula solo (medidas del paquete que fija ML, marca propia) no se mandan.
- **Modelo**: muchas publicaciones viejas no tienen el atributo Modelo en ML, y hoy ML lo exige en algunas categorías. Si falta, se usa el **Modelo del producto de Laucen** (pestaña Datos). Si tampoco está ahí, ML rechaza la copia con "El campo Modelo es obligatorio": cargalo en el producto y volvé a preparar.
- **Por qué rechaza ML**: al preparar la copia se muestra, publicación por publicación, lo que contesta Mercado Libre: cada causa con su tipo (error o aviso), los errores primero. Lo que ML rechaza no entra al lote.
- **No se duplica en una misma cuenta**: si el destino ya tiene un producto con ese SKU o ese título, la publicación no entra al lote.
- **Una publicación creada no se reintenta**: si el paso de la descripción falla después de crearla, queda como enviada con el aviso y se trae igual.
- **Por ahora no se copian** las de catálogo ni las que tienen variaciones: se arman aparte, porque cada cuenta tiene que ganar con un plan de cuotas distinto.

## Preguntas frecuentes

**¿Por qué no me deja marcar una publicación?** Porque no está activa en el origen, es de catálogo, tiene variaciones o ya está en la cuenta de destino.

## Relacionado

- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Cola de Mercado Libre](/config/canales/cola)
