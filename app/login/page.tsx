"use client";

import { useState } from "react";

export default function Login() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, senha }) });
      if (r.ok) {
        window.location.href = "/";
        return;
      }
      setErro((await r.json().catch(() => ({}))).erro ?? "Não foi possível entrar.");
    } catch {
      setErro("Sem conexão com o servidor.");
    }
    setEntrando(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Gestão da obra</div>
          <h1 className="text-xl font-semibold text-stone-900">Sofitel</h1>
        </div>
        <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-stone-600">
          Usuário
          <input
            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="mb-4 flex flex-col gap-1 text-xs font-medium text-stone-600">
          Senha
          <input
            type="password"
            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {erro && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            ▲ {erro}
          </p>
        )}
        <button type="submit" disabled={entrando} className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
