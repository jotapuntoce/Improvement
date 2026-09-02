// Único propósito: reenviar el pathname actual como header hacia los Server Components (headers()
// no expone la URL de la request por sí solo — ver app/layout.js, que lo usa para decidir si
// renderiza el Sidebar/Topbar). No toca auth ni redirige nada — requirePlatformAdmin() sigue siendo
// el único guard real, esto es puramente informativo para el layout.
import { NextResponse } from "next/server";

export function proxy(request) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
