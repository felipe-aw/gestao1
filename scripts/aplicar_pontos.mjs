// Aplica os pontos gerados por importar_pontos.py no sistema, via API (servidor rodando).
// Uso: node scripts/aplicar_pontos.mjs <pontos.json> [url-api] [--gravar]
// Reaplicar é seguro: cada ponto tem id fixo pela linha da planilha, e etapas já marcadas
// no sistema são mantidas (a planilha só acrescenta "ok").
import fs from "fs";
import { conectar } from "./api.mjs";

const [, , arq, url = "http://localhost:3511/api/db", flag] = process.argv;
const pontos = JSON.parse(fs.readFileSync(arq, "utf8"));
const normSist = (s) => (!s ? "Sem sistema" : /^hid/i.test(s) ? "Hidráulica" : /^el[eé]t/i.test(s) ? "Elétrica" : /^hvac/i.test(s) ? "HVAC" : s);

const api = await conectar(url);
const db = await (await api(url)).json();
const ops = [];

const cfg = structuredClone(db.config);
if (cfg.andarMin > -1) cfg.andarMin = -1; // a lista tem pontos no subsolo
cfg.listas.tiposItem.auto_ac = ["DI", "DO", "AI", "AO", "CS", "ETH", "KNX"];
if (JSON.stringify(cfg) !== JSON.stringify(db.config)) ops.push({ op: "config", config: cfg });

let novos = 0;
let alterados = 0;
pontos.forEach((p, i) => {
  if (p.andar === null) throw new Error(`Linha ${p.linha}: pavimento "${p.pav}" não reconhecido`);
  const id = `PT${p.linha}`;
  const atual = db.itens.find((x) => x.id === id);
  const etapas = { ...(atual?.etapas ?? {}), ...p.etapas };
  const obs = p.obs && !/^(ok|-)$/i.test(p.obs) ? p.obs : undefined;
  const item = {
    ...(atual ?? {}),
    id,
    escopo: "auto_ac",
    codigo: `P-${String(i + 1).padStart(3, "0")}`,
    andar: p.andar,
    sistema: normSist(p.sistema),
    tipo: p.ponto.tipoPonto,
    local: p.ponto.quadro && p.ponto.quadro !== "-" ? p.ponto.quadro : undefined,
    ponto: p.ponto,
    etapas,
    obs: atual?.obs ?? obs,
  };
  if (!atual) novos++;
  else if (JSON.stringify(atual) !== JSON.stringify(JSON.parse(JSON.stringify(item)))) alterados++;
  else return;
  ops.push({ op: "upsert", col: "itens", item });
});

console.log(`pontos: ${pontos.length} | novos: ${novos} | alterados: ${alterados} | config: ${ops.some((o) => o.op === "config") ? "atualizada" : "sem mudança"}`);
if (flag === "--gravar" && ops.length) {
  const r = await api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
  const d = await r.json();
  console.log("GRAVADO", r.status, "| pontos auto_ac no sistema:", d.itens.filter((x) => x.escopo === "auto_ac").length);
}
