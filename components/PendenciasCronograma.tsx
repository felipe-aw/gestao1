"use client";

import { useMemo, useState } from "react";
import { addDias, diasEntre, escopoDef, fmtData, hojeISO, nomeAndar, pendenciaAberta, pendenciaVencida, segunda } from "@/lib/logic";
import type { Pendencia } from "@/lib/types";
import { useDB } from "./store";
import { Pill, Selecao, tomPendencia, tomPrioridade } from "./ui";

const D = 14; // px por dia
const COR_ABERTA = "#2a78d6";
const COR_OK = "#0ca30c";
const COR_ATRASO = "#d03b3b";

type Agrupar = "empresa" | "equipe" | "responsavel" | "andar" | "escopo";

/** Linha do tempo das pendências: barra da abertura até o prazo (ou regularização), agrupada. */
export default function PendenciasCronograma({ lista, onEditar }: { lista: Pendencia[]; onEditar: (p: Pendencia) => void }) {
  const { db } = useDB();
  const hoje = hojeISO();
  const [agrupar, setAgrupar] = useState<Agrupar>("empresa");

  const chave = (p: Pendencia): string => {
    switch (agrupar) {
      case "empresa":
        return db.empresas.find((e) => e.id === p.empresaId)?.nome ?? "Sem empresa";
      case "equipe":
        return db.equipes.find((e) => e.id === p.equipeId)?.nome ?? "Sem equipe";
      case "responsavel":
        return p.responsavel || db.empresas.find((e) => e.id === p.empresaId)?.nome || "Sem responsável";
      case "andar":
        return nomeAndar(p.andar);
      case "escopo":
        return escopoDef(p.escopo).nome;
    }
  };

  const fimDe = (p: Pendencia) => p.dataRegularizacao ?? (p.prazo && p.prazo > hoje ? p.prazo : hoje);

  const { ini, dias, grupos } = useMemo(() => {
    const datas = lista.flatMap((p) => [p.data, p.prazo, p.dataRegularizacao].filter(Boolean) as string[]);
    const min = [hoje, ...datas].sort()[0];
    const max = [addDias(hoje, 14), ...datas].sort().at(-1)!;
    const ini = segunda(addDias(min, -2));
    const dias = Math.ceil((diasEntre(ini, max) + 8) / 7) * 7;
    const m = new Map<string, Pendencia[]>();
    for (const p of lista) {
      const k = chave(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    const grupos = [...m.entries()]
      .map(([k, ps]) => [k, ps.sort((a, b) => (a.prazo ?? "9").localeCompare(b.prazo ?? "9") || a.num - b.num)] as const)
      .sort((a, b) => {
        // Grupos com mais vencidas primeiro; "Sem …" por último.
        const va = a[1].filter((p) => pendenciaVencida(p, hoje)).length;
        const vb = b[1].filter((p) => pendenciaVencida(p, hoje)).length;
        return Number(a[0].startsWith("Sem ")) - Number(b[0].startsWith("Sem ")) || vb - va || a[0].localeCompare(b[0]);
      });
    return { ini, dias, grupos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, agrupar, db.empresas, db.equipes, hoje]);

  const x = (iso: string) => diasEntre(ini, iso) * D;
  const largura = dias * D;
  const semanas = Array.from({ length: dias / 7 }, (_, i) => addDias(ini, i * 7));

  if (!lista.length) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <span className="flex items-center gap-2">
          Agrupar por
          <Selecao
            value={agrupar}
            onChange={(v) => setAgrupar(v as Agrupar)}
            vazio={false}
            opcoes={[
              { v: "empresa", t: "Empresa" },
              { v: "equipe", t: "Equipe" },
              { v: "responsavel", t: "Responsável" },
              { v: "andar", t: "Andar" },
              { v: "escopo", t: "Escopo" },
            ]}
          />
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: COR_ABERTA }} /> Aberta (abertura → prazo)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: COR_ATRASO }} /> Atraso (prazo → hoje)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: COR_OK }} /> Regularizada
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-0.5 bg-stone-900" /> Prazo
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-0.5 bg-red-600" /> Hoje
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-max text-sm">
          <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
            <div className="w-[26rem] shrink-0 px-3 py-2 font-medium">Pendência</div>
            <div className="relative flex border-l border-stone-200" style={{ width: largura }}>
              {semanas.map((s) => (
                <div key={s} className={`shrink-0 border-l border-stone-200 px-1 py-2 tabular-nums ${s === segunda(hoje) ? "font-bold text-red-700" : ""}`} style={{ width: 7 * D }}>
                  {fmtData(s).slice(0, 5)}
                </div>
              ))}
            </div>
          </div>

          {grupos.map(([nome, ps]) => {
            const ab = ps.filter((p) => pendenciaAberta(p)).length;
            const venc = ps.filter((p) => pendenciaVencida(p, hoje)).length;
            return (
              <div key={nome}>
                <div className="flex border-b border-stone-200 bg-stone-100">
                  <div className="w-[26rem] shrink-0 px-3 py-1.5 text-xs font-semibold text-stone-700">
                    {nome} <span className="font-normal text-stone-500">· {ab} abertas</span>
                    {venc > 0 && <span className="font-normal text-red-700"> · ▲ {venc} vencidas</span>}
                  </div>
                  <div className="border-l border-stone-200" style={{ width: largura }} />
                </div>
                {ps.map((p) => {
                  const vencida = pendenciaVencida(p, hoje);
                  const ok = !pendenciaAberta(p);
                  const fimBase = ok ? fimDe(p) : p.prazo && p.prazo < hoje ? p.prazo : fimDe(p);
                  return (
                    <div key={p.id} className="flex cursor-pointer border-b border-stone-100 hover:bg-blue-50/50" onClick={() => onEditar(p)} title="Clique para editar">
                      <div className="flex w-[26rem] shrink-0 items-center gap-2 px-3 py-1">
                        <span className="w-8 shrink-0 text-xs tabular-nums text-stone-500">#{p.num}</span>
                        <span className="min-w-0 flex-1 truncate" title={p.descricao}>
                          {p.descricao}
                          <span className="text-xs text-stone-400"> · {[nomeAndar(p.andar), p.itemCodigo].filter(Boolean).join(" · ")}</span>
                        </span>
                        {p.prioridade === "Alta" && <Pill tom={tomPrioridade(p.prioridade)}>Alta</Pill>}
                        <Pill tom={tomPendencia(p.status, vencida)}>{vencida ? "Vencida" : p.status}</Pill>
                      </div>
                      <div className="relative border-l border-stone-200" style={{ width: largura, backgroundImage: `repeating-linear-gradient(to right, #e7e5e4 0 1px, transparent 1px ${7 * D}px)` }}>
                        <div className="absolute inset-y-0 w-0.5 bg-red-600/70" style={{ left: x(hoje) }} />
                        <div
                          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
                          style={{ left: x(p.data), width: Math.max(4, x(addDias(fimBase, 1)) - x(p.data)), background: ok ? COR_OK : COR_ABERTA }}
                          title={`Aberta em ${fmtData(p.data)}${p.prazo ? ` · prazo ${fmtData(p.prazo)}` : ""}${p.dataRegularizacao ? ` · regularizada ${fmtData(p.dataRegularizacao)}` : ""}`}
                        />
                        {vencida && p.prazo && (
                          <div
                            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
                            style={{ left: x(addDias(p.prazo, 1)), width: Math.max(4, x(addDias(hoje, 1)) - x(addDias(p.prazo, 1))), background: COR_ATRASO }}
                            title={`${diasEntre(p.prazo, hoje)} dias de atraso`}
                          />
                        )}
                        {p.prazo && <div className="absolute top-1 bottom-1 w-0.5 bg-stone-900" style={{ left: x(addDias(p.prazo, 1)) - 1 }} title={`Prazo ${fmtData(p.prazo)}`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
