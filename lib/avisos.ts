// Avisos de la barra de estado (pedido de Fer, 10/10), de cada usuario:
// - Los contadores (pedidos, preguntas, mensajes, WhatsApp en espera) se
//   refrescan solos, y lo que entró y el usuario todavía no vio se pinta
//   distinto hasta que entra a esa pantalla (`visto`).
// - Lo que la IA no contestó (le falta un dato o el cliente pide una persona)
//   puede abrir una ventana de prepo y sonar (`aviso_sonido`). La ventana se elige
//   por tipo (`aviso_ventana_tipos`): pedidos nuevos, y preguntas, mensajes y
//   WhatsApp que la IA no contestó, y reclamos para atender (uno nuevo, o un
//   mensaje nuevo del comprador o de Mercado Libre en uno que espera respuesta).
//   `avisado` guarda hasta dónde ya se mostró, para no repetirlo.
// Las preferencias van en usuario_preferencia (db/moneda.sql).

import { consulta, una } from "@/lib/erp/base";
import { contadoresEstado, marcaDe, SQL_RECLAMO_A_ATENDER } from "@/lib/erp/contadores";
import { TIPOS_RECLAMO, esTipoReclamo } from "@/lib/reclamos";
import type { PermisoKey } from "@/lib/permisos";
import { cadaMinValido, TIPOS_AVISO, VENTANA_TODO, type AvisoIa, type ClaveContador, type EstadoAvisos, type Prefs } from "@/lib/avisos-tipos";
import { sqlPedidoPendiente } from "@/lib/pedidos";
import { SQL_DERIVADA_ESPERA } from "@/lib/mercadolibre/sql-mensajes";
import { formatear, type Moneda } from "@/lib/moneda";

export type Marcas = Record<string, number>;
type TipoAviso = AvisoIa["tipo"];

// De entrada, todo prendido (Fer, 10/10).
const PREFS_DEFECTO: Prefs = { sonido: true, ventana: VENTANA_TODO, pedidoDetalle: true, cadaMin: 1 };

async function filaDe(usuario: string, org: string) {
  return una<FilaPrefs & { visto: Marcas | null; avisado: Marcas | null }>(
    "select aviso_sonido, aviso_ventana, aviso_ventana_tipos, aviso_cada_min, visto, avisado from usuario_preferencia where usuario_id = $1 and organizacion_id = $2", [usuario, org]);
}

type FilaPrefs = { aviso_sonido: boolean; aviso_ventana: boolean; aviso_ventana_tipos: Partial<Record<ClaveContador | "pedidos_detalle", boolean>> | null; aviso_cada_min: number };

/** Un tipo que no está en `aviso_ventana_tipos` sigue a `aviso_ventana` (la caja única de antes). */
export const prefsDe = (f: FilaPrefs | null): Prefs => f ? {
  sonido: f.aviso_sonido,
  ventana: Object.fromEntries(TIPOS_AVISO.map((t) => [t, f.aviso_ventana_tipos?.[t] ?? f.aviso_ventana])) as Record<ClaveContador, boolean>,
  pedidoDetalle: f.aviso_ventana_tipos?.pedidos_detalle ?? true,
  cadaMin: cadaMinValido(f.aviso_cada_min),
} : PREFS_DEFECTO;

export async function prefsAvisos(usuario: string, org: string): Promise<Prefs> {
  return prefsDe(await filaDe(usuario, org));
}

export async function fijarPrefsAvisos(usuario: string, org: string, p: Prefs): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, aviso_sonido, aviso_ventana_tipos, aviso_cada_min) values ($1, $2, $3, $4::jsonb, $5)
    on conflict (usuario_id, organizacion_id) do update set aviso_sonido = excluded.aviso_sonido, aviso_ventana_tipos = excluded.aviso_ventana_tipos,
      aviso_cada_min = excluded.aviso_cada_min, actualizado_ts = now()`,
    [usuario, org, p.sonido, JSON.stringify({ ...p.ventana, pedidos_detalle: p.pedidoDetalle }), cadaMinValido(p.cadaMin)]);
}

/** Guarda una marca (de `visto` o de `avisado`) sólo si es mayor que la que había. */
export async function subirMarca(usuario: string, org: string, columna: "visto" | "avisado" | "push_avisado", clave: string, marca: number): Promise<void> {
  if (!Number.isFinite(marca) || marca <= 0) return;
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, ${columna}) values ($1, $2, jsonb_build_object($3::text, $4::float8))
    on conflict (usuario_id, organizacion_id) do update
      set ${columna} = coalesce(usuario_preferencia.${columna}, '{}'::jsonb)
                       || case when coalesce((usuario_preferencia.${columna} ->> $3::text)::float8, 0) < $4::float8
                               then jsonb_build_object($3::text, $4::float8) else '{}'::jsonb end`,
    [usuario, org, clave, marca]);
}

