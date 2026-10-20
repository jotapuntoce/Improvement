"use client";

// "Iniciar sesión" abre el login encima de la página, como en whop.com: <dialog> nativo (Escape y
// clic fuera lo cierran). /login sigue existiendo para entrar directo o al volver de una ruta privada.
import { Suspense, useRef } from "react";
import { LoginForm } from "./LoginForm.tsx";
import s from "./Sitio.module.css";

export function LoginModal({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`${s.entrarBoton} ${className}`} onClick={() => ref.current?.showModal()}>
        Iniciar sesión
      </button>
      <dialog
        ref={ref}
        className={s.modal}
        aria-label="Iniciar sesión"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <Suspense fallback={null}>
          <LoginForm enModal />
        </Suspense>
      </dialog>
    </>
  );
}
