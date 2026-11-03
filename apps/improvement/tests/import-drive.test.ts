// Bajar de Google Drive el archivo que el dueño eligió en el Picker: solo al host de Google, con
// fileId validado, Sheets exportadas a CSV y el mismo tope de 5 MB. fetch simulado; nunca se llama a Google.
import { describe, expect, it, vi } from "vitest";
import { fetchDriveFile } from "../server/import/drive.ts";

const ID = "1AbC_dEf-GhIjKlMnOp";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchDriveFile", () => {
  it("WHEN el archivo elegido es una Google Sheet THE SYSTEM SHALL exportarla a CSV", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ name: "Clientes", mimeType: "application/vnd.google-apps.spreadsheet" }))
      .mockResolvedValueOnce(new Response("Nombre\nAna"));
    const r = await fetchDriveFile(ID, "tok", fetchImpl);
    expect(r).toMatchObject({ ok: true, data: { name: "Clientes.csv", type: "text/csv", source: "sheets" } });
    expect(r.ok && new TextDecoder().decode(r.data.bytes)).toBe("Nombre\nAna");
    expect(fetchImpl.mock.calls[1]![0]).toBe(`https://www.googleapis.com/drive/v3/files/${ID}/export?mimeType=text%2Fcsv`);
    expect(fetchImpl.mock.calls[0]![1]).toEqual({ headers: { Authorization: "Bearer tok" } });
  });

  it("WHEN es un archivo normal THE SYSTEM SHALL bajarlo con alt=media, y si pasa de 5 MB no lo baja", async () => {
    const ok = vi.fn()
      .mockResolvedValueOnce(json({ name: "lista.pdf", mimeType: "application/pdf", size: "2048" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    expect(await fetchDriveFile(ID, "tok", ok)).toMatchObject({ ok: true, data: { name: "lista.pdf", type: "application/pdf" } });
    expect(ok.mock.calls[1]![0]).toBe(`https://www.googleapis.com/drive/v3/files/${ID}?alt=media`);

    const big = vi.fn().mockResolvedValueOnce(json({ name: "x.xlsx", mimeType: "x", size: String(6 * 1024 * 1024) }));
    expect(await fetchDriveFile(ID, "tok", big)).toMatchObject({ ok: false, error: { message: "El archivo pasa de 5 MB." } });
    expect(big).toHaveBeenCalledTimes(1);
  });

  it("WHEN el fileId trae caracteres raros THE SYSTEM SHALL negarlo sin llamar a Google", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchDriveFile("../etc/passwd", "tok", fetchImpl)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await fetchDriveFile(ID, "", fetchImpl)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("WHEN Google responde 401, 403 o 404 THE SYSTEM SHALL pedir que vuelva a elegir el archivo", async () => {
    for (const status of [401, 403, 404]) {
      const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: {} }, status));
      expect(await fetchDriveFile(ID, "tok", fetchImpl)).toMatchObject({ ok: false, error: { message: "No pudimos abrir ese archivo de Drive; vuelve a elegirlo." } });
    }
  });
});
