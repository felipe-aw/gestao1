"use client";

import { useState } from "react";
import { ESCOPOS, fmtData, hojeISO, nomeAndar, novoId, pendenciaAberta, pendenciaVencida, progressoMedio, statusAtividade } from "@/lib/logic";
import type { Atividade, Empresa, EscopoId, Pendencia } from "@/lib/types";
import { useDB } from "./store";
import { FormPendencia } from "./Pendencias";
import { Barra, Botao, Cabecalho, Campo, EscopoTag, Modal, Pill, Texto, Vazio, inputCls, tomPendencia } from "./ui";

export function resumoCarga(ativs: Atividade[], pends: Pendencia[], hoje: string) {
  return {
    nAtiv: ativs.length,
    avanco: progressoMedio(ativs),
    atrasadas: ativs.filter((a) => statusAtividade(a, hoje) === "Atrasada").length,
    emAndamento: ativs.filter((a) => statusAtividade(a, hoje) === "Em andamento").length,
    pendAb: pends.filter((p) => pendenciaAberta(p)).length,
    pendVenc: pends.filter((p) => pendenciaVencida(p, hoje)).length,
  };
}

export function EscopoChecks({ valor, onChange }: { valor: EscopoId[]; onChange: (v: EscopoId[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ESCOPOS.map((e) => (
        <label key={e.id} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2 py-1 text-xs font-normal text-stone-700">
          <input type="checkbox" checked={valor.includes(e.id)} onChange={(ev) => onChange(ev.target.checked ? [...valor, e.id] : valor.filter((x) => x !== e.id))} />
          <EscopoTag escopo={e.id} curto={false} />
        </label>
      ))}
    </div>
  );
}

export default function Empresas() {
  const { db, escopo, upsert, salvar } = useDB();
  const hoje = hojeISO();
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [editPend, setEditPend] = useState<Pendencia | null>(null);
  const [busca, setBusca] = useState("");

  const lista = db.empresas
    .filter((e) => !escopo || e.escopos.includes(escopo))
    .filter((e) => !busca || `${e.nome} ${e.contato ?? ""} ${e.cnpj ?? ""}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div>
      <Cabecalho
        titulo="Empresas"
        sub="Empresas contratadas e terceiros, com a carga de atividades e pendências de cada uma."
        acoes={
          <Botao tipo="primario" onClick={() => setEditando({ id: "", nome: "", escopos: escopo ? [escopo] : [] })}>
            + Empresa
          </Botao>
        }
      />
      <input className={`${inputCls} mb-3 w-64`} placeholder="Buscar empresa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {lista.length === 0 ? (
        <Vazio>Nenhuma empresa cadastrada{escopo ? " neste escopo" : ""}.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-2 py-2 font-medium">Escopos</th>
                <th className="px-2 py-2 font-medium">Contato</th>
                <th className="px-2 py-2 text-right font-medium">Equipes</th>
                <th className="px-2 py-2 text-right font-medium">Atividades</th>
                <th className="px-2 py-2 font-medium">Avanço</th>
                <th className="px-2 py-2 text-right font-medium">Atrasadas</th>
                <th className="px-2 py-2 text-right font-medium">Pend. abertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const r = resumoCarga(
                  db.atividades.filter((a) => a.empresaId === e.id),
                  db.pendencias.filter((p) => p.empresaId === e.id),
                  hoje,
                );
                return (
                  <tr key={e.id} className="border-t border-stone-100 hover:bg-blue-50/40">
                    <td className="px-3 py-2">
                      <button className="font-medium text-stone-900 hover:text-blue-700 hover:underline" onClick={() => setEditando(e)}>
                        {e.nome}
                      </button>
                      {e.cnpj && <div className="text-xs text-stone-500">{e.cnpj}</div>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-0.5">
                        {e.escopos.map((s) => (
                          <EscopoTag key={s} escopo={s} />
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-stone-600">
                      <div>{e.contato}</div>
                      <div>{[e.telefone, e.email].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{db.equipes.filter((q) => q.empresaId === e.id).length}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.nAtiv}</td>
                    <td className="px-2 py-2">{r.nAtiv ? <Barra valor={r.avanco} largura="w-20" /> : <span className="text-xs text-stone-300">—</span>}</td>
                    <td className="px-2 py-2 text-right">{r.atrasadas ? <Pill tom="critico">{r.atrasadas}</Pill> : <span className="text-stone-400">0</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {r.pendAb}
                      {r.pendVenc > 0 && <span className="ml-1 text-xs text-red-700">({r.pendVenc} venc.)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormEmpresa
          onEditarPendencia={(p) => {
            setEditPend(p);
            setEditando(null);
          }}
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (e) => {
            await upsert("empresas", e.id ? e : { ...e, id: novoId("E") });
            setEditando(null);
          }}
          onExcluir={
            editando.id
              ? async () => {
                  const id = editando.id;
                  const vinc = db.atividades.filter((a) => a.empresaId === id).length + db.pendencias.filter((p) => p.empresaId === id).length + db.equipes.filter((q) => q.empresaId === id).length;
                  if (!confirm(vinc ? `"${editando.nome}" tem ${vinc} vínculos (atividades, pendências, equipes). Excluir e desvincular?` : `Excluir "${editando.nome}"?`)) return;
                  await salvar([
                    ...db.atividades.filter((a) => a.empresaId === id).map((a) => ({ op: "upsert" as const, col: "atividades" as const, item: { ...a, empresaId: undefined } })),
                    ...db.pendencias.filter((p) => p.empresaId === id).map((p) => ({ op: "upsert" as const, col: "pendencias" as const, item: { ...p, empresaId: undefined } })),
                    ...db.equipes.filter((q) => q.empresaId === id).map((q) => ({ op: "upsert" as const, col: "equipes" as const, item: { ...q, empresaId: undefined } })),
                    { op: "delete", col: "empresas", id },
                  ]);
                  setEditando(null);
                }
              : undefined
          }
        />
      )}
      {editPend && <FormPendencia inicial={editPend} onFechar={() => setEditPend(null)} onSalvo={() => setEditPend(null)} />}
    </div>
  );
}

function FormEmpresa({
  inicial,
  onFechar,
  onSalvar,
  onExcluir,
  onEditarPendencia,
}: {
  inicial: Empresa;
  onFechar: () => void;
  onSalvar: (e: Empresa) => void;
  onExcluir?: () => void;
  onEditarPendencia: (p: Pendencia) => void;
}) {
  const { db } = useDB();
  const hoje = hojeISO();
  const [e, setE] = useState<Empresa>(inicial);
  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setE((x) => ({ ...x, [k]: v }));
  const equipes = db.equipes.filter((q) => q.empresaId === inicial.id && inicial.id);
  const pends = db.pendencias.filter((p) => p.empresaId === inicial.id && inicial.id && pendenciaAberta(p));
  const atras = db.atividades.filter((a) => a.empresaId === inicial.id && inicial.id && statusAtividade(a, hoje) === "Atrasada");

  return (
    <Modal titulo={inicial.id ? inicial.nome : "Nova empresa"} onFechar={onFechar} largura="max-w-3xl">
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (e.nome.trim()) onSalvar({ ...e, nome: e.nome.trim() });
        }}
      >
        <Campo rotulo="Razão social / nome">
          <Texto value={e.nome} onChange={(v) => set("nome", v)} autoFocus />
        </Campo>
        <Campo rotulo="CNPJ">
          <Texto value={e.cnpj} onChange={(v) => set("cnpj", v || undefined)} />
        </Campo>
        <Campo rotulo="Contato">
          <Texto value={e.contato} onChange={(v) => set("contato", v || undefined)} />
        </Campo>
        <Campo rotulo="Telefone">
          <Texto value={e.telefone} onChange={(v) => set("telefone", v || undefined)} />
        </Campo>
        <Campo rotulo="E-mail" className="col-span-2">
          <Texto type="email" value={e.email} onChange={(v) => set("email", v || undefined)} />
        </Campo>
        <Campo rotulo="Escopos que atende" className="col-span-2">
          <EscopoChecks valor={e.escopos} onChange={(v) => set("escopos", v)} />
        </Campo>
        <Campo rotulo="Observações" className="col-span-2">
          <textarea className={inputCls} rows={2} value={e.obs ?? ""} onChange={(ev) => set("obs", ev.target.value || undefined)} />
        </Campo>

        {inicial.id && (
          <div className="col-span-2 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium text-stone-600">Equipes ({equipes.length})</div>
              {equipes.map((q) => (
                <div key={q.id} className="text-stone-700">
                  {q.nome} {q.qtdPessoas ? <span className="text-xs text-stone-400">· {q.qtdPessoas} pessoas</span> : null}
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-stone-600">Atividades atrasadas ({atras.length})</div>
              {atras.slice(0, 8).map((a) => (
                <div key={a.id} className="text-xs text-stone-700">
                  {a.nome} · {nomeAndar(a.andar)} <span className="text-red-700">fim {fmtData(a.fimPrev)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-stone-600">Pendências abertas ({pends.length})</div>
              {pends.slice(0, 8).map((p) => (
                <button type="button" key={p.id} onClick={() => onEditarPendencia(p)} className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-stone-700 hover:bg-blue-50" title="Clique para editar">
                  <Pill tom={tomPendencia(p.status, pendenciaVencida(p, hoje))}>#{p.num}</Pill>
                  <span className="truncate">{p.descricao}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="col-span-2 flex items-center justify-between pt-2">
          <div>{onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}</div>
          <div className="flex gap-2">
            <Botao onClick={onFechar}>Cancelar</Botao>
            <Botao tipo="primario" type="submit" disabled={!e.nome.trim()}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}

