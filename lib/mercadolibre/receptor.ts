// Lo que hace cada función de Vercel con las notificaciones de Mercado Libre
// que le llegan (bitácora #1009). ML a veces avisa de golpe un cambio en TODAS
// las publicaciones de una cuenta (1.500 avisos en 20 segundos); si cada aviso
// abre su conexión y además se procesa en paralelo, el pooler de la base (400
// conexiones) se llena y se cae todo, la tienda incluida. Por eso, dentro de
// cada función:
// - los avisos que llegan juntos se guardan en tanda, con una sola consulta;
// - se procesan de a uno, en fila (nunca cientos en paralelo), primero las
//   urgentes (ventas, preguntas, mensajes, reclamos) aunque hayan llegado
//   detrás de mil de publicaciones. Lo que no se alcanza a procesar queda
//   pendiente en la base y lo toma la próxima tanda o el barrido.

import { guardarNotificaciones, procesarNotificaciones, TOPICOS_URGENTES, type Notificacion } from "@/lib/mercadolibre/procesar";

const JUNTAR_MS = 40;
const TANDA_MAX = 200;

type Espera = { n: Notificacion; listo: () => void; falla: (e: unknown) => void };
let tanda: Espera[] = [];
let reloj: ReturnType<typeof setTimeout> | null = null;

const urgentes: number[] = [];
const comunes: number[] = [];
const TOPE_EN_MEMORIA = 5_000; // más que eso queda sólo en la base (lo toma el barrido)
let procesando: Promise<void> | null = null;

async function vaciar() {
  reloj = null;
  const t = tanda;
  tanda = [];
  if (!t.length) return;
  try {
    const ids = await guardarNotificaciones(t.map((x) => x.n));
    for (const x of ids) (TOPICOS_URGENTES.includes(x.topic) ? urgentes : comunes).push(x.id);
    if (comunes.length > TOPE_EN_MEMORIA) comunes.splice(0, comunes.length - TOPE_EN_MEMORIA);
    t.forEach((x) => x.listo());
  } catch (e) {
    t.forEach((x) => x.falla(e));
  }
}

/** Guarda la notificación (junto con las que lleguen en los próximos milisegundos).
 *  Resuelve cuando quedó guardada; si la base falló, tira el error. */
export function recibirNotificacion(n: Notificacion): Promise<void> {
  return new Promise((listo, falla) => {
    tanda.push({ n, listo, falla });
    if (tanda.length >= TANDA_MAX) {
      if (reloj) clearTimeout(reloj);
      void vaciar();
    } else {
      reloj ??= setTimeout(() => void vaciar(), JUNTAR_MS);
    }
  });
}

/** Procesa, de a una y en fila, las notificaciones que guardó esta función. Si ya
 *  hay una fila corriendo, devuelve esa (las nuevas se suman a ella). */
export function procesarRecibidas(hastaMs = Date.now() + 50_000): Promise<void> {
  procesando ??= (async () => {
    while ((urgentes.length || comunes.length) && Date.now() < hastaMs) {
      const ids = urgentes.length ? urgentes.splice(0, 50) : comunes.splice(0, 20);
      try {
        await procesarNotificaciones(hastaMs, ids);
      } catch (e) {
        console.error("[meli] notificación", e); // quedan pendientes: las toma el barrido
      }
    }
  })().finally(() => { procesando = null; });
  return procesando;
}
