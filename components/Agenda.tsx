"use client";

import { useMemo, useState } from "react";
import { ESCOPOS, addDias, compararAtividades, escopoDef, fmtData, hojeISO, nomeAndar, pendenciaAberta, pendenciaVencida, segunda, statusAtividade } from "@/lib/logic";
import type { Atividade, EscopoId, Pendencia } from "@/lib/types";
import { useDB } from "./store";
import { Botao, Cabecalho, Data, EscopoTag, Pill, Selecao, Vazio, tomAtividade, tomPendencia, tomPrioridade } from "./ui";
import { FormAtividade } from "./Cronograma";
import { FormPendencia } from "./Pendencias";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
type Agrupar = "empresa" | "equipe" | "andar";

/** Programação da semana: o que cada empresa/equipe faz em cada dia, e as pendências que vencem. */
export default function Agenda() {
  const { db, escopo, upsert } = useDB();
  const hoje = hojeISO();
  const [seg, setSeg] = useState(segunda(hoje));
  const [agrupar, setAgrupar] = useState<Agrupar>("empresa");
  const [editAtiv, setEditAtiv] = useState<Atividade | null>(null);
  const [editPend, setEditPend] = useState<Pendencia | null>(null);
  const dom = addDias(seg, 6);
  const dias = Array.from({ length: 7 }, (_, i) => addDias(seg, i));
  const escs: EscopoId[] = escopo ? [escopo] : ESCOPOS.map((e) => e.id);
  const macro = (id: string) => db.macros.find((m) => m.id === id);

  // Atividades previstas na semana, ou em andamento/atrasadas que ainda não terminaram.
  const ativs = useMemo(
    () =>
      db.atividades.filter((a) => {
        const m = macro(a.macroId);
        if (!m || !escs.includes(m.escopo)) return false;
        if (a.fimReal) return a.fimReal >= seg && (a.inicioReal ?? a.inicioPrev ?? a.fimReal) <= dom;
        const prevNaSemana = a.inicioPrev && a.fimPrev && a.inicioPrev <= dom && a.fimPrev >= seg;
        const pendente = seg <= segunda(hoje) && ((a.inicioReal && a.inicioReal <= dom) || (a.fimPrev && a.fimPrev < seg));
        return !!(prevNaSemana || pendente);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.atividades, db.macros, seg, dom, escopo, hoje],
  );

  const grupos = useMemo(() => {
    const nome = (a: Atividade) =>
      agrupar === "empresa"
        ? (db.empresas.find((e) => e.id === a.empresaId)?.nome ?? "Sem empresa definida")
        : agrupar === "equipe"
          ? (db.equipes.find((e) => e.id === a.equipeId)?.nome ?? "Sem equipe definida")
          : nomeAndar(a.andar);
    const m = new Map<string, Atividade[]>();
    for (const a of ativs) m.set(nome(a), [...(m.get(nome(a)) ?? []), a]);
    return [...m.entries()]
      .map(([k, as]) => [k, as.sort((a, b) => (a.andar ?? -99) - (b.andar ?? -99) || compararAtividades(a, b))] as const)
      .sort((a, b) => Number(a[0].startsWith("Sem ")) - Number(b[0].startsWith("Sem ")) || a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
  }, [ativs, agrupar, db.empresas, db.equipes]);

  const pends = db.pendencias
    .filter((p) => escs.includes(p.escopo) && pendenciaAberta(p) && p.prazo && p.prazo <= dom && (p.prazo >= seg || seg <= segunda(hoje)))
    .sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""));
  const nomeEmp = (id?: string) => db.empresas.find((e) => e.id === id)?.nome;

  const celula = (a: Atividade, d: string) => {
    const st = statusAtividade(a, hoje);
    const prev = !!(a.inicioPrev && a.fimPrev && d >= a.inicioPrev && d <= a.fimPrev);
    const real = !!(a.inicioReal && d >= a.inicioReal && d <= (a.fimReal ?? hoje));
    const atraso = st === "Atrasada" && !prev && d <= hoje && (!a.fimPrev || d > a.fimPrev) && (!a.inicioPrev || d >= a.inicioPrev);
    if (real) return { bg: "#008300", txt: "Realizado" };
    if (atraso) return { bg: "#d03b3b", txt: "Atrasado" };
    if (prev) return { bg: "#86b6ef", txt: "Previsto" };
    return null;
  };

  return (
    <div className="agenda">
      <Cabecalho
        titulo="Agenda semanal"
        sub={`Programação de ${fmtData(seg)} a ${fmtData(dom)} · ${ativs.length} atividades · ${pends.length} pendências com prazo`}
        acoes={
          <span className="no-print flex flex-wrap items-center gap-2">
            <Botao onClick={() => setSeg(addDias(seg, -7))}>← Semana anterior</Botao>
            <Botao onClick={() => setSeg(segunda(hoje))} tipo={seg === segunda(hoje) ? "fantasma" : "secundario"}>
              Esta semana
            </Botao>
            <Botao onClick={() => setSeg(addDias(seg, 7))}>Próxima semana →</Botao>
            <Data value={seg} onChange={(v) => v && setSeg(segunda(v))} />
            <Botao tipo="primario" onClick={() => window.print()}>
              Imprimir
            </Botao>
          </span>
        }
      />
      <div className="no-print mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <span className="flex items-center gap-2">
          Agrupar por
          <Selecao
            value={agrupar}
            onChange={(v) => setAgrupar(v as Agrupar)}
            vazio={false}
            opcoes={[
              { v: "empresa", t: "Empresa" },
              { v: "equipe", t: "Equipe" },
              { v: "andar", t: "Andar" },
            ]}
          />
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: "#86b6ef" }} /> Previsto
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: "#008300" }} /> Realizado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-5 rounded-sm" style={{ background: "#d03b3b" }} /> Atrasado
        </span>
      </div>

      {grupos.length === 0 ? (
        <Vazio>Nenhuma atividade programada nesta semana. Preencha as datas previstas no Cronograma.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Atividade</th>
                <th className="px-2 py-2 text-left font-medium">Andar</th>
                <th className="px-2 py-2 text-left font-medium">{agrupar === "empresa" ? "Equipe" : "Empresa"}</th>
                {dias.map((d, i) => (
                  <th key={d} className={`w-14 px-0.5 py-2 text-center font-medium ${d === hoje ? "text-red-700" : ""}`}>
                    {DIAS[i]}
                    <div className="font-normal tabular-nums">{fmtData(d).slice(0, 5)}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(([nome, as]) => (
                <GrupoLinhas key={nome} nome={nome} n={as.length}>
                  {as.map((a) => {
                    const m = macro(a.macroId)!;
                    const st = statusAtividade(a, hoje);
                    const outro =
                      agrupar === "empresa"
                        ? db.equipes.find((q) => q.id === a.equipeId)?.nome
                        : [nomeEmp(a.empresaId), agrupar === "andar" ? db.equipes.find((q) => q.id === a.equipeId)?.nome : undefined].filter(Boolean).join(" / ");
                    return (
                      <tr key={a.id} className="cursor-pointer border-t border-stone-100 hover:bg-blue-50/50" onClick={() => setEditAtiv(a)} title="Clique para editar">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: escopoDef(m.escopo).cor }} title={escopoDef(m.escopo).nome} />
                            <span>
                              {a.nome}
                              <span className="text-xs text-stone-400"> · {escopoDef(m.escopo).curto} / {m.nome}</span>
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-xs text-stone-600">{nomeAndar(a.andar)}</td>
                        <td className="px-2 py-1.5 text-xs text-stone-600">{outro || <span className="text-stone-300">—</span>}</td>
                        {dias.map((d) => {
                          const c = celula(a, d);
                          return (
                            <td key={d} className={`px-0.5 py-1.5 ${d === hoje ? "bg-red-50/60" : ""}`}>
                              {c && <div className="mx-auto h-4 rounded-sm" style={{ background: c.bg }} title={`${c.txt} · ${fmtData(d)}`} />}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5">
                          <Pill tom={tomAtividade(st)}>{st}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </GrupoLinhas>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold text-stone-800">Pendências com prazo até {fmtData(dom)} ({pends.length})</h2>
      {pends.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhuma pendência aberta vencendo nesta semana.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {pends.map((p) => {
                const venc = pendenciaVencida(p, hoje);
                return (
                  <tr key={p.id} className="cursor-pointer border-t border-stone-100 first:border-0 hover:bg-blue-50/50" onClick={() => setEditPend(p)} title="Clique para editar">
                    <td className="px-3 py-1.5 text-xs tabular-nums text-stone-500">#{p.num}</td>
                    <td className="px-2 py-1.5">
                      <EscopoTag escopo={p.escopo} />
                    </td>
                    <td className="px-2 py-1.5">
                      {p.descricao}
                      <span className="text-xs text-stone-400"> · {[nomeAndar(p.andar), p.itemCodigo].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-stone-600">{nomeEmp(p.empresaId) || p.responsavel || "—"}</td>
                    <td className="px-2 py-1.5">
                      <Pill tom={tomPrioridade(p.prioridade)}>{p.prioridade}</Pill>
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-xs tabular-nums ${venc ? "font-semibold text-red-700" : "text-stone-600"}`}>
                      {venc && "▲ "}prazo {fmtData(p.prazo)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Pill tom={tomPendencia(p.status, venc)}>{venc ? "Vencida" : p.status}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editAtiv && (
        <FormAtividade
          inicial={editAtiv}
          escs={escs}
          onFechar={() => setEditAtiv(null)}
          onSalvar={async (a) => {
            await upsert("atividades", a);
            setEditAtiv(null);
          }}
        />
      )}
      {editPend && <FormPendencia inicial={editPend} onFechar={() => setEditPend(null)} onSalvo={() => setEditPend(null)} />}
    </div>
  );
}

function GrupoLinhas({ nome, n, children }: { nome: string; n: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-stone-200 bg-stone-100">
        <td colSpan={11} className="px-3 py-1.5 text-xs font-semibold text-stone-700">
          {nome} <span className="font-normal text-stone-500">· {n} atividades</span>
        </td>
      </tr>
      {children}
    </>
  );
}
