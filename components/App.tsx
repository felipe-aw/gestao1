"use client";

import { useState } from "react";
import { ESCOPOS, hojeISO, pendenciaAberta, pendenciaVencida, statusAtividade } from "@/lib/logic";
import { DBProvider, useDB } from "./store";
import Painel from "./Painel";
import Cronograma from "./Cronograma";
import Agenda from "./Agenda";
import Itens from "./Itens";
import Pendencias from "./Pendencias";
import Empresas from "./Empresas";
import Equipes from "./Equipes";
import Configuracoes from "./Configuracoes";

export type Aba = "painel" | "cronograma" | "agenda" | "itens" | "pendencias" | "empresas" | "equipes" | "config";

const MENU: { id: Aba; nome: string }[] = [
  { id: "painel", nome: "Painel" },
  { id: "cronograma", nome: "Cronograma" },
  { id: "agenda", nome: "Agenda semanal" },
  { id: "itens", nome: "Andares e itens" },
  { id: "pendencias", nome: "Pendências" },
  { id: "empresas", nome: "Empresas" },
  { id: "equipes", nome: "Equipes" },
  { id: "config", nome: "Configurações" },
];

export default function App() {
  return (
    <DBProvider>
      <Shell />
    </DBProvider>
  );
}

async function sair() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}

function Shell() {
  const { db, escopo, setEscopo } = useDB();
  // Shell só renderiza no cliente (após carregar os dados), então ler o hash aqui é seguro.
  const [aba, setAbaState] = useState<Aba>(() => {
    const h = window.location.hash.slice(1) as Aba;
    return MENU.some((m) => m.id === h) ? h : "painel";
  });
  const setAba = (a: Aba) => {
    setAbaState(a);
    history.replaceState(null, "", `#${a}`);
  };
  const hoje = hojeISO();

  const nPend = db.pendencias.filter((p) => pendenciaAberta(p) && (!escopo || p.escopo === escopo)).length;
  const nVenc = db.pendencias.filter((p) => pendenciaVencida(p, hoje) && (!escopo || p.escopo === escopo)).length;
  const macroEsc = new Map(db.macros.map((m) => [m.id, m.escopo]));
  const nAtras = db.atividades.filter((a) => (!escopo || macroEsc.get(a.macroId) === escopo) && statusAtividade(a, hoje) === "Atrasada").length;
  const badge: Partial<Record<Aba, { n: number; alerta: boolean }>> = {
    pendencias: { n: nPend, alerta: nVenc > 0 },
    cronograma: { n: nAtras, alerta: nAtras > 0 },
  };

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-900">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="border-b border-stone-200 px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Gestão da obra</div>
          <div className="text-lg font-semibold">{db.config.obra}</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {MENU.map((m) => (
            <button
              key={m.id}
              onClick={() => setAba(m.id)}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${aba === m.id ? "bg-blue-50 font-semibold text-blue-800" : "text-stone-700 hover:bg-stone-100"}`}
            >
              {m.nome}
              {badge[m.id] && badge[m.id]!.n > 0 && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${badge[m.id]!.alerta ? "bg-red-100 text-red-800" : "bg-stone-200 text-stone-700"}`}>{badge[m.id]!.n}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-stone-200 p-4 text-xs text-stone-500">
          <span>Hoje: {hoje.split("-").reverse().join("/")}</span>
          <button onClick={sair} className="rounded px-2 py-1 font-medium text-stone-700 hover:bg-stone-100" title="Encerrar a sessão">
            Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex gap-1 overflow-x-auto px-4 pt-2 md:hidden">
            <button onClick={sair} className="whitespace-nowrap rounded-md px-2.5 py-1 text-sm text-stone-600">
              Sair
            </button>
            {MENU.map((m) => (
              <button key={m.id} onClick={() => setAba(m.id)} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm ${aba === m.id ? "bg-blue-50 font-semibold text-blue-800" : "text-stone-600"}`}>
                {m.nome}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
            <span className="mr-1 text-xs font-medium text-stone-500">Escopo:</span>
            <FiltroBtn ativo={!escopo} onClick={() => setEscopo("")}>
              Todos
            </FiltroBtn>
            {ESCOPOS.map((e) => (
              <FiltroBtn key={e.id} ativo={escopo === e.id} onClick={() => setEscopo(e.id)}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.cor }} />
                {e.nome}
              </FiltroBtn>
            ))}
          </div>
        </header>
        <main className="p-4 md:p-6">
          {aba === "painel" && <Painel irPara={setAba} />}
          {aba === "cronograma" && <Cronograma />}
          {aba === "agenda" && <Agenda />}
          {aba === "itens" && <Itens />}
          {aba === "pendencias" && <Pendencias />}
          {aba === "empresas" && <Empresas />}
          {aba === "equipes" && <Equipes />}
          {aba === "config" && <Configuracoes />}
        </main>
      </div>
    </div>
  );
}

function FiltroBtn({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${ativo ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}
    >
      {children}
    </button>
  );
}
