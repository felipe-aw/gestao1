"use client";

import { useMemo, type ReactNode } from "react";
import {
  ESCOPOS,
  addDias,
  andares,
  escopoDef,
  fmtData,
  hojeISO,
  macrosDoEscopo,
  nomeAndar,
  pendAbertasDoItem,
  pendenciaAberta,
  pendenciaVencida,
  progressoMedio,
  statusAtividade,
  statusItem,
  fracaoEtapas,
} from "@/lib/logic";
import type { Atividade, EscopoId } from "@/lib/types";
import { useDB } from "./store";
import { Barra, Cabecalho, EscopoTag, Pill } from "./ui";
import type { Aba } from "./App";

// Rampa sequencial azul (magnitude): mais escuro = mais avançado.
const RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const corRampa = (v: number) => RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / 100) * RAMPA.length))];

export default function Painel({ irPara }: { irPara: (a: Aba) => void }) {
  const { db, escopo } = useDB();
  const hoje = hojeISO();

  const d = useMemo(() => {
    const macroEsc = new Map(db.macros.map((m) => [m.id, m.escopo]));
    const escs: EscopoId[] = escopo ? [escopo] : ESCOPOS.map((e) => e.id);
    const ativs = db.atividades.filter((a) => escs.includes(macroEsc.get(a.macroId)!));
    const pends = db.pendencias.filter((p) => escs.includes(p.escopo));
    const itens = db.itens.filter((i) => escs.includes(i.escopo) && !escopoDef(i.escopo).etapas);
    const aprovados = itens.filter((i) => statusItem(i, pendAbertasDoItem(db.pendencias, i)) === "Aprovado AW").length;
    const porEscopo = escs.map((e) => {
      const a = db.atividades.filter((x) => macroEsc.get(x.macroId) === e);
      const it = db.itens.filter((x) => x.escopo === e);
      const p = db.pendencias.filter((x) => x.escopo === e);
      return {
        e,
        avanco: progressoMedio(a),
        nAtiv: a.length,
        atrasadas: a.filter((x) => statusAtividade(x, hoje) === "Atrasada").length,
        itens: it.length,
        aprov: it.filter((i) => statusItem(i, pendAbertasDoItem(db.pendencias, i)) === "Aprovado AW").length,
        etapas: it.length && escopoDef(e).etapas ? (it.reduce((soma, i) => soma + (fracaoEtapas(i) ?? 0), 0) / it.length) * 100 : null,
        pendAb: p.filter((x) => pendenciaAberta(x)).length,
        pendVenc: p.filter((x) => pendenciaVencida(x, hoje)).length,
      };
    });
    return {
      macroEsc,
      escs,
      ativs,
      avanco: progressoMedio(ativs),
      atrasadas: ativs.filter((a) => statusAtividade(a, hoje) === "Atrasada"),
      concluidas: ativs.filter((a) => statusAtividade(a, hoje) === "Concluída").length,
      proximas: ativs
        .filter((a) => statusAtividade(a, hoje) === "Não iniciada" && a.inicioPrev && a.inicioPrev >= hoje && a.inicioPrev <= addDias(hoje, 14))
        .sort((a, b) => a.inicioPrev!.localeCompare(b.inicioPrev!)),
      pendAb: pends.filter((p) => pendenciaAberta(p)),
      pendVenc: pends.filter((p) => pendenciaVencida(p, hoje)).length,
      pendAlta: pends.filter((p) => pendenciaAberta(p) && p.prioridade === "Alta").length,
      itens: itens.length,
      aprovados,
      porEscopo,
    };
  }, [db, escopo, hoje]);

  const nomeEmpresa = (id?: string) => db.empresas.find((e) => e.id === id)?.nome;

  // Pendências abertas por empresa (ou responsável em texto quando não há empresa).
  const porEmpresa = useMemo(() => {
    const m = new Map<string, { abertas: number; vencidas: number }>();
    for (const p of d.pendAb) {
      const k = nomeEmpresa(p.empresaId) ?? (p.responsavel ? `${p.responsavel} (sem empresa)` : "Sem responsável");
      const v = m.get(k) ?? { abertas: 0, vencidas: 0 };
      v.abertas++;
      if (pendenciaVencida(p, hoje)) v.vencidas++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].abertas - a[1].abertas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.pendAb, db.empresas, hoje]);
  const maxEmp = Math.max(1, ...porEmpresa.map(([, v]) => v.abertas));

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho titulo={escopo ? escopoDef(escopo).nome : "Painel geral da obra"} sub="Indicadores calculados a partir do cronograma, dos itens e das pendências." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile rotulo="Avanço físico" valor={`${Math.round(d.avanco)}%`} sub={`${d.concluidas} de ${d.ativs.length} atividades concluídas`} onClick={() => irPara("cronograma")} />
        <Tile rotulo="Atividades atrasadas" valor={d.atrasadas.length} sub={d.atrasadas.length ? "fim previsto vencido ou início não realizado" : "nenhuma atividade atrasada"} alerta={d.atrasadas.length > 0} onClick={() => irPara("cronograma")} />
        <Tile rotulo="Pendências abertas" valor={d.pendAb.length} sub={`${d.pendVenc} vencidas · ${d.pendAlta} prioridade alta`} alerta={d.pendVenc > 0} onClick={() => irPara("pendencias")} />
        <Tile rotulo="Itens aprovados AW" valor={`${d.aprovados} de ${d.itens}`} sub={d.itens ? `${Math.round((d.aprovados / d.itens) * 100)}% dos itens cadastrados` : "nenhum item cadastrado"} onClick={() => irPara("itens")} />
      </div>

      {!escopo && (
        <Secao titulo="Por escopo">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-2 pr-3 font-medium">Escopo</th>
                  <th className="py-2 pr-3 font-medium">Avanço físico</th>
                  <th className="py-2 pr-3 text-right font-medium">Atividades</th>
                  <th className="py-2 pr-3 text-right font-medium">Atrasadas</th>
                  <th className="py-2 pr-3 font-medium">Itens aprovados AW / etapas</th>
                  <th className="py-2 pr-3 text-right font-medium">Pend. abertas</th>
                  <th className="py-2 text-right font-medium">Vencidas</th>
                </tr>
              </thead>
              <tbody>
                {d.porEscopo.map((r) => (
                  <tr key={r.e} className="border-b border-stone-100">
                    <td className="py-2 pr-3">
                      <EscopoTag escopo={r.e} curto={false} />
                    </td>
                    <td className="py-2 pr-3">
                      <Barra valor={r.avanco} largura="w-32" />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.nAtiv}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.atrasadas ? <Pill tom="critico">{r.atrasadas}</Pill> : <span className="text-stone-400">0</span>}</td>
                    <td className="py-2 pr-3">
                      {r.itens && r.etapas !== null ? (
                        <span className="inline-flex items-center gap-2" title="Média das etapas Cabo, Equipamento, Programação e Tela">
                          <Barra valor={r.etapas} cor="#0ca30c" largura="w-24" />
                          <span className="text-xs text-stone-500 tabular-nums">{r.itens} pontos · etapas</span>
                        </span>
                      ) : r.itens ? (
                        <span className="inline-flex items-center gap-2">
                          <Barra valor={(r.aprov / r.itens) * 100} cor="#0ca30c" largura="w-24" />
                          <span className="text-xs text-stone-500 tabular-nums">
                            {r.aprov}/{r.itens}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">sem itens</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.pendAb}</td>
                    <td className="py-2 text-right tabular-nums">{r.pendVenc ? <Pill tom="critico">{r.pendVenc}</Pill> : <span className="text-stone-400">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Avanço por macroatividade">
          <div className="flex flex-col gap-4">
            {d.escs.map((e) => {
              const ms = macrosDoEscopo(db, e);
              if (!ms.length) return null;
              return (
                <div key={e}>
                  {!escopo && (
                    <div className="mb-1.5">
                      <EscopoTag escopo={e} curto={false} />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    {ms.map((m) => {
                      const as = db.atividades.filter((a) => a.macroId === m.id);
                      const atr = as.filter((a) => statusAtividade(a, hoje) === "Atrasada").length;
                      return (
                        <div key={m.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                          <span className="truncate text-stone-700">
                            {m.nome} <span className="text-xs text-stone-400">({as.length})</span>
                          </span>
                          {atr ? <Pill tom="critico">{atr} atras.</Pill> : <span />}
                          {as.length ? <Barra valor={progressoMedio(as)} cor={escopoDef(e).cor} /> : <span className="w-[8.5rem] text-right text-xs text-stone-400">sem atividades</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Secao>

        <Secao titulo="Pendências abertas por empresa">
          {porEmpresa.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma pendência aberta.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {porEmpresa.map(([nome, v]) => (
                <div key={nome} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm" title={`${nome}: ${v.abertas} abertas, ${v.vencidas} vencidas`}>
                  <span className="truncate text-stone-700">{nome}</span>
                  <span className="flex h-3 items-center">
                    <span className="h-full rounded-r" style={{ width: `${(v.abertas / maxEmp) * 100}%`, background: "#2a78d6" }} />
                  </span>
                  <span className="text-right text-xs tabular-nums text-stone-600">
                    {v.abertas}
                    {v.vencidas > 0 && <span className="ml-1 text-red-700">({v.vencidas} venc.)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Secao>
      </div>

      <Secao titulo="Avanço por andar e escopo" sub="Cor = avanço físico médio das atividades do andar (mais escuro = mais avançado). Número = pendências abertas.">
        {mapaAndares(d.escs)}
      </Secao>

      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo={`Atividades atrasadas (${d.atrasadas.length})`}>
          {listaAtiv([...d.atrasadas].sort((a, b) => (a.fimPrev ?? "").localeCompare(b.fimPrev ?? "")), d.macroEsc, "fimPrev", "fim prev.")}
        </Secao>
        <Secao titulo={`Início nos próximos 14 dias (${d.proximas.length})`}>
          {listaAtiv(d.proximas, d.macroEsc, "inicioPrev", "início")}
        </Secao>
      </div>
    </div>
  );

  function listaAtiv(ativs: Atividade[], macroEsc: Map<string, EscopoId>, campo: "fimPrev" | "inicioPrev", rotulo: string) {
    if (!ativs.length) return <p className="text-sm text-stone-500">Nada aqui.</p>;
    return (
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {ativs.slice(0, 100).map((a) => (
              <tr key={a.id} className="border-b border-stone-100">
                <td className="py-1.5 pr-2">
                  <EscopoTag escopo={macroEsc.get(a.macroId)!} />
                </td>
                <td className="py-1.5 pr-2">{a.nome}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap text-stone-500">{nomeAndar(a.andar)}</td>
                <td className="py-1.5 pr-2 text-stone-500">{nomeEmpresa(a.empresaId) ?? ""}</td>
                <td className="py-1.5 whitespace-nowrap text-right text-xs text-stone-500">
                  {rotulo} {fmtData(a[campo])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function mapaAndares(escs: EscopoId[]) {
    const linhas = andares(db).slice().reverse();
    return (
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium text-stone-500">Andar</th>
              {escs.map((e) => (
                <th key={e} className="px-1 py-1 font-medium text-stone-600">
                  <EscopoTag escopo={e} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((andar) => (
              <tr key={andar}>
                <td className="whitespace-nowrap px-2 py-px text-stone-600">{nomeAndar(andar)}</td>
                {escs.map((e) => {
                  const as = db.atividades.filter((a) => a.andar === andar && d.macroEsc.get(a.macroId) === e);
                  const np = db.pendencias.filter((p) => p.escopo === e && p.andar === andar && pendenciaAberta(p)).length;
                  if (!as.length)
                    return (
                      <td key={e} className="px-1 py-px">
                        <div className="flex h-6 min-w-24 items-center justify-center rounded bg-stone-100 text-stone-400">{np ? `${np} pend.` : "—"}</div>
                      </td>
                    );
                  const v = progressoMedio(as);
                  const escuro = v >= 50;
                  return (
                    <td key={e} className="px-1 py-px">
                      <div
                        className="flex h-6 min-w-24 items-center justify-between gap-2 rounded px-2 tabular-nums"
                        style={{ background: corRampa(v), color: escuro ? "#fff" : "#0d366b" }}
                        title={`${escopoDef(e).nome} · ${nomeAndar(andar)}\nAvanço: ${Math.round(v)}% (${as.length} atividades)\nPendências abertas: ${np}`}
                      >
                        <span>{Math.round(v)}%</span>
                        {np > 0 && <span className="rounded bg-white px-1 font-semibold text-red-700">{np}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

function Tile({ rotulo, valor, sub, alerta, onClick }: { rotulo: string; valor: ReactNode; sub: string; alerta?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-300 hover:shadow-sm">
      <div className="text-xs font-medium text-stone-500">{rotulo}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${alerta ? "text-red-700" : "text-stone-900"}`}>
        {alerta && <span className="mr-1 text-xl" aria-hidden>▲</span>}
        {valor}
      </div>
      <div className="mt-1 text-xs text-stone-500">{sub}</div>
    </button>
  );
}

export function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-stone-800">{titulo}</h2>
      {sub && <p className="mb-3 text-xs text-stone-500">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
