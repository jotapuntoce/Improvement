"use client";
// Escucha los cambios de `message` del canal abierto con el JWT del usuario: RLS decide qué eventos
// llegan. No pinta mensajes; solo pide al servidor la página otra vez.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export function ChannelLive({
  channelId,
  accessToken,
  url,
  anonKey,
}: {
  channelId: string;
  accessToken: string;
  url: string;
  anonKey: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("CONNECTING");

  useEffect(() => {
    // `accessToken` como callback: si no, el cliente re-autentica Realtime con su propia sesión (vacía)
    // y manda la anon key, y RLS deja de entregar eventos — falla intermitente vista en el e2e.
    const supabase = createClient(url, anonKey, { accessToken: async () => accessToken });
    void supabase.realtime.setAuth(accessToken);
    const sub = supabase
      .channel(`canal-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message", filter: `channel_id=eq.${channelId}` }, () =>
        router.refresh(),
      )
      .subscribe((s) => setStatus(s));
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [channelId, accessToken, url, anonKey, router]);

  return <span hidden data-realtime={status} />;
}
