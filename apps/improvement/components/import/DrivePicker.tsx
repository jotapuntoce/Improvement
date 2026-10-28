"use client";
// "Elegir de Google Drive": pide a Google un token con alcance drive.file (solo el archivo que se
// elija), abre el Picker y manda el fileId y el token al formulario que lo contiene (una Server
// Action). Los scripts de Google se cargan al primer clic, no al abrir la página.
import { useRef, useState } from "react";

interface PickerDoc { id: string }
interface PickerData { action: string; docs?: PickerDoc[] }
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setCallback(cb: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface GoogleWindow {
  gapi: { load(lib: string, cb: () => void): void };
  google: {
    accounts: { oauth2: { initTokenClient(cfg: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }): { requestAccessToken(): void } } };
    picker: {
      PickerBuilder: new () => PickerBuilder;
      DocsView: new (viewId?: string) => { setMimeTypes(types: string): unknown };
      ViewId: { SPREADSHEETS: string };
      Action: { PICKED: string };
    };
  };
}

const TYPES = "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/png,image/jpeg,image/webp";

const loaded = new Map<string, Promise<void>>();
function load(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(src));
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src)!;
}

export function DrivePicker({ clientId, apiKey, appId }: { clientId: string; apiKey: string; appId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      await Promise.all([load("https://apis.google.com/js/api.js"), load("https://accounts.google.com/gsi/client")]);
      const w = window as unknown as GoogleWindow;
      await new Promise<void>((resolve) => w.gapi.load("picker", resolve));
      const { google } = w;
      google.accounts.oauth2
        .initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (r) => {
            if (!r.access_token) return setError("Google no dio permiso para abrir tu Drive.");
            const token = r.access_token;
            new google.picker.PickerBuilder()
              .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS))
              .addView(new google.picker.DocsView().setMimeTypes(TYPES))
              .setOAuthToken(token)
              .setDeveloperKey(apiKey)
              .setAppId(appId)
              .setCallback((data) => {
                const doc = data.action === google.picker.Action.PICKED ? data.docs?.[0] : undefined;
                if (!doc || !fileRef.current || !tokenRef.current) return;
                fileRef.current.value = doc.id;
                tokenRef.current.value = token;
                fileRef.current.form?.requestSubmit();
              })
              .build()
              .setVisible(true);
          },
        })
        .requestAccessToken();
    } catch {
      setError("No pudimos abrir Google Drive; revisa tu conexión e intenta de nuevo.");
    }
  }

  return (
    <>
      <input ref={fileRef} type="hidden" name="fileId" />
      <input ref={tokenRef} type="hidden" name="token" />
      <button type="button" className="panel-btn-ghost" onClick={pick}>Elegir de Google Drive</button>
      {error && <p className="invite-error" role="alert">{error}</p>}
    </>
  );
}
