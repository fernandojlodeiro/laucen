// Los campos del sistema que se pueden llenar desde un Excel, por destino
// (orden 136, §10). Cuando Fer suba el primer Excel de Virtual Seller, se
// ajusta ESTA lista: agregar un campo acá lo hace aparecer en la pantalla de
// mapeo; lo que hace cada campo al importar está en lib/importar/ejecutar.ts.
//
// `alias`: nombres de columna que se reconocen solos al subir el archivo
// (sin acentos ni mayúsculas), para que el mapeo arranque medio hecho.

export type Destino = "productos" | "clientes" | "ventas" | "stock";

export type Campo = {
  clave: string;
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: string;
  alias?: string[];
};

export const DESTINOS: Record<Destino, { nombre: string; ayuda: string; campos: Campo[] }> = {
  productos: {
    nombre: "Productos",
    ayuda: "Crea o actualiza productos por su SKU base (no duplica). Si la fila trae un SKU de variación distinto del SKU base, el producto queda con variaciones y se crea o actualiza esa variación.",
    campos: [
      { clave: "sku_base", etiqueta: "SKU base", obligatorio: true, alias: ["sku", "codigo", "cod", "sku base", "codigo producto", "articulo"] },
      { clave: "titulo", etiqueta: "Título", obligatorio: true, alias: ["titulo", "nombre", "descripcion corta", "producto", "detalle"] },
      { clave: "marca", etiqueta: "Marca", alias: ["marca"] },
      { clave: "descripcion", etiqueta: "Descripción", alias: ["descripcion", "descripcion larga"] },
      { clave: "codigo_barras", etiqueta: "Código de barras", alias: ["codigo de barras", "ean", "upc", "codigo barras", "barras"] },
      { clave: "familia", etiqueta: "Familia", ayuda: "Por nombre; si no existe, se crea.", alias: ["familia", "rubro", "categoria"] },
      { clave: "peso_g", etiqueta: "Peso (g)", alias: ["peso", "peso g", "peso gr"] },
      { clave: "largo_cm", etiqueta: "Largo (cm)", alias: ["largo"] },
      { clave: "ancho_cm", etiqueta: "Ancho (cm)", alias: ["ancho"] },
      { clave: "alto_cm", etiqueta: "Alto (cm)", alias: ["alto"] },
      { clave: "sku_variacion", etiqueta: "SKU de la variación", ayuda: "Vacío o igual al SKU base = producto simple.", alias: ["sku variacion", "sku hijo"] },
      { clave: "atributo_1", etiqueta: "Atributo 1 de la variación", ayuda: "El nombre de la columna es el atributo (ej. Color) y la celda, su valor.", alias: ["color"] },
      { clave: "atributo_2", etiqueta: "Atributo 2 de la variación", ayuda: "Ídem (ej. Talle).", alias: ["talle", "medida"] },
      { clave: "atributo_3", etiqueta: "Atributo 3 de la variación" },
      { clave: "precio", etiqueta: "Precio de lista", alias: ["precio", "precio lista", "precio de lista", "pvp"] },
      { clave: "lista", etiqueta: "Lista de precios", ayuda: "Por nombre; si no existe, se crea. Vacío = la primera lista.", alias: ["lista", "lista de precios"] },
      { clave: "moneda", etiqueta: "Moneda del precio", ayuda: "ARS o USD (también $, pesos, US$, dólares). Vacío = la de la lista.", alias: ["moneda"] },
    ],
  },
  clientes: {
    nombre: "Clientes y proveedores",
    ayuda: "Las filas cuyo Tipo dice \"Proveedor\" van a Proveedores (Compras); \"mayorista\" queda como cliente mayorista; el resto, clientes. Un cliente se busca si ya existe por CUIT, DNI, apodo de Mercado Libre o mail (en ese orden): si existe lo completa, si no lo crea. Nunca borra un dato que ya estaba. Toda la fila original queda guardada en la ficha (datos de Virtual Seller), aunque una columna no tenga campo propio.",
    campos: [
      { clave: "nombre", etiqueta: "Nombre (de la cuenta)", obligatorio: true, ayuda: "Si viene como \"Apellido, Nombre\", se separan apellido y nombre.", alias: ["nombre de la cuenta", "nombre", "cliente", "apellido y nombre", "nombre y apellido"] },
      { clave: "razon_social", etiqueta: "Razón social", alias: ["denominacion y razon social", "razon social", "denominacion"] },
      { clave: "tipo", etiqueta: "Tipo", ayuda: "Cliente / Cliente mayorista / Proveedor (Virtual Seller). Los proveedores van a su propia tabla.", alias: ["tipo", "tipo cliente"] },
      { clave: "condicion_iva", etiqueta: "Condición IVA", ayuda: "CF, RI, M (monotributo), E (exento), NR, o el texto completo.", alias: ["categoria iva", "condicion iva", "iva", "cond iva", "situacion iva"] },
      { clave: "cuit", etiqueta: "CUIT (identificación tributaria)", ayuda: "Con o sin guiones: queda como 20-12345678-9.", alias: ["identificacion tributaria", "cuit", "cuil"] },
      { clave: "documento_tipo", etiqueta: "Tipo de documento", ayuda: "DNI, CUIT, CUIL, PASAPORTE u OTRO. Vacío = se deduce del número.", alias: ["tipo documento", "tipo doc"] },
      { clave: "documento_numero", etiqueta: "Número de documento", ayuda: "Los de relleno (1111111, 0) se ignoran.", alias: ["nro documento", "documento", "dni", "numero documento", "doc"] },
      { clave: "apodo_ml", etiqueta: "Apodo de Mercado Libre", ayuda: "Sirve para reconocerlo cuando vuelva a comprar en ML.", alias: ["apodo mlibre", "apodo ml", "nickname", "apodo"] },
      { clave: "email", etiqueta: "Mail", alias: ["correo electronico", "email", "mail", "e-mail", "correo"] },
      { clave: "telefono", etiqueta: "Teléfono", alias: ["telefono", "tel"] },
      { clave: "telefono_movil", etiqueta: "Celular", alias: ["movil", "celular", "whatsapp"] },
      { clave: "calle", etiqueta: "Dirección (calle y número)", ayuda: "La dirección principal (fiscal).", alias: ["direccion", "calle", "domicilio"] },
      { clave: "numero", etiqueta: "Número (altura), si viene aparte", alias: ["numero", "altura"] },
      { clave: "localidad", etiqueta: "Localidad", alias: ["ciudad de correo", "localidad", "ciudad"] },
      { clave: "provincia", etiqueta: "Provincia", alias: ["estado o provincia de correo", "provincia"] },
      { clave: "codigo_postal", etiqueta: "Código postal", alias: ["codigo postal", "cp", "cod postal"] },
      { clave: "pais", etiqueta: "País", alias: ["pais de correo", "pais"] },
      { clave: "direccion_envio", etiqueta: "Dirección de envío", ayuda: "Si es distinta de la principal, queda como segunda dirección (Envío).", alias: ["direccion envio", "direccion de envio"] },
      { clave: "notas", etiqueta: "Observaciones", alias: ["observaciones especiales", "observaciones", "notas"] },
    ],
  },
  ventas: {
    nombre: "Ventas históricas",
    ayuda: "Cada nº de venta es un pedido (varias filas con el mismo nº = varias líneas). Entran como entregados en el canal \"Histórico Virtual Seller\", sin tocar el stock. Se convierten con el tipo de cambio de la fecha de cada venta.",
    campos: [
      { clave: "id_externo", etiqueta: "Nº de venta", obligatorio: true, alias: ["nro venta", "numero venta", "venta", "nro", "comprobante", "nro comprobante", "factura", "pedido"] },
      { clave: "fecha", etiqueta: "Fecha", obligatorio: true, alias: ["fecha", "fecha venta"] },
      { clave: "cliente_nombre", etiqueta: "Cliente (nombre)", alias: ["cliente", "nombre", "razon social"] },
      { clave: "cliente_documento", etiqueta: "Cliente (documento)", alias: ["documento", "dni", "cuit"] },
      { clave: "cliente_email", etiqueta: "Cliente (mail)", alias: ["email", "mail"] },
      { clave: "sku", etiqueta: "SKU", obligatorio: true, alias: ["sku", "codigo", "articulo", "cod"] },
      { clave: "cantidad", etiqueta: "Cantidad", obligatorio: true, alias: ["cantidad", "cant", "unidades"] },
      { clave: "precio_unitario", etiqueta: "Precio unitario", obligatorio: true, alias: ["precio", "precio unitario", "unitario", "p unitario"] },
      { clave: "moneda", etiqueta: "Moneda", ayuda: "ARS o USD. Vacío = pesos.", alias: ["moneda"] },
      { clave: "medio_pago", etiqueta: "Medio de pago", alias: ["medio de pago", "forma de pago", "pago"] },
    ],
  },
  stock: {
    nombre: "Stock inicial",
    ayuda: "Cada fila es un ingreso de stock (se suma a lo que haya). Va a la ubicación general del primer depósito propio, salvo que la fila diga otro depósito o ubicación.",
    campos: [
      { clave: "sku", etiqueta: "SKU", ayuda: "SKU o código de barras: con uno alcanza.", alias: ["sku", "codigo", "articulo", "cod"] },
      { clave: "codigo_barras", etiqueta: "Código de barras", alias: ["codigo de barras", "ean", "barras"] },
      { clave: "cantidad", etiqueta: "Cantidad", obligatorio: true, alias: ["cantidad", "stock", "existencia", "cant", "unidades"] },
      { clave: "deposito", etiqueta: "Depósito", ayuda: "Por nombre. Vacío = el primer depósito propio.", alias: ["deposito"] },
      { clave: "ubicacion", etiqueta: "Ubicación", ayuda: "Código de la ubicación en ese depósito. Vacío = la general.", alias: ["ubicacion"] },
    ],
  },
};

