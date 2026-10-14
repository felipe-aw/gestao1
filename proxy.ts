import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, validarToken } from "@/lib/auth";

// Exige login em tudo, exceto a tela de login, a rota de login e arquivos estáticos.
export async function proxy(request: NextRequest) {
  const usuario = await validarToken(request.cookies.get(COOKIE_SESSAO)?.value);
  if (usuario) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
