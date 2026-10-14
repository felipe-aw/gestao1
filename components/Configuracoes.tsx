"use client";

import { useState } from "react";
import { ESCOPOS } from "@/lib/logic";
import type { Config, EscopoId } from "@/lib/types";
import { useDB } from "./store";
import { Botao, Cabecalho, Campo, Data, Texto, inputCls } from "./ui";
import { Secao } from "./Painel";

type ListaSimples = "statusPendencia" | "prioridade" | "encontradaEm" | "locais";

export default function Configuracoes() {
  const { db, salvar } = useDB();
  const [c, setC] = useState<Config>(db.config);
  const [esc, setEsc] = useState<EscopoId>("auto_ac");
  const sujo = JSON.stringify(c) !== JSON.stringify(db.config);

  const setLista = (k: ListaSimples, v: string[]) => setC((x) => ({ ...x, listas: { ...x.listas, [k]: v } }));
  const setPorEscopo = (k: "categorias" | "tiposItem", v: string[]) => setC((x) => ({ ...x, listas: { ...x.listas, [k]: { ...x.listas[k], [esc]: v } } }));

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho
        titulo="Configurações"
        sub="Dados da obra e listas dos menus suspensos. Uma opção por linha."
        acoes={
          <>
            <Botao onClick={() => setC(db.config)} disabled={!sujo}>
              Descartar
            </Botao>
            <Botao tipo="primario" disabled={!sujo} onClick={() => salvar([{ op: "config", config: c }])}>
              Salvar alterações
            </Botao>
          </>
        }
      />
      <Secao titulo="Obra">
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Nome da obra">
            <Texto value={c.obra} onChange={(v) => setC({ ...c, obra: v })} />
          </Campo>
          <Campo rotulo="Início do cronograma (Gantt)">
            <Data value={c.inicioCronograma} onChange={(v) => v && setC({ ...c, inicioCronograma: v })} />
          </Campo>
          <Campo rotulo="Andar mais baixo (0 = térreo, −1 = subsolo)">
            <Texto type="number" value={c.andarMin} onChange={(v) => setC({ ...c, andarMin: Number(v) })} />
          </Campo>
          <Campo rotulo="Andar mais alto">
            <Texto type="number" value={c.andarMax} onChange={(v) => setC({ ...c, andarMax: Number(v) })} />
          </Campo>
        </div>
      </Secao>
      <Secao titulo="Listas gerais">
        <div className="grid gap-3 md:grid-cols-4">
          <EditorLista rotulo="Status de pendência" valor={c.listas.statusPendencia} onChange={(v) => setLista("statusPendencia", v)} dica='O status "Regularizada" fecha a pendência.' />
          <EditorLista rotulo="Prioridade" valor={c.listas.prioridade} onChange={(v) => setLista("prioridade", v)} />
          <EditorLista rotulo="Encontrada em" valor={c.listas.encontradaEm} onChange={(v) => setLista("encontradaEm", v)} />
          <EditorLista rotulo="Locais" valor={c.listas.locais} onChange={(v) => setLista("locais", v)} />
        </div>
      </Secao>
      <Secao titulo="Listas por escopo">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ESCOPOS.map((e) => (
            <button key={e.id} onClick={() => setEsc(e.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${esc === e.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300"}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.cor }} />
              {e.nome}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <EditorLista key={`cat-${esc}`} rotulo="Categorias de pendência" valor={c.listas.categorias[esc]} onChange={(v) => setPorEscopo("categorias", v)} />
          <EditorLista key={`tip-${esc}`} rotulo="Tipos de item" valor={c.listas.tiposItem[esc]} onChange={(v) => setPorEscopo("tiposItem", v)} />
        </div>
      </Secao>
      <p className="text-xs text-stone-500">
        Os dados ficam em <code>gestao/data/db.json</code>, com backup diário automático em <code>gestao/data/backups/</code>.
      </p>
    </div>
  );
}

function EditorLista({ rotulo, valor, onChange, dica }: { rotulo: string; valor: string[]; onChange: (v: string[]) => void; dica?: string }) {
  const [txt, setTxt] = useState(valor.join("\n"));
  return (
    <Campo rotulo={rotulo}>
      <textarea
        className={`${inputCls} font-mono text-xs`}
        rows={Math.max(5, Math.min(14, valor.length + 1))}
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
        }}
      />
      {dica && <span className="font-normal text-stone-400">{dica}</span>}
    </Campo>
  );
}
