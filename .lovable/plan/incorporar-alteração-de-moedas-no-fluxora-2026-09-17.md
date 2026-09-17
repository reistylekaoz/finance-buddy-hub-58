# Incorporar alteração de moedas no Fluxora

## Objetivo
Aplicar a lógica enviada para que receitas, despesas, gráficos, lançamentos e centros de custo permaneçam na moeda original de cada conta.

## Alterações
- Manter o saldo consolidado convertido para reais pela cotação D-1.
- Exibir receitas, despesas e resultado mensal separados por BRL, EUR e USD quando existirem.
- Separar os gráficos e o resumo dos centros de custo por moeda.
- Mostrar cada lançamento na moeda da conta correspondente.
- Atualizar o aviso ao cadastrar contas em moeda estrangeira.
- Preservar a identidade atual do Fluxora: logo oficial transparente e contraste corrigido no menu.

## Validação
- Confirmar que a aplicação compila sem erros.
- Conferir no painel que a marca e o menu continuam corretos e que os valores aparecem por moeda.
