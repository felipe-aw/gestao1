"use client";

import { useMemo, useState } from "react";
import { CONCLUIDO, NA, andares, escopoDef, estadoEtapa, fracaoEtapas, hojeISO, nomeAndar, novoId, pendAbertasDoItem } from "@/lib/logic";
import type { EscopoId, Item, Pendencia, PontoAutomacao } from "@/lib/types";
import { useDB } from "./store";
import { Barra, Botao, Cabecalho, Campo, Modal, Selecao, Texto, Vazio, baixarCSV, inputCls } from "./ui";
import { FormPendencia, novaPendencia } from "./Pendencias";

type Agrupar = "categoria" | "andar" | "quadro" | "equipamento";
const COR_OK = "#0ca30c";

// Cores dos estados (sempre acompanhadas do texto do estado).
const ESTILO_ESTADO: Record<string, { fundo: string; cor: string }> = {
  [CONCLUIDO]: { fundo: "#e6f4e6", cor: "#0a6a0a" },
  "Em andamento": { fundo: "#e3eefb", cor: "#1c5cab" },
  "Schneider (case)": { fundo: "#fdf1d6", cor: "#8a5a00" },
  Pendente: { fundo: "#f9e0e0", cor: "#b02a2a" },
  [NA]: { fundo: "#efeeea", cor: "#52514e" },
};
const estiloEstado = (e: string) => ESTILO_ESTADO[e] ?? ESTILO_ESTADO[NA];

/** Colunas exibidas: etapas editáveis, com as derivadas (calculadas) logo após a última etapa de que dependem. */
function colunasDe(escopo: EscopoId) {
  const def = escopoDef(escopo);
  const cols: { id: string; nome: string; derivada: boolean }[] = [];
  for (const e of def.etapas ?? []) {
    cols.push({ id: e.id, nome: e.nome, derivada: false });
    for (const d of def.etapasDerivadas ?? []) if (d.de.at(-1) === e.id) cols.push({ id: d.id, nome: d.nome, derivada: true });
  }
  return cols;
}

/**
 * Itens com checklist de etapas (EscopoDef.etapas): pontos de automação da área comum
 * (Cabo / Equipamento / Programação / Tela) e controle de acesso (Instalação / Configuração / Funcionando).
 * Pontos de automação têm dados extras (sistema, quadro, controlador…) que só aparecem quando existem.
 */
