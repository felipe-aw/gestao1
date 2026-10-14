import { cookies } from "next/headers";
import { connection } from "next/server";
import { COOKIE_SESSAO, validarToken } from "@/lib/auth";
import { aplicar, lerDB, type Op } from "@/lib/db.server";

// O proxy já bloqueia quem não está logado; a rota confere de novo por segurança.
async function autenticado() {
  return !!(await validarToken((await cookies()).get(COOKIE_SESSAO)?.value));
}

export async function GET() {
  await connection();
  if (!(await autenticado())) return Response.json({ erro: "Não autenticado" }, { status: 401 });
  return Response.json(await lerDB());
}

export async function POST(request: Request) {
  if (!(await autenticado())) return Response.json({ erro: "Não autenticado" }, { status: 401 });
  const { ops } = (await request.json()) as { ops: Op[] };
  try {
    return Response.json(await aplicar(ops));
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 400 });
  }
}
