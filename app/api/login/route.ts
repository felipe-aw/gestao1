import { NextResponse } from "next/server";
import { COOKIE_SESSAO, credenciaisValidas, criarToken, opcoesCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const { usuario = "", senha = "" } = (await request.json().catch(() => ({}))) as { usuario?: string; senha?: string };
  if (!credenciaisValidas(usuario, senha)) {
    // Atraso pequeno para dificultar tentativas em sequência.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, usuario: usuario.trim().toLowerCase() });
  res.cookies.set(COOKIE_SESSAO, await criarToken(usuario.trim().toLowerCase()), opcoesCookie);
  return res;
}