export default function ChecklistItens({ escopo, seletorEscopo }: { escopo: EscopoId; seletorEscopo?: React.ReactNode }) {
  const { db, upsert, salvar } = useDB();
  const def = escopoDef(escopo);
  const ETAPAS = colunasDe(escopo);
  const EDITAVEIS = ETAPAS.filter((e) => !e.derivada);
  const ESTADOS = def.estados;
  const [fEstado, setFEstado] = useState("");
  const [massaEtapa, setMassaEtapa] = useState(EDITAVEIS[0].id);
  const [massaEstado, setMassaEstado] = useState(CONCLUIDO);
  const [busca, setBusca] = useState("");
  const [fCat, setFCat] = useState("");
  const [fAndar, setFAndar] = useState("");
  const [fQuadro, setFQuadro] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fEtapa, setFEtapa] = useState("");
  const [fExtra, setFExtra] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Item | null>(null);
  const [novaPend, setNovaPend] = useState<Pendencia | null>(null);

  const pontos = useMemo(() => db.itens.filter((i) => i.escopo === escopo), [db.itens, escopo]);
  // Pontos de automação são classificados por sistema; os demais, pelo tipo (ex.: Catraca, Porta).
  const porSistema = pontos.some((p) => p.sistema);
  const temPonto = pontos.some((p) => p.ponto && Object.keys(p.ponto).length > 1);
  const rotCat = porSistema ? "Sistema" : "Tipo";
  const categoria = (p: Item) => (porSistema ? p.sistema : p.tipo) || (porSistema ? "Sem sistema" : "Sem tipo");
  const [agrupar, setAgrupar] = useState<Agrupar>(porSistema ? "categoria" : "andar");

  // % concluído de uma etapa (N/A fora da base) e avanço geral = média do % de cada item (mesma regra da planilha).
  const contaEtapa = (its: Item[], id: string) => {
    const base = its.filter((i) => estadoEtapa(i, id) !== NA);
    return { ok: base.filter((i) => estadoEtapa(i, id) === CONCLUIDO).length, base: base.length };
  };
  const pctEtapa = (its: Item[], id: string) => {
    const c = contaEtapa(its, id);
    return c.base ? (c.ok / c.base) * 100 : 0;
  };
  const pctGeral = (its: Item[]) => (its.length ? (its.reduce((s, i) => s + (fracaoEtapas(i) ?? 0), 0) / its.length) * 100 : 0);

  const categorias = [...new Set(pontos.map(categoria))].sort();
  const quadros = [...new Set(pontos.map((p) => p.ponto?.quadro).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return pontos.filter((p) => {
      if (fCat && categoria(p) !== fCat) return false;
      if (fAndar !== "" && String(p.andar) !== fAndar) return false;
      if (fQuadro && p.ponto?.quadro !== fQuadro) return false;
      if (fTipo && !(p.tipo ?? "").split("/").includes(fTipo)) return false;
      if (fEtapa === "completo" && (fracaoEtapas(p) ?? 0) < 1) return false;
      if (fEtapa && fEtapa !== "completo" && !fEstado && estadoEtapa(p, fEtapa) === CONCLUIDO) return false;
      if (fEstado && fEtapa && fEtapa !== "completo" && estadoEtapa(p, fEtapa) !== fEstado) return false;
      if (fEstado && (!fEtapa || fEtapa === "completo") && !ETAPAS.some((e) => estadoEtapa(p, e.id) === fEstado)) return false;
      if (fExtra === "problema" && !p.ponto?.problema) return false;
      if (fExtra === "futuro" && !p.ponto?.futuro) return false;
      if (fExtra === "pendencia" && !pendAbertasDoItem(db.pendencias, p)) return false;
      const texto = `${p.codigo} ${p.local ?? ""} ${p.tipo ?? ""} ${p.modelo ?? ""} ${p.ponto?.equipamento ?? ""} ${p.ponto?.descricao ?? ""} ${p.ponto?.quadro ?? ""} ${p.ponto?.controlador ?? ""} ${p.ponto?.sensor ?? ""} ${p.ponto?.problema ?? ""} ${p.obs ?? ""}`;
      if (b && !texto.toLowerCase().includes(b)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontos, busca, fCat, fAndar, fQuadro, fTipo, fEtapa, fEstado, fExtra, db.pendencias]);

  const grupos = useMemo(() => {
    const chave = (p: Item) =>
      agrupar === "categoria" ? categoria(p) : agrupar === "andar" ? nomeAndar(p.andar) : agrupar === "quadro" ? p.ponto?.quadro || "Sem quadro" : p.ponto?.equipamento || "Sem equipamento";
    const m = new Map<string, Item[]>();
    const ord = [...filtrados].sort((a, b) => a.andar - b.andar || (a.ponto?.linha ?? 0) - (b.ponto?.linha ?? 0) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
    for (const p of ord) m.set(chave(p), [...(m.get(chave(p)) ?? []), p]);
    const lista = [...m.entries()];
    if (agrupar !== "andar") lista.sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, agrupar]);

  const alternarEtapa = (p: Item, etapa: string) => upsert("itens", { ...p, etapas: { ...(p.etapas ?? {}), [etapa]: !p.etapas?.[etapa] } });
  const definirEstado = (p: Item, etapa: string, estado: string) => upsert("itens", { ...p, etapas: { ...(p.etapas ?? {}), [etapa]: estado } });

  const marcarEmMassa = async (etapa: string, valor: boolean | string) => {
    const alvo = pontos.filter((p) => sel.has(p.id) && (p.etapas?.[etapa] ?? false) !== valor);
    if (alvo.length) await salvar(alvo.map((p) => ({ op: "upsert" as const, col: "itens" as const, item: { ...p, etapas: { ...(p.etapas ?? {}), [etapa]: valor } } })));
  };

  const alternarSel = (ids: string[], marcar: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (marcar) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const exportar = () =>
    baixarCSV(`${def.itens.toLowerCase().replace(/\s+/g, "_")}_${hojeISO()}.csv`, [
      [
        "Código", "Andar", rotCat, "Local", "Tipo", "Modelo",
        ...(temPonto ? ["Quadro", "Controlador", "Equipamento", "Descrição", "Sensor/Interface", "Cabo", "Destino", "Fornecimento", "Fornecedor", "Compra", "Futuro", "Problema", "Linha planilha"] : []),
        ...ETAPAS.map((e) => e.nome), "% concluído", "Obs.",
      ],
      ...filtrados.map((p) => [
        p.codigo, nomeAndar(p.andar), categoria(p), p.local, p.tipo, p.modelo,
        ...(temPonto
          ? [p.ponto?.quadro, p.ponto?.controlador, p.ponto?.equipamento, p.ponto?.descricao, p.ponto?.sensor, p.ponto?.cabo, p.ponto?.destino, p.ponto?.fornecimento, p.ponto?.fornecedor, p.ponto?.compra, p.ponto?.futuro ? "Sim" : "", p.ponto?.problema, p.ponto?.linha]
          : []),
        ...ETAPAS.map((e) => (ESTADOS ? estadoEtapa(p, e.id) : p.etapas?.[e.id] ? "ok" : "")), `${Math.round((fracaoEtapas(p) ?? 0) * 100)}%`, p.obs,
      ]),
    ]);

  const filtrosAtivos = !!(busca || fCat || fAndar || fQuadro || fTipo || fEtapa || fEstado || fExtra);
  const nomesEtapas = (def.etapasAvanco ?? EDITAVEIS.map((e) => e.id)).map((id) => ETAPAS.find((e) => e.id === id)?.nome).join(", ");
  const resumoLinhas: (readonly [string, Item[]])[] = [...categorias.map((c) => [c, pontos.filter((p) => categoria(p) === c)] as const), ["Total", pontos] as const];
  const colsAntesEtapas = 3 + (temPonto ? 3 : 1);

  return (
    <div>
      <Cabecalho
        titulo={`${def.itens} – ${def.nome}`}
        sub={`${pontos.length} ${def.itens.toLowerCase()} · avanço geral ${Math.round(pctGeral(pontos))}% (média das etapas ${nomesEtapas})`}
        acoes={
          <>
            <Botao onClick={exportar}>Exportar CSV</Botao>
            <Botao
              tipo="primario"
              onClick={() =>
                setEditando({ id: "", escopo, codigo: "", andar: fAndar === "" ? 0 : Number(fAndar), sistema: porSistema ? fCat || undefined : undefined, tipo: !porSistema ? fCat || undefined : undefined, etapas: {}, ...(temPonto ? { ponto: {} } : {}) })
              }
            >
              + {def.item}
            </Botao>
          </>
        }
      />
      {seletorEscopo}

      {pontos.length === 0 ? (
        <Vazio>Nenhum {def.item.toLowerCase()} cadastrado em {def.nome}.</Vazio>
      ) : (
        <>
          {/* Resumo por sistema/tipo e por etapa */}
          <div className="mb-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{rotCat}</th>
                  <th className="px-2 py-2 text-right font-medium">Qtd.</th>
                  {ETAPAS.map((e) => (
                    <th key={e.id} className={`px-2 py-2 font-medium ${e.derivada ? "bg-stone-100 text-stone-700" : ""}`} title={e.derivada ? "Calculada a partir das etapas anteriores" : undefined}>
                      {e.nome}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">% concluído</th>
                  {temPonto && <th className="px-2 py-2 text-right font-medium">Problemas</th>}
                  {temPonto && <th className="px-2 py-2 text-right font-medium">Futuros</th>}
                </tr>
              </thead>
              <tbody>
                {resumoLinhas.map(([c, its]) => (
                  <tr
                    key={c}
                    className={`border-t border-stone-100 ${c === "Total" ? "bg-stone-50 font-semibold" : "cursor-pointer hover:bg-blue-50/50"} ${fCat === c ? "bg-blue-50" : ""}`}
                    onClick={() => c !== "Total" && setFCat(fCat === c ? "" : c)}
                    title={c !== "Total" ? "Clique para filtrar" : undefined}
                  >
                    <td className="px-3 py-2">{c}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{its.length}</td>
                    {ETAPAS.map((e) => {
                      const c = contaEtapa(its, e.id);
                      return (
                        <td key={e.id} className={`px-2 py-2 ${e.derivada ? "bg-stone-50" : ""}`} title={`${e.nome}: ${c.ok} de ${c.base} concluídos${c.base < its.length ? ` (${its.length - c.base} N/A)` : ""}`}>
                          <Barra valor={pctEtapa(its, e.id)} largura={ETAPAS.length > 5 ? "w-8" : "w-16"} cor={COR_OK} />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <Barra valor={pctGeral(its)} largura={ETAPAS.length > 5 ? "w-10" : "w-16"} />
                    </td>
                    {temPonto && <td className="px-2 py-2 text-right tabular-nums">{its.filter((p) => p.ponto?.problema).length || <span className="text-stone-300">0</span>}</td>}
                    {temPonto && <td className="px-2 py-2 text-right tabular-nums">{its.filter((p) => p.ponto?.futuro).length || <span className="text-stone-300">0</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className={`${inputCls} w-60`} placeholder={temPonto ? "Buscar equipamento, descrição, quadro…" : "Buscar código, local…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Selecao value={fCat} onChange={setFCat} opcoes={categorias} vazio={porSistema ? "Todos os sistemas" : "Todos os tipos"} />
            <Selecao value={fAndar} onChange={setFAndar} opcoes={andares(db).filter((a) => pontos.some((p) => p.andar === a)).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio="Todos os andares" />
            {quadros.length > 0 && <Selecao value={fQuadro} onChange={setFQuadro} opcoes={quadros} vazio="Todos os quadros" />}
            {temPonto && <Selecao value={fTipo} onChange={setFTipo} opcoes={["DI", "DO", "AI", "AO", "CS", "ETH", "KNX"]} vazio="Todo tipo de ponto" />}
            <Selecao
              value={fEtapa}
              onChange={setFEtapa}
              opcoes={[...ETAPAS.map((e) => ({ v: e.id, t: ESTADOS && fEstado ? e.nome : `${e.nome} não concluída` })), { v: "completo", t: "100% concluído" }]}
              vazio="Toda etapa"
            />
            {ESTADOS && <Selecao value={fEstado} onChange={setFEstado} opcoes={ESTADOS} vazio="Qualquer estado" />}
            <Selecao
              value={fExtra}
              onChange={setFExtra}
              opcoes={[
                ...(temPonto
                  ? [
                      { v: "problema", t: "Com problema" },
                      { v: "futuro", t: "Ponto futuro" },
                    ]
                  : []),
                { v: "pendencia", t: "Com pendência aberta" },
              ]}
              vazio="Todos"
            />
            {filtrosAtivos && (
              <Botao
                tipo="fantasma"
                onClick={() => {
                  setBusca("");
                  setFCat("");
                  setFAndar("");
                  setFQuadro("");
                  setFTipo("");
                  setFEtapa("");
                  setFEstado("");
                  setFExtra("");
                }}
              >
                Limpar filtros
              </Botao>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs text-stone-600">
              Agrupar por
              <Selecao
                value={agrupar}
                onChange={(v) => setAgrupar(v as Agrupar)}
                vazio={false}
                opcoes={[
                  { v: "categoria", t: rotCat },
                  { v: "andar", t: "Andar" },
                  ...(temPonto
                    ? [
                        { v: "quadro", t: "Quadro" },
                        { v: "equipamento", t: "Equipamento" },
                      ]
                    : []),
                ]}
              />
            </span>
          </div>

          {sel.size > 0 && (
            <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm shadow-sm">
              <span className="font-semibold text-blue-900">{sel.size} selecionados</span>
              {ESTADOS ? (
                <>
                  <span className="text-blue-900">· definir</span>
                  <Selecao value={massaEtapa} onChange={setMassaEtapa} opcoes={EDITAVEIS.map((e) => ({ v: e.id, t: e.nome }))} vazio={false} />
                  <span className="text-blue-900">como</span>
                  <Selecao value={massaEstado} onChange={setMassaEstado} opcoes={ESTADOS} vazio={false} />
                  <Botao tipo="primario" onClick={() => marcarEmMassa(massaEtapa, massaEstado)}>
                    Aplicar em {sel.size}
                  </Botao>
                </>
              ) : (
                <>
                  <span className="text-blue-900">· marcar como ok:</span>
                  {EDITAVEIS.map((e) => (
                    <Botao key={e.id} onClick={() => marcarEmMassa(e.id, true)}>
                      ✓ {e.nome}
                    </Botao>
                  ))}
                  <span className="text-blue-900">· desmarcar:</span>
                  {EDITAVEIS.map((e) => (
                    <Botao key={e.id} tipo="fantasma" onClick={() => marcarEmMassa(e.id, false)}>
                      {e.nome}
                    </Botao>
                  ))}
                </>
              )}
              <span className="ml-auto">
                <Botao tipo="fantasma" onClick={() => setSel(new Set())}>
                  Limpar seleção
                </Botao>
              </span>
            </div>
          )}

          <p className="mb-2 text-xs text-stone-500">
            {filtrados.length} {def.itens.toLowerCase()}
            {filtrosAtivos ? " com os filtros atuais" : ""} · {ESTADOS ? "mude o status de cada etapa direto na tabela" : "clique em ✓/○ para marcar ou desmarcar uma etapa"}; clique no código para editar.
          </p>

          {filtrados.length === 0 ? (
            <Vazio>Nada encontrado com esses filtros.</Vazio>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className={`w-full text-sm ${temPonto ? "min-w-[72rem]" : "min-w-[48rem]"}`}>
                <thead className="sticky top-0 bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input type="checkbox" aria-label="Selecionar todos os filtrados" checked={filtrados.every((p) => sel.has(p.id))} onChange={(e) => alternarSel(filtrados.map((p) => p.id), e.target.checked)} />
                    </th>
                    <th className="px-2 py-2 font-medium">Código</th>
                    <th className="px-2 py-2 font-medium">Andar</th>
                    {temPonto ? (
                      <>
                        <th className="px-2 py-2 font-medium">Quadro / controlador</th>
                        <th className="px-2 py-2 font-medium">Equipamento / descrição</th>
                        <th className="px-2 py-2 font-medium">Tipo</th>
                        <th className="px-2 py-2 font-medium">Fornec.</th>
                      </>
                    ) : (
                      <th className="px-2 py-2 font-medium">Tipo / local</th>
                    )}
                    {ETAPAS.map((e) => (
                      <th key={e.id} className={`px-1 py-2 text-center font-medium ${e.derivada ? "bg-stone-100 text-stone-700" : ""}`} title={e.derivada ? "Calculada a partir das etapas anteriores" : undefined}>
                        {e.nome}
                      </th>
                    ))}
                    {ESTADOS && <th className="px-2 py-2 text-right font-medium">%</th>}
                    <th className="px-2 py-2 font-medium">{temPonto ? "Problema / obs." : "Obs."}</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([nome, its]) => {
                    const fechado = fechados.has(nome);
                    return [
                      <tr key={`g-${nome}`} className="border-t border-stone-200 bg-stone-100">
                        <td className="px-3 py-1.5">
                          <input type="checkbox" aria-label={`Selecionar ${nome}`} checked={its.every((p) => sel.has(p.id))} onChange={(e) => alternarSel(its.map((p) => p.id), e.target.checked)} />
                        </td>
                        <td colSpan={colsAntesEtapas - 1} className="py-1.5 pr-2">
                          <button
                            className="flex items-center gap-2 text-left text-xs font-semibold text-stone-800"
                            onClick={() =>
                              setFechados((s) => {
                                const n = new Set(s);
                                if (n.has(nome)) n.delete(nome);
                                else n.add(nome);
                                return n;
                              })
                            }
                          >
                            <span className="w-3 text-stone-400">{fechado ? "▸" : "▾"}</span>
                            {nome}
                            <span className="font-normal text-stone-500">· {its.length}</span>
                            <Barra valor={pctGeral(its)} largura="w-16" />
                          </button>
                        </td>
                        {ETAPAS.map((e) => {
                          const c = contaEtapa(its, e.id);
                          return (
                            <td key={e.id} className="px-1 py-1.5 text-center text-[11px] tabular-nums text-stone-600" title={`${e.nome}: ${c.ok} de ${c.base} concluídos`}>
                              {c.ok}/{c.base}
                            </td>
                          );
                        })}
                        {ESTADOS && <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-stone-600">{Math.round(pctGeral(its))}%</td>}
                        <td />
                      </tr>,
                      ...(fechado
                        ? []
                        : its.map((p) => {
                            const pa = pendAbertasDoItem(db.pendencias, p);
                            return (
                              <tr key={p.id} className={`border-t border-stone-100 align-top hover:bg-blue-50/40 ${sel.has(p.id) ? "bg-blue-50/70" : ""}`}>
                                <td className="px-3 py-1.5">
                                  <input type="checkbox" aria-label={`Selecionar ${p.codigo}`} checked={sel.has(p.id)} onChange={(e) => alternarSel([p.id], e.target.checked)} />
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5">
                                  <button className="font-medium text-stone-900 hover:text-blue-700 hover:underline" onClick={() => setEditando(p)}>
                                    {p.codigo}
                                  </button>
                                  {p.ponto?.futuro && <div className="text-[10px] text-stone-500">futuro</div>}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-stone-600">{nomeAndar(p.andar)}</td>
                                {temPonto ? (
                                  <>
                                    <td className="px-2 py-1.5 text-xs text-stone-600">
                                      <div>{p.ponto?.quadro ?? "—"}</div>
                                      {p.ponto?.controlador && <div className="text-stone-400">{p.ponto.controlador}</div>}
                                    </td>
                                    <td className="max-w-sm px-2 py-1.5">
                                      <div className="text-stone-900">
                                        {p.ponto?.equipamento ?? "—"}
                                        {agrupar !== "categoria" && <span className="text-xs text-stone-400"> · {categoria(p)}</span>}
                                      </div>
                                      <div className="text-xs text-stone-500">{p.ponto?.descricao}</div>
                                      {p.ponto?.sensor && <div className="text-[11px] text-stone-400">{p.ponto.sensor}</div>}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs text-stone-600">{p.tipo}</td>
                                    <td className="px-2 py-1.5 text-xs text-stone-600">
                                      <div>{p.ponto?.fornecimento}</div>
                                      {(p.ponto?.fornecedor || p.ponto?.compra) && <div className="text-stone-400">{[p.ponto?.fornecedor, p.ponto?.compra].filter(Boolean).join(" · ")}</div>}
                                    </td>
                                  </>
                                ) : (
                                  <td className="px-2 py-1.5">
                                    <div className="text-stone-900">{p.tipo ?? "—"}</div>
                                    {(p.local || p.modelo) && <div className="text-xs text-stone-500">{[p.local, p.modelo].filter(Boolean).join(" · ")}</div>}
                                  </td>
                                )}
                                {ETAPAS.map((e) => {
                                  if (ESTADOS) {
                                    const est = estadoEtapa(p, e.id);
                                    const st = estiloEstado(est);
                                    return (
                                      <td key={e.id} className={`px-0.5 py-1.5 text-center ${e.derivada ? "bg-stone-50" : ""}`}>
                                        {e.derivada ? (
                                          <span className="inline-block rounded px-1.5 py-1 text-[11px] font-semibold" style={{ background: st.fundo, color: st.cor }} title={`${e.nome} (calculado): ${est}`}>
                                            {est}
                                          </span>
                                        ) : (
                                          <select
                                            value={est}
                                            onChange={(ev) => definirEstado(p, e.id, ev.target.value)}
                                            className="w-[6.5rem] cursor-pointer rounded border-0 px-1 py-1 text-[11px] font-medium"
                                            style={{ background: st.fundo, color: st.cor }}
                                            title={`${e.nome}: ${est}`}
                                            aria-label={`${e.nome} de ${p.codigo}`}
                                          >
                                            {ESTADOS.map((x) => (
                                              <option key={x}>{x}</option>
                                            ))}
                                          </select>
                                        )}
                                      </td>
                                    );
                                  }
                                  const okE = !!p.etapas?.[e.id];
                                  return (
                                    <td key={e.id} className="px-1 py-1.5 text-center">
                                      <button
                                        onClick={() => alternarEtapa(p, e.id)}
                                        className={`inline-flex h-6 w-7 items-center justify-center rounded text-sm font-bold ${okE ? "text-white" : "border border-stone-300 text-stone-300 hover:border-stone-500 hover:text-stone-500"}`}
                                        style={okE ? { background: COR_OK } : undefined}
                                        title={`${e.nome}: ${okE ? "ok — clique para desmarcar" : "pendente — clique para marcar ok"}`}
                                        aria-label={`${e.nome} ${okE ? "ok" : "pendente"}`}
                                      >
                                        {okE ? "✓" : "○"}
                                      </button>
                                    </td>
                                  );
                                })}
                                {ESTADOS && <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">{Math.round((fracaoEtapas(p) ?? 0) * 100)}%</td>}
                                <td className="max-w-xs px-2 py-1.5 text-xs">
                                  {p.ponto?.problema && <div className="font-medium text-red-700">▲ {p.ponto.problema}</div>}
                                  {pa > 0 && <div className="text-red-700">{pa} pendência(s) aberta(s)</div>}
                                  {p.obs && <div className="text-stone-500">{p.obs}</div>}
                                </td>
                              </tr>
                            );
                          })),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editando && (
        <FormChecklist
          inicial={editando}
          comPonto={temPonto}
          onFechar={() => setEditando(null)}
          onSalvar={async (p) => {
            if (pontos.some((x) => x.codigo === p.codigo && x.id !== p.id)) {
              alert(`Já existe ${def.item.toLowerCase()} com o código ${p.codigo}.`);
              return;
            }
            await upsert("itens", p.id ? p : { ...p, id: novoId("I") });
            setEditando(null);
          }}
          onExcluir={
            editando.id
              ? async () => {
                  if (!confirm(`Excluir ${editando.codigo}?`)) return;
                  await salvar([{ op: "delete", col: "itens", id: editando.id }]);
                  setEditando(null);
                }
              : undefined
          }
          onNovaPendencia={
            editando.id
              ? () => {
                  const p = editando;
                  setNovaPend(
                    novaPendencia(escopo, {
                      andar: p.andar,
                      itemCodigo: p.codigo,
                      local: [p.local ?? p.ponto?.quadro, p.ponto?.equipamento].filter(Boolean).join(" · ") || undefined,
                      descricao: p.ponto?.problema ?? "",
                      encontradaEm: temPonto ? "Programação" : "Instalação",
                    }),
                  );
                  setEditando(null);
                }
              : undefined
          }
        />
      )}
      {novaPend && <FormPendencia inicial={novaPend} onFechar={() => setNovaPend(null)} onSalvo={() => setNovaPend(null)} />}
    </div>
  );
}

function FormChecklist({
  inicial,
  comPonto,
  onFechar,
  onSalvar,
  onExcluir,
  onNovaPendencia,
}: {
  inicial: Item;
  comPonto: boolean;
  onFechar: () => void;
  onSalvar: (p: Item) => void;
  onExcluir?: () => void;
  onNovaPendencia?: () => void;
}) {
  const { db } = useDB();
  const def = escopoDef(inicial.escopo);
  const [p, setP] = useState<Item>(inicial);
  const setPt = <K extends keyof PontoAutomacao>(k: K, v: PontoAutomacao[K]) => setP((x) => ({ ...x, ponto: { ...(x.ponto ?? {}), [k]: v } }));
  const t = (k: keyof PontoAutomacao) => (v: string) => setPt(k, (v || undefined) as never);
  const sistemas = [...new Set(db.itens.filter((i) => i.escopo === inicial.escopo).map((i) => i.sistema).filter(Boolean) as string[])].sort();

  return (
    <Modal titulo={inicial.id ? `${def.item} ${inicial.codigo}` : `Novo ${def.item.toLowerCase()}`} onFechar={onFechar} largura={comPonto ? "max-w-4xl" : "max-w-2xl"}>
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (p.codigo.trim()) onSalvar({ ...p, codigo: p.codigo.trim() });
        }}
      >
        <Campo rotulo="Código">
          <Texto value={p.codigo} onChange={(v) => setP({ ...p, codigo: v })} autoFocus={!inicial.id} placeholder={`${def.prefixo}-01-01`} />
        </Campo>
        <Campo rotulo="Andar">
          <Selecao value={p.andar} onChange={(v) => setP({ ...p, andar: Number(v) })} opcoes={andares(db).map((a) => ({ v: a, t: nomeAndar(a) }))} vazio={false} />
        </Campo>
        {comPonto ? (
          <>
            <Campo rotulo="Sistema">
              <input className={inputCls} list="sistemas-ponto" value={p.sistema ?? ""} onChange={(e) => setP({ ...p, sistema: e.target.value || undefined })} />
              <datalist id="sistemas-ponto">
                {sistemas.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Tipo de ponto">
              <Selecao value={p.tipo} onChange={(v) => setP({ ...p, tipo: v || undefined, ponto: { ...(p.ponto ?? {}), tipoPonto: v || undefined } })} opcoes={db.config.listas.tiposItem[p.escopo]} />
            </Campo>
            <Campo rotulo="Quadro">
              <Texto value={p.ponto?.quadro} onChange={(v) => setP({ ...p, local: v || undefined, ponto: { ...(p.ponto ?? {}), quadro: v || undefined } })} />
            </Campo>
            <Campo rotulo="Controlador">
              <Texto value={p.ponto?.controlador} onChange={t("controlador")} />
            </Campo>
            <Campo rotulo="Equipamento" className="col-span-2">
              <Texto value={p.ponto?.equipamento} onChange={t("equipamento")} />
            </Campo>
            <Campo rotulo="Descrição" className="col-span-2 md:col-span-4">
              <Texto value={p.ponto?.descricao} onChange={t("descricao")} />
            </Campo>
            <Campo rotulo="Sensor / interface" className="col-span-2">
              <Texto value={p.ponto?.sensor} onChange={t("sensor")} />
            </Campo>
            <Campo rotulo="Cabo">
              <Texto value={p.ponto?.cabo} onChange={t("cabo")} />
            </Campo>
            <Campo rotulo="Destino">
              <Texto value={p.ponto?.destino} onChange={t("destino")} />
            </Campo>
            <Campo rotulo="Fornecimento">
              <Texto value={p.ponto?.fornecimento} onChange={t("fornecimento")} />
            </Campo>
            <Campo rotulo="Fornecedor">
              <Texto value={p.ponto?.fornecedor} onChange={t("fornecedor")} />
            </Campo>
            <Campo rotulo="Compra">
              <Selecao value={p.ponto?.compra} onChange={t("compra")} opcoes={["Requisitar", "Comprado"]} />
            </Campo>
            <Campo rotulo="Ponto futuro">
              <Selecao value={p.ponto?.futuro ? "Sim" : ""} onChange={(v) => setPt("futuro", v === "Sim" ? true : undefined)} opcoes={["Sim"]} vazio="Não" />
            </Campo>
          </>
        ) : (
          <>
            <Campo rotulo="Tipo">
              <Selecao value={p.tipo} onChange={(v) => setP({ ...p, tipo: v || undefined })} opcoes={db.config.listas.tiposItem[p.escopo]} />
            </Campo>
            <Campo rotulo="Modelo">
              <Texto value={p.modelo} onChange={(v) => setP({ ...p, modelo: v || undefined })} />
            </Campo>
            <Campo rotulo="Local" className="col-span-2 md:col-span-4">
              <Texto value={p.local} onChange={(v) => setP({ ...p, local: v || undefined })} placeholder="Ex.: Porta da administração" />
            </Campo>
          </>
        )}
        <div className="col-span-2 md:col-span-4">
          <div className="mb-1 text-xs font-medium text-stone-600">
            Etapas{def.estados ? ` · ${Math.round((fracaoEtapas(p) ?? 0) * 100)}% concluído` : ""}
          </div>
          {def.estados ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {colunasDe(p.escopo).map((e) =>
                e.derivada ? (
                  <Campo key={e.id} rotulo={`${e.nome} (calculado)`}>
                    <span className="rounded-md px-2.5 py-1.5 text-sm font-medium" style={{ background: estiloEstado(estadoEtapa(p, e.id)).fundo, color: estiloEstado(estadoEtapa(p, e.id)).cor }}>
                      {estadoEtapa(p, e.id)}
                    </span>
                  </Campo>
                ) : (
                  <Campo key={e.id} rotulo={e.nome}>
                    <Selecao value={estadoEtapa(p, e.id)} onChange={(v) => setP({ ...p, etapas: { ...(p.etapas ?? {}), [e.id]: v } })} opcoes={def.estados!} vazio={false} />
                  </Campo>
                ),
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {def.etapas!.map((e) => (
                <label key={e.id} className="inline-flex items-center gap-2 rounded-md border border-stone-200 px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={!!p.etapas?.[e.id]} onChange={(ev) => setP({ ...p, etapas: { ...(p.etapas ?? {}), [e.id]: ev.target.checked } })} />
                  {e.nome}
                </label>
              ))}
            </div>
          )}
        </div>
        {comPonto && (
          <Campo rotulo="Problema" className="col-span-2">
            <Texto value={p.ponto?.problema} onChange={t("problema")} placeholder="Ex.: Problema Temon, Correção, Verificar…" />
          </Campo>
        )}
        <Campo rotulo="Observações" className={comPonto ? "col-span-2" : "col-span-2 md:col-span-4"}>
          <Texto value={p.obs} onChange={(v) => setP({ ...p, obs: v || undefined })} />
        </Campo>
        {p.ponto?.linha && <p className="col-span-2 text-xs text-stone-400 md:col-span-4">Linha {p.ponto.linha} da planilha de pontos (aba Consolidada).</p>}
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-4">
          <div className="flex gap-2">
            {onExcluir && <Botao tipo="perigo" onClick={onExcluir}>Excluir</Botao>}
            {onNovaPendencia && <Botao onClick={onNovaPendencia}>+ Pendência</Botao>}
          </div>
          <div className="flex gap-2">
            <Botao onClick={onFechar}>Cancelar</Botao>
            <Botao tipo="primario" type="submit" disabled={!p.codigo.trim()}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}
