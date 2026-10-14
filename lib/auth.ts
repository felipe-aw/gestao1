// Login simples (usuário único) com sessão em cookie assinado (HMAC-SHA256).
// Credenciais ficam em .env.local (fora do Git) — veja .env.example:
//   GESTAO_USUARIO, GESTAO_SENHA, GESTAO_SEGREDO

export const COOKIE_SESSAO = "gestao_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7; // 7 dias

const USUARIO = process.env.GESTAO_USUARIO ?? "admin";
const SENHA = process.env.GESTAO_SENHA ?? "";
const SEGREDO = process.env.GESTAO_SEGREDO || `gestao-sofitel::${USUARIO}::${SENHA}`;

if (!SENHA) console.error("[auth] GESTAO_SENHA não definida (.env.local) — ninguém consegue entrar.");

// Espaços são ignorados na senha ("abc 123" = "abc123").
const semEspacos = (s: string) => s.replace(/\s+/g, "");

export function credenciaisValidas(usuario: string, senha: string): boolean {
  if (!SENHA) return false;
  return usuario.trim().toLowerCase() === USUARIO.toLowerCase() && semEspacos(senha) === semEspacos(SENHA);
}

async function assinar(dados: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(dados));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token "usuario.expiracao.assinatura". */
export async function criarToken(usuario: string): Promise<string> {
  const dados = `${encodeURIComponent(usuario)}.${Math.floor(Date.now() / 1000) + DURACAO_SESSAO_S}`;
  return `${dados}.${await assinar(dados)}`;
}

/** Devolve o usuário da sessão, ou null se o token for inválido/expirado. */
export async function validarToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [usuario, exp, sig] = partes;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const esperado = await assinar(`${usuario}.${exp}`);
  if (esperado.length !== sig.length) return null;
  let dif = 0;
  for (let i = 0; i < sig.length; i++) dif |= esperado.charCodeAt(i) ^ sig.charCodeAt(i);
  return dif === 0 ? decodeURIComponent(usuario) : null;
}

export const opcoesCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  // A obra acessa por http na rede local; só exige https se GESTAO_HTTPS=1.
  secure: process.env.GESTAO_HTTPS === "1",
  path: "/",
  maxAge: DURACAO_SESSAO_S,
};
