// Envío de WhatsApp vía la REST API de Twilio directa (fetch nativo) — no se agrega el SDK `twilio`
// como dependencia nueva: la llamada es un POST simple con auth básica, Node ya trae fetch (CLAUDE.md
// §8: revisa primero si algo existente ya lo resuelve antes de sumar una dependencia).
//
// Server-only — nunca se importa desde un archivo "use client" (mismo régimen que lib/db.js: las
// credenciales de Twilio no deben llegar al bundle del navegador).
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
// Formato esperado: "whatsapp:+14155238886" (con el prefijo "whatsapp:" ya incluido, tal como Twilio
// lo pide en el campo From).
const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

function isConfigured() {
  return Boolean(accountSid && authToken && fromNumber);
}

/**
 * Envía un mensaje de WhatsApp vía Twilio. Nunca lanza si Twilio no está configurado — devuelve
 * { ok:false, reason:"not_configured" } para que el caller decida cómo avisar (el flujo de
 * provisión de un prospecto no debe fallar completo solo porque falta configurar Twilio).
 *
 * @param {{ to: string, body: string }} args - `to` en formato E.164 (ej: "+525512345678"),
 *   con o sin el prefijo "whatsapp:" (se normaliza aquí).
 */
export async function sendWhatsAppMessage({ to, body }) {
  if (!isConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: normalizedTo, From: fromNumber, Body: body });

  let res;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch (err) {
    return { ok: false, reason: "network_error", detail: err?.message ?? String(err) };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "twilio_error", status: res.status, detail };
  }

  const data = await res.json();
  return { ok: true, sid: data.sid };
}

export const whatsappConfigured = isConfigured;
