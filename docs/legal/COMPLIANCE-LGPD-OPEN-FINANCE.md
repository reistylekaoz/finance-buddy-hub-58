# Compliance LGPD e Open Finance — Fluxora

> Documento de apoio técnico-jurídico, não é parecer jurídico formal. Antes de
> lançar o produto comercialmente ou assumir obrigações contratuais com
> usuários, valide este conteúdo com um advogado inscrito na OAB especializado
> em proteção de dados / direito bancário.

Data-base: mapeamento feito a partir das migrations em `supabase/migrations/`
até `20260919120000_a2b3c4d5-6e7f-4890-a1b2-c3d4e5f6a7b9.sql`.

## 1. Enquadramento legal

- **LGPD — Lei nº 13.709/2018**: aplica-se porque o Fluxora trata dados
  pessoais (identificação) e dados financeiros de pessoas naturais no Brasil.
  Dados financeiros não são "dados sensíveis" na definição do art. 5º, II da
  LGPD (que é uma lista fechada: origem racial/étnica, convicção religiosa,
  opinião política, filiação sindical/religiosa/política/filosófica, dado
  referente à saúde ou vida sexual, dado genético ou biométrico). Ainda assim,
  merecem tratamento reforçado por serem dados de alto risco reputacional e
  financeiro ao titular.
- **Marco Civil da Internet — Lei nº 12.965/2014**: guarda de registros de
  acesso, dever de segurança.
- **Open Finance Brasil**: regulado pelo Banco Central (Resolução Conjunta
  BCB/CVM nº 1/2020, Resolução BCB nº 32/2021 e normas correlatas do Manual de
  Escopo do Open Finance). O Fluxora **não** é participante direto do Open
  Finance — ele consome dados por meio da **Pluggy**, que atua como Iniciadora
  de Serviço de Informação/agregadora regulada. Isso não isenta o Fluxora de
  obrigações: como recebedor final do dado, o Fluxora é **controlador** dos
  dados pessoais recebidos via Pluggy para as finalidades que define (exibir
  extrato, categorizar, calcular patrimônio).
- **CDC**: só se aplica automaticamente quando houver relação de consumo
  onerosa (plano pago). Hoje o app parece gratuito/uso pessoal — reavaliar se
  monetizar.

## 2. Mapeamento de dados pessoais tratados

| Tabela | Dados pessoais | Finalidade | Base legal (art. 7º LGPD) |
|---|---|---|---|
| `auth.users` (Supabase Auth) | e-mail, senha (hash), provedor OAuth (Google) | autenticação | execução de contrato (V) |
| `profiles` | nome de exibição, moeda preferida | personalização da conta | execução de contrato (V) |
| `accounts` | nome da conta, instituição, tipo, saldo inicial, moeda | gestão de contas bancárias do usuário | execução de contrato (V) |
| `credit_cards` / `credit_card_transactions` | dados de cartão de crédito e faturas do usuário | gestão de despesas | execução de contrato (V) |
| `transactions` | valor, data, descrição, categoria, origem (manual/OFX/Open Finance) | lançamentos financeiros, fluxo de caixa | execução de contrato (V) |
| `assets` | bens e direitos do usuário | balanço patrimonial | execução de contrato (V) |
| `categories`, `cost_centers` | estrutura de organização definida pelo próprio usuário | categorização | execução de contrato (V) |
| `bank_connections` | `pluggy_item_id`, instituição conectada, status de sincronização | conexão Open Finance via Pluggy | **consentimento específico (I)** — exigido pela regulação de Open Finance, além da execução de contrato |
| Dados sincronizados via Pluggy (saldos, extratos, transações da instituição) | dados bancários do usuário nas instituições autorizadas | espelhar extrato automaticamente | **consentimento específico (I)**, renovável e revogável |

