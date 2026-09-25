# Radar — tendencias de Mercado Libre

Detalle del módulo Radar. Estaba en `AGENTS.md`; se movió acá cuando `AGENTS.md` pasó a ser
sólo convenciones generales (25/09/2026).

## Qué hace

- Pantalla `/radar`, botón "📡 Radar" en el panel. Pestañas: Tendencias, Mis categorías
  seguidas, Configuración.
- **Árbol de categorías** de Mercado Libre Argentina completo: se carga en tandas y se refresca
  según la configuración.
- **Tendencias por categoría**, separadas en tres grupos: crecimiento / más buscadas /
  populares. **Los grupos se deducen por el tramo de la lista (1–10 / 11–30 / 31–50): supuesto
  sin confirmar**, ver `lib/radar/base.ts`.
- Comparación contra la semana anterior (sube / baja / nueva).
- **Categorías seguidas**: estrella para seguir + interruptor.
- **"Ver publicaciones"**: API gratis de Mercado Libre (catálogo).
- **"Mejorar con Apify"**: paga, con tope semanal de gasto (permiso `radar_gastar`).
- **Configuración**: todos los parámetros (tope de gasto, frecuencia de los procesos, etc.).

## Dónde está

- Código: `lib/radar/`, `app/radar/`.
- Tablas: `db/radar.sql`. Se crean solas: `lib/radar/esquema.ts` corre ese archivo
  (idempotente) al primer uso tras cada arranque. Una migración nueva del Radar va en ese mismo
  archivo, siempre con `if not exists`.

## Cron

`vercel.json` llama `/api/radar/cron` todos los días a las 11:00 UTC (8:00 AR); qué corre lo
decide la configuración de cada organización. Si se carga `CRON_SECRET` en Vercel, se exige;
sin ella la ruta es pública pero inofensiva (no repite nada de la semana, tope de gasto).
