# Gestão da obra – Sofitel

Sistema web (Next.js) para acompanhar os sistemas eletrônicos da obra:
**Automação área comum, Automação quartos, CFTV, Controle de acesso e Detecção e alarme**.

## Telas

| Tela | O que faz |
|---|---|
| **Painel** | Avanço físico, atividades atrasadas, pendências abertas/vencidas, itens aprovados AW, avanço por escopo, por macro, mapa andar × escopo, pendências por empresa |
| **Cronograma** | Macroatividades → atividades, com datas previstas/reais, % de avanço, empresa/equipe e Gantt semanal. "Gerar por andares" cria uma atividade por andar com sequência e defasagem. "Macros" cadastra/reordena as macros de cada escopo |
| **Andares e itens** | Quartos, câmeras, pontos de acesso e dispositivos por andar, com status automático (instalação → configuração/programação → pendência/retorno → OK AW). "Gerar em lote" cria os itens por andar |
| **Pendências** | Cadastro e acompanhamento, com filtros por escopo, andar, prioridade, categoria, empresa e equipe; prazo vencido é destacado |
| **Empresas / Equipes** | Cadastro, com a carga de atividades e pendências de cada uma |
| **Configurações** | Nome da obra, andares, início do Gantt e listas dos menus |

O filtro **Escopo** no topo vale para todas as telas. Todas as listas exportam CSV (abre no Excel).

## Dados

- Ficam em `data/db.json`. Backup automático diário em `data/backups/`.
- Carga inicial: `npm run importar` lê `../Automacao_Programacao_Quartos.xlsx` e `../CFTV_Pavimentos.xlsx`
  (use `python scripts/importar.py --forcar` para recriar do zero — **apaga o que foi lançado no sistema**).

## Login

O sistema pede usuário e senha (cookie de sessão de 7 dias; botão **Sair** no menu).
As credenciais ficam em `.env.local` (não vai para o Git). Para configurar numa máquina nova, copie `.env.example`
para `.env.local` e preencha:

```
GESTAO_USUARIO=admin
GESTAO_SENHA=...
GESTAO_SEGREDO=...   # segredo que assina a sessão
```

Os scripts de importação usam as mesmas credenciais do `.env.local`.
Os dados da obra ficam em `data/db.json`, que vai para o Git junto com o código (os backups em `data/backups/` não vão).
Ao clonar em outra máquina, basta criar o `.env.local`.

## Rodar

```bash
npm install
npm run dev            # desenvolvimento em http://localhost:3511
npm run build          # build de produção
npm start              # produção em http://0.0.0.0:3005 (acessível na rede)
npm run pm2:start      # produção via PM2 (app "gestao-sofitel")
```

Pare o servidor/PM2 antes de `npm run build`, senão o OneDrive pode travar a pasta `.next` (EBUSY).
Para acesso de outras máquinas, libere a porta 3005 no firewall (PowerShell como admin):

```powershell
New-NetFirewallRule -DisplayName "Gestao Sofitel 3005" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3005 -Profile Domain,Private -RemoteAddress LocalSubnet
```

## Pontos de automação (área comum)

A lista de pontos (aba **Consolidada** da planilha "Lista de Pontos Automação - SMART") aparece em
**Andares e itens → Automação – Área comum**, com resumo por sistema e checklist Cabo / Equipamento / Programação / Tela.
Para reimportar uma versão nova da planilha (o servidor pode continuar rodando):

```bash
python scripts/importar_pontos.py "../Lista de Pontos.xlsx" pontos.json
node scripts/aplicar_pontos.mjs pontos.json http://localhost:3511/api/db --gravar
```

Reaplicar é seguro: cada ponto é identificado pela linha da planilha e as etapas já marcadas no sistema são mantidas.

## Evolução da automação dos quartos

A planilha "Evolução de entrega – Automação dos quartos (GRMS)" (aba **Quartos**) atualiza as etapas de cada quarto
(Keypads, Termostato, DALI, Cortina, EBO, Master Off, Zigbee, Lógica Opera), a tipologia, as observações e as pendências:

```bash
python scripts/importar_evolucao_quartos.py "../Evolucao_Automacao_Quartos_DD_MM_AAAA Rx.xlsx" evolucao.json
node --no-warnings scripts/aplicar_evolucao_quartos.mjs evolucao.json http://localhost:3511/api/db --data=AAAA-MM-DD            # só mostra
node --no-warnings scripts/aplicar_evolucao_quartos.mjs evolucao.json http://localhost:3511/api/db --data=AAAA-MM-DD --gravar   # aplica
```

Observação nova vira pendência; observação removida regulariza a pendência; pendência já regularizada no sistema não é reaberta.
`--cronograma` também copia o % médio de cada andar para as atividades "Programação quartos" (desligado por padrão).
