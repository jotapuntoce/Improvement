// Único punto no autenticado de apps/improvement. Server Component delgado: envuelve LoginForm (la
// hoja "use client" real) en <Suspense> porque useSearchParams() lo exige para poder prerenderizarse
// — ver LoginForm.tsx para el resto del comportamiento y la nota de sesión.
import { Suspense } from "react";
import { LoginForm } from "./LoginForm.tsx";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
