// Aplica a planilha de evolução da automação dos quartos (JSON de importar_evolucao_quartos.py), via API.
// Uso: node scripts/aplicar_evolucao_quartos.mjs <evolucao.json> [url-api] [--gravar] [--data=AAAA-MM-DD]
//
// O que faz:
//  - etapas de cada quarto (Keypads, Termostato, DALI, Cortina, EBO, Master Off, Zigbee, Opera) e tipologia;
//  - observação da planilha vira a observação do quarto;
//  - pendências: observação nova → pendência nova; observação removida → pendência regularizada;
//    texto mudou → descrição atualizada. Pendência já regularizada no sistema não é reaberta.
//    Observações que são só anotação (ok, iniciada atividade, implementado…) não viram pendência;
//  - com --cronograma: avanço das atividades "Programação quartos" = média do % dos quartos do andar
//    (desligado por padrão para não sobrescrever o avanço lançado à mão no cronograma).
import fs from "fs";
import { conectar } from "./api.mjs";
import { fracaoEtapas } from "../lib/logic.ts";

const args = process.argv.slice(2);
const arq = args[0];
const url = args.find((a) => a.startsWith("http")) ?? "http://localhost:3511/api/db";
const gravar = args.includes("--gravar");
const comCronograma = args.includes("--cronograma");
const DATA = args.find((a) => a.startsWith("--data="))?.slice(7) ?? new Date().toISOString().slice(0, 10);

const planilha = JSON.parse(fs.readFileSync(arq, "utf8"));
const api = await conectar(url);
const db = await (await api(url)).json();
const ops = [];
const log = [];

const ANOTACAO = /^ok$|implement|iniciada atividade/i;
const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// Classe do problema, para reconhecer o mesmo problema escrito de outro jeito.
const classe = (s) => {
  const x = norm(s);
  if (/2 leituras travadas/.test(x)) return "trav";
  if (/2 zigbee (off|offline)/.test(x)) return "off";
  if (/banheiro nao le/.test(x)) return "banh";
  if (/quarto nao le/.test(x)) return "qto";
  if (/controlador offline/.test(x)) return "ctrl";
  if (/leitura congelada/.test(x)) return "cong";
  return x;
};
const categoria = (d) =>
  /temon|driver|spot|painel|espelho|dabol|dabom/i.test(d) ? (/painel|espelho|dabol|dabom/i.test(d) ? "Civil / acabamento (terceiros)" : "Dispositivo com defeito")
  : /link/i.test(d) ? "EBO / links de tela" : /controlador/i.test(d) ? "Rede / comunicação" : "Zigbee / sensores (Schneider)";

const quartos = db.itens.filter((i) => i.escopo === "auto_q");
let num = Math.max(0, ...db.pendencias.map((p) => p.num));
const cont = { etapas: 0, regularizadas: 0, novas: 0, atualizadas: 0, divergenciaPct: 0 };

for (const q of planilha) {
  const it = quartos.find((i) => i.codigo === q.codigo);
  if (!it) {
    log.push(`QUARTO NÃO CADASTRADO: ${q.codigo}`);
    continue;
  }
  const obsQuarto = q.obs && !/^ok$/i.test(q.obs) ? q.obs : undefined;
  const novo = { ...it, tipo: q.tipologia ?? it.tipo, etapas: { ...q.etapas }, obs: obsQuarto };
  const pctSistema = Math.round((fracaoEtapas(novo) ?? 0) * 100);
  if (Math.abs(pctSistema - Math.round((q.pct ?? 0) * 100)) > 0) {
    cont.divergenciaPct++;
    log.push(`% diferente em ${q.codigo}: planilha ${Math.round(q.pct * 100)}%, sistema ${pctSistema}%`);
  }
  if (JSON.stringify(novo) !== JSON.stringify(it)) {
    ops.push({ op: "upsert", col: "itens", item: novo });
    cont.etapas++;
  }

  // Pendências do quarto
  const pends = db.pendencias.filter((p) => p.escopo === "auto_q" && p.itemCodigo === q.codigo);
  const abertas = pends.filter((p) => p.status !== "Regularizada");
  const problema = q.obs && !ANOTACAO.test(q.obs) ? q.obs : undefined;
  if (!problema) {
    for (const p of abertas) {
      ops.push({ op: "upsert", col: "pendencias", item: { ...p, status: "Regularizada", dataRegularizacao: DATA, obs: [p.obs, `Observação removida da planilha de evolução (${DATA})`].filter(Boolean).join(" · ") } });
      cont.regularizadas++;
      log.push(`regularizar #${p.num} ${q.codigo}: ${p.descricao}`);
    }
  } else if (abertas.length) {
    const p = abertas[0];
    if (classe(p.descricao) !== classe(problema)) {
      ops.push({ op: "upsert", col: "pendencias", item: { ...p, descricao: problema, categoria: categoria(problema) } });
      cont.atualizadas++;
      log.push(`atualizar #${p.num} ${q.codigo}: "${p.descricao}" → "${problema}"`);
    }
  } else if (pends.some((p) => classe(p.descricao) === classe(problema))) {
    log.push(`mantida regularizada (planilha ainda cita): ${q.codigo} — ${problema}`);
  } else {
    const item = {
      id: `P${Date.now().toString(36)}${q.codigo}`, num: ++num, data: DATA, escopo: "auto_q", andar: q.andar, itemCodigo: q.codigo,
      encontradaEm: "Programação", categoria: categoria(problema), descricao: problema,
      prioridade: /controlador offline/i.test(problema) ? "Alta" : "Média", status: "Aberta",
      ...(/temon/i.test(problema) && db.empresas.find((e) => /temon/i.test(e.nome)) ? { empresaId: db.empresas.find((e) => /temon/i.test(e.nome)).id } : {}),
    };
    ops.push({ op: "upsert", col: "pendencias", item });
    cont.novas++;
    log.push(`nova #${item.num} ${q.codigo}: ${problema}`);
  }
}

// Avanço do cronograma por andar
const macroQ = db.macros.find((m) => m.escopo === "auto_q" && /programa/i.test(m.nome));
if (macroQ && comCronograma) {
  for (const a of db.atividades.filter((x) => x.macroId === macroQ.id)) {
    const qs = planilha.filter((q) => q.andar === a.andar);
    if (!qs.length) continue;
    const pct = Math.round((qs.reduce((s, q) => s + (q.pct ?? 0), 0) / qs.length) * 100);
    if (pct === a.progresso && !a.fimReal) continue;
    const n = { ...a, progresso: pct, ...(pct > 0 && !a.inicioReal ? { inicioReal: DATA } : {}) };
    if (pct < 100) delete n.fimReal;
    else n.fimReal = a.fimReal ?? DATA;
    ops.push({ op: "upsert", col: "atividades", item: n });
    log.push(`cronograma ${a.andar}º andar: ${a.progresso}% → ${pct}%`);
  }
}

console.log(log.join("\n"));
console.log(`\nquartos alterados: ${cont.etapas} | pendências novas: ${cont.novas}, regularizadas: ${cont.regularizadas}, atualizadas: ${cont.atualizadas} | % divergente: ${cont.divergenciaPct} | ops: ${ops.length}`);
if (gravar && ops.length) {
  const r = await api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
  console.log("GRAVADO", r.status);
}
