# Correos de Supabase Auth — Improvement

Se pegan en Supabase → Authentication → Emails → Templates (proyecto `improvement`). Los colores van
escritos porque los clientes de correo no leen los tokens de `packages/ui/src/tokens.css`; son los
mismos valores (`--bg`, `--brand-improvement-1`, `--brand-improvement-2`).

Los enlaces apuntan a `{{ .SiteURL }}/auth/callback?token_hash=…` (jotapuntoce.com), no a
`{{ .ConfirmationURL }}` (supabase.co): un enlace a otro dominio que el remitente es señal de spam.
`app/auth/callback/page.tsx` canjea el token con `verifyOtp`. El GIF de arriba (isotipo red → sólido)
vive en `apps/improvement/public/brand/isotipo-correo.gif` y se regenera con `isotipo-correo.py`.

**Foto de perfil en Gmail:** Gmail muestra la foto de la cuenta de Google del remitente. Grupo de
Google Workspace `improvement@jotapuntoce.com` (para recibir el código) → cuenta de Google con "usar
mi correo actual" → foto `apps/improvement/public/brand/isotipo-avatar.png`. La foto de perfil es
fija (Gmail no anima avatares); la animación va dentro del correo.

Remitente (SMTP Settings): **Improvement** `<improvement@jotapuntoce.com>` vía Resend (dominio verificado 2026-11-04)
(`smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key de Resend).

## Confirm signup

**Asunto:** Confirma tu correo para entrar a tu Improvement

```html
<div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f4f6fb">
  <div style="max-width:480px;margin:0 auto;background:#0b0d12;border:1px solid #1f2a24;border-radius:22px;padding:32px;text-align:center">
    <img src="https://jotapuntoce.com/improvement/brand/isotipo-correo.gif" width="80" height="80" alt="Improvement" style="display:block;margin:0 auto 12px;border:0">
    <p style="margin:0 0 8px;color:#1fbe79;letter-spacing:.14em;font-size:12px;font-weight:700">IMPROVEMENT</p>
    <h1 style="margin:0 0 12px;font-size:24px">Confirma tu correo</h1>
    <p style="margin:0 0 24px;color:#aab3c2;font-size:15px;line-height:1.5">
      Un clic y tu negocio digital empieza a armarse.
    </p>
    <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#1fbe79;background-image:linear-gradient(135deg,#1fbe79,#98e33b);color:#05060b;font-weight:700;text-decoration:none">
      Confirmar y entrar
    </a>
    <p style="margin:20px 0 0;color:#aab3c2;font-size:13px;line-height:1.5">Improvement es tu director general digital: te dice qué falta en tu negocio y te lleva paso a paso para resolverlo.</p>
    <p style="margin:16px 0 0;color:#6b7386;font-size:13px">Si no creaste una cuenta, ignora este correo.</p>
  </div>
</div>
```

## Reset password

**Asunto:** Crea tu nueva contraseña de Improvement

```html
<div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f4f6fb">
  <div style="max-width:480px;margin:0 auto;background:#0b0d12;border:1px solid #1f2a24;border-radius:22px;padding:32px;text-align:center">
    <img src="https://jotapuntoce.com/improvement/brand/isotipo-correo.gif" width="80" height="80" alt="Improvement" style="display:block;margin:0 auto 12px;border:0">
    <p style="margin:0 0 8px;color:#1fbe79;letter-spacing:.14em;font-size:12px;font-weight:700">IMPROVEMENT</p>
    <h1 style="margin:0 0 12px;font-size:24px">Nueva contraseña</h1>
    <p style="margin:0 0 24px;color:#aab3c2;font-size:15px;line-height:1.5">
      Pediste cambiar tu contraseña. El enlace sirve una sola vez.
    </p>
    <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#1fbe79;background-image:linear-gradient(135deg,#1fbe79,#98e33b);color:#05060b;font-weight:700;text-decoration:none">
      Crear nueva contraseña
    </a>
    <p style="margin:24px 0 0;color:#6b7386;font-size:13px">Si no lo pediste, ignora este correo; tu contraseña no cambia.</p>
  </div>
</div>
```
