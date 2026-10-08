/** Hora del último deploy en hora argentina y el commit corto (sin el id del
 *  deploy de Vercel: Fer, 8/10). */
export function versión() {
  const hora = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return [hora && `Actualizado ${hora}`, commit].filter(Boolean).join(" · ");
}
