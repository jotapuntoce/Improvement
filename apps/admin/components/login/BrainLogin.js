"use client";

// Pantalla de entrada de JotaPuntoCe: tarjeta de vidrio al frente y el cerebro del logo detrás
// (./brainScene.js). Estilo "dala" de la biblioteca de diseño, adaptado a JotaPuntoCe.
// La autenticación no vive aquí: signInAction es la Server Action de app/login/page.js.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { startBrainScene } from "./brainScene.js";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="jl-btn" type="submit" disabled={pending} aria-busy={pending || undefined}>
      <span className="jl-spin" aria-hidden="true" />
      {pending ? "Entrando" : "Entrar"}
    </button>
  );
}

export default function BrainLogin({ signInAction, hasError }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: hasError ? "El correo o la contraseña no coinciden." : "" });
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => startBrainScene(canvasRef.current, rootRef.current), []);

  function validate(e) {
    const form = e.currentTarget;
    const email = form.email, password = form.password;
    const next = {
      email: !email.value ? "Escribe tu correo." : !email.validity.valid ? "Ese correo no parece completo." : "",
      password: !password.value ? "Escribe tu contraseña." : "",
    };
    setErrors(next);
    if (next.email || next.password) {
      e.preventDefault();
      (next.email ? email : password).focus();
    }
  }

  const passwordMsg = errors.password || (capsLock ? "Bloq Mayús está activado." : "");

  return (
    <div className="jl-root" ref={rootRef}>
      <canvas className="jl-canvas" ref={canvasRef} aria-hidden="true" />

      <header className="jl-header">
        <span className="jl-logo jl-in">JotaPuntoCe<sup>®</sup></span>
        <span className="jl-spacer" />
        <a className="jl-btn jl-in" href="#" style={{ animationDelay: ".1s" }}>Solicitar acceso</a>
      </header>

      <main className="jl-stage">
        <div className="jl-card jl-in" style={{ animationDelay: ".5s" }}>
          <h1 className="jl-title">Sistemas locos. Ingenio inevitable.</h1>

          <form action={signInAction} onSubmit={validate} noValidate className="jl-form">
            <label className="jl-sr" htmlFor="email">Correo</label>
            <div className={`jl-pill${errors.email ? " jl-bad" : ""}`}>
              <input id="email" name="email" type="email" placeholder="Correo" autoComplete="username" inputMode="email"
                autoCapitalize="off" spellCheck={false} required aria-invalid={!!errors.email} aria-describedby="email-msg"
                onInput={() => setErrors((s) => ({ ...s, email: "" }))} />
            </div>
            <p className="jl-msg" id="email-msg">{errors.email}</p>

            <label className="jl-sr" htmlFor="password">Contraseña</label>
            <div className={`jl-pill${errors.password ? " jl-bad" : ""}`}>
              <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Contraseña"
                autoComplete="current-password" required aria-invalid={!!errors.password} aria-describedby="password-msg"
                onInput={() => setErrors((s) => ({ ...s, password: "" }))}
                onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)} />
              <button type="button" className="jl-toggle" aria-pressed={showPassword} aria-controls="password"
                onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
            <p className="jl-msg" id="password-msg">{passwordMsg}</p>

            <div className="jl-row">
              <SubmitButton />
              <a className="jl-ghost" href="#">Olvidé mi contraseña</a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
