export type EscopoId = "auto_ac" | "auto_q" | "cftv" | "ca" | "sdai";

export interface Empresa {
  id: string;
  nome: string;
  cnpj?: string;
  contato?: string;
  telefone?: string;
  email?: string;
  escopos: EscopoId[];
  obs?: string;
}

export interface Equipe {
  id: string;
  nome: string;
  empresaId?: string;
  lider?: string;
  telefone?: string;
  qtdPessoas?: number;
  escopos: EscopoId[];
  obs?: string;
}

/** Macroatividade (fase) de um escopo. */
export interface Macro {
  id: string;
  escopo: EscopoId;
  nome: string;
  ordem: number;
}

export interface Atividade {
  id: string;
  macroId: string;
  nome: string;
  andar: number | null;
  local?: string;
  empresaId?: string;
  equipeId?: string;
  inicioPrev?: string;
  fimPrev?: string;
  inicioReal?: string;
  fimReal?: string;
  /** 0–100 */
  progresso: number;
  /** Posição manual dentro da macro (definida ao reordenar). */
  ordem?: number;
  obs?: string;
}

/** Item rastreado individualmente: quarto, câmera, leitor, detector etc. */
export interface Item {
  id: string;
  escopo: EscopoId;
  codigo: string;
  andar: number;
  local?: string;
  tipo?: string;
  modelo?: string;
  ip?: string;
  /** NVR / canal / switch / laço etc. */
  extra?: string;
  dataInstalacao?: string;
  /** Programação (automação) ou configuração (demais). */
  dataConfig?: string;
  tecnico?: string;
  equipeId?: string;
  achouPendencia?: boolean;
  dataRetorno?: string;
  nRetornos?: number;
  dataOkAW?: string;
  aprovadoPor?: string;
  obs?: string;
  /** Sistema do ponto (HVAC, Hidráulica, Elétrica…) — pontos de automação. */
  sistema?: string;
  /**
   * Checklist de etapas do escopo (ver EscopoDef.etapas): id da etapa → concluída (true/false)
   * ou, em escopos com estados (EscopoDef.estados), o estado da etapa ("Concluído", "Pendente"…).
   */
  etapas?: Record<string, boolean | string>;
  /** Dados da lista de pontos de automação. */
  ponto?: PontoAutomacao;
}

export interface PontoAutomacao {
  quadro?: string;
  controlador?: string;
  equipamento?: string;
  descricao?: string;
  /** DI, DO, AI, AO, CS, ETH, KNX */
  tipoPonto?: string;
  destino?: string;
  cabo?: string;
  sensor?: string;
  fornecimento?: string;
  fornecedor?: string;
  compra?: string;
  futuro?: boolean;
  problema?: string;
  /** Linha na planilha de origem (rastreabilidade). */
  linha?: number;
}

export interface Pendencia {
  id: string;
  num: number;
  data: string;
  escopo: EscopoId;
  andar: number | null;
  local?: string;
  /** Código do item (quarto/câmera/dispositivo), se houver. */
  itemCodigo?: string;
  atividadeId?: string;
  encontradaEm: string;
  categoria: string;
  descricao: string;
  prioridade: string;
  empresaId?: string;
  equipeId?: string;
  responsavel?: string;
  prazo?: string;
  status: string;
  dataRegularizacao?: string;
  obs?: string;
}

export interface Config {
  obra: string;
  inicioCronograma: string;
  andarMin: number;
  andarMax: number;
  listas: {
    statusPendencia: string[];
    prioridade: string[];
    encontradaEm: string[];
    locais: string[];
    categorias: Record<EscopoId, string[]>;
    tiposItem: Record<EscopoId, string[]>;
  };
}

export interface DB {
  config: Config;
  empresas: Empresa[];
  equipes: Equipe[];
  macros: Macro[];
  atividades: Atividade[];
  itens: Item[];
  pendencias: Pendencia[];
}

export type Colecao = Exclude<keyof DB, "config">;

export type Registro = DB[Colecao][number];
