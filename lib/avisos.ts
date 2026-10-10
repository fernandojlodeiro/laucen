// Avisos de la barra de estado (pedido de Fer, 10/10), de cada usuario:
// - Los contadores (pedidos, preguntas, mensajes, WhatsApp en espera) se
//   refrescan solos, y lo que entró y el usuario todavía no vio se pinta
//   distinto hasta que entra a esa pantalla (`visto`).
// - Lo que la IA no contestó (le falta un dato o el cliente pide una persona)
//   puede abrir una ventana de prepo (`aviso_ventana`) y sonar (`aviso_sonido`).
//   `avisado` guarda hasta dónde ya se mostró, para no repetirlo.
// Las preferencias van en usuario_preferencia (db/moneda.sql).

import { consulta, una } from "@/lib/erp/base";
import { contadoresEstado, marcaDe } from "@/lib/erp/contadores";
import type { PermisoKey } from "@/lib/permisos";
import type { AvisoIa, ClaveContador, EstadoAvisos, Prefs } from "@/lib/avisos-tipos";

type Marcas = Record<string, number>;
type TipoAviso = AvisoIa["tipo"];

const PREFS_DEFECTO: Prefs = { sonido: false, ventana: true };

async function filaDe(usuario: string, org: string) {
  return una<{ aviso_sonido: boolean; aviso_ventana: boolean; visto: Marcas | null; avisado: Marcas | null }>(
    "select aviso_sonido, aviso_ventana, visto, avisado from usuario_preferencia where usuario_id = $1 and organizacion_id = $2", [usuario, org]);
}

export async function prefsAvisos(usuario: string, org: string): Promise<Prefs> {
  const f = await filaDe(usuario, org);
  return f ? { sonido: f.aviso_sonido, ventana: f.aviso_ventana } : PREFS_DEFECTO;
}

