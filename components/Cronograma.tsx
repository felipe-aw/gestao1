"use client";

import { useMemo, useState } from "react";
import {
  ESCOPOS,
  addDias,
  andares,
  compararAtividades,
  diasEntre,
  escopoDef,
  fmtData,
  hojeISO,
  macrosDoEscopo,
  nomeAndar,
  novoId,
  pendAbertasDoItem,
  progressoEfetivo,
  progressoMedio,
  segunda,
  statusAtividade,
  statusItem,
  fracaoEtapas,
} from "@/lib/logic";
import type { Atividade, EscopoId, Macro } from "@/lib/types";
import { useDB } from "./store";
import { Barra, Botao, Cabecalho, Campo, Data, EscopoTag, Modal, Pill, Selecao, Texto, Vazio, baixarCSV, inputCls, tomAtividade } from "./ui";

const W = 26; // px por semana no Gantt
const COR_PREV = "#86b6ef";
const COR_REAL = "#008300";
const LARG = "71rem"; // largura da parte de colunas (soma do gridTemplate + gaps + padding)

export default function Cronograma() {
  const { db, escopo, upsert, remover, salvar } = useDB();
  const hoje = hojeISO();
  const [fMacro, setFMacro] = useState("");
  const [fAndar, setFAndar] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [gerando, setGerando] = useState(false);
  const [macrosAberto, setMacrosAberto] = useState(false);
  const [verGantt, setVerGantt] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const alternar = (ids: string[], marcar: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (marcar) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  // Move a atividade uma posição entre as visíveis e renumera a macro inteira.
  const mover = async (a: Atividade, visiveis: Atividade[], dir: -1 | 1) => {
    const i = visiveis.findIndex((x) => x.id === a.id);
    const alvo = visiveis[i + dir];
    if (!alvo) return;
    const todas = db.atividades
      .filter((x) => x.macroId === a.macroId)
      .sort(compararAtividades)
      .filter((x) => x.id !== a.id);
    const j = todas.findIndex((x) => x.id === alvo.id);
    todas.splice(dir === -1 ? j : j + 1, 0, a);
    const ops = todas
      .map((x, k) => ({ x, ordem: k + 1 }))
      .filter(({ x, ordem }) => x.ordem !== ordem)
      .map(({ x, ordem }) => ({ op: "upsert" as const, col: "atividades" as const, item: { ...x, ordem } }));
    if (ops.length) await salvar(ops);
  };

  const escs: EscopoId[] = escopo ? [escopo] : ESCOPOS.map((e) => e.id);
  const nomeEmp = (id?: string) => db.empresas.find((e) => e.id === id)?.nome ?? "";
  const nomeEq = (id?: string) => db.equipes.find((e) => e.id === id)?.nome ?? "";

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return db.atividades.filter((a) => {
      if (fMacro && a.macroId !== fMacro) return false;
      if (fAndar !== "" && String(a.andar) !== fAndar) return false;
      if (fEmpresa && a.empresaId !== fEmpresa) return false;
      if (fStatus && statusAtividade(a, hoje) !== fStatus) return false;
      if (b && !`${a.nome} ${a.local ?? ""} ${a.obs ?? ""}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [db.atividades, fMacro, fAndar, fEmpresa, fStatus, busca, hoje]);

  // Janela do Gantt: do início do cronograma até a última data (mín. 26 semanas).
  const semanas = useMemo(() => {
    const ini = segunda(db.config.inicioCronograma);
    let fim = addDias(ini, 7 * 26);
    for (const a of db.atividades) for (const d of [a.fimPrev, a.fimReal]) if (d && d > fim) fim = d;
    const n = Math.ceil((diasEntre(ini, fim) + 1) / 7);
    return Array.from({ length: n }, (_, i) => addDias(ini, i * 7));
  }, [db.atividades, db.config.inicioCronograma]);
  const inicioGantt = semanas[0];
  const x = (iso: string) => (diasEntre(inicioGantt, iso) / 7) * W;

  const pctItensAndar = (e: EscopoId, andar: number | null) => {
    if (andar === null) return null;
    const its = db.itens.filter((i) => i.escopo === e && i.andar === andar);
    if (!its.length) return null;
    // Escopos com checklist: média das etapas; demais: % aprovados pela AW.
    if (escopoDef(e).etapas) return (its.reduce((s, i) => s + (fracaoEtapas(i) ?? 0), 0) / its.length) * 100;
    return (its.filter((i) => statusItem(i, pendAbertasDoItem(db.pendencias, i)) === "Aprovado AW").length / its.length) * 100;
  };

  const exportar = () => {
    const linhas: (string | number | undefined)[][] = [["Escopo", "Macro", "Atividade", "Andar", "Local", "Empresa", "Equipe", "Início prev.", "Fim prev.", "Início real", "Fim real", "%", "Status", "Obs."]];
    for (const e of escs)
      for (const m of macrosDoEscopo(db, e))
        for (const a of filtradas.filter((a) => a.macroId === m.id))
          linhas.push([escopoDef(e).nome, m.nome, a.nome, nomeAndar(a.andar), a.local, nomeEmp(a.empresaId), nomeEq(a.equipeId), a.inicioPrev, a.fimPrev, a.inicioReal, a.fimReal, progressoEfetivo(a), statusAtividade(a, hoje), a.obs]);
    baixarCSV(`cronograma_${hoje}.csv`, linhas);
  };

  const macrosFiltro = escs.flatMap((e) => macrosDoEscopo(db, e).map((m) => ({ v: m.id, t: `${escopoDef(e).curto} · ${m.nome}` })));
  const gridTemplate = `minmax(16rem,1.6fr) 5.5rem minmax(8rem,1fr) 4.5rem 4.5rem 4.5rem 4.5rem 8rem 8.5rem`;

  return (
    <div>
      <Cabecalho
        titulo="Cronograma"
        sub="Macroatividades e atividades por escopo, com datas previstas e realizadas."
        acoes={
          <>
            <Botao onClick={() => setVerGantt((v) => !v)} tipo="fantasma">
              {verGantt ? "Ocultar Gantt" : "Mostrar Gantt"}
            </Botao>
            <Botao onClick={exportar}>Exportar CSV</Botao>
            <Botao onClick={() => setMacrosAberto(true)}>Macros</Botao>
            <Botao onClick={() => setGerando(true)}>Gerar por andares</Botao>
            <Botao
              tipo="primario"
              onClick={() => setEditando({ id: "", macroId: fMacro || macrosFiltro[0]?.v.toString() || "", nome: "", andar: null, progresso: 0 })}
            >
              + Atividade
            </Botao>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <input className={`${inputCls} w-56`} placeholder="Buscar atividade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Selecao value={fMacro} onChange={setFMacro} opcoes={macrosFiltro} vazio="Todas as macros" />
        <Selecao value={fAndar} onChange={setFAndar} opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio="Todos os andares" />
        <Selecao value={fEmpresa} onChange={setFEmpresa} opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))} vazio="Todas as empresas" />
        <Selecao value={fStatus} onChange={setFStatus} opcoes={["Não iniciada", "Em andamento", "Atrasada", "Concluída"]} vazio="Todos os status" />
        {verGantt && (
          <span className="ml-auto flex items-center gap-3 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-5 rounded-sm" style={{ background: COR_PREV }} /> Previsto
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-5 rounded-sm" style={{ background: COR_REAL }} /> Realizado
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-0.5 bg-red-600" /> Hoje
            </span>
          </span>
        )}
      </div>

      {sel.size > 0 && <AcoesEmMassa ids={[...sel]} escs={escs} onLimpar={() => setSel(new Set())} />}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-max text-sm">
          {/* cabeçalho */}
          <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
            <div className="grid shrink-0 items-end gap-2 px-3 py-2" style={{ gridTemplateColumns: gridTemplate, width: LARG }}>
              <span>Atividade</span>
              <span>Andar</span>
              <span>Empresa / equipe</span>
              <span>Iní. prev.</span>
              <span>Fim prev.</span>
              <span>Iní. real</span>
              <span>Fim real</span>
              <span>Avanço</span>
              <span>Status</span>
            </div>
            {verGantt && (
              <div className="relative border-l border-stone-200" style={{ width: semanas.length * W }}>
                <div className="flex">
                  {semanas.map((s, i) => (
                    <div key={s} className="h-4 shrink-0 overflow-visible whitespace-nowrap pl-0.5 text-[10px] text-stone-500" style={{ width: W }}>
                      {(i === 0 ? s.slice(5, 7) === semanas[1]?.slice(5, 7) : s.slice(5, 7) !== semanas[i - 1].slice(5, 7)) && ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+s.slice(5, 7) - 1] + "/" + s.slice(2, 4)}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {semanas.map((s) => (
                    <div key={s} className={`shrink-0 border-l border-stone-200 py-1 text-center text-[10px] tabular-nums ${s === segunda(hoje) ? "font-bold text-red-700" : ""}`} style={{ width: W }}>
                      {s.slice(8)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {escs.map((e) => {
            const ms = macrosDoEscopo(db, e).filter((m) => !fMacro || m.id === fMacro);
            const temAlguma = ms.some((m) => filtradas.some((a) => a.macroId === m.id));
            if (!temAlguma && (fMacro || fAndar || fEmpresa || fStatus || busca)) return null;
            const def = escopoDef(e);
            return (
              <div key={e}>
                {!escopo && (
                  <div className="sticky left-0 border-b border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-700" style={{ width: LARG }}>
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: def.cor }} />
                    {def.nome}
                  </div>
                )}
                {ms.map((m) => {
                  const as = filtradas.filter((a) => a.macroId === m.id).sort(compararAtividades);
                  if (!as.length && (fAndar || fEmpresa || fStatus || busca)) return null;
                  const fechada = fechadas.has(m.id);
                  const ini = as.map((a) => a.inicioPrev).filter(Boolean).sort()[0];
                  const fim = as.map((a) => a.fimPrev).filter(Boolean).sort().at(-1);
                  const atr = as.filter((a) => statusAtividade(a, hoje) === "Atrasada").length;
                  return (
                    <div key={m.id}>
                      <div className="flex border-b border-stone-200 bg-stone-50/70 hover:bg-stone-100">
                        <div className="grid shrink-0 items-center gap-2 px-3 py-1.5" style={{ gridTemplateColumns: gridTemplate, width: LARG }}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="shrink-0"
                              aria-label={`Selecionar todas de ${m.nome}`}
                              disabled={!as.length}
                              checked={as.length > 0 && as.every((a) => sel.has(a.id))}
                              onChange={(ev) => alternar(as.map((a) => a.id), ev.target.checked)}
                            />
                            <button
                              className="flex min-w-0 items-center gap-2 whitespace-nowrap text-left font-semibold text-stone-800"
                              onClick={() =>
                                setFechadas((s) => {
                                  const n = new Set(s);
                                  if (n.has(m.id)) n.delete(m.id);
                                  else n.add(m.id);
                                  return n;
                                })
                              }
                            >
                              <span className="w-3 text-stone-400">{fechada ? "▸" : "▾"}</span>
                              {m.nome}
                              <span className="text-xs font-normal text-stone-400">{as.length} ativ.</span>
                            </button>
                          </span>
                          <span />
                          <span />
                          <span className="text-xs text-stone-600">{fmtData(ini)}</span>
                          <span className="text-xs text-stone-600">{fmtData(fim)}</span>
                          <span />
                          <span />
                          {as.length ? <Barra valor={progressoMedio(as)} largura="w-14" cor={def.cor} /> : <span />}
                          {atr ? <Pill tom="critico">{atr} atras.</Pill> : <span />}
                        </div>
                        {verGantt && (
                          <div className="relative border-l border-stone-200" style={{ width: semanas.length * W }}>
                            <GradeGantt n={semanas.length} hojeX={x(hoje)} />
                            {ini && fim && <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm" style={{ left: x(ini), width: Math.max(3, x(addDias(fim, 1)) - x(ini)), background: def.cor }} />}
                          </div>
                        )}
                      </div>
                      {!fechada &&
                        as.map((a, idx) => {
                          const st = statusAtividade(a, hoje);
                          const pi = pctItensAndar(e, a.andar);
                          return (
                            <div key={a.id} className={`group flex border-b border-stone-100 hover:bg-blue-50/40 ${sel.has(a.id) ? "bg-blue-50/70" : ""}`}>
                              <div className="grid shrink-0 items-center gap-2 px-3 py-1" style={{ gridTemplateColumns: gridTemplate, width: LARG }}>
                                <span className="flex min-w-0 items-center gap-1">
                                  <input type="checkbox" className="shrink-0" aria-label={`Selecionar ${a.nome}`} checked={sel.has(a.id)} onChange={(ev) => alternar([a.id], ev.target.checked)} />
                                  <span className="flex shrink-0 flex-col leading-none opacity-0 group-hover:opacity-100">
                                    <button className="px-0.5 text-[10px] text-stone-500 hover:text-blue-700 disabled:invisible" disabled={idx === 0} onClick={() => mover(a, as, -1)} title="Subir">
                                      ▲
                                    </button>
                                    <button className="px-0.5 text-[10px] text-stone-500 hover:text-blue-700 disabled:invisible" disabled={idx === as.length - 1} onClick={() => mover(a, as, 1)} title="Descer">
                                      ▼
                                    </button>
                                  </span>
                                  <button className="truncate text-left text-stone-800 hover:text-blue-700 hover:underline" title={a.obs || a.nome} onClick={() => setEditando(a)}>
                                    {a.nome}
                                    {a.local && <span className="text-stone-400"> · {a.local}</span>}
                                  </button>
                                </span>
                                <span className="truncate text-xs text-stone-600">{nomeAndar(a.andar)}</span>
                                <span className="truncate text-xs text-stone-600" title={[nomeEmp(a.empresaId), nomeEq(a.equipeId)].filter(Boolean).join(" / ")}>
                                  {nomeEmp(a.empresaId) || <span className="text-stone-300">—</span>}
                                  {a.equipeId && <span className="text-stone-400"> / {nomeEq(a.equipeId)}</span>}
                                </span>
                                <span className="text-xs tabular-nums text-stone-600">{fmtData(a.inicioPrev)}</span>
                                <span className="text-xs tabular-nums text-stone-600">{fmtData(a.fimPrev)}</span>
                                <span className="text-xs tabular-nums text-stone-600">{fmtData(a.inicioReal)}</span>
                                <span className="text-xs tabular-nums text-stone-600">{fmtData(a.fimReal)}</span>
                                <span className="flex items-center gap-1" title={pi !== null ? (escopoDef(e).etapas ? `Etapas dos itens do andar concluídas: ${Math.round(pi)}%` : `Itens do andar aprovados AW: ${Math.round(pi)}%`) : undefined}>
                                  <ProgressoInline a={a} onSalvar={(p) => upsert("atividades", { ...a, progresso: p })} />
                                  {pi !== null && <span className="text-[10px] text-stone-400">itens {Math.round(pi)}%</span>}
                                </span>
                                <Pill tom={tomAtividade(st)}>{st}</Pill>
                              </div>
                              {verGantt && (
                                <div className="relative border-l border-stone-200" style={{ width: semanas.length * W }}>
                                  <GradeGantt n={semanas.length} hojeX={x(hoje)} />
                                  {a.inicioPrev && a.fimPrev && (
                                    <div
                                      className="absolute top-[5px] h-2 rounded-sm"
                                      style={{ left: x(a.inicioPrev), width: Math.max(3, x(addDias(a.fimPrev, 1)) - x(a.inicioPrev)), background: COR_PREV }}
                                      title={`Previsto: ${fmtData(a.inicioPrev)} → ${fmtData(a.fimPrev)}`}
                                    />
                                  )}
                                  {a.inicioReal && (
                                    <div
                                      className="absolute bottom-[5px] h-2 rounded-sm"
                                      style={{
                                        left: x(a.inicioReal),
                                        width: Math.max(3, x(addDias(a.fimReal ?? hoje, 1)) - x(a.inicioReal)),
                                        background: COR_REAL,
                                        opacity: a.fimReal ? 1 : 0.55,
                                      }}
                                      title={`Realizado: ${fmtData(a.inicioReal)} → ${a.fimReal ? fmtData(a.fimReal) : "em andamento"}`}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
                {!ms.length && (
                  <div className="px-3 py-3 text-sm text-stone-500" style={{ width: LARG }}>
                    Nenhuma macro cadastrada para {def.nome}. Use o botão “Macros”.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {filtradas.length === 0 && (
        <div className="mt-4">
          <Vazio>Nenhuma atividade encontrada com os filtros atuais.</Vazio>
        </div>
      )}

      {editando && (
        <FormAtividade
          inicial={editando}
          escs={escs}
          onFechar={() => setEditando(null)}
          onSalvar={async (a) => {
            await upsert("atividades", a.id ? a : { ...a, id: novoId("A") });
            setEditando(null);
          }}
          onDuplicar={
            editando.id
              ? async (a) => {
                  // A cópia fica logo abaixo da original, sem datas reais.
                  await upsert("atividades", {
                    ...a,
                    id: novoId("A"),
                    nome: `${a.nome} (cópia)`,
                    inicioReal: undefined,
                    fimReal: undefined,
                    progresso: 0,
                    ordem: a.ordem !== undefined ? a.ordem + 0.5 : undefined,
                  });
                  setEditando(null);
                }
              : undefined
          }
          onExcluir={
            editando.id
              ? async () => {
                  if (confirm(`Excluir a atividade "${editando.nome}"?`)) {
                    await remover("atividades", editando.id);
                    setEditando(null);
                  }
                }
              : undefined
          }
        />
      )}
      {gerando && (
        <GerarPorAndares
          escs={escs}
          onFechar={() => setGerando(false)}
          onGerar={async (lista) => {
            await salvar(lista.map((item) => ({ op: "upsert" as const, col: "atividades" as const, item })));
            setGerando(false);
          }}
        />
      )}
      {macrosAberto && <GerenciarMacros escopoInicial={escs[0]} onFechar={() => setMacrosAberto(false)} />}
    </div>
  );
}

function GradeGantt({ n, hojeX }: { n: number; hojeX: number }) {
  return (
    <>
      <div className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(to right, #e7e5e4 0 1px, transparent 1px ${W}px)` }} />
      {hojeX >= 0 && hojeX <= n * W && <div className="absolute inset-y-0 w-0.5 bg-red-600/70" style={{ left: hojeX }} />}
    </>
  );
}

function ProgressoInline({ a, onSalvar }: { a: Atividade; onSalvar: (p: number) => void }) {
  const [v, setV] = useState<string | null>(null);
  const atual = progressoEfetivo(a);
  return (
    <span className="relative inline-flex items-center">
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        disabled={!!a.fimReal}
        className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs tabular-nums hover:border-stone-300 focus:border-blue-500 focus:bg-white disabled:text-stone-500"
        value={v ?? atual}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== null) {
            const n = Math.max(0, Math.min(100, Number(v) || 0));
            if (n !== atual) onSalvar(n);
            setV(null);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        title={a.fimReal ? "Concluída (fim real preenchido)" : "Avanço físico (%)"}
      />
      <span className="text-xs text-stone-500">%</span>
    </span>
  );
}

function opcoesMacro(macros: Macro[], escs: EscopoId[]) {
  return escs.flatMap((e) =>
    macros
      .filter((m) => m.escopo === e)
      .sort((a, b) => a.ordem - b.ordem)
      .map((m) => ({ v: m.id, t: `${escopoDef(e).curto} · ${m.nome}` })),
  );
}

export function FormAtividade({
  inicial,
  escs,
  onFechar,
  onSalvar,
  onExcluir,
  onDuplicar,
}: {
  inicial: Atividade;
  escs: EscopoId[];
  onFechar: () => void;
  onSalvar: (a: Atividade) => void;
  onExcluir?: () => void;
  onDuplicar?: (a: Atividade) => void;
}) {
  const { db } = useDB();
  const [a, setA] = useState<Atividade>(inicial);
  const set = <K extends keyof Atividade>(k: K, v: Atividade[K]) => setA((x) => ({ ...x, [k]: v }));
  const escMacro = db.macros.find((m) => m.id === a.macroId)?.escopo;
  const equipes = db.equipes.filter((e) => !a.empresaId || e.empresaId === a.empresaId);
  const erro = !a.macroId ? "Escolha a macro." : !a.nome.trim() ? "Informe o nome." : a.inicioPrev && a.fimPrev && a.fimPrev < a.inicioPrev ? "Fim previsto antes do início." : a.inicioReal && a.fimReal && a.fimReal < a.inicioReal ? "Fim real antes do início real." : "";

  return (
    <Modal titulo={inicial.id ? "Editar atividade" : "Nova atividade"} onFechar={onFechar}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!erro) onSalvar({ ...a, nome: a.nome.trim(), progresso: a.fimReal ? 100 : a.progresso });
        }}
      >
        <Campo rotulo="Macroatividade" className="col-span-2">
          <Selecao value={a.macroId} onChange={(v) => set("macroId", v)} opcoes={opcoesMacro(db.macros, escs.length === 1 ? escs : ESCOPOS.map((e) => e.id))} />
        </Campo>
        <Campo rotulo="Atividade" className="col-span-2">
          <Texto value={a.nome} onChange={(v) => set("nome", v)} autoFocus placeholder="Ex.: Instalação de câmeras" />
        </Campo>
        <Campo rotulo="Andar">
          <Selecao value={a.andar ?? ""} onChange={(v) => set("andar", v === "" ? null : Number(v))} opcoes={andares(db).map((n) => ({ v: n, t: nomeAndar(n) }))} vazio="Geral / sem andar" />
        </Campo>
        <Campo rotulo="Local (opcional)">
          <input className={inputCls} list="locais" value={a.local ?? ""} onChange={(e) => set("local", e.target.value || undefined)} />
          <datalist id="locais">
            {db.config.listas.locais.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao
            value={a.empresaId}
            onChange={(v) => setA((x) => ({ ...x, empresaId: v || undefined, equipeId: x.equipeId && db.equipes.find((q) => q.id === x.equipeId)?.empresaId !== v ? undefined : x.equipeId }))}
            opcoes={db.empresas.filter((e) => !escMacro || !e.escopos.length || e.escopos.includes(escMacro)).map((e) => ({ v: e.id, t: e.nome }))}
          />
        </Campo>
        <Campo rotulo="Equipe">
          <Selecao value={a.equipeId} onChange={(v) => set("equipeId", v || undefined)} opcoes={equipes.map((e) => ({ v: e.id, t: e.nome }))} />
        </Campo>
        <Campo rotulo="Início previsto">
          <Data value={a.inicioPrev} onChange={(v) => set("inicioPrev", v)} />
        </Campo>
        <Campo rotulo="Fim previsto">
          <Data value={a.fimPrev} onChange={(v) => set("fimPrev", v)} />
        </Campo>
        <Campo rotulo="Início real">
          <Data value={a.inicioReal} onChange={(v) => set("inicioReal", v)} />
        </Campo>
        <Campo rotulo="Fim real (conclui a atividade)">
          <Data value={a.fimReal} onChange={(v) => set("fimReal", v)} />
        </Campo>
        <Campo rotulo={`Avanço físico: ${a.fimReal ? 100 : a.progresso}%`} className="col-span-2">
          <input type="range" min={0} max={100} step={5} disabled={!!a.fimReal} value={a.fimReal ? 100 : a.progresso} onChange={(e) => set("progresso", Number(e.target.value))} />
        </Campo>
        <Campo rotulo="Observações" className="col-span-2">
          <textarea className={inputCls} rows={2} value={a.obs ?? ""} onChange={(e) => set("obs", e.target.value || undefined)} />
        </Campo>
        <div className="col-span-2 flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}
            {onDuplicar && <Botao onClick={() => onDuplicar(a)}>Duplicar</Botao>}
          </div>
          <div className="flex items-center gap-2">
            {erro && <span className="text-xs text-red-700">{erro}</span>}
            <Botao onClick={onFechar}>Cancelar</Botao>
            <Botao tipo="primario" type="submit" disabled={!!erro}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function GerarPorAndares({ escs, onFechar, onGerar }: { escs: EscopoId[]; onFechar: () => void; onGerar: (a: Atividade[]) => void }) {
  const { db } = useDB();
  const opcoes = opcoesMacro(db.macros, escs.length === 1 ? escs : ESCOPOS.map((e) => e.id));
  const [macroId, setMacroId] = useState(String(opcoes[0]?.v ?? ""));
  const [nome, setNome] = useState("");
  const [de, setDe] = useState(db.config.andarMin);
  const [ate, setAte] = useState(db.config.andarMax);
  const [inicio, setInicio] = useState<string | undefined>(db.config.inicioCronograma);
  const [duracao, setDuracao] = useState(5);
  const [intervalo, setIntervalo] = useState(5);
  const [ordem, setOrdem] = useState<"sobe" | "desce">("sobe");
  const [empresaId, setEmpresaId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const macro = db.macros.find((m) => m.id === macroId);
  const nomeFinal = nome.trim() || macro?.nome || "";

  const lista: Atividade[] = useMemo(() => {
    const ands: number[] = [];
    for (let a = Math.min(de, ate); a <= Math.max(de, ate); a++) ands.push(a);
    if (ordem === "desce") ands.reverse();
    return ands.map((andar, i) => {
      const ini = inicio ? addDias(inicio, i * intervalo) : undefined;
      return {
        id: novoId("A") + i,
        macroId,
        nome: nomeFinal,
        andar,
        empresaId: empresaId || undefined,
        equipeId: equipeId || undefined,
        inicioPrev: ini,
        fimPrev: ini ? addDias(ini, Math.max(1, duracao) - 1) : undefined,
        progresso: 0,
      };
    });
  }, [de, ate, ordem, inicio, intervalo, duracao, macroId, nomeFinal, empresaId, equipeId]);

  const jaExistem = db.atividades.filter((a) => a.macroId === macroId && a.nome === nomeFinal && lista.some((l) => l.andar === a.andar)).length;

  return (
    <Modal titulo="Gerar atividades por andar" onFechar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Macroatividade" className="col-span-2">
          <Selecao value={macroId} onChange={setMacroId} opcoes={opcoes} vazio={false} />
        </Campo>
        <Campo rotulo="Nome da atividade" className="col-span-2">
          <Texto value={nome} onChange={setNome} placeholder={macro?.nome} />
        </Campo>
        <Campo rotulo="Do andar">
          <Selecao value={de} onChange={(v) => setDe(Number(v))} opcoes={andares(db).map((n) => ({ v: n, t: nomeAndar(n) }))} vazio={false} />
        </Campo>
        <Campo rotulo="Até o andar">
          <Selecao value={ate} onChange={(v) => setAte(Number(v))} opcoes={andares(db).map((n) => ({ v: n, t: nomeAndar(n) }))} vazio={false} />
        </Campo>
        <Campo rotulo="Início do primeiro andar">
          <Data value={inicio} onChange={setInicio} />
        </Campo>
        <Campo rotulo="Sequência">
          <Selecao
            value={ordem}
            onChange={(v) => setOrdem(v as "sobe" | "desce")}
            opcoes={[
              { v: "sobe", t: "De baixo para cima" },
              { v: "desce", t: "De cima para baixo" },
            ]}
            vazio={false}
          />
        </Campo>
        <Campo rotulo="Duração por andar (dias corridos)">
          <Texto type="number" min={1} value={duracao} onChange={(v) => setDuracao(Number(v))} />
        </Campo>
        <Campo rotulo="Defasagem entre andares (dias)">
          <Texto type="number" min={0} value={intervalo} onChange={(v) => setIntervalo(Number(v))} />
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao value={empresaId} onChange={(v) => { setEmpresaId(v); setEquipeId(""); }} opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))} />
        </Campo>
        <Campo rotulo="Equipe">
          <Selecao value={equipeId} onChange={setEquipeId} opcoes={db.equipes.filter((e) => !empresaId || e.empresaId === empresaId).map((e) => ({ v: e.id, t: e.nome }))} />
        </Campo>
        <div className="col-span-2 rounded-md bg-stone-50 p-3 text-xs text-stone-600">
          Serão criadas <b>{lista.length}</b> atividades “{nomeFinal}”
          {lista[0]?.inicioPrev && (
            <>
              {" "}
              de {fmtData(lista[0].inicioPrev)} a {fmtData(lista.at(-1)!.fimPrev)}
            </>
          )}
          .
          {jaExistem > 0 && <div className="mt-1 text-red-700">▲ Já existem {jaExistem} atividades com esse nome nesses andares — serão duplicadas.</div>}
        </div>
        <div className="col-span-2 flex justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!macroId || !nomeFinal} onClick={() => onGerar(lista)}>
            Gerar {lista.length} atividades
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function GerenciarMacros({ escopoInicial, onFechar }: { escopoInicial: EscopoId; onFechar: () => void }) {
  const { db, upsert, salvar } = useDB();
  const [esc, setEsc] = useState<EscopoId>(escopoInicial);
  const [novo, setNovo] = useState("");
  const ms = macrosDoEscopo(db, esc);

  const mover = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ms.length) return;
    await salvar([
      { op: "upsert", col: "macros", item: { ...ms[i], ordem: ms[j].ordem } },
      { op: "upsert", col: "macros", item: { ...ms[j], ordem: ms[i].ordem } },
    ]);
  };

  return (
    <Modal titulo="Macroatividades" onFechar={onFechar}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ESCOPOS.map((e) => (
          <button key={e.id} onClick={() => setEsc(e.id)} className={`rounded-full border px-3 py-1 text-xs ${esc === e.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300"}`}>
            {e.nome}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {ms.map((m, i) => {
          const n = db.atividades.filter((a) => a.macroId === m.id).length;
          return (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-stone-400">{i + 1}</span>
              <input className={`${inputCls} flex-1`} defaultValue={m.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== m.nome && upsert("macros", { ...m, nome: e.target.value.trim() })} />
              <span className="w-16 text-xs text-stone-500">{n} ativ.</span>
              <Botao tipo="fantasma" onClick={() => mover(i, -1)} disabled={i === 0}>
                ↑
              </Botao>
              <Botao tipo="fantasma" onClick={() => mover(i, 1)} disabled={i === ms.length - 1}>
                ↓
              </Botao>
              <Botao
                tipo="perigo"
                onClick={async () => {
                  if (!confirm(n ? `Excluir "${m.nome}" e suas ${n} atividades?` : `Excluir "${m.nome}"?`)) return;
                  await salvar([
                    ...db.atividades.filter((a) => a.macroId === m.id).map((a) => ({ op: "delete" as const, col: "atividades" as const, id: a.id })),
                    { op: "delete", col: "macros", id: m.id },
                  ]);
                }}
              >
                Excluir
              </Botao>
            </div>
          );
        })}
        {!ms.length && <p className="text-sm text-stone-500">Nenhuma macro neste escopo.</p>}
      </div>
      <form
        className="mt-4 flex gap-2 border-t border-stone-200 pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!novo.trim()) return;
          await upsert("macros", { id: novoId("M"), escopo: esc, nome: novo.trim(), ordem: (ms.at(-1)?.ordem ?? 0) + 1 } as Macro);
          setNovo("");
        }}
      >
        <input className={`${inputCls} flex-1`} placeholder={`Nova macro em ${escopoDef(esc).nome}…`} value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Botao tipo="primario" type="submit">
          Adicionar
        </Botao>
      </form>
      <div className="mt-2 text-xs text-stone-500">
        <EscopoTag escopo={esc} curto={false} /> — as macros agrupam as atividades no cronograma e no painel.
      </div>
    </Modal>
  );
}

