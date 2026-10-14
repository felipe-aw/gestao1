"use client";

import { useMemo, useState } from "react";
import { ESCOPOS, addDias, andares, diasEmAberto, escopoDef, fmtData, hojeISO, nomeAndar, novoId, pendenciaAberta, pendenciaVencida } from "@/lib/logic";
import type { EscopoId, Pendencia } from "@/lib/types";
import { useDB } from "./store";
import PendenciasCronograma from "./PendenciasCronograma";
import { Botao, Cabecalho, Campo, Data, EscopoTag, Modal, Pill, Selecao, Texto, Vazio, baixarCSV, inputCls, tomPendencia, tomPrioridade } from "./ui";

export function novaPendencia(escopo: EscopoId, parcial: Partial<Pendencia> = {}): Pendencia {
  return {
    id: "",
    num: 0,
    data: hojeISO(),
    escopo,
    andar: null,
    encontradaEm: "",
    categoria: "",
    descricao: "",
    prioridade: "Média",
    status: "Aberta",
    prazo: addDias(hojeISO(), 7),
    ...parcial,
  };
}

export default function Pendencias() {
  const { db, escopo, upsert, salvar } = useDB();
  const hoje = hojeISO();
  const L = db.config.listas;
  const [fSit, setFSit] = useState("abertas");
  const [fAndar, setFAndar] = useState("");
  const [fPrior, setFPrior] = useState("");
  const [fEmp, setFEmp] = useState("");
  const [fEquipe, setFEquipe] = useState("");
  const [fCat, setFCat] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Pendencia | null>(null);
  const [ordem, setOrdem] = useState<"num" | "prazo" | "dias">("prazo");
  const [modo, setModo] = useState<"lista" | "cronograma">("lista");

  const nomeEmp = (id?: string) => db.empresas.find((e) => e.id === id)?.nome ?? "";
  const nomeEq = (id?: string) => db.equipes.find((e) => e.id === id)?.nome ?? "";

  const base = db.pendencias.filter((p) => !escopo || p.escopo === escopo);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const r = base.filter((p) => {
      if (fSit === "abertas" && !pendenciaAberta(p)) return false;
      if (fSit === "vencidas" && !pendenciaVencida(p, hoje)) return false;
      if (fSit !== "abertas" && fSit !== "vencidas" && fSit && p.status !== fSit) return false;
      if (fAndar !== "" && String(p.andar) !== fAndar) return false;
      if (fPrior && p.prioridade !== fPrior) return false;
      if (fEmp && p.empresaId !== fEmp) return false;
      if (fEquipe && p.equipeId !== fEquipe) return false;
      if (fCat && p.categoria !== fCat) return false;
      if (b && !`${p.num} ${p.descricao} ${p.local ?? ""} ${p.itemCodigo ?? ""} ${p.responsavel ?? ""} ${p.obs ?? ""}`.toLowerCase().includes(b)) return false;
      return true;
    });
    const prio = (p: Pendencia) => L.prioridade.indexOf(p.prioridade);
    return r.sort((a, b) => {
      if (ordem === "num") return b.num - a.num;
      if (ordem === "dias") return diasEmAberto(b, hoje) - diasEmAberto(a, hoje);
      return Number(!pendenciaAberta(a)) - Number(!pendenciaAberta(b)) || (a.prazo ?? "9").localeCompare(b.prazo ?? "9") || prio(a) - prio(b);
    });
  }, [base, fSit, fAndar, fPrior, fEmp, fEquipe, fCat, busca, ordem, hoje, L.prioridade]);

  const categorias = escopo ? L.categorias[escopo] : [...new Set(ESCOPOS.flatMap((e) => L.categorias[e.id]))];
  const abertas = base.filter((p) => pendenciaAberta(p));
  const regSemana = base.filter((p) => p.dataRegularizacao && p.dataRegularizacao >= addDias(hoje, -7)).length;

  const mudarStatus = (p: Pendencia, status: string) =>
    upsert("pendencias", { ...p, status, dataRegularizacao: status === "Regularizada" ? p.dataRegularizacao || hoje : undefined });

  const exportar = () =>
    baixarCSV(`pendencias_${hoje}.csv`, [
      ["Nº", "Data", "Escopo", "Andar", "Item", "Local", "Encontrada em", "Categoria", "Descrição", "Prioridade", "Empresa", "Equipe", "Responsável", "Prazo", "Status", "Data regularização", "Dias em aberto", "Obs."],
      ...lista.map((p) => [p.num, p.data, escopoDef(p.escopo).nome, nomeAndar(p.andar), p.itemCodigo, p.local, p.encontradaEm, p.categoria, p.descricao, p.prioridade, nomeEmp(p.empresaId), nomeEq(p.equipeId), p.responsavel, p.prazo, p.status, p.dataRegularizacao, diasEmAberto(p, hoje), p.obs]),
    ]);

  return (
    <div>
      <Cabecalho
        titulo="Pendências"
        sub={`${abertas.length} abertas · ${base.filter((p) => pendenciaVencida(p, hoje)).length} vencidas · ${abertas.filter((p) => p.prioridade === "Alta").length} de prioridade alta · ${regSemana} regularizadas nos últimos 7 dias`}
        acoes={
          <>
            <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
              {(["lista", "cronograma"] as const).map((m) => (
                <button key={m} onClick={() => setModo(m)} className={`rounded px-3 py-1 ${modo === m ? "bg-stone-800 text-white" : "text-stone-600"}`}>
                  {m === "lista" ? "Lista" : "Cronograma"}
                </button>
              ))}
            </div>
            <Botao onClick={exportar}>Exportar CSV</Botao>
            <Botao tipo="primario" onClick={() => setEditando(novaPendencia(escopo || "auto_q"))}>
              + Pendência
            </Botao>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={`${inputCls} w-56`} placeholder="Buscar (nº, descrição, item…)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Selecao
          value={fSit}
          onChange={setFSit}
          vazio="Todas"
          opcoes={[{ v: "abertas", t: "Abertas" }, { v: "vencidas", t: "Vencidas" }, ...L.statusPendencia.map((s) => ({ v: s, t: s }))]}
        />
        <Selecao value={fAndar} onChange={setFAndar} opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio="Todos os andares" />
        <Selecao value={fPrior} onChange={setFPrior} opcoes={L.prioridade} vazio="Toda prioridade" />
        <Selecao value={fCat} onChange={setFCat} opcoes={categorias} vazio="Toda categoria" />
        <Selecao value={fEmp} onChange={setFEmp} opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))} vazio="Todas as empresas" />
        <Selecao value={fEquipe} onChange={setFEquipe} opcoes={db.equipes.map((e) => ({ v: e.id, t: e.nome }))} vazio="Todas as equipes" />
        <Selecao
          value={ordem}
          onChange={(v) => setOrdem(v as typeof ordem)}
          vazio={false}
          opcoes={[
            { v: "prazo", t: "Ordenar: prazo" },
            { v: "num", t: "Ordenar: mais recentes" },
            { v: "dias", t: "Ordenar: dias em aberto" },
          ]}
        />
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhuma pendência com esses filtros.</Vazio>
      ) : modo === "cronograma" ? (
        <PendenciasCronograma lista={lista} onEditar={setEditando} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-2 py-2 font-medium">Escopo</th>
                <th className="px-2 py-2 font-medium">Andar / item</th>
                <th className="px-2 py-2 font-medium">Pendência</th>
                <th className="px-2 py-2 font-medium">Prior.</th>
                <th className="px-2 py-2 font-medium">Responsável</th>
                <th className="px-2 py-2 font-medium">Prazo</th>
                <th className="px-2 py-2 text-right font-medium">Dias</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const venc = pendenciaVencida(p, hoje);
                return (
                  <tr key={p.id} className="cursor-pointer border-t border-stone-100 align-top hover:bg-blue-50/60" onClick={() => setEditando(p)} title="Clique para editar">
                    <td className="px-3 py-2 tabular-nums text-stone-500">
                      <div className="font-medium text-stone-700">#{p.num}</div>
                      <div className="text-[11px]">{fmtData(p.data)}</div>
                      <button className="mt-1 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-700 hover:border-blue-500 hover:text-blue-700">✎ Editar</button>
                    </td>
                    <td className="px-2 py-2">
                      <EscopoTag escopo={p.escopo} />
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <div className="text-stone-700">{nomeAndar(p.andar)}</div>
                      <div className="text-stone-500">{[p.itemCodigo, p.local].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="max-w-md px-2 py-2">
                      <div className="text-stone-900">{p.descricao}</div>
                      <div className="text-xs text-stone-500">
                        {[p.categoria, p.encontradaEm && `encontrada em ${p.encontradaEm}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Pill tom={tomPrioridade(p.prioridade)}>{p.prioridade}</Pill>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <div className="text-stone-700">{nomeEmp(p.empresaId) || p.responsavel || <span className="text-stone-300">—</span>}</div>
                      <div className="text-stone-500">{[nomeEq(p.equipeId), p.empresaId && p.responsavel].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className={`whitespace-nowrap px-2 py-2 text-xs tabular-nums ${venc ? "font-semibold text-red-700" : "text-stone-600"}`}>
                      {venc && "▲ "}
                      {fmtData(p.prazo)}
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-stone-600">{diasEmAberto(p, hoje)}</td>
                    <td className="cursor-default px-2 py-2" onClick={(e) => e.stopPropagation()} title="">
                      <div className="flex flex-col items-start gap-1">
                        <Pill tom={tomPendencia(p.status, venc)}>{venc ? `${p.status} · vencida` : p.status}</Pill>
                        <select className="rounded border border-stone-200 bg-white px-1 py-0.5 text-xs text-stone-600" value={p.status} onChange={(e) => mudarStatus(p, e.target.value)} aria-label="Mudar status">
                          {L.statusPendencia.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormPendencia
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => setEditando(null)}
          onExcluir={
            editando.id
              ? async () => {
                  if (confirm(`Excluir a pendência #${editando.num}?`)) {
                    await salvar([{ op: "delete", col: "pendencias", id: editando.id }]);
                    setEditando(null);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

export function FormPendencia({ inicial, onFechar, onSalvo, onExcluir }: { inicial: Pendencia; onFechar: () => void; onSalvo: () => void; onExcluir?: () => void }) {
  const { db, upsert } = useDB();
  const L = db.config.listas;
  const [p, setP] = useState<Pendencia>(inicial);
  const set = <K extends keyof Pendencia>(k: K, v: Pendencia[K]) => setP((x) => ({ ...x, [k]: v }));
  const itens = db.itens.filter((i) => i.escopo === p.escopo && (p.andar === null || i.andar === p.andar));
  const macroIds = new Set(db.macros.filter((m) => m.escopo === p.escopo).map((m) => m.id));
  const ativs = db.atividades.filter((a) => macroIds.has(a.macroId) && (p.andar === null || a.andar === p.andar));
  const erro = !p.descricao.trim() ? "Descreva a pendência." : !p.data ? "Informe a data." : "";

  const salvar = async () => {
    const num = p.num || Math.max(0, ...db.pendencias.map((x) => x.num)) + 1;
    const dataReg = p.status === "Regularizada" ? p.dataRegularizacao || hojeISO() : undefined;
    await upsert("pendencias", { ...p, id: p.id || novoId("P"), num, descricao: p.descricao.trim(), dataRegularizacao: dataReg });
    onSalvo();
  };

  return (
    <Modal titulo={inicial.id ? `Pendência #${inicial.num}` : "Nova pendência"} onFechar={onFechar} largura="max-w-3xl">
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!erro) salvar();
        }}
      >
        <Campo rotulo="Escopo">
          <Selecao value={p.escopo} onChange={(v) => setP((x) => ({ ...x, escopo: v as EscopoId, itemCodigo: undefined, atividadeId: undefined, categoria: "" }))} opcoes={ESCOPOS.map((e) => ({ v: e.id, t: e.nome }))} vazio={false} />
        </Campo>
        <Campo rotulo="Data">
          <Data value={p.data} onChange={(v) => set("data", v ?? "")} />
        </Campo>
        <Campo rotulo="Andar">
          <Selecao
            value={p.andar ?? ""}
            onChange={(v) => setP((x) => ({ ...x, andar: v === "" ? null : Number(v), itemCodigo: undefined, atividadeId: undefined }))}
            opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))}
          />
        </Campo>
        <Campo rotulo={`${escopoDef(p.escopo).item} (opcional)`}>
          <Selecao
            value={p.itemCodigo}
            onChange={(v) => {
              const it = db.itens.find((i) => i.escopo === p.escopo && i.codigo === v);
              setP((x) => ({ ...x, itemCodigo: v || undefined, andar: it ? it.andar : x.andar, local: x.local || it?.local }));
            }}
            opcoes={itens.map((i) => ({ v: i.codigo, t: `${i.codigo}${i.local ? " – " + i.local : ""}` }))}
          />
        </Campo>
        <Campo rotulo="Local">
          <input className={inputCls} list="locais-p" value={p.local ?? ""} onChange={(e) => set("local", e.target.value || undefined)} />
          <datalist id="locais-p">
            {L.locais.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Atividade relacionada">
          <Selecao value={p.atividadeId} onChange={(v) => set("atividadeId", v || undefined)} opcoes={ativs.map((a) => ({ v: a.id, t: `${a.nome} · ${nomeAndar(a.andar)}` }))} />
        </Campo>
        <Campo rotulo="Encontrada em">
          <Selecao value={p.encontradaEm} onChange={(v) => set("encontradaEm", v)} opcoes={L.encontradaEm} />
        </Campo>
        <Campo rotulo="Categoria">
          <Selecao value={p.categoria} onChange={(v) => set("categoria", v)} opcoes={L.categorias[p.escopo]} />
        </Campo>
        <Campo rotulo="Prioridade">
          <Selecao value={p.prioridade} onChange={(v) => set("prioridade", v)} opcoes={L.prioridade} vazio={false} />
        </Campo>
        <Campo rotulo="Descrição da pendência" className="col-span-2 md:col-span-3">
          <textarea className={inputCls} rows={2} value={p.descricao} onChange={(e) => set("descricao", e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="Empresa responsável">
          <Selecao
            value={p.empresaId}
            onChange={(v) => setP((x) => ({ ...x, empresaId: v || undefined, equipeId: undefined }))}
            opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))}
          />
        </Campo>
        <Campo rotulo="Equipe">
          <Selecao value={p.equipeId} onChange={(v) => set("equipeId", v || undefined)} opcoes={db.equipes.filter((e) => !p.empresaId || e.empresaId === p.empresaId).map((e) => ({ v: e.id, t: e.nome }))} />
        </Campo>
        <Campo rotulo="Responsável (pessoa)">
          <Texto value={p.responsavel} onChange={(v) => set("responsavel", v || undefined)} />
        </Campo>
        <Campo rotulo="Prazo">
          <Data value={p.prazo} onChange={(v) => set("prazo", v)} />
        </Campo>
        <Campo rotulo="Status">
          <Selecao value={p.status} onChange={(v) => set("status", v)} opcoes={L.statusPendencia} vazio={false} />
        </Campo>
        <Campo rotulo="Data regularização">
          <Data value={p.dataRegularizacao} onChange={(v) => setP((x) => ({ ...x, dataRegularizacao: v, status: v ? "Regularizada" : x.status }))} />
        </Campo>
        <Campo rotulo="Observações" className="col-span-2 md:col-span-3">
          <textarea className={inputCls} rows={2} value={p.obs ?? ""} onChange={(e) => set("obs", e.target.value || undefined)} />
        </Campo>
        <div className="col-span-2 flex items-center justify-between md:col-span-3">
          <div>{onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}</div>
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
