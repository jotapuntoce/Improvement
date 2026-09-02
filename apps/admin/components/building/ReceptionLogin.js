"use client";

// Recepción de JotaPuntoCe — lo que aparece después del zoom del edificio. La Server Action real
// (signIn, definida en app/login/page.js, la misma de siempre: Supabase Auth + cookie httpOnly)
// llega como prop; este archivo solo le da la ambientación de mostrador/recepción.
export default function ReceptionLogin({ signInAction, hasError, onBack }) {
  return (
    <div className="jpc-reception">
      <div className="jpc-reception-wall">
        <p className="jpc-reception-eyebrow">Recepción</p>
        <p className="jpc-reception-word">JOTAPUNTOCE</p>
        <p className="jpc-reception-sub">Bienvenido de vuelta</p>
      </div>
      <form className="jpc-reception-card" action={signInAction}>
        <label className="jpc-field-label">
          Email
          <input className="jpc-field-input" type="email" name="email" required />
        </label>
        <label className="jpc-field-label">
          Contraseña
          <input className="jpc-field-input" type="password" name="password" required />
        </label>
        {hasError && <p className="jpc-reception-error">Email o contraseña incorrectos.</p>}
        <button className="jpc-reception-submit" type="submit">
          Entrar
        </button>
        <button className="jpc-back-link" type="button" onClick={onBack}>
          ← Volver afuera
        </button>
      </form>
    </div>
  );
}
