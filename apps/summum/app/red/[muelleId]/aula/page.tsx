// Aula de la red: cursos publicados con candado por nivel. El nivel sale de los puntos de la comunidad.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { completeLesson, listCourses } from "@/server/community/classroom.ts";
import { levelFor, memberPoints } from "@/server/community/levels.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";

export default async function AulaPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/aula`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const courses = await listCourses(userId, muelleId);
  const level = levelFor((await memberPoints(muelleId)).get(userId) ?? 0);

  async function vista(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await completeLesson(actor, formData.get("lessonId")?.toString() ?? "");
    if (!r.ok) redirect(`${base}?error=${errorCode(r.error)}`);
    revalidatePath(base);
    redirect(base);
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Aula</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <p>Nivel {level}</p>
      {courses.map((c) => (
        <section key={c.id} aria-label={c.title}>
          <h2>{c.title}</h2>
          {c.description && <p>{c.description}</p>}
          {c.locked ? (
            <p>Se abre en el nivel {c.minLevel}</p>
          ) : (
            <ul>
              {c.lessons.map((l) => (
                <li key={l.id}>
                  {l.title}
                  {l.videoUrl && (
                    <>
                      {" "}
                      · <a href={l.videoUrl} target="_blank" rel="noreferrer">Ver video</a>
                    </>
                  )}
                  <form action={vista} style={{ display: "inline-flex" }}>
                    <input type="hidden" name="lessonId" value={l.id} />
                    <button type="submit">Marcar como vista</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {courses.length === 0 && <p>Todavía no hay cursos publicados.</p>}
    </main>
  );
}
