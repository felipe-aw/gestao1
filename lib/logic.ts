import type { Atividade, DB, EscopoId, Item, Macro, Pendencia } from "./types";

export interface EscopoDef {
  id: EscopoId;
  nome: string;
  curto: string;
  /** Cor categórica fixa do escopo (identidade, nunca status). */
  cor: string;
  /** Nome do item rastreado individualmente. */
  item: string;
  itens: string;
  /** Itens passam por instalação antes da configuração/programação. */
  usaInstalacao: boolean;
  /** Rótulo da etapa de configuração. */
  etapaConfig: string;
  prefixo: string;
  /** Checklist de etapas por item (quando o escopo usa). `grupo` agrupa colunas no cabeçalho. */
  etapas?: { id: string; nome: string; grupo?: string }[];
  /** Estados possíveis de cada etapa (sem isso, a etapa é só ok / pendente). */
  estados?: string[];
  /** Etapas calculadas a partir de outras (ex.: Automação local = Keypads + Termostato + DALI + Cortina). */
  etapasDerivadas?: { id: string; nome: string; de: string[] }[];
  /** Etapas que entram no % de avanço (padrão: todas as etapas). */
  etapasAvanco?: string[];
}

export const ESCOPOS: EscopoDef[] = [
  { id: "auto_ac", nome: "Automação – Área comum", curto: "Autom. AC", cor: "#2a78d6", item: "Ponto", itens: "Pontos de automação", usaInstalacao: true, etapaConfig: "Programação", prefixo: "P",
    etapas: [
      { id: "cabo", nome: "Cabo" },
      { id: "equipamento", nome: "Equipamento" },
      { id: "programacao", nome: "Programação" },
      { id: "tela", nome: "Tela" },
    ],
  },
  {
    id: "auto_q", nome: "Automação – Quartos", curto: "Autom. Quartos", cor: "#eb6834", item: "Quarto", itens: "Quartos", usaInstalacao: false, etapaConfig: "Programação", prefixo: "Q",
    // Mesma estrutura e fórmulas da planilha "Evolução de entrega – Automação dos quartos (GRMS)".
    etapas: [
      { id: "keypads", nome: "Keypads", grupo: "Automação local" },
      { id: "termostato", nome: "Termostato", grupo: "Automação local" },
      { id: "dali", nome: "DALI", grupo: "Automação local" },
      { id: "cortina", nome: "Cortina", grupo: "Automação local" },
      { id: "ebo", nome: "EBO (links de tela)" },
      { id: "masteroff", nome: "Master Off" },
      { id: "zigbee", nome: "Zigbee (Schneider)" },
      { id: "opera", nome: "Lógica Opera (Accor)" },
    ],
    estados: ["Pendente", "Em andamento", "Schneider (case)", "Concluído", "N/A"],
    etapasDerivadas: [{ id: "local", nome: "Local (geral)", de: ["keypads", "termostato", "dali", "cortina"] }],
    etapasAvanco: ["local", "ebo", "masteroff", "zigbee", "opera"],
  },
  { id: "cftv", nome: "CFTV", curto: "CFTV", cor: "#1baf7a", item: "Câmera", itens: "Câmeras", usaInstalacao: true, etapaConfig: "Configuração", prefixo: "CAM" },
  {
    id: "ca", nome: "Controle de acesso", curto: "Ctrl. acesso", cor: "#eda100", item: "Ponto de acesso", itens: "Pontos de acesso", usaInstalacao: true, etapaConfig: "Configuração", prefixo: "CA",
    etapas: [
      { id: "instalacao", nome: "Instalação" },
      { id: "configuracao", nome: "Configuração" },
      { id: "funcionando", nome: "Funcionando" },
    ],
  },
  { id: "sdai", nome: "Detecção e alarme", curto: "Detecção/alarme", cor: "#e87ba4", item: "Dispositivo", itens: "Dispositivos", usaInstalacao: true, etapaConfig: "Programação", prefixo: "DA" },
];

export const escopoDef = (id: EscopoId) => ESCOPOS.find((e) => e.id === id)!;

export function nomeAndar(a: number | null | undefined): string {
  if (a === null || a === undefined) return "—";
  if (a === 0) return "Térreo";
  if (a < 0) return `Subsolo ${-a}`;
  return `${a}º andar`;
}

export function andares(db: DB): number[] {
  const r: number[] = [];
  for (let a = db.config.andarMin; a <= db.config.andarMax; a++) r.push(a);
  return r;
}

