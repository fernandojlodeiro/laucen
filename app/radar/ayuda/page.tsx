import Link from "next/link";
import { GRUPOS, FUENTE_GRUPOS, type Grupo } from "@/lib/radar/base";
import { FUENTES_APIFY } from "@/lib/radar/config";

// Ayuda del Radar: qué significa cada símbolo, cada interruptor y cada
// proceso, en palabras simples. Pedido de Fer: "si pasa una semana y vengo,
// que esté escrito qué hacía cada cosa". Si cambia el comportamiento de algo
// del Radar, se actualiza acá en el mismo cambio.

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border border-[#E3E9F0] rounded-lg bg-white p-4 scroll-mt-4">
      <h2 className="text-sm font-bold mb-2">{titulo}</h2>
      <div className="text-sm text-[#2b3945] grid gap-2">{children}</div>
    </section>
  );
}

function Simbolo({ s, children }: { s: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-3 items-start">
      <span className="text-center">{s}</span>
      <span>{children}</span>
    </div>
  );
}

const pista = (p: boolean) => (
  <span className={`relative inline-flex h-5 w-9 items-center rounded-full ${p ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ${p ? "translate-x-4" : "translate-x-0.5"}`} />
  </span>
);

export default function Ayuda() {
  return (
    <div className="grid gap-4">
      <nav className="text-xs flex flex-wrap gap-x-3 gap-y-1">
        {[["simbolos", "Símbolos"], ["seguir", "Seguir una categoría"], ["grupos", "Los dos rankings"],
          ["publicaciones", "Ver publicaciones y Apify"], ["propias", "Mis palabras"], ["automatico", "Lo que corre solo"], ["historial", "Historial"],
          ["datos", "De dónde salen los datos"]].map(([id, t]) => (
          <a key={id} href={`#${id}`} className="text-[#16577F] underline">{t}</a>
        ))}
      </nav>

      <Seccion id="simbolos" titulo="Símbolos">
        <Simbolo s={<span className="text-[#C98A00]">★</span>}>Seguís esa categoría (ver “Seguir una categoría”). Tocala para dejar de seguirla.</Simbolo>
        <Simbolo s={<span className="text-[#9AA7B3]">☆</span>}>No la seguís. Tocala para seguirla. Está en la lista de subcategorías y en el Historial.</Simbolo>
        <Simbolo s={pista(true)}><b>Seguir esta categoría</b>: lo mismo que la estrella, para la categoría en la que estás parado.</Simbolo>
        <Simbolo s={pista(false)}><b>Profundizar automático</b>: sólo en categorías que seguís. Ver “Lo que corre solo”. Cuesta plata (Apify).</Simbolo>
        <Simbolo s={<span className="text-[10px] font-bold rounded px-1 bg-[#EEF7F1] text-[#1F6E4A]">NUEVA</span>}>La palabra no estaba en ese ranking en la lectura anterior de esa categoría.</Simbolo>
        <Simbolo s={<span className="text-[#1F6E4A]">▲3</span>}>Subió 3 lugares dentro de su ranking desde la lectura anterior.</Simbolo>
        <Simbolo s={<span className="text-[#C03420]">▼2</span>}>Bajó 2 lugares.</Simbolo>
        <Simbolo s={<span className="text-[#9AA7B3]">=</span>}>Quedó en el mismo lugar.</Simbolo>
        <Simbolo s={<span className="text-[10px] rounded px-1.5 py-0.5 bg-[#F1F3F5] border border-[#DCE2E8]">👁 vista</span>}>
          Alguien de tu organización ya miró las publicaciones de esa palabra (cualquier semana). Dice cuándo y quién; la fila queda en gris. Tocala para verlo en el Historial.
        </Simbolo>
        <Simbolo s={<span className="inline-block w-4 h-4 rounded-full border border-[#9AA7B3] text-[10px] leading-4">i</span>}>Al lado de cada ranking: pasá el mouse (o tocala) y explica la regla de ese ranking.</Simbolo>
        <Simbolo s="🤖">Lo hizo el proceso automático, no una persona.</Simbolo>
        <Simbolo s="✍">Palabra propia: la escribió alguien en “Buscar mis palabras” (no vino de las tendencias).</Simbolo>
      </Seccion>

      <Seccion id="seguir" titulo="Seguir una categoría (★ o el interruptor “Seguir”)">
        <p>Seguir una categoría hace exactamente tres cosas; todo lo demás funciona igual la sigas o no:</p>
        <ol className="list-decimal pl-5 grid gap-1">
          <li><b>Se lee sola todas las semanas</b>, entres o no, y queda la historia completa para comparar semana contra semana. Una que no seguís se lee sólo las semanas en que entrás (puede tener huecos).</li>
          <li><b>Aparece en “Mis categorías seguidas”</b>, con el resumen de la semana: palabras nuevas, las que subieron y las que salieron.</li>
          <li><b>Habilita “Profundizar automático”</b> (en las que no seguís, ese interruptor está apagado y no se puede prender).</li>
        </ol>
        <p>La estrella y el interruptor “Seguir esta categoría” son lo mismo: la estrella sirve para seguir una subcategoría sin entrar; el interruptor, para la categoría en la que estás.</p>
      </Seccion>

      <Seccion id="grupos" titulo="Los dos rankings (pestañas de Tendencias)">
        {(Object.keys(GRUPOS) as Grupo[]).map((g) => (
          <div key={g}>
            <b>{GRUPOS[g].label}</b>
            <ul className="list-disc pl-5">{GRUPOS[g].regla.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ))}
        <p className="text-xs text-[#5C6B76]">{FUENTE_GRUPOS}</p>
        <p>Nada se pisa: cada semana que se lee una categoría queda guardada como una lectura aparte. Las comparaciones (NUEVA, ▲, ▼) son contra la lectura anterior de esa misma categoría.</p>
      </Seccion>

      <Seccion id="publicaciones" titulo="Ver publicaciones y Mejorar con Apify">
        <p><b>Ver publicaciones</b> (gratis): pregunta a la API oficial de Mercado Libre. Trae productos de catálogo con su precio más bajo, vendedor y foto. <b>No trae cantidad vendida</b> ni publicaciones sueltas (fuera de catálogo).</p>
        <p><b>Mejorar con Apify</b> (pago): lee la página de Mercado Libre como si fuera una persona y trae lo que ves ahí: precio, <b>vendidos</b> (en rangos: “+100”), opiniones, vendedor, foto. Cuesta aprox. {Object.values(FUENTES_APIFY).map((f) => `USD ${f.costoPorPalabra.toFixed(2)} (${f.label.split(" ")[0]})`).join(" o ")} por palabra.</p>
        <p>Una misma palabra no se vuelve a buscar (ni a pagar) en la misma semana: se muestra lo guardado. Hay un <b>tope de gasto semanal</b> de Apify (Configuración); al llegar, no deja buscar más hasta el lunes.</p>
      </Seccion>

      <Seccion id="propias" titulo="✍ Buscar mis palabras y palabras seguidas">
        <p>Arriba de los rankings, en Tendencias, está <b>“Buscar mis palabras”</b>: escribís cualquier cosa (no hace falta que esté en las tendencias) y la buscás gratis o con Apify, igual que una palabra de la lista. Si estás dentro de una categoría, la búsqueda queda asociada a esa categoría; si estás en “Todo Mercado Libre”, queda suelta.</p>
        <p>Queda en el Historial con la marca <b>✍ palabra propia</b>.</p>
        <p>Ojo: esa ★ es de la <b>palabra</b>, no de una categoría (dice “Seguir esta palabra”). Con ella la seguís: aparece en “Mis categorías seguidas” → “Mis palabras seguidas”, y los días del proceso automático se vuelve a buscar sola con Apify (cuesta lo mismo que una búsqueda con Apify, dentro del tope semanal). Así ves cómo cambian su precio y sus vendidos con el tiempo.</p>
      </Seccion>

      <Seccion id="automatico" titulo="Lo que corre solo (el proceso diario)">
        <p>Todos los días a las <b>8:00</b> la app se despierta y hace lo que le toque según Configuración:</p>
        <ul className="list-disc pl-5 grid gap-1">
          <li><b>Leer tendencias</b> (gratis, cada 7 días por defecto): “Todo Mercado Libre” y todas las categorías que seguís.</li>
          <li><b>Profundizar</b> (pago, junto con lo anterior): en las seguidas con “Profundizar” prendido, busca con Apify las primeras palabras de cada ranking (3 por defecto, × 2 rankings) y guarda sus publicaciones. Respeta el tope semanal.</li>
          <li><b>Palabras seguidas</b> (pago, junto con lo anterior): cada palabra propia con ★ se vuelve a buscar con Apify. Respeta el tope semanal.</li>
          <li><b>Árbol de categorías</b> (gratis, cada 1 mes por defecto): relee todas las categorías de Mercado Libre.</li>
        </ul>
        <p>Si no le alcanza el tiempo, sigue al día siguiente donde quedó, sin repetir ni volver a pagar. Lo que hizo se ve en Configuración → “Últimas corridas”.</p>
      </Seccion>

      <Seccion id="historial" titulo="Historial">
        <p>Cada vez que alguien de tu organización tocó “Ver publicaciones” o “Mejorar con Apify” (y lo que hizo el proceso automático, con 🤖), con fecha, hora, quién, la categoría completa, la palabra, el ranking, la fuente, cuántas publicaciones trajo y el costo.</p>
        <p>Al tocar una fila vuelve a Tendencias en esa categoría y ese ranking, con esas publicaciones abiertas. La ★ de cada fila sigue esa categoría desde ahí. El interruptor “Incluir automáticas” muestra u oculta las del proceso automático.</p>
      </Seccion>

      <Seccion id="datos" titulo="De dónde salen los datos">
        <p>Árbol, tendencias y publicaciones vienen de Mercado Libre y se guardan una sola vez, compartidos por todas las organizaciones (no se paga dos veces lo mismo). Lo de cada organización —qué sigue, su configuración, su historial y su gasto— es sólo de ella, y lo ven todos sus usuarios con el nombre de quién hizo cada cosa.</p>
        <p>Orden de las subcategorías: por cantidad de publicaciones (Mercado Libre no informa cuánto factura cada categoría).</p>
        <p className="text-xs text-[#5C6B76]">¿Algo no está claro? <Link href="/radar/configuracion" className="underline">Configuración</Link> tiene todos los parámetros.</p>
      </Seccion>
    </div>
  );
}
