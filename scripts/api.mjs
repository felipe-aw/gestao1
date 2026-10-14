// Acesso à API do sistema pelos scripts: faz login e devolve um fetch que envia o cookie da sessão.
// Credenciais: variáveis GESTAO_USUARIO / GESTAO_SENHA ou, se não definidas, o arquivo .env.local.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function lerEnvLocal() {
  const arq = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (!fs.existsSync(arq)) return {};
  return Object.fromEntries(
    fs.readFileSync(arq, "utf8").split(/\r?\n/).filter((l) => /^\s*[A-Z_]+\s*=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
}

export async function conectar(urlApi) {
  const env = { ...lerEnvLocal(), ...process.env };
  const r = await fetch(new URL("/api/login", new URL(urlApi)), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: env.GESTAO_USUARIO ?? "admin", senha: env.GESTAO_SENHA ?? "" }),
  });
  if (!r.ok) throw new Error(`Login na API falhou (${r.status}). Confira GESTAO_USUARIO / GESTAO_SENHA no .env.local.`);
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  return (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), cookie } });
}
