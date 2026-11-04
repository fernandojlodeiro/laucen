// Productos para probar «Dejar de ofrecer Full» por API (Fer, 4/11; bitácora #1074): en una cuenta
// con Full, un producto con publicaciones de Full que quedó sin nada en Full (ni disponible ni en
// ingreso, según la última lectura de lib/full/lectura.ts), sin unidades en camino a Full y con
// stock disponible en los depósitos propios de la cuenta. Mientras ML no tenga una llamada
// documentada, el superadministrador ve el aviso en la barra de estado para hacer la prueba con
// ese caso; después, esto mismo es lo que va a sacar Full solo.

import { consulta } from "@/lib/erp/base";
import { enviarMail, plantilla, escapar } from "@/lib/correo/mailer";
import { urlPanel } from "@/lib/tienda/dominios";

export type CasoDejarFull = { cuenta: string; canal_id: number; variacion_id: number; producto_id: number; sku: string; item_id: string; publicaciones: number; disponible: number };

export async function casosDejarFull(org: string): Promise<CasoDejarFull[]> {
  return consulta<CasoDejarFull>(`
    with deps as (
      select d.id deposito, cd.canal_id, c.nombre cuenta from deposito d join canal_deposito cd on cd.deposito_id = d.id
        join canal c on c.id = cd.canal_id and c.tipo = 'mercadolibre' and c.estado = 'activo'
       where d.organizacion_id = $1 and d.tipo = 'full_ml' and d.estado = 'activo'
    ), pubs as (
      select dp.deposito, dp.canal_id, dp.cuenta, pu.variacion_id, min(m.item_id) item_id, count(*)::int publicaciones
        from deps dp join meli_item m on m.canal_id = dp.canal_id and m.logistica = 'fulfillment' and coalesce(m.estado, '') <> 'closed'
        join publicacion pu on pu.canal_id = m.canal_id and pu.id_externo = m.item_id and pu.variacion_id is not null
       group by 1, 2, 3, 4
    )
    select p.cuenta, p.canal_id::int, p.variacion_id::int, v.producto_id::int, v.sku, p.item_id, p.publicaciones,
           stock_disponible_canal($1, p.variacion_id, p.canal_id) disponible
      from pubs p join variacion v on v.id = p.variacion_id
     -- Leído de ML, sin error, y nada en Full (tampoco en ingreso o en revisión).
     where exists (select 1 from full_stock fs where fs.canal_id = p.canal_id and fs.variacion_id = p.variacion_id)
       and not exists (select 1 from full_stock fs where fs.canal_id = p.canal_id and fs.variacion_id = p.variacion_id
                        and (fs.error is not null or coalesce(fs.disponible, 0) + coalesce(fs.no_disponible, 0) > 0))
       and not exists (select 1 from full_envio e join full_envio_linea l on l.envio_id = e.id
                        where e.deposito_full_id = p.deposito and e.estado = 'despachado' and l.variacion_id = p.variacion_id
                          and l.cantidad > l.recibido + l.faltante)
       and stock_disponible_canal($1, p.variacion_id, p.canal_id) > 0
     order by p.cuenta, v.sku`, [org]);
}

/** Un mail a los superadministradores por cada caso nuevo (Fer, 4/11). La clave del mail lleva el día:
 *  mientras el caso siga, se repite como mucho una vez por día. Lo llama el proceso de fondo después de
 *  leer Full (app/api/erp/tareas). */
export async function avisarDejarFull(org: string | null): Promise<number> {
  const orgs = org ? [org] : (await consulta<{ id: string }>("select distinct organizacion_id id from deposito where tipo = 'full_ml' and estado = 'activo'")).map((x) => x.id);
  let enviados = 0;
  for (const o of orgs) {
    const casos = await casosDejarFull(o);
    if (!casos.length) continue;
    const para = await consulta<{ email: string }>(`
      select distinct u.email from membresias m join usuarios u on u.id = m.usuario_id
       where m.organizacion_id = $1 and m.superadmin and upper(m.estado) = 'ACTIVO' and u.email is not null`, [o]);
    const dia = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const panel = urlPanel();
    for (const c of casos) {
      const filas = `<p>En <b>${escapar(c.cuenta)}</b>, <b>${escapar(c.sku)}</b> quedó sin nada en Full, sin unidades en camino a Full y con
        <b>${c.disponible}</b> u. en el depósito propio. Sus ${c.publicaciones} publicaciones de Full están pausadas (por ejemplo ${escapar(c.item_id)}).</p>
        <p>Es el caso para probar «Dejar de ofrecer Full» por API, así Laucen lo hace solo de ahora en más. Avisale a la sesión de Code antes de tocar nada en el panel de Mercado Libre.</p>`;
      for (const p of para) {
        const r = await enviarMail(o, {
          para: p.email, tipo: "dejar_full", clave: `dejar-full:${c.canal_id}:${c.variacion_id}:${dia}:${p.email}`,
          asunto: `Full: ${c.sku} en ${c.cuenta} quedó en 0 — probar «Dejar de ofrecer Full»`, remitente: { nombre: "Laucen", email: null },
          html: plantilla({ nombre: "Laucen", web: panel }, "Para probar «Dejar de ofrecer Full»", filas,
            { texto: "Ver el stock en Full", url: `${panel}/stock/full/stock?q=${encodeURIComponent(c.sku)}` }),
        });
        if (r.ok && !r.ya) enviados++;
      }
    }
  }
  return enviados;
}
