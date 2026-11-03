"use client";
// Enlace de la barra que se marca cuando estás en su sección. El layout no se vuelve a pintar al
// navegar, así que la ruta actual solo se conoce aquí, en el cliente.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}
