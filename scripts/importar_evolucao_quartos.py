"""Lê a planilha "Evolução de entrega – Automação dos quartos (GRMS)" e gera um JSON por quarto.

Uso (dentro de gestao/):  python scripts/importar_evolucao_quartos.py <planilha.xlsx> <saida.json>
Depois: node scripts/aplicar_evolucao_quartos.mjs <saida.json> [url-api] [--gravar]

Aba "Quartos", dados a partir da linha 7: A Andar, B Quarto, C Tipologia, D Keypads, E Termostato,
F DALI, G Comando de cortina, H Geral (calculado), I EBO, J Master Off, K Zigbee, L Lógica Opera,
M % Concluído (calculado), N Observações.
"""
import json
import re
import sys
import warnings

import openpyxl

warnings.filterwarnings("ignore")
ETAPAS = ["keypads", "termostato", "dali", "cortina", None, "ebo", "masteroff", "zigbee", "opera"]


def main(arq, saida):
    ws = openpyxl.load_workbook(arq, data_only=True)["Quartos"]
    quartos = []
    for r in ws.iter_rows(min_row=7, values_only=True):
        if not r[1]:
            continue
        andar = int(re.match(r"\s*(\d+)", str(r[0])).group(1))
        etapas = {k: (str(v).strip() if v else "Pendente") for k, v in zip(ETAPAS, r[3:12]) if k}
        obs = str(r[13]).strip() if r[13] else None
        quartos.append({
            "codigo": f"Q{int(str(r[1]).strip())}",
            "andar": andar,
            "tipologia": r[2],
            "etapas": etapas,
            "geral": r[7],
            "pct": r[12],
            "obs": obs,
        })
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(quartos, f, ensure_ascii=False, indent=1)
    print(f"{len(quartos)} quartos -> {saida}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