const MANTER = "__manter__";
const LIMPAR = "__limpar__";

/** Barra para alterar várias atividades selecionadas de uma vez. */
function AcoesEmMassa({ ids, escs, onLimpar }: { ids: string[]; escs: EscopoId[]; onLimpar: () => void }) {
  const { db, salvar } = useDB();
  const [empresa, setEmpresa] = useState(MANTER);
  const [equipe, setEquipe] = useState(MANTER);
  const [macro, setMacro] = useState(MANTER);
  const [deslocar, setDeslocar] = useState(0);
  const [progresso, setProgresso] = useState("");
  const [inicio, setInicio] = useState<string | undefined>();
  const sel = db.atividades.filter((a) => ids.includes(a.id));
  const empEquipe = empresa !== MANTER && empresa !== LIMPAR ? empresa : undefined;
  const mudou = empresa !== MANTER || equipe !== MANTER || macro !== MANTER || deslocar !== 0 || progresso !== "" || !!inicio;

  const aplicar = async () => {
    // "Reprogramar a partir de": mantém a defasagem entre as atividades, ancorando a mais cedo na data escolhida.
    const primeiro = sel.map((a) => a.inicioPrev).filter(Boolean).sort()[0];
    const delta = (inicio && primeiro ? diasEntre(primeiro, inicio) : 0) + deslocar;
    const ops = sel.map((a) => {
      const n: Atividade = { ...a };
      if (empresa === LIMPAR) n.empresaId = undefined;
      else if (empresa !== MANTER) n.empresaId = empresa;
      if (empresa !== MANTER && n.equipeId && db.equipes.find((q) => q.id === n.equipeId)?.empresaId !== n.empresaId) n.equipeId = undefined;
      if (equipe === LIMPAR) n.equipeId = undefined;
      else if (equipe !== MANTER) n.equipeId = equipe;
      if (macro !== MANTER) {
        n.macroId = macro;
        n.ordem = undefined;
      }
      if (delta) {
        if (n.inicioPrev) n.inicioPrev = addDias(n.inicioPrev, delta);
        if (n.fimPrev) n.fimPrev = addDias(n.fimPrev, delta);
      }
      if (progresso !== "" && !n.fimReal) n.progresso = Math.max(0, Math.min(100, Number(progresso) || 0));
      return { op: "upsert" as const, col: "atividades" as const, item: n };
    });
    await salvar(ops);
    setEmpresa(MANTER);
    setEquipe(MANTER);
    setMacro(MANTER);
    setDeslocar(0);
    setProgresso("");
    setInicio(undefined);
  };

  const excluir = async () => {
    if (!confirm(`Excluir ${sel.length} atividades selecionadas?`)) return;
    await salvar(sel.map((a) => ({ op: "delete" as const, col: "atividades" as const, id: a.id })));
    onLimpar();
  };

  return (
    <div className="sticky top-14 z-20 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-blue-900">{sel.length} atividades selecionadas</span>
        <div className="flex gap-2">
          <Botao tipo="perigo" onClick={excluir}>
            Excluir selecionadas
          </Botao>
          <Botao tipo="fantasma" onClick={onLimpar}>
            Limpar seleção
          </Botao>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Empresa">
          <Selecao value={empresa} onChange={setEmpresa} vazio={false} opcoes={[{ v: MANTER, t: "— manter —" }, { v: LIMPAR, t: "(sem empresa)" }, ...db.empresas.map((e) => ({ v: e.id, t: e.nome }))]} />
        </Campo>
        <Campo rotulo="Equipe">
          <Selecao
            value={equipe}
            onChange={setEquipe}
            vazio={false}
            opcoes={[{ v: MANTER, t: "— manter —" }, { v: LIMPAR, t: "(sem equipe)" }, ...db.equipes.filter((q) => !empEquipe || q.empresaId === empEquipe).map((q) => ({ v: q.id, t: q.nome }))]}
          />
        </Campo>
        <Campo rotulo="Mover para a macro">
          <Selecao value={macro} onChange={setMacro} vazio={false} opcoes={[{ v: MANTER, t: "— manter —" }, ...opcoesMacro(db.macros, escs.length === 1 ? escs : ESCOPOS.map((e) => e.id))]} />
        </Campo>
        <Campo rotulo="Reprogramar a partir de">
          <Data value={inicio} onChange={setInicio} />
        </Campo>
        <Campo rotulo="Adiar (+) / antecipar (−) dias">
          <input type="number" className={`${inputCls} w-28`} value={deslocar} onChange={(e) => setDeslocar(Number(e.target.value) || 0)} />
        </Campo>
        <Campo rotulo="Avanço %">
          <input type="number" min={0} max={100} className={`${inputCls} w-20`} value={progresso} placeholder="manter" onChange={(e) => setProgresso(e.target.value)} />
        </Campo>
        <Botao tipo="primario" disabled={!mudou} onClick={aplicar}>
          Aplicar em {sel.length}
        </Botao>
      </div>
    </div>
  );
}
