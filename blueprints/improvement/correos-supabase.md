# Correos de Supabase Auth — Improvement

Se pegan en Supabase → Authentication → Emails → Templates (proyecto `improvement`). Los colores van
escritos porque los clientes de correo no leen los tokens de `packages/ui/src/tokens.css`; son los
mismos valores (`--bg`, `--brand-improvement-1`, `--brand-improvement-2`).

Remitente (SMTP Settings): **Improvement** `<hola@jotapuntoce.com>` vía Resend
(`smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key de Resend).

## Confirm signup

**Asunto:** Confirma tu correo para entrar a tu Improvement

```html
<div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f4f6fb">
  <div style="max-width:480px;margin:0 auto;background:#0b0d12;border:1px solid #1f2a24;border-radius:22px;padding:32px;text-align:center">
    <p style="margin:0 0 8px;color:#1fbe79;letter-spacing:.14em;font-size:12px;font-weight:700">IMPROVEMENT</p>
    <h1 style="margin:0 0 12px;font-size:24px">Confirma tu correo</h1>
    <p style="margin:0 0 24px;color:#aab3c2;font-size:15px;line-height:1.5">
      Un clic y tu negocio digital empieza a armarse.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#1fbe79;background-image:linear-gradient(135deg,#1fbe79,#98e33b);color:#05060b;font-weight:700;text-decoration:none">
      Confirmar y entrar
    </a>
    <p style="margin:24px 0 0;color:#6b7386;font-size:13px">Si no creaste una cuenta, ignora este correo.</p>
  </div>
</div>
```

## Reset password

**Asunto:** Crea tu nueva contraseña de Improvement

```html
<div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f4f6fb">
  <div style="max-width:480px;margin:0 auto;background:#0b0d12;border:1px solid #1f2a24;border-radius:22px;padding:32px;text-align:center">
    <p style="margin:0 0 8px;color:#1fbe79;letter-spacing:.14em;font-size:12px;font-weight:700">IMPROVEMENT</p>
    <h1 style="margin:0 0 12px;font-size:24px">Nueva contraseña</h1>
    <p style="margin:0 0 24px;color:#aab3c2;font-size:15px;line-height:1.5">
      Pediste cambiar tu contraseña. El enlace sirve una sola vez.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#1fbe79;background-image:linear-gradient(135deg,#1fbe79,#98e33b);color:#05060b;font-weight:700;text-decoration:none">
      Crear nueva contraseña
    </a>
    <p style="margin:24px 0 0;color:#6b7386;font-size:13px">Si no lo pediste, ignora este correo; tu contraseña no cambia.</p>
  </div>
</div>
```