// ---------- datas ----------

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtData(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function addDias(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Segunda-feira da semana da data. */
export function segunda(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  return addDias(iso, -dow);
}

// ---------- atividades ----------

export type StatusAtividade = "Não iniciada" | "Em andamento" | "Atrasada" | "Concluída";

export function statusAtividade(a: Atividade, hoje = hojeISO()): StatusAtividade {
  if (a.fimReal || a.progresso >= 100) return "Concluída";
  if (a.fimPrev && a.fimPrev < hoje) return "Atrasada";
  if (a.inicioPrev && a.inicioPrev < hoje && !a.inicioReal && a.progresso === 0) return "Atrasada";
  if (a.inicioReal || a.progresso > 0) return "Em andamento";
  return "Não iniciada";
}

export function progressoEfetivo(a: Atividade): number {
  return a.fimReal ? 100 : Math.max(0, Math.min(100, a.progresso || 0));
}

/** Progresso médio ponderado pela duração prevista (mínimo 1 dia). */
export function progressoMedio(ativs: Atividade[]): number {
  if (!ativs.length) return 0;
  let soma = 0;
  let peso = 0;
  for (const a of ativs) {
    const p = a.inicioPrev && a.fimPrev ? Math.max(1, diasEntre(a.inicioPrev, a.fimPrev) + 1) : 1;
    soma += progressoEfetivo(a) * p;
    peso += p;
  }
  return soma / peso;
}

/** Ordem de exibição: manual (ordem) primeiro; sem ordem, por andar e início previsto. */
export function compararAtividades(a: Atividade, b: Atividade): number {
  const oa = a.ordem ?? Number.MAX_SAFE_INTEGER;
  const ob = b.ordem ?? Number.MAX_SAFE_INTEGER;
  return oa - ob || (a.andar ?? -99) - (b.andar ?? -99) || (a.inicioPrev ?? "").localeCompare(b.inicioPrev ?? "") || a.nome.localeCompare(b.nome);
}

export function escopoDaAtividade(db: DB, a: Atividade): EscopoId | undefined {
  return db.macros.find((m) => m.id === a.macroId)?.escopo;
}

export function macrosDoEscopo(db: DB, escopo: EscopoId): Macro[] {
  return db.macros.filter((m) => m.escopo === escopo).sort((a, b) => a.ordem - b.ordem);
}

// ---------- pendências ----------

export const pendenciaAberta = (p: Pendencia, statusFinal = "Regularizada") => p.status !== statusFinal;

export function pendenciaVencida(p: Pendencia, hoje = hojeISO()): boolean {
  return pendenciaAberta(p) && !!p.prazo && p.prazo < hoje;
}

export function diasEmAberto(p: Pendencia, hoje = hojeISO()): number {
  return diasEntre(p.data, p.dataRegularizacao || hoje);
}

// ---------- itens (fluxo de status automático) ----------

export type StatusItem =
  | "Não instalado"
  | "Instalado – configurar"
  | "Pendência – regularizar"
  | "Aguardando retorno"
  | "Aguardando OK AW"
  | "Aprovado AW";

export const FLUXO_ITEM: StatusItem[] = [
  "Não instalado",
  "Instalado – configurar",
  "Pendência – regularizar",
  "Aguardando retorno",
  "Aguardando OK AW",
  "Aprovado AW",
];

/** Rótulo exibido do status (quartos não têm instalação: "Não programado"). */
export function rotuloStatusItem(s: StatusItem, escopo: EscopoId): string {
  const def = escopoDef(escopo);
  if (!def.usaInstalacao && (s === "Não instalado" || s === "Instalado – configurar")) return `Não ${def.etapaConfig === "Programação" ? "programado" : "configurado"}`;
  if (s === "Instalado – configurar") return `Instalado – ${def.etapaConfig === "Programação" ? "programar" : "configurar"}`;
  return s;
}

export function pendAbertasDoItem(pends: Pendencia[], it: Item): number {
  return pends.filter((p) => p.escopo === it.escopo && p.itemCodigo === it.codigo && pendenciaAberta(p)).length;
}

export const CONCLUIDO = "Concluído";
export const NA = "N/A";

/** Estado de uma etapa do item como texto (etapas ok/pendente viram "Concluído"/"Pendente"). Calcula etapas derivadas. */
export function estadoEtapa(it: Item, id: string): string {
  const der = escopoDef(it.escopo).etapasDerivadas?.find((d) => d.id === id);
  if (der) {
    // Mesma regra da coluna "Automação local – geral" da planilha.
    const v = der.de.map((e) => estadoEtapa(it, e));
    const n = (x: string) => v.filter((y) => y === x).length;
    if (n(NA) === v.length) return NA;
    if (n(CONCLUIDO) + n(NA) === v.length) return CONCLUIDO;
    if (n("Schneider (case)") > 0) return "Schneider (case)";
    if (n("Pendente") + n(NA) === v.length) return "Pendente";
    return "Em andamento";
  }
  const v = it.etapas?.[id];
  if (v === true) return CONCLUIDO;
  if (!v) return "Pendente";
  return v;
}

/** Fração (0–1) das etapas concluídas do item (N/A fora da base); null se o escopo não usa etapas. */
export function fracaoEtapas(it: Item): number | null {
  const def = escopoDef(it.escopo);
  if (!def.etapas?.length) return null;
  const ids = def.etapasAvanco ?? def.etapas.map((e) => e.id);
  const est = ids.map((id) => estadoEtapa(it, id)).filter((e) => e !== NA);
  return est.length ? est.filter((e) => e === CONCLUIDO).length / est.length : 0;
}

/** Normaliza nomes de sistema vindos de planilhas (ex.: "Hidraulica"/"HID" → "Hidráulica"). */
export function normalizarSistema(s?: string): string {
  const t = (s ?? "").trim();
  if (!t) return "Sem sistema";
  if (/^hid/i.test(t)) return "Hidráulica";
  if (/^el[eé]t/i.test(t) || /^ele$/i.test(t)) return "Elétrica";
  if (/^hvac/i.test(t)) return "HVAC";
  return t;
}

export function statusItem(it: Item, pendAbertas: number): StatusItem {
  if (it.dataOkAW) return "Aprovado AW";
  const def = escopoDef(it.escopo);
  if (def.usaInstalacao && !it.dataInstalacao) return "Não instalado";
  // Sem etapa de instalação (quartos), a falta de programação já é o estado inicial.
  if (!it.dataConfig) return def.usaInstalacao ? "Instalado – configurar" : "Não instalado";
  if (pendAbertas > 0) return "Pendência – regularizar";
  if (it.achouPendencia && !it.dataRetorno) return "Aguardando retorno";
  return "Aguardando OK AW";
}

export function novoId(prefixo = ""): string {
  return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
