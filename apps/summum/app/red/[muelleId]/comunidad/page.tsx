// Comunidad de la red: publicar y comentar. Solo dueños del muelle y afiliadas activas (assertNetworkMember).
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { addComment, createPost, listFeed } from "@/server/community/feed.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

async function actor() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

export default async function ComunidadPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/comunidad`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const feed = await listFeed(userId, muelleId);

  async function publicar(formData: FormData) {
    "use server";
    done(base, await createPost(await actor(), muelleId, formData.get("body")?.toString()));
  }

  async function comentar(formData: FormData) {
    "use server";
    done(base, await addComment(await actor(), formData.get("postId")?.toString() ?? "", formData.get("body")?.toString()));
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Comunidad</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <form action={publicar}>
        <label>
          Publicación <textarea name="body" required maxLength={4000} />
        </label>
        <button type="submit">Publicar</button>
      </form>
      <ul>
        {feed.map((p) => (
          <li key={p.id}>
            <p>{p.body}</p>
            <small>
              {p.authorName ?? "Integrante"} · {p.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · {p.comments} comentarios
            </small>
            <form action={comentar}>
              <input type="hidden" name="postId" value={p.id} />
              <label>
                Comentario <input name="body" required maxLength={2000} />
              </label>
              <button type="submit">Comentar</button>
            </form>
          </li>
        ))}
        {feed.length === 0 && <li>Todavía no hay publicaciones.</li>}
      </ul>
    </main>
  );
}
