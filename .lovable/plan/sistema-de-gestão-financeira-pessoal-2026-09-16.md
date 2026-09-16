# Sistema de gestão financeira pessoal

## Objetivo
Criar uma primeira versão completa para lançamentos manuais, com login, dados privados por usuário e estrutura preparada para evoluir como SaaS. O visual será minimalista, em tons de laranja escuro, com foco em leitura rápida e números bem alinhados.

## Experiência principal
- Página de acesso com cadastro e login por e-mail/senha e Google, incluindo recuperação de senha.
- Área protegida com navegação para Visão geral, Contas, Lançamentos, Categorias e Patrimônio.
- Dashboard com saldo consolidado, receitas, despesas, resultado do mês, receita x despesa, fluxo de caixa e movimentações recentes.
- Cadastro e edição de contas bancárias, carteiras, investimentos, ativos e passivos.
- Lançamentos de receita, despesa e transferência entre contas, atualizando os saldos relacionados.
- Categorias hierárquicas sem limite fixo de níveis, exibidas como árvore e caminho completo.
- Balanço patrimonial com total de ativos, passivos e patrimônio líquido.
- Layout adaptado para computador e celular.

## Dados e segurança
- Perfil básico por usuário, separado dos dados de acesso.
- Todas as contas, categorias, lançamentos e itens patrimoniais terão um proprietário.
- Regras de acesso garantirão que cada pessoa visualize e altere somente os próprios dados.
- Estrutura já compatível com múltiplos usuários, sem compartilhar informações financeiras.
- Transferências serão gravadas como uma operação única com conta de origem e destino.

## Direção visual
- Fundo claro e neutro, superfícies discretas e detalhes em laranja queimado/escuro.
- Verde reservado para entradas e evolução positiva; vermelho contido para saídas e passivos.
- Tipografia limpa, números tabulares e tabelas compactas.
- Poucas animações, usadas apenas em transições, gráficos e estados de interação.

## Fora desta primeira versão
- Importação de arquivo OFX.
- Conexão automática com Open Finance.
- Agente virtual e lançamentos por WhatsApp.

Esses pontos ficarão previstos na arquitetura para implementação futura, sem controles que prometam funções ainda indisponíveis.

## Detalhes técnicos
- Lovable Cloud para login, banco de dados e isolamento seguro dos dados.
- Tabelas para perfis, contas, categorias, lançamentos e patrimônio, com histórico de criação e alteração.
- Políticas de segurança por usuário em todas as tabelas financeiras.
- Rotas públicas apenas para acesso e recuperação; telas financeiras protegidas.
- Componentes reutilizáveis para formulários, tabelas, indicadores e navegação.

## Validação
- Testar cadastro, login, saída e recuperação de senha.
- Criar duas contas, lançar receita, despesa e transferência e conferir os saldos.
- Criar categorias em três níveis e confirmar o caminho nos lançamentos.
- Conferir dashboard e balanço patrimonial após alterações.
- Verificar isolamento entre usuários e uso em telas pequenas e grandes.
