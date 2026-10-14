"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Colecao, Config, DB, EscopoId, Registro } from "@/lib/types";

type Op =
  | { op: "upsert"; col: Colecao; item: Registro }
  | { op: "delete"; col: Colecao; id: string }
  | { op: "config"; config: Config };

interface Ctx {
  db: DB;
  salvar: (ops: Op[]) => Promise<void>;
  upsert: (col: Colecao, item: Registro) => Promise<void>;
  remover: (col: Colecao, id: string) => Promise<void>;
  escopo: EscopoId | "";
  setEscopo: (e: EscopoId | "") => void;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<Ctx | null>(null);

export function useDB() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useDB fora do provider");
  return c;
}

export function DBProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<EscopoId | "">("");

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/db", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDb(await r.json());
    } catch (e) {
      setErro(`Não foi possível carregar os dados (${(e as Error).message}). Rode "python scripts/importar.py" para criar data/db.json.`);
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(recarregar, 0);
    // Mantém sincronizado quando outra pessoa edita.
    const t = setInterval(() => document.visibilityState === "visible" && recarregar(), 60000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [recarregar]);

  const salvar = useCallback(async (ops: Op[]) => {
    const r = await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
    const j = await r.json();
    if (r.status === 401) {
      alert("Sua sessão expirou. Entre de novo — a última alteração não foi salva.");
      window.location.href = "/login";
      return;
    }
    if (!r.ok) {
      alert(`Erro ao salvar: ${j.erro ?? r.status}`);
      return;
    }
    setDb(j);
  }, []);

  if (erro) return <div className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{erro}</div>;
  if (!db) return <div className="m-8 text-stone-500">Carregando…</div>;

  return (
    <Contexto.Provider
      value={{
        db,
        salvar,
        upsert: (col, item) => salvar([{ op: "upsert", col, item }]),
        remover: (col, id) => salvar([{ op: "delete", col, id }]),
        escopo,
        setEscopo,
        recarregar,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