/** El usuario entró a la pantalla de ese contador: lo que hay hasta ahora queda visto. */
export async function marcarVisto(usuario: string, org: string, clave: ClaveContador): Promise<void> {
  await subirMarca(usuario, org, "visto", clave, await marcaDe(org, clave));
}

/** El usuario cerró la ventana: lo que se le mostró no se le vuelve a abrir. */
export async function marcarAvisado(usuario: string, org: string, marcas: Partial<Record<TipoAviso, number>>): Promise<void> {
  for (const [tipo, marca] of Object.entries(marcas)) if (TIPOS.includes(tipo as TipoAviso)) await subirMarca(usuario, org, "avisado", tipo, Number(marca));
}

const TIPOS: TipoAviso[] = TIPOS_AVISO;

const MOTIVO: Record<string, string> = {
  falta_dato: "A la IA le falta un dato para contestar.",
  persona: "El cliente pide hablar con una persona.",
  derivar: "La IA le avisó al comprador que lo deriva a una persona: espera tu respuesta.",
};

/** Lo que la IA no contestó y todavía no se le mostró al usuario (pasa su marca de `avisado`). */
export async function pendientesIa(org: string, puede: (p: PermisoKey) => boolean, avisado: Marcas): Promise<AvisoIa[]> {
  const desde = (t: TipoAviso) => Number(avisado[t] ?? 0);
  const [reclamos, pedidos, preguntas, mensajes, casos, facturas] = await Promise.all([
    puede("reclamos_ver") ? consulta<{ id: string; marca: number; tipo: string; origen: string; canal: string | null; motivo: string | null; pedido_id: string | null;
      cliente: string | null; vence: string | null; texto: string | null }>(`
      select x.* from (
        select r.id::text, floor(extract(epoch from greatest(r.creado_ts, coalesce(u.fecha, r.creado_ts))) * 1000)::float8 marca, r.tipo, r.origen,
               c.nombre canal, r.motivo, r.pedido_id::text, cl.nombre cliente,
               to_char(r.vence_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM "a las" HH24:MI') vence, u.texto
          from reclamo r left join canal c on c.id = r.canal_id left join cliente cl on cl.id = r.cliente_id
          left join lateral (select m.fecha, m.texto from reclamo_mensaje m where m.reclamo_id = r.id and m.de in ('comprador', 'ml')
                              order by m.fecha desc limit 1) u on true
         where r.organizacion_id = $1 and ${SQL_RECLAMO_A_ATENDER}) x
       where x.marca > $2::float8
       order by x.marca limit 10`, [org, desde("reclamos")]).catch(() => []) : [],
    puede("pedidos_ver") ? consulta<{ id: string; canal: string | null; cliente: string | null; total: string | null; moneda: Moneda; lineas: string | null }>(`
      select p.id::text, c.nombre canal, cl.nombre cliente, case when p.moneda = 'USD' then p.total_usd else p.total_ars end::text total, p.moneda,
             (select string_agg(l.cantidad::int || ' × ' || l.titulo, '\n' order by l.id) from pedido_linea l where l.pedido_id = p.id) lineas
        from pedido p left join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")} and p.id > $2::float8
       order by p.id limit 10`, [org, desde("pedidos")]).catch(() => []) : [],
    puede("preguntas_ver") ? consulta<{ id: string; marca: number; texto: string; ia_estado: string; sugerencia: string | null; cuenta: string | null; titulo: string | null }>(`
      select q.id::text, floor(extract(epoch from q.sugerencia_ts) * 1000)::float8 marca, q.texto, q.ia_estado, q.sugerencia,
             c.nombre cuenta, pu.titulo
        from meli_pregunta q left join canal c on c.id = q.canal_id left join publicacion pu on pu.id = q.publicacion_id
       where q.organizacion_id = $1 and q.estado = 'UNANSWERED' and q.ia_estado in ('falta_dato', 'persona')
         -- Al milisegundo, igual que la marca guardada (con los microsegundos, lo cerrado volvía a abrirse).
         and floor(extract(epoch from q.sugerencia_ts) * 1000) > $2::float8
       order by q.sugerencia_ts limit 10`, [org, desde("preguntas")]).catch(() => []) : [],
    puede("preguntas_ver") ? consulta<{ pack_id: string; marca: number; ia_estado: string; sugerencia: string | null; cuenta: string | null; pedido_id: string | null; texto: string | null }>(`
      select x.* from (
        -- Una derivada a una persona que espera respuesta se avisa desde que la IA le avisó al comprador (Fer, 25/10).
        select v.pack_id, floor(extract(epoch from case when ${SQL_DERIVADA_ESPERA("v")} then greatest(v.sugerencia_ts, v.derivada_ts) else v.sugerencia_ts end) * 1000)::float8 marca,
               case when ${SQL_DERIVADA_ESPERA("v")} then 'derivar' else v.ia_estado end ia_estado, v.sugerencia, c.nombre cuenta, v.pedido_id::text,
               (select m.texto from meli_mensaje m where m.organizacion_id = v.organizacion_id and m.pack_id = v.pack_id and not m.de_vendedor
                 order by m.fecha desc limit 1) texto
          from meli_conversacion v left join canal c on c.id = v.canal_id
         where v.organizacion_id = $1 and ((v.sin_leer > 0 and v.ia_estado in ('falta_dato', 'persona')) or ${SQL_DERIVADA_ESPERA("v")})) x
       where x.marca > $2::float8
       order by x.marca limit 10`, [org, desde("mensajes")]).catch(() => []) : [],
    puede("mensajes_ver") ? consulta<{ id: string; chat_id: string; asunto: string; motivo: string; nombre: string; texto: string | null }>(`
      select k.id::text, k.chat_id::text, k.asunto, k.motivo, coalesce(nullif(ch.nombre, ''), ch.externo) nombre,
             (select m.texto from chat_mensaje m where m.chat_id = k.chat_id and m.clase = 'entrante' order by m.id desc limit 1) texto
        from chat_caso k join chat ch on ch.id = k.chat_id
       where k.organizacion_id = $1 and k.resuelto_ts is null and k.id > $2::float8
       order by k.id limit 10`, [org, desde("whatsapp")]).catch(() => []) : [],
    puede("facturacion_ver") ? consulta<{ id: string; marca: number; motivo: string; canal: string | null; cliente: string | null; texto: string | null }>(`
      select p.id::text, floor(extract(epoch from p.factura_retenida_ts) * 1000)::float8 marca, p.factura_retenida motivo, c.nombre canal, cl.nombre cliente,
             (select m.texto from meli_mensaje m where m.pedido_id = p.id and not m.de_vendedor order by m.fecha desc limit 1) texto
        from pedido p left join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and p.factura_retenida is not null and floor(extract(epoch from p.factura_retenida_ts) * 1000) > $2::float8
       order by p.factura_retenida_ts limit 10`, [org, desde("facturas")]).catch(() => []) : [],
  ]);
  return [
    ...reclamos.map((r): AvisoIa => ({
      tipo: "reclamos", id: r.id, marca: Number(r.marca),
      titulo: `${esTipoReclamo(r.tipo) ? TIPOS_RECLAMO[r.tipo] : "Reclamo"} ${r.id}${r.canal ? ` en ${r.canal}` : r.origen === "web" ? " de la web" : r.origen === "local" ? " del local" : ""}`,
      detalle: [r.motivo, r.cliente, r.pedido_id ? `Pedido ${r.pedido_id}` : null].filter(Boolean).join(" · "),
      texto: r.texto ?? "", motivo: r.vence ? `Hay que responder antes del ${r.vence}.` : "Está esperando que lo atiendas.",
      // Se atiende en la bandeja de Mensajes (Fer, 25/10); las acciones de ML, desde ahí a su ficha.
      propuesta: null, href: `/ventas/mensajes?con=r:${r.id}`,
    })),
    ...pedidos.map((p): AvisoIa => ({
      tipo: "pedidos", id: p.id, marca: Number(p.id), titulo: `Pedido nuevo ${p.id}${p.canal ? ` en ${p.canal}` : ""}`,
      detalle: [p.cliente, p.total != null ? formatear(Number(p.total), p.moneda) : null].filter(Boolean).join(" · "),
      texto: p.lineas ?? "", motivo: "", propuesta: null, href: `/ventas/pedidos/${p.id}`,
    })),
    ...preguntas.map((q): AvisoIa => ({
      tipo: "preguntas", id: q.id, marca: Number(q.marca), titulo: `Pregunta${q.cuenta ? ` en ${q.cuenta}` : ""}`,
      detalle: q.titulo ?? "", texto: q.texto, motivo: MOTIVO[q.ia_estado] ?? "", propuesta: q.sugerencia, href: `/ventas/mensajes?con=p:${q.id}`,
    })),
    ...mensajes.map((m): AvisoIa => ({
      tipo: "mensajes", id: m.pack_id, marca: Number(m.marca), titulo: `Mensaje${m.cuenta ? ` en ${m.cuenta}` : ""}`,
      detalle: m.pedido_id ? `Pedido ${m.pedido_id}` : "", texto: m.texto ?? "(adjunto)", motivo: MOTIVO[m.ia_estado] ?? "",
      propuesta: m.sugerencia, href: `/ventas/mensajes?con=m:${encodeURIComponent(m.pack_id)}`, derivada: m.ia_estado === "derivar",
    })),
    ...casos.map((k): AvisoIa => ({
      tipo: "whatsapp", id: k.id, marca: Number(k.id), titulo: `WhatsApp de ${k.nombre}`, detalle: k.asunto,
      texto: k.texto ?? "", motivo: k.motivo || "La IA lo dejó en espera para una persona.", propuesta: null,
      href: `/ventas/mensajes?con=c:${k.chat_id}`,
    })),
    ...facturas.map((f): AvisoIa => ({
      tipo: "facturas", id: f.id, marca: Number(f.marca), titulo: `Factura retenida: pedido ${f.id}${f.canal ? ` en ${f.canal}` : ""}`,
      detalle: f.cliente ?? "", texto: f.texto ?? "", motivo: f.motivo, propuesta: null, href: `/ventas/pedidos/${f.id}`,
    })),
  ];
}

