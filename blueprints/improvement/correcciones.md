# Correcciones de Improvement — recorrido del 2026-11-03

Versión revisada: worktree `.worktrees/improvement-odoo`, rama `improvement-perfil-config` (PR #12).
Se anotan aquí sección por sección; se aplican todas juntas al final.

## 1. Entrada (`/login`, `/registro`, `/auth/*`, `/invitacion`) — aplicada 2026-11-04, gate verde

Pendiente fuera del código: Redirect URLs de Supabase Auth con `/auth/callback` (local y Vercel), y
probar el correo de confirmación con una cuenta real.

1. **Rediseñar el login.** Hoy es un formulario suelto sin tarjeta ni subtítulo.
2. **"¿Nuevo? Crea tu cuenta" más grande** — el texto y el botón; hoy es un link chico.
3. **Rediseñar el registro "Crea tu Improvement".** Que haga juego con el login nuevo.
4. **Bug: en el registro no se puede confirmar el correo.**
   - Causa probable (`app/registro/RegistroForm.tsx:26`): `signUp` no manda `emailRedirectTo`, así que el
     enlace del correo lleva a la "Site URL" de Supabase y no de regreso a la app; además el error de
     `signUp` se ignora.
   - Por revisar al aplicar: Site URL y Redirect URLs en Supabase Auth, y si el correo llega (el SMTP
     por default de Supabase tiene límite de envíos por hora).
   - Arreglo: `emailRedirectTo: <origen>/auth/callback` y mostrar el error real.
