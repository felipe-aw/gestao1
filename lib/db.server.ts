import { promises as fs } from "fs";
import path from "path";
import type { Colecao, Config, DB, Registro } from "./types";

// GESTAO_DATA_DIR permite apontar para outra pasta (ex.: testes com uma cópia dos dados).
const PASTA = process.env.GESTAO_DATA_DIR || path.join(process.cwd(), "data");
const ARQUIVO = path.join(PASTA, "db.json");
const BACKUPS = path.join(PASTA, "backups");

export type Op =
  | { op: "upsert"; col: Colecao; item: Registro }
  | { op: "delete"; col: Colecao; id: string }
  | { op: "config"; config: Config };

const COLECOES: Colecao[] = ["empresas", "equipes", "macros", "atividades", "itens", "pendencias"];

// Serializa as gravações para não perder alterações simultâneas.
let fila: Promise<unknown> = Promise.resolve();

export async function lerDB(): Promise<DB> {
  return JSON.parse(await fs.readFile(ARQUIVO, "utf8")) as DB;
}

async function backupDiario() {
  const dia = new Date().toISOString().slice(0, 10);
  const destino = path.join(BACKUPS, `db-${dia}.json`);
  try {
    await fs.access(destino);
  } catch {
    await fs.mkdir(BACKUPS, { recursive: true });
    await fs.copyFile(ARQUIVO, destino);
  }
}

export function aplicar(ops: Op[]): Promise<DB> {
  const run = fila.then(async () => {
    const db = await lerDB();
    for (const o of ops) {
      if (o.op === "config") {
        db.config = o.config;
        continue;
      }
      if (!COLECOES.includes(o.col)) throw new Error(`Coleção inválida: ${o.col}`);
      const lista = db[o.col] as Registro[];
      if (o.op === "upsert") {
        const i = lista.findIndex((x) => x.id === o.item.id);
        if (i >= 0) lista[i] = o.item;
        else lista.push(o.item);
      } else {
        const i = lista.findIndex((x) => x.id === o.id);
        if (i >= 0) lista.splice(i, 1);
      }
    }
    await backupDiario();
    const tmp = ARQUIVO + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 1), "utf8");
    await fs.rename(tmp, ARQUIVO);
    return db;
  });
  fila = run.catch(() => {});
  return run;
}