/** Lo que dibuja la barra de estado y la ventana. La primera vez, lo que ya
 *  estaba pendiente no abre la ventana (sería una catarata de cosas viejas). */
export async function estadoAvisos(usuario: string, org: string, puede: (p: PermisoKey) => boolean, aLaVista = false): Promise<EstadoAvisos> {
  // Con Laucen a la vista, avisa la pantalla: los avisos de Windows esperan (lib/avisos-push.ts).
  if (aLaVista) await vistazo(usuario, org).catch(() => {});
  const f = await filaDe(usuario, org).catch(() => null);
  const prefs = prefsDe(f);
  const contadores = await contadoresEstado(org, puede, f?.visto ?? {});
  if (!f?.avisado) {
    await iniciarAvisado(usuario, org).catch(() => {});
    return { contadores, ventana: [], prefs };
  }
  const ventana = await pendientesIa(org, puede, await completarMarcas(usuario, org, "avisado", f.avisado));
  return { contadores, ventana, prefs };
}

/** Las marcas de "hasta acá" de hoy (para empezar sin una catarata de cosas viejas). */
export async function marcasActuales(org: string): Promise<Marcas> {
  const r = await una<{ pedidos: number | null; whatsapp: number | null }>(`
    select (select max(id)::float8 from pedido where organizacion_id = $1) pedidos,
           (select max(id)::float8 from chat_caso where organizacion_id = $1) whatsapp`, [org]);
  return { reclamos: Date.now(), pedidos: Number(r?.pedidos ?? 0), preguntas: Date.now(), mensajes: Date.now(), whatsapp: Number(r?.whatsapp ?? 0), facturas: Date.now() };
}

/** Si a las marcas guardadas les falta un tipo (uno nuevo), se completa con la de hoy y se guarda. */
export async function completarMarcas(usuario: string, org: string, columna: "avisado" | "push_avisado", marcas: Marcas): Promise<Marcas> {
  const faltan = TIPOS_AVISO.filter((t) => marcas[t] === undefined);
  if (!faltan.length) return marcas;
  const hoy = await marcasActuales(org);
  const completas = { ...marcas };
  for (const t of faltan) {
    completas[t] = hoy[t];
    await subirMarca(usuario, org, columna, t, hoy[t]);
  }
  return completas;
}

async function iniciarAvisado(usuario: string, org: string): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, avisado) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set avisado = coalesce(usuario_preferencia.avisado, excluded.avisado)`,
    [usuario, org, JSON.stringify(await marcasActuales(org))]);
}

async function vistazo(usuario: string, org: string): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, vistazo_ts) values ($1, $2, now())
    on conflict (usuario_id, organizacion_id) do update set vistazo_ts = now()`, [usuario, org]);
}
