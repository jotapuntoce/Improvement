// apps/improvement/server/import/drive.ts
// Baja de Google Drive el archivo que el dueño eligió en el Picker, con el token que Google le dio en
// su navegador (alcance drive.file: solo ese archivo). Solo habla con el host fijo de la API de
// Drive y el token nunca se guarda ni se escribe en logs. Sin guard: lo llama la Server Action de
// importar, y lo que baja entra por createImportJob, que sí verifica al dueño.
import { MAX_BYTES, type UploadedFile } from "./parse.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

const API = "https://www.googleapis.com/drive/v3/files/";
const SHEET = "application/vnd.google-apps.spreadsheet";

export async function fetchDriveFile(
  fileId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<UploadedFile & { source?: "sheets" }>> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !accessToken) return fail("Vuelve a elegir el archivo de Drive.");
  const init = { headers: { Authorization: `Bearer ${accessToken}` } };
  const gone = fail("No pudimos abrir ese archivo de Drive; vuelve a elegirlo.", "NOT_FOUND");
  try {
    const meta = await fetchImpl(`${API}${fileId}?fields=name,mimeType,size`, init);
    if (!meta.ok) return gone;
    const { name, mimeType, size } = (await meta.json()) as { name: string; mimeType: string; size?: string };
    if (Number(size ?? 0) > MAX_BYTES) return fail("El archivo pasa de 5 MB.");
    const isSheet = mimeType === SHEET;
    const body = await fetchImpl(isSheet ? `${API}${fileId}/export?mimeType=${encodeURIComponent("text/csv")}` : `${API}${fileId}?alt=media`, init);
    if (!body.ok) return gone;
    const bytes = new Uint8Array(await body.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return fail("El archivo pasa de 5 MB.");
    return isSheet
      ? { ok: true, data: { name: `${name}.csv`, type: "text/csv", bytes, source: "sheets" } }
      : { ok: true, data: { name, type: mimeType, bytes } };
  } catch {
    return fail("Google Drive no respondió; intenta de nuevo.", "INTERNAL");
  }
}
