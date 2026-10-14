"use client";

import { useState } from "react";
import { fmtData, hojeISO, nomeAndar, novoId, statusAtividade } from "@/lib/logic";
import type { Equipe } from "@/lib/types";
import { useDB } from "./store";
import { Barra, Botao, Cabecalho, Campo, EscopoTag, Modal, Pill, Selecao, Texto, Vazio, inputCls, tomAtividade } from "./ui";
import { EscopoChecks, resumoCarga } from "./Empresas";

export default function Equipes() {
  const { db, escopo, upsert, salvar } = useDB();
  const hoje = hojeISO();
  const [editando, setEditando] = useState<Equipe | null>(null);
  const [fEmp, setFEmp] = useState("");

  const nomeEmp = (id?: string) => db.empresas.find((e) => e.id === id)?.nome ?? "";
  const lista = db.equipes
    .filter((q) => !escopo || q.escopos.includes(escopo))
    .filter((q) => !fEmp || q.empresaId === fEmp)
    .sort((a, b) => nomeEmp(a.empresaId).localeCompare(nomeEmp(b.empresaId)) || a.nome.localeCompare(b.nome));
  const totalPessoas = lista.reduce((s, q) => s + (q.qtdPessoas ?? 0), 0);

  return (
    <div>
      <Cabecalho
        titulo="Equipes"
        sub={`${lista.length} equipes · ${totalPessoas} pessoas alocadas`}
        acoes={
          <Botao tipo="primario" onClick={() => setEditando({ id: "", nome: "", empresaId: fEmp || undefined, escopos: escopo ? [escopo] : [] })}>
            + Equipe
          </Botao>
        }
      />
      <div className="mb-3">
        <Selecao value={fEmp} onChange={setFEmp} opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))} vazio="Todas as empresas" />
      </div>
      {lista.length === 0 ? (
        <Vazio>Nenhuma equipe cadastrada. Cadastre as empresas primeiro e depois as equipes de cada uma.</Vazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((q) => {
            const ativs = db.atividades.filter((a) => a.equipeId === q.id);
            const r = resumoCarga(ativs, db.pendencias.filter((p) => p.equipeId === q.id), hoje);
            const atuais = ativs.filter((a) => {
              const s = statusAtividade(a, hoje);
              return s === "Em andamento" || s === "Atrasada";
            });
            return (
              <button key={q.id} onClick={() => setEditando(q)} className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-stone-900">{q.nome}</div>
                    <div className="text-xs text-stone-500">{nomeEmp(q.empresaId) || "Sem empresa"}</div>
                  </div>
                  {q.qtdPessoas ? <span className="text-xs text-stone-600">{q.qtdPessoas} pessoas</span> : null}
                </div>
                {q.lider && (
                  <div className="text-xs text-stone-600">
                    Líder: {q.lider}
                    {q.telefone && ` · ${q.telefone}`}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {q.escopos.map((s) => (
                    <EscopoTag key={s} escopo={s} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-2 text-xs text-stone-600">
                  <span>{r.nAtiv} ativ.</span>
                  {r.nAtiv > 0 && <Barra valor={r.avanco} largura="w-16" />}
                  {r.atrasadas > 0 && <Pill tom="critico">{r.atrasadas} atrasadas</Pill>}
                  <span>
                    {r.pendAb} pend.{r.pendVenc > 0 && <span className="text-red-700"> ({r.pendVenc} venc.)</span>}
                  </span>
                </div>
                {atuais.length > 0 && (
                  <div className="text-xs text-stone-600">
                    <div className="font-medium text-stone-500">Em execução:</div>
                    {atuais.slice(0, 3).map((a) => (
                      <div key={a.id} className="truncate">
                        {a.nome} · {nomeAndar(a.andar)}
                      </div>
                    ))}
                    {atuais.length > 3 && <div className="text-stone-400">+{atuais.length - 3}</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editando && (
        <FormEquipe
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (q) => {
            await upsert("equipes", q.id ? q : { ...q, id: novoId("T") });
            setEditando(null);
          }}
          onExcluir={
            editando.id
              ? async () => {
                  const id = editando.id;
                  if (!confirm(`Excluir a equipe "${editando.nome}"? Atividades, itens e pendências ficarão sem equipe.`)) return;
                  await salvar([
                    ...db.atividades.filter((a) => a.equipeId === id).map((a) => ({ op: "upsert" as const, col: "atividades" as const, item: { ...a, equipeId: undefined } })),
                    ...db.pendencias.filter((p) => p.equipeId === id).map((p) => ({ op: "upsert" as const, col: "pendencias" as const, item: { ...p, equipeId: undefined } })),
                    ...db.itens.filter((i) => i.equipeId === id).map((i) => ({ op: "upsert" as const, col: "itens" as const, item: { ...i, equipeId: undefined } })),
                    { op: "delete", col: "equipes", id },
                  ]);
                  setEditando(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function FormEquipe({ inicial, onFechar, onSalvar, onExcluir }: { inicial: Equipe; onFechar: () => void; onSalvar: (q: Equipe) => void; onExcluir?: () => void }) {
  const { db } = useDB();
  const hoje = hojeISO();
  const [q, setQ] = useState<Equipe>(inicial);
  const set = <K extends keyof Equipe>(k: K, v: Equipe[K]) => setQ((x) => ({ ...x, [k]: v }));
  const ativs = inicial.id ? db.atividades.filter((a) => a.equipeId === inicial.id && statusAtividade(a, hoje) !== "Concluída").sort((a, b) => (a.inicioPrev ?? "").localeCompare(b.inicioPrev ?? "")) : [];

  return (
    <Modal titulo={inicial.id ? inicial.nome : "Nova equipe"} onFechar={onFechar}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.nome.trim()) onSalvar({ ...q, nome: q.nome.trim() });
        }}
      >
        <Campo rotulo="Nome da equipe">
          <Texto value={q.nome} onChange={(v) => set("nome", v)} autoFocus placeholder="Ex.: Equipe CFTV 1" />
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao
            value={q.empresaId}
            onChange={(v) => {
              const emp = db.empresas.find((e) => e.id === v);
              setQ((x) => ({ ...x, empresaId: v || undefined, escopos: x.escopos.length ? x.escopos : (emp?.escopos ?? []) }));
            }}
            opcoes={db.empresas.map((e) => ({ v: e.id, t: e.nome }))}
          />
        </Campo>
        <Campo rotulo="Líder / encarregado">
          <Texto value={q.lider} onChange={(v) => set("lider", v || undefined)} />
        </Campo>
        <Campo rotulo="Telefone">
          <Texto value={q.telefone} onChange={(v) => set("telefone", v || undefined)} />
        </Campo>
        <Campo rotulo="Qtd. de pessoas">
          <Texto type="number" min={0} value={q.qtdPessoas} onChange={(v) => set("qtdPessoas", v === "" ? undefined : Number(v))} />
        </Campo>
        <span />
        <Campo rotulo="Escopos" className="col-span-2">
          <EscopoChecks valor={q.escopos} onChange={(v) => set("escopos", v)} />
        </Campo>
        <Campo rotulo="Observações" className="col-span-2">
          <textarea className={inputCls} rows={2} value={q.obs ?? ""} onChange={(e) => set("obs", e.target.value || undefined)} />
        </Campo>
        {ativs.length > 0 && (
          <div className="col-span-2">
            <div className="mb-1 text-xs font-medium text-stone-600">Atividades não concluídas ({ativs.length})</div>
            <div className="max-h-48 overflow-y-auto text-sm">
              {ativs.map((a) => {
                const s = statusAtividade(a, hoje);
                return (
                  <div key={a.id} className="flex items-center gap-2 border-b border-stone-100 py-1">
                    <span className="flex-1 truncate">
                      {a.nome} · {nomeAndar(a.andar)}
                    </span>
                    <span className="text-xs text-stone-500">
                      {fmtData(a.inicioPrev)} → {fmtData(a.fimPrev)}
                    </span>
                    <Pill tom={tomAtividade(s)}>{s}</Pill>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="col-span-2 flex items-center justify-between pt-2">
          <div>{onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}</div>
          <div className="flex gap-2">
            <Botao onClick={onFechar}>Cancelar</Botao>
            <Botao tipo="primario" type="submit" disabled={!q.nome.trim()}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}
