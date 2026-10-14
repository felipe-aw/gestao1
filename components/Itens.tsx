"use client";

import { useMemo, useState } from "react";
import { ESCOPOS, FLUXO_ITEM, andares, escopoDef, fmtData, hojeISO, nomeAndar, novoId, pendAbertasDoItem, rotuloStatusItem, statusItem, type StatusItem } from "@/lib/logic";
import type { EscopoId, Item, Pendencia } from "@/lib/types";
import { useDB } from "./store";
import { Botao, Cabecalho, Campo, Data, Modal, Pill, Selecao, Texto, Vazio, baixarCSV, inputCls, tomItem } from "./ui";
import { FormPendencia, novaPendencia } from "./Pendencias";
import ChecklistItens from "./ChecklistItens";

// Cor de preenchimento dos quadradinhos do mapa por status (sempre acompanhada de legenda e tooltip).
const COR_STATUS: Record<StatusItem, string> = {
  "Não instalado": "#e7e5e4",
  "Instalado – configurar": "#9ec5f4",
  "Pendência – regularizar": "#d03b3b",
  "Aguardando retorno": "#ec835a",
  "Aguardando OK AW": "#fab219",
  "Aprovado AW": "#0ca30c",
};

export default function Itens() {
  const { db, escopo: escGlobal, upsert, remover, salvar } = useDB();
  const [escLocal, setEscLocal] = useState<EscopoId>("auto_q");
  const esc = escGlobal || escLocal;
  const def = escopoDef(esc);
  const [modo, setModo] = useState<"mapa" | "tabela">("mapa");
  const [fAndar, setFAndar] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Item | null>(null);
  const [lote, setLote] = useState(false);
  const [novaPend, setNovaPend] = useState<Pendencia | null>(null);
  const hoje = hojeISO();

  const itens = useMemo(
    () =>
      db.itens
        .filter((i) => i.escopo === esc)
        .map((i) => {
          const pa = pendAbertasDoItem(db.pendencias, i);
          return { i, pa, st: statusItem(i, pa) };
        })
        .sort((a, b) => a.i.andar - b.i.andar || a.i.codigo.localeCompare(b.i.codigo, "pt-BR", { numeric: true })),
    [db.itens, db.pendencias, esc],
  );

  const filtrados = itens.filter(({ i, st }) => {
    if (fAndar !== "" && String(i.andar) !== fAndar) return false;
    if (fStatus && st !== fStatus) return false;
    const b = busca.trim().toLowerCase();
    if (b && !`${i.codigo} ${i.local ?? ""} ${i.tipo ?? ""} ${i.ip ?? ""} ${i.tecnico ?? ""}`.toLowerCase().includes(b)) return false;
    return true;
  });

  const contagem = FLUXO_ITEM.filter((s) => def.usaInstalacao || s !== "Instalado – configurar").map((s) => ({ s, n: itens.filter((x) => x.st === s).length }));

  const exportar = () =>
    baixarCSV(`${def.itens.toLowerCase().replace(/\s+/g, "_")}_${hoje}.csv`, [
      ["Código", "Andar", "Local", "Tipo", "Modelo", "IP", "Extra", "Instalação", def.etapaConfig, "Técnico", "Achou pendência", "Pend. abertas", "Retorno", "Nº retornos", "OK AW", "Aprovado por", "Status", "Obs."],
      ...filtrados.map(({ i, pa, st }) => [i.codigo, nomeAndar(i.andar), i.local, i.tipo, i.modelo, i.ip, i.extra, i.dataInstalacao, i.dataConfig, i.tecnico, i.achouPendencia === undefined ? "" : i.achouPendencia ? "Sim" : "Não", pa, i.dataRetorno, i.nRetornos, i.dataOkAW, i.aprovadoPor, rotuloStatusItem(st, esc), i.obs]),
    ]);

  const porAndar = andares(db)
    .slice()
    .reverse()
    .map((a) => ({ a, its: filtrados.filter((x) => x.i.andar === a) }))
    .filter((x) => x.its.length || (fAndar === "" && !fStatus && !busca));

  const seletorEscopo = !escGlobal && (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {ESCOPOS.map((e) => (
        <button key={e.id} onClick={() => setEscLocal(e.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${esc === e.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}>
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.cor }} />
          {e.nome} <span className="opacity-60">({db.itens.filter((i) => i.escopo === e.id).length})</span>
        </button>
      ))}
    </div>
  );

  // Escopos com checklist de etapas (área comum, controle de acesso).
  if (def.etapas) return <ChecklistItens key={esc} escopo={esc} seletorEscopo={seletorEscopo} />;

  return (
    <div>
      <Cabecalho
        titulo={`${def.itens} – ${def.nome}`}
        sub={`Fluxo automático: ${def.usaInstalacao ? "instalação → " : ""}${def.etapaConfig.toLowerCase()} → pendência/retorno → OK AW. O status muda conforme as datas.`}
        acoes={
          <>
            <Botao onClick={exportar}>Exportar CSV</Botao>
            <Botao onClick={() => setLote(true)}>Gerar em lote</Botao>
            <Botao tipo="primario" onClick={() => setEditando({ id: "", escopo: esc, codigo: "", andar: fAndar === "" ? db.config.andarMin : Number(fAndar) })}>
              + {def.item}
            </Botao>
          </>
        }
      />

      {seletorEscopo}

      <div className="mb-4 flex flex-wrap gap-2">
        {contagem.map(({ s, n }) => (
          <button
            key={s}
            onClick={() => setFStatus(fStatus === s ? "" : s)}
            className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left ${fStatus === s ? "border-stone-800 ring-1 ring-stone-800" : "border-stone-200 hover:border-stone-300"}`}
          >
            <span className="h-3 w-3 rounded-sm" style={{ background: COR_STATUS[s] }} />
            <span className="text-xs text-stone-600">{rotuloStatusItem(s, esc)}</span>
            <span className="text-base font-semibold tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-56`} placeholder="Buscar código, local, IP…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Selecao value={fAndar} onChange={setFAndar} opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio="Todos os andares" />
        <div className="ml-auto flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
          {(["mapa", "tabela"] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} className={`rounded px-3 py-1 ${modo === m ? "bg-stone-800 text-white" : "text-stone-600"}`}>
              {m === "mapa" ? "Mapa por andar" : "Tabela"}
            </button>
          ))}
        </div>
      </div>

      {itens.length === 0 ? (
        <Vazio>
          Nenhum {def.item.toLowerCase()} cadastrado em {def.nome}. Use “Gerar em lote” para criar a lista por andar.
        </Vazio>
      ) : modo === "mapa" ? (
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          {porAndar.map(({ a, its }) => {
            const aprov = its.filter((x) => x.st === "Aprovado AW").length;
            return (
              <div key={a} className="flex items-start gap-3 border-b border-stone-100 py-1.5 last:border-0">
                <div className="w-24 shrink-0 pt-1 text-xs text-stone-600">
                  <div className="font-medium text-stone-800">{nomeAndar(a)}</div>
                  {its.length > 0 && (
                    <div className="tabular-nums">
                      {aprov}/{its.length} aprov.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {its.map(({ i, pa, st }) => (
                    <button
                      key={i.id}
                      onClick={() => setEditando(i)}
                      title={`${i.codigo}${i.local ? " – " + i.local : ""}\n${rotuloStatusItem(st, esc)}${pa ? `\n${pa} pendência(s) aberta(s)` : ""}`}
                      className="min-w-14 rounded px-1.5 py-1 text-[11px] font-medium tabular-nums ring-white hover:ring-2 hover:ring-stone-800"
                      style={{ background: COR_STATUS[st], color: st === "Não instalado" || st === "Instalado – configurar" || st === "Aguardando OK AW" ? "#1c1917" : "#fff" }}
                    >
                      {i.codigo}
                    </button>
                  ))}
                  {!its.length && <span className="pt-1 text-xs text-stone-300">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-2 py-2 font-medium">Andar</th>
                <th className="px-2 py-2 font-medium">Local / tipo</th>
                {def.usaInstalacao && <th className="px-2 py-2 font-medium">Instalação</th>}
                <th className="px-2 py-2 font-medium">{def.etapaConfig}</th>
                <th className="px-2 py-2 font-medium">Técnico</th>
                <th className="px-2 py-2 text-right font-medium">Pend.</th>
                <th className="px-2 py-2 font-medium">Retorno</th>
                <th className="px-2 py-2 font-medium">OK AW</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(({ i, pa, st }) => (
                <tr key={i.id} className="border-t border-stone-100 hover:bg-blue-50/40">
                  <td className="px-3 py-1.5">
                    <button className="font-medium text-stone-900 hover:text-blue-700 hover:underline" onClick={() => setEditando(i)}>
                      {i.codigo}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-stone-600">{nomeAndar(i.andar)}</td>
                  <td className="px-2 py-1.5 text-xs text-stone-600">{[i.local, i.tipo].filter(Boolean).join(" · ")}</td>
                  {def.usaInstalacao && <td className="px-2 py-1.5 text-xs tabular-nums">{fmtData(i.dataInstalacao)}</td>}
                  <td className="px-2 py-1.5 text-xs tabular-nums">{fmtData(i.dataConfig)}</td>
                  <td className="px-2 py-1.5 text-xs">{i.tecnico}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums">{pa || ""}</td>
                  <td className="px-2 py-1.5 text-xs tabular-nums">{fmtData(i.dataRetorno)}</td>
                  <td className="px-2 py-1.5 text-xs tabular-nums">{fmtData(i.dataOkAW)}</td>
                  <td className="px-2 py-1.5">
                    <Pill tom={tomItem(st)}>{rotuloStatusItem(st, esc)}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormItem
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (i) => {
            if (db.itens.some((x) => x.escopo === i.escopo && x.codigo === i.codigo && x.id !== i.id)) {
              alert(`Já existe ${def.item.toLowerCase()} com o código ${i.codigo}.`);
              return;
            }
            await upsert("itens", i.id ? i : { ...i, id: novoId("I") });
            setEditando(null);
          }}
          onExcluir={
            editando.id
              ? async () => {
                  if (confirm(`Excluir ${editando.codigo}?`)) {
                    await remover("itens", editando.id);
                    setEditando(null);
                  }
                }
              : undefined
          }
          onEditarPendencia={(p) => {
            setNovaPend(p);
            setEditando(null);
          }}
          onNovaPendencia={
            editando.id
              ? () => {
                  setNovaPend(novaPendencia(editando.escopo, { andar: editando.andar, itemCodigo: editando.codigo, local: editando.local, encontradaEm: editando.dataConfig ? def.etapaConfig : def.usaInstalacao ? "Instalação" : "" }));
                  setEditando(null);
                }
              : undefined
          }
        />
      )}
      {novaPend && <FormPendencia inicial={novaPend} onFechar={() => setNovaPend(null)} onSalvo={() => setNovaPend(null)} />}
      {lote && (
        <GerarLote
          escopo={esc}
          onFechar={() => setLote(false)}
          onGerar={async (novos) => {
            await salvar(novos.map((item) => ({ op: "upsert" as const, col: "itens" as const, item })));
            setLote(false);
          }}
        />
      )}
    </div>
  );
}

function FormItem({
  inicial,
  onFechar,
  onSalvar,
  onExcluir,
  onNovaPendencia,
  onEditarPendencia,
}: {
  inicial: Item;
  onFechar: () => void;
  onSalvar: (i: Item) => void;
  onExcluir?: () => void;
  onNovaPendencia?: () => void;
  onEditarPendencia: (p: Pendencia) => void;
}) {
  const { db } = useDB();
  const def = escopoDef(inicial.escopo);
  const [i, setI] = useState<Item>(inicial);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setI((x) => ({ ...x, [k]: v }));
  const pa = pendAbertasDoItem(db.pendencias, i);
  const st = statusItem(i, pa);
  const pends = db.pendencias.filter((p) => p.escopo === i.escopo && p.itemCodigo === inicial.codigo && inicial.codigo);
  const hoje = hojeISO();

  return (
    <Modal titulo={inicial.id ? `${def.item} ${inicial.codigo}` : `Novo ${def.item.toLowerCase()}`} onFechar={onFechar} largura="max-w-3xl">
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (i.codigo.trim()) onSalvar({ ...i, codigo: i.codigo.trim() });
        }}
      >
        <div className="col-span-2 flex items-center gap-2 md:col-span-4">
          <span className="text-xs text-stone-500">Status atual:</span>
          <Pill tom={tomItem(st)}>{rotuloStatusItem(st, i.escopo)}</Pill>
          {pa > 0 && <span className="text-xs text-red-700">{pa} pendência(s) aberta(s)</span>}
        </div>
        <Campo rotulo="Código">
          <Texto value={i.codigo} onChange={(v) => set("codigo", v)} autoFocus={!inicial.id} placeholder={def.prefixo === "Q" ? "Q1204" : `${def.prefixo}-12-01`} />
        </Campo>
        <Campo rotulo="Andar">
          <Selecao value={i.andar} onChange={(v) => set("andar", Number(v))} opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio={false} />
        </Campo>
        <Campo rotulo="Local / posição">
          <Texto value={i.local} onChange={(v) => set("local", v || undefined)} />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao value={i.tipo} onChange={(v) => set("tipo", v || undefined)} opcoes={db.config.listas.tiposItem[i.escopo]} />
        </Campo>
        <Campo rotulo="Modelo">
          <Texto value={i.modelo} onChange={(v) => set("modelo", v || undefined)} />
        </Campo>
        <Campo rotulo="IP">
          <Texto value={i.ip} onChange={(v) => set("ip", v || undefined)} />
        </Campo>
        <Campo rotulo={i.escopo === "cftv" ? "NVR / canal / switch" : i.escopo === "sdai" ? "Laço / endereço" : "Controlador / porta"} className="col-span-2">
          <Texto value={i.extra} onChange={(v) => set("extra", v || undefined)} />
        </Campo>
        {def.usaInstalacao && (
          <Campo rotulo="Data instalação">
            <Data value={i.dataInstalacao} onChange={(v) => set("dataInstalacao", v)} />
          </Campo>
        )}
        <Campo rotulo={`Data ${def.etapaConfig.toLowerCase()}`}>
          <Data value={i.dataConfig} onChange={(v) => set("dataConfig", v)} />
        </Campo>
        <Campo rotulo="Técnico / programador">
          <Texto value={i.tecnico} onChange={(v) => set("tecnico", v || undefined)} />
        </Campo>
        <Campo rotulo="Equipe">
          <Selecao value={i.equipeId} onChange={(v) => set("equipeId", v || undefined)} opcoes={db.equipes.map((e) => ({ v: e.id, t: e.nome }))} />
        </Campo>
        <Campo rotulo="Achou pendência?">
          <Selecao
            value={i.achouPendencia === undefined ? "" : i.achouPendencia ? "Sim" : "Não"}
            onChange={(v) => set("achouPendencia", v === "" ? undefined : v === "Sim")}
            opcoes={["Sim", "Não"]}
          />
        </Campo>
        <Campo rotulo="Data retorno">
          <Data value={i.dataRetorno} onChange={(v) => set("dataRetorno", v)} />
        </Campo>
        <Campo rotulo="Nº retornos">
          <Texto type="number" min={0} value={i.nRetornos} onChange={(v) => set("nRetornos", v === "" ? undefined : Number(v))} />
        </Campo>
        <Campo rotulo="Data OK AW">
          <Data value={i.dataOkAW} onChange={(v) => set("dataOkAW", v)} />
        </Campo>
        <Campo rotulo="Aprovado por (AW)">
          <Texto value={i.aprovadoPor} onChange={(v) => set("aprovadoPor", v || undefined)} />
        </Campo>
        <Campo rotulo="Observações" className="col-span-2 md:col-span-4">
          <textarea className={inputCls} rows={2} value={i.obs ?? ""} onChange={(e) => set("obs", e.target.value || undefined)} />
        </Campo>

        {pends.length > 0 && (
          <div className="col-span-2 md:col-span-4">
            <div className="mb-1 text-xs font-medium text-stone-600">Pendências deste item</div>
            <ul className="flex flex-col gap-1 text-sm">
              {pends.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onEditarPendencia(p)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-blue-50" title="Clique para editar">
                    <span className="text-xs text-stone-500">#{p.num}</span>
                    <span className="flex-1">{p.descricao}</span>
                    <span className="text-xs text-stone-500">prazo {fmtData(p.prazo)}</span>
                    <Pill tom={p.status === "Regularizada" ? "bom" : p.prazo && p.prazo < hoje ? "critico" : "serio"}>{p.status}</Pill>
                    <span className="text-xs text-blue-700">✎ Editar</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-4">
          <div className="flex gap-2">
            {onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}
            {onNovaPendencia && <Botao onClick={onNovaPendencia}>+ Pendência neste item</Botao>}
          </div>
          <div className="flex gap-2">
            <Botao onClick={onFechar}>Cancelar</Botao>
            <Botao tipo="primario" type="submit" disabled={!i.codigo.trim()}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function GerarLote({ escopo, onFechar, onGerar }: { escopo: EscopoId; onFechar: () => void; onGerar: (i: Item[]) => void }) {
  const { db } = useDB();
  const def = escopoDef(escopo);
  const [de, setDe] = useState(db.config.andarMin);
  const [ate, setAte] = useState(db.config.andarMax);
  const [qtd, setQtd] = useState(4);
  const [prefixo, setPrefixo] = useState(def.prefixo);
  const [tipo, setTipo] = useState("");

  const codigo = (andar: number, n: number) => (prefixo === "Q" ? `Q${andar}${String(n).padStart(2, "0")}` : `${prefixo}-${String(andar).padStart(2, "0")}-${String(n).padStart(2, "0")}`);
  const existentes = new Set(db.itens.filter((i) => i.escopo === escopo).map((i) => i.codigo));
  const novos: Item[] = [];
  for (let a = Math.min(de, ate); a <= Math.max(de, ate); a++)
    for (let n = 1; n <= qtd; n++) {
      const c = codigo(a, n);
      if (!existentes.has(c)) novos.push({ id: novoId("I") + a + "_" + n, escopo, codigo: c, andar: a, tipo: tipo || undefined });
    }

  return (
    <Modal titulo={`Gerar ${def.itens.toLowerCase()} em lote`} onFechar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Do andar">
          <Selecao value={de} onChange={(v) => setDe(Number(v))} opcoes={andares(db).map((n) => ({ v: n, t: nomeAndar(n) }))} vazio={false} />
        </Campo>
        <Campo rotulo="Até o andar">
          <Selecao value={ate} onChange={(v) => setAte(Number(v))} opcoes={andares(db).map((n) => ({ v: n, t: nomeAndar(n) }))} vazio={false} />
        </Campo>
        <Campo rotulo="Quantidade por andar">
          <Texto type="number" min={1} max={99} value={qtd} onChange={(v) => setQtd(Math.max(1, Math.min(99, Number(v) || 1)))} />
        </Campo>
        <Campo rotulo="Prefixo do código">
          <Texto value={prefixo} onChange={setPrefixo} />
        </Campo>
        <Campo rotulo="Tipo" className="col-span-2">
          <Selecao value={tipo} onChange={setTipo} opcoes={db.config.listas.tiposItem[escopo]} />
        </Campo>
        <div className="col-span-2 rounded-md bg-stone-50 p-3 text-xs text-stone-600">
          Exemplo de código: <b>{codigo(Math.min(de, ate), 1)}</b>. Serão criados <b>{novos.length}</b> itens novos (códigos já existentes são ignorados).
        </div>
        <div className="col-span-2 flex justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!novos.length || !prefixo.trim()} onClick={() => onGerar(novos)}>
            Gerar {novos.length}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