Todas as tabelas de dado do usuário têm Row Level Security habilitada
(`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), o que é uma boa prática de
minimização/segurança técnica — vale manter isso documentado como medida de
segurança no relatório de impacto (RIPD), se vierem a fazer um.

## 3. Operadores / suboperadores (compartilhamento)

- **Lovable Cloud / Supabase** — hospedagem do banco de dados e autenticação.
  Verificar região de hospedagem dos dados; se fora do Brasil, isso é
  **transferência internacional de dados** (art. 33 LGPD) e precisa constar
  na Política de Privacidade com a base legal aplicável (ex.: cláusulas
  contratuais padrão do fornecedor).
- **Pluggy** — agregador/iniciador de Open Finance. Fluxora deve ter contrato
  (DPA/termos) com a Pluggy definindo papéis (a Pluggy normalmente atua como
  operadora dos dados repassados, mas também como controladora de parte do
  processamento regulatório — checar os termos vigentes da Pluggy).
- **Google** — login social (OAuth). Escopo mínimo (e-mail, nome, foto) —
  confirmar no console OAuth que só esses escopos estão habilitados.

## 4. Lacunas identificadas hoje no produto

1. **Não havia Política de Privacidade nem Termos de Uso publicados** — sem
   isso, não há como informar titulares (art. 9º LGPD) nem formalizar
   aceite. *(Corrigido nesta entrega — ver `src/routes/privacidade.tsx` e
   `src/routes/termos.tsx`.)*
2. **Tela de cadastro (`src/routes/auth.tsx`) não linkava Termos/Privacidade
   nem registrava aceite** — adicionado aviso com links abaixo do botão de
   criar conta. Para consentimento **específico de Open Finance**, o ideal é
   capturar o aceite no momento em que o usuário inicia a conexão via Pluggy
   (não no cadastro geral), com texto claro do que será compartilhado e por
   quanto tempo — **não implementado ainda**, pois depende da tela de conexão
   bancária, que não existe no código-fonte ainda (só a tabela
   `bank_connections`). Recomendo tratar isso na mesma PR/feature que
   implementar a tela de conexão Pluggy.
3. **Consentimento de Open Finance deve ser renovável e revogável**: a
   regulação do Bacen exige que o consentimento tenha prazo definido (máx. 12
   meses, renovável) e que o usuário consiga revogar a qualquer momento, com
   efeito imediato. Isso deve virar requisito de produto quando a integração
   Pluggy for exposta na UI (ex.: botão "desconectar banco" que já existe
   estruturalmente via `bank_connections.status`, mas precisa deletar/revogar
   o item também do lado da Pluggy via API, não só do banco local).
4. **Nenhum canal de encarregado (DPO) definido** — a política criada usa
   placeholder `[preencher]`; defina um e-mail de contato antes de publicar.
5. **Ausência de identificação da pessoa jurídica/física controladora**
   (razão social ou CPF, CNPJ) nos documentos — preencher antes de publicar
   publicamente.
6. **Nenhum mecanismo de exclusão de conta pelo próprio usuário** identificado
   no código (`src/routes`) — LGPD art. 18, VI garante direito de eliminação.
   Recomendo implementar endpoint/fluxo de "excluir minha conta" que apague
   ou anonimize dados nas tabelas listadas acima.

## 5. Checklist de próximos passos

- [x] Publicar Política de Privacidade e Termos de Uso no app.
- [x] Linkar os documentos na tela de cadastro.
- [ ] Preencher identificação do controlador (nome/razão social, CPF/CNPJ,
      endereço, contato do encarregado) nos dois documentos.
- [ ] Confirmar região de hospedagem do Supabase/Lovable Cloud e, se fora do
      BR, adicionar cláusula de transferência internacional.
- [ ] Ao construir a tela de conexão bancária (Pluggy), implementar
      consentimento específico, com prazo e opção de revogação imediata.
- [ ] Implementar exclusão/anonimização de conta a pedido do usuário.
- [ ] Revisar contrato/DPA com a Pluggy antes de sair de ambiente de testes.
- [ ] Se o produto passar a ser pago, revisar aplicabilidade do CDC e emissão
      fiscal (ver observação tributária abaixo).

## 6. Nota tributária (fora do escopo desta entrega, registrar para depois)

O Fluxora **categoriza** dados financeiros do usuário, mas isso não o torna
"consultoria tributária" — os Termos de Uso incluem uma cláusula de
isenção deixando claro que o app não substitui um contador/consultor
tributário para fins de IRPF ou apuração de tributos. Se no futuro o app
quiser sugerir automaticamente despesas dedutíveis de IRPF (ex.: saúde,
educação), isso deve continuar sendo apresentado como "sugestão informativa",
nunca como recomendação fiscal definitiva, para não gerar responsabilidade
por orientação tributária incorreta.