export async function fijarPrefsAvisos(usuario: string, org: string, p: Prefs): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, aviso_sonido, aviso_ventana) values ($1, $2, $3, $4)
    on conflict (usuario_id, organizacion_id) do update set aviso_sonido = excluded.aviso_sonido, aviso_ventana = excluded.aviso_ventana, actualizado_ts = now()`,
    [usuario, org, p.sonido, p.ventana]);
}

/** Guarda una marca (de `visto` o de `avisado`) sólo si es mayor que la que había. */
async function subirMarca(usuario: string, org: string, columna: "visto" | "avisado", clave: string, marca: number): Promise<void> {
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

const TIPOS: TipoAviso[] = ["preguntas", "mensajes", "whatsapp"];

const MOTIVO: Record<string, string> = {
  falta_dato: "A la IA le falta un dato para contestar.",
  persona: "El cliente pide hablar con una persona.",
};

/** Lo que la IA no contestó y todavía no se le mostró al usuario (pasa su marca de `avisado`). */
async function pendientesIa(org: string, puede: (p: PermisoKey) => boolean, avisado: Marcas): Promise<AvisoIa[]> {
  const desde = (t: TipoAviso) => Number(avisado[t] ?? 0);
  const [preguntas, mensajes, casos] = await Promise.all([
    puede("preguntas_ver") ? consulta<{ id: string; marca: number; texto: string; ia_estado: string; sugerencia: string | null; cuenta: string | null; titulo: string | null }>(`
      select q.id::text, (extract(epoch from q.sugerencia_ts) * 1000)::float8 marca, q.texto, q.ia_estado, q.sugerencia,
             c.nombre cuenta, pu.titulo
        from meli_pregunta q left join canal c on c.id = q.canal_id left join publicacion pu on pu.id = q.publicacion_id
       where q.organizacion_id = $1 and q.estado = 'UNANSWERED' and q.ia_estado in ('falta_dato', 'persona')
         and q.sugerencia_ts > to_timestamp($2::float8 / 1000)
       order by q.sugerencia_ts limit 10`, [org, desde("preguntas")]).catch(() => []) : [],
    puede("preguntas_ver") ? consulta<{ pack_id: string; marca: number; ia_estado: string; sugerencia: string | null; cuenta: string | null; pedido_id: string | null; texto: string | null }>(`
      select v.pack_id, (extract(epoch from v.sugerencia_ts) * 1000)::float8 marca, v.ia_estado, v.sugerencia, c.nombre cuenta, v.pedido_id::text,
             (select m.texto from meli_mensaje m where m.organizacion_id = v.organizacion_id and m.pack_id = v.pack_id and not m.de_vendedor
               order by m.fecha desc limit 1) texto
        from meli_conversacion v left join canal c on c.id = v.canal_id
       where v.organizacion_id = $1 and v.sin_leer > 0 and v.ia_estado in ('falta_dato', 'persona')
         and v.sugerencia_ts > to_timestamp($2::float8 / 1000)
       order by v.sugerencia_ts limit 10`, [org, desde("mensajes")]).catch(() => []) : [],
    puede("mensajes_ver") ? consulta<{ id: string; chat_id: string; asunto: string; motivo: string; nombre: string; texto: string | null }>(`
      select k.id::text, k.chat_id::text, k.asunto, k.motivo, coalesce(nullif(ch.nombre, ''), ch.externo) nombre,
             (select m.texto from chat_mensaje m where m.chat_id = k.chat_id and m.clase = 'entrante' order by m.id desc limit 1) texto
        from chat_caso k join chat ch on ch.id = k.chat_id
       where k.organizacion_id = $1 and k.resuelto_ts is null and k.id > $2::float8
       order by k.id limit 10`, [org, desde("whatsapp")]).catch(() => []) : [],
  ]);
  return [
    ...preguntas.map((q): AvisoIa => ({
      tipo: "preguntas", id: q.id, marca: Number(q.marca), titulo: `Pregunta${q.cuenta ? ` en ${q.cuenta}` : ""}`,
      detalle: q.titulo ?? "", texto: q.texto, motivo: MOTIVO[q.ia_estado] ?? "", propuesta: q.sugerencia, href: "/ventas/preguntas",
    })),
    ...mensajes.map((m): AvisoIa => ({
      tipo: "mensajes", id: m.pack_id, marca: Number(m.marca), titulo: `Mensaje${m.cuenta ? ` en ${m.cuenta}` : ""}`,
      detalle: m.pedido_id ? `Pedido ${m.pedido_id}` : "", texto: m.texto ?? "(adjunto)", motivo: MOTIVO[m.ia_estado] ?? "",
      propuesta: m.sugerencia, href: `/ventas/preguntas?ver=mensajes&pack=${encodeURIComponent(m.pack_id)}`,
    })),
    ...casos.map((k): AvisoIa => ({
      tipo: "whatsapp", id: k.id, marca: Number(k.id), titulo: `WhatsApp de ${k.nombre}`, detalle: k.asunto,
      texto: k.texto ?? "", motivo: k.motivo || "La IA lo dejó en espera para una persona.", propuesta: null,
      href: `/ventas/mensajes?filtro=en_espera&con=${k.chat_id}`,
    })),
  ];
}

/** Lo que dibuja la barra de estado y la ventana. La primera vez, lo que ya
 *  estaba pendiente no abre la ventana (sería una catarata de cosas viejas). */
export async function estadoAvisos(usuario: string, org: string, puede: (p: PermisoKey) => boolean): Promise<EstadoAvisos> {
  const f = await filaDe(usuario, org).catch(() => null);
  const prefs = f ? { sonido: f.aviso_sonido, ventana: f.aviso_ventana } : PREFS_DEFECTO;
  const contadores = await contadoresEstado(org, puede, f?.visto ?? {});
  if (!f?.avisado) {
    await iniciarAvisado(usuario, org, puede).catch(() => {});
    return { contadores, ventana: [], prefs };
  }
  const ventana = await pendientesIa(org, puede, f.avisado);
  return { contadores, ventana, prefs };
}

async function iniciarAvisado(usuario: string, org: string, puede: (p: PermisoKey) => boolean): Promise<void> {
  const todo = await pendientesIa(org, puede, {});
  const marcas: Marcas = { preguntas: Date.now(), mensajes: Date.now(), whatsapp: 0 };
  for (const a of todo) marcas[a.tipo] = Math.max(marcas[a.tipo], a.marca);
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, avisado) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set avisado = coalesce(usuario_preferencia.avisado, excluded.avisado)`,
    [usuario, org, JSON.stringify(marcas)]);
}
