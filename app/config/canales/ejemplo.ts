// Datos de ejemplo de Canales (orden 136, §6): la primera vez que una
// organización sin ningún canal abre la pantalla, se cargan cuatro listas de
// precios, un depósito propio (si no hay ninguno) y un canal por tipo, cada
// uno vendiendo desde ese depósito. Queda marcado en config_org
// (`ejemplo_canales_sembrado`), así borrarlos no los vuelve a crear.

import { enTransaccion, una } from "@/lib/erp/base";

const CLAVE = "ejemplo_canales_sembrado";

const LISTAS = ["Mercado Libre", "Web minorista", "Mayorista", "Local"];
const CANALES: { nombre: string; tipo: string; lista: string }[] = [
  { nombre: "Mercado Libre", tipo: "mercadolibre", lista: "Mercado Libre" },
  { nombre: "Web minorista", tipo: "web_minorista", lista: "Web minorista" },
  { nombre: "Web mayorista", tipo: "web_mayorista", lista: "Mayorista" },
  { nombre: "Local", tipo: "local", lista: "Local" },
  { nombre: "Otro", tipo: "otro", lista: "Web minorista" },
];

export async function sembrarEjemploCanales(org: string): Promise<void> {
  // Mirada rápida sin transacción: lo normal es que no haga falta.
  const ya = await una<{ hay: boolean }>(
    `select exists (select 1 from canal where organizacion_id = $1)
         or exists (select 1 from config_org where organizacion_id = $1 and clave = $2) hay`, [org, CLAVE]);
  if (ya?.hay) return;

  await enTransaccion(async (c) => {
    // Un candado por organización: dos pestañas abiertas a la vez no siembran dos veces.
    await c.query("select pg_advisory_xact_lock(hashtext('ejemplo_canales:' || $1))", [org]);
    const otra = await c.query(
      `select 1 where exists (select 1 from canal where organizacion_id = $1)
                   or exists (select 1 from config_org where organizacion_id = $1 and clave = $2)`, [org, CLAVE]);
    if (otra.rowCount) return;

    const listas = new Map<string, number>();
    for (const [i, nombre] of LISTAS.entries()) {
      const r = await c.query<{ id: string }>(`
        insert into lista_precios (organizacion_id, nombre, moneda_base, orden) values ($1, $2, 'ARS', $3)
        on conflict (organizacion_id, nombre) do update set nombre = excluded.nombre returning id`, [org, nombre, i + 1]);
      listas.set(nombre, Number(r.rows[0].id));
    }

    let dep = (await c.query<{ id: string }>(
      `select id from deposito where organizacion_id = $1 and estado = 'activo' order by (tipo = 'propio') desc, id limit 1`, [org])).rows[0]?.id;
    let depCreado = false;
    if (!dep) {
      dep = (await c.query<{ id: string }>(
        `insert into deposito (organizacion_id, nombre, tipo) values ($1, 'Depósito propio', 'propio')
         on conflict (organizacion_id, nombre) do update set estado = 'activo' returning id`, [org])).rows[0].id;
      depCreado = true;
    }

    const canales: number[] = [];
    for (const k of CANALES) {
      const r = await c.query<{ id: string }>(
        `insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, $2, $3, $4) returning id`,
        [org, k.nombre, k.tipo, listas.get(k.lista)]);
      const id = Number(r.rows[0].id);
      canales.push(id);
      await c.query("insert into canal_deposito (organizacion_id, canal_id, deposito_id, prioridad) values ($1, $2, $3, 1)", [org, id, dep]);
    }

    await c.query(`
      insert into config_org (organizacion_id, clave, valor) values ($1, $2, $3::jsonb)
      on conflict ((coalesce(organizacion_id, '')), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
      [org, CLAVE, JSON.stringify({ canales, listas: [...listas.values()], deposito: depCreado ? Number(dep) : null })]);
  });
}

/** Ids de los canales de ejemplo que siguen como se sembraron (con su nombre
 *  original): mientras haya alguno, la pantalla muestra el aviso. */
export async function canalesDeEjemplo(org: string): Promise<number[]> {
  const r = await una<{ ids: number[] | null }>(`
    select array_agg(c.id::int) ids from canal c
     where c.organizacion_id = $1 and c.nombre = any($3::text[])
       and c.id in (select jsonb_array_elements_text(valor -> 'canales')::bigint from config_org where organizacion_id = $1 and clave = $2)`,
    [org, CLAVE, CANALES.map((k) => k.nombre)]);
  return r?.ids ?? [];
}