/** Cómo se muestra el estado de una importación: [texto, color]. */
export const ESTADOS_IMPORTACION = {
  leido: ["Para mapear", "azul"], ejecutando: ["A medias", "amarillo"], terminado: ["Terminada", "verde"], con_errores: ["Con rechazos", "rojo"],
} as const;

export const esDestino = (x: unknown): x is Destino => typeof x === "string" && Object.hasOwn(DESTINOS, x);

/** "Código de Barras " → "codigo de barras" (para comparar nombres de columna). */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[._\-/º°#:]+/g, " ").replace(/\s+/g, " ").trim();
}

/** El mapeo que se adivina por los nombres de columna: {campo: columna}. */
export function mapeoSugerido(destino: Destino, columnas: string[]): Record<string, string> {
  const libres = new Map(columnas.map((c) => [normalizar(c), c]));
  const r: Record<string, string> = {};
  for (const campo of DESTINOS[destino].campos) {
    for (const a of [normalizar(campo.etiqueta), normalizar(campo.clave), ...(campo.alias ?? []).map(normalizar)]) {
      const col = libres.get(a);
      if (col) { r[campo.clave] = col; libres.delete(a); break; }
    }
  }
  return r;
}

/** Los obligatorios que faltan mapear. En stock, además, SKU o código de barras. */
export function faltanObligatorios(destino: Destino, mapeo: Record<string, string>): string[] {
  const faltan = DESTINOS[destino].campos.filter((c) => c.obligatorio && !mapeo[c.clave]).map((c) => c.etiqueta);
  if (destino === "stock" && !mapeo.sku && !mapeo.codigo_barras) faltan.unshift("SKU o código de barras");
  return faltan;
}
