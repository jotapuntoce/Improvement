// Instagram por la API oficial de Meta (Business Discovery): las publicaciones públicas de una cuenta de negocio o
// creador, leídas con la cuenta de negocio de JotaPuntoCe. Las cifras las calcula el código; la IA solo las lee.
// Spec 2026-10-05-chequeo-como-el-primero-design.md, sección 3. Sin token, devuelve motivo y el motor sigue.
const TIPO = { IMAGE: "foto", VIDEO: "reel", CAROUSEL_ALBUM: "carrusel" };
const NO_SON_USUARIOS = ["p", "reel", "reels", "stories", "explore", "tv"];

export function usuarioDe(url) {
  const m = String(url ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return m && !NO_SON_USUARIOS.includes(m[1].toLowerCase()) ? m[1] : null;
}

const promedio = (xs) => (xs.length ? Math.round(xs.reduce((s, p) => s + p.interacciones, 0) / xs.length) : 0);
const agrupar = (posts, clave, nombre) =>
  Object.entries(Object.groupBy(posts, clave))
    .map(([k, xs]) => ({ [nombre]: k, posts: xs.length, promedio: promedio(xs) }))
    .sort((a, b) => String(a[nombre]).localeCompare(String(b[nombre])));

export function resumir(bd) {
  const todos = (bd.media?.data ?? []).map((m) => {
    const likes = m.hasOwnProperty("like_count") ? m.like_count : null;
    const comentarios = m.comments_count ?? 0;
    return {
      texto: (m.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
      fecha: String(m.timestamp ?? "").slice(0, 10),
      tipo: TIPO[m.media_type] ?? String(m.media_type ?? "").toLowerCase(),
      likes,
      comentarios,
      interacciones: likes !== null ? likes + comentarios : null,
      url: m.permalink,
    };
  });
  const posts = todos.filter((p) => p.likes !== null);
  const likesOcultos = todos.length - posts.length;
  const prom = promedio(posts);
  const seguidores = bd.followers_count ?? null;
  return {
    usuario: bd.username,
    seguidores,
    publicaciones: bd.media_count ?? null,
    bio: bd.biography ?? "",
    analizadas: todos.length,
    likesOcultos,
    promedio: prom,
    tasa: seguidores ? Math.round((prom / seguidores) * 1000) / 10 : null, // % de seguidores que reacciona por post
    top: [...posts].sort((a, b) => b.interacciones - a.interacciones).slice(0, 6),
    porMes: agrupar(posts, (p) => p.fecha.slice(0, 7), "mes"),
    porTipo: agrupar(posts, (p) => p.tipo, "tipo"),
  };
}

export async function recolectarInstagram(url, { fetch: f = fetch, env = process.env } = {}) {
  const usuario = usuarioDe(url);
  if (!usuario) return { ok: false, motivo: "No dio su Instagram." };
  if (!env.META_IG_USER_ID || !env.META_ACCESS_TOKEN) {
    return { ok: false, motivo: "Instagram sin configurar (faltan META_IG_USER_ID y META_ACCESS_TOKEN)." };
  }
  const campos = `business_discovery.username(${usuario}){username,followers_count,media_count,biography,media.limit(50){caption,like_count,comments_count,timestamp,media_type,permalink}}`;
  const u = `https://graph.facebook.com/${env.META_IG_USER_ID}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  try {
    const opts = { signal: AbortSignal.timeout(15_000) };
    const cuerpo = await (await f(u, opts)).json();
    if (cuerpo.error) return { ok: false, motivo: `Meta respondió: ${cuerpo.error.message} (¿cuenta personal o privada?).` };
    if (!cuerpo.business_discovery) return { ok: false, motivo: "Meta no devolvió la cuenta." };
    return { ok: true, data: resumir(cuerpo.business_discovery) };
  } catch (e) {
    return { ok: false, motivo: `No se pudo llamar a Meta: ${e?.message ?? e}` };
  }
}
