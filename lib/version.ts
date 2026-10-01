/** Hora del último deploy en hora argentina, el commit corto y el id del
 *  deploy de Vercel (el mismo `dpl_…` que muestra Vercel en Deployments). */
export function versión() {
  const hora = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const deploy = process.env.VERCEL_DEPLOYMENT_ID;
  return [hora && `Actualizado ${hora}`, commit, deploy].filter(Boolean).join(" · ");
}
