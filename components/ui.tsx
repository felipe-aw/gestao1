"use client";

import { useEffect, type ReactNode } from "react";
import { escopoDef } from "@/lib/logic";
import type { EscopoId } from "@/lib/types";

export function Modal({ titulo, onFechar, children, largura = "max-w-2xl" }: { titulo: string; onFechar: () => void; children: ReactNode; largura?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onMouseDown={onFechar}>
      <div className={`w-full ${largura} rounded-xl bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button className="rounded px-2 text-xl leading-none text-stone-500 hover:bg-stone-100" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ rotulo, children, className = "" }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-stone-600 ${className}`}>
      {rotulo}
      {children}
    </label>
  );
}

export const inputCls =
  "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function Texto({ value, onChange, ...rest }: { value?: string | number | null; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Data({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  return <input type="date" className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />;
}

export function Selecao({
  value,
  onChange,
  opcoes,
  vazio = "—",
}: {
  value?: string | number | null;
  onChange: (v: string) => void;
  opcoes: (string | { v: string | number; t: string })[];
  vazio?: string | false;
}) {
  return (
    <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {vazio !== false && <option value="">{vazio}</option>}
      {opcoes.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.v} value={o.v}>
            {o.t}
          </option>
        ),
      )}
    </select>
  );
}

export function Botao({ children, onClick, tipo = "secundario", type = "button", disabled }: { children: ReactNode; onClick?: () => void; tipo?: "primario" | "secundario" | "perigo" | "fantasma"; type?: "button" | "submit"; disabled?: boolean }) {
  const cls = {
    primario: "bg-blue-600 text-white hover:bg-blue-700",
    secundario: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
    perigo: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    fantasma: "text-stone-600 hover:bg-stone-100",
  }[tipo];
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

export function EscopoTag({ escopo, curto = true }: { escopo: EscopoId; curto?: boolean }) {
  const d = escopoDef(escopo);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-stone-700">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.cor }} />
      {curto ? d.curto : d.nome}
    </span>
  );
}

// Status: cor reservada + ícone + rótulo (nunca só cor).
const STATUS: Record<string, { cor: string; fundo: string; icone: string }> = {
  bom: { cor: "#0a7a0a", fundo: "#e6f4e6", icone: "✓" },
  aviso: { cor: "#8a5a00", fundo: "#fdf1d6", icone: "◷" },
  serio: { cor: "#a8461f", fundo: "#fbe6dc", icone: "!" },
  critico: { cor: "#b02a2a", fundo: "#f9e0e0", icone: "▲" },
  neutro: { cor: "#52514e", fundo: "#efeeea", icone: "○" },
  andamento: { cor: "#1c5cab", fundo: "#e3eefb", icone: "▶" },
};

export type Tom = keyof typeof STATUS;

export function Pill({ tom, children }: { tom: Tom; children: ReactNode }) {
  const s = STATUS[tom];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: s.cor, background: s.fundo }}>
      <span aria-hidden>{s.icone}</span>
      {children}
    </span>
  );
}

export function tomAtividade(s: string): Tom {
  return s === "Concluída" ? "bom" : s === "Atrasada" ? "critico" : s === "Em andamento" ? "andamento" : "neutro";
}

export function tomItem(s: string): Tom {
  if (s === "Aprovado AW") return "bom";
  if (s.startsWith("Pendência")) return "critico";
  if (s === "Aguardando retorno") return "serio";
  if (s === "Aguardando OK AW") return "aviso";
  if (s.startsWith("Instalado")) return "andamento";
  return "neutro";
}

export function tomPendencia(status: string, vencida: boolean): Tom {
  if (status === "Regularizada") return "bom";
  if (vencida) return "critico";
  if (status === "Aguardando terceiro") return "aviso";
  if (status === "Em regularização") return "andamento";
  return "serio";
}

export function tomPrioridade(p: string): Tom {
  return p === "Alta" ? "critico" : p === "Média" ? "aviso" : "neutro";
}

/** Barra de progresso fina, com valor em texto ao lado. */
export function Barra({ valor, cor = "#2a78d6", largura = "w-24" }: { valor: number; cor?: string; largura?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 ${largura} overflow-hidden rounded-full bg-stone-200`}>
        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: cor }} />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-stone-600">{Math.round(v)}%</span>
    </span>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">{children}</div>;
}

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{titulo}</h1>
        {sub && <p className="text-sm text-stone-500">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{acoes}</div>
    </div>
  );
}

export function baixarCSV(nome: string, linhas: (string | number | undefined | null)[][]) {
  const esc = (v: string | number | undefined | null) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}
