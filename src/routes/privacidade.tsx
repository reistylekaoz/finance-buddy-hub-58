import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade | Fluxora" },
      {
        name: "description",
        content: "Como o Fluxora coleta, usa e protege seus dados pessoais e financeiros.",
      },
      { property: "og:title", content: "Política de Privacidade | Fluxora" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link to="/auth" className="text-sm text-primary hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: 18 de setembro de 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Esta Política de Privacidade explica como o <strong>Fluxora</strong> ("nós", "nosso
            aplicativo") coleta, usa, armazena e protege dados pessoais dos usuários ("você",
            "titular"), em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº
            13.709/2018 — LGPD).
          </p>
          <p className="mt-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Controlador dos dados: <em>[preencher: nome/razão social, CPF ou CNPJ, endereço]</em>.
            Canal de contato do encarregado (DPO): <em>[preencher e-mail de contato]</em>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">1. Quais dados coletamos</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Cadastro:</strong> nome, e-mail e senha (ou dados básicos do seu perfil
              Google, se você entrar com essa opção), moeda preferida.
            </li>
            <li>
              <strong>Contas e cartões:</strong> nome da conta ou cartão, instituição financeira,
              tipo de conta, saldo inicial e moeda que você cadastra.
            </li>
            <li>
              <strong>Lançamentos financeiros:</strong> valor, data, descrição, categoria e centro
              de custo de receitas, despesas e transferências — lançados manualmente, importados de
              arquivos OFX/CSV, ou sincronizados automaticamente via Open Finance.
            </li>
            <li>
              <strong>Patrimônio:</strong> bens e direitos que você cadastra para compor seu balanço
              patrimonial.
            </li>
            <li>
              <strong>Conexões bancárias (Open Finance):</strong> se você optar por conectar um
              banco automaticamente, usamos a <strong>Pluggy</strong>, uma iniciadora/agregadora de
              dados regulada pelo Banco Central do Brasil no âmbito do Open Finance. Nesse caso,
              tratamos os dados de saldo e extrato que a instituição financeira conectada nos
              repassa, mediante o seu consentimento explícito, específico e revogável a qualquer
              momento.
            </li>
            <li>
              <strong>Dados técnicos:</strong> registros de acesso e uso, para segurança e prevenção
              de fraude, conforme exigido pelo Marco Civil da Internet.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">2. Para que usamos seus dados</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              Fornecer as funcionalidades do app: contas, lançamentos, categorização e dashboard.
            </li>
            <li>Calcular seu balanço patrimonial e fluxo de caixa.</li>
            <li>
              Sincronizar automaticamente extratos, quando você autorizar uma conexão Open Finance.
            </li>
            <li>Autenticar seu acesso e proteger sua conta contra uso indevido.</li>
            <li>Cumprir obrigações legais e responder a autoridades, quando exigido por lei.</li>
          </ul>
          <p className="mt-3">
            <strong>
              Não usamos seus dados financeiros para conceder crédito, vender produtos financeiros
              de terceiros ou compartilhar com anunciantes.
            </strong>{" "}
            O Fluxora não é uma instituição de pagamento e não movimenta dinheiro — apenas organiza
            informações que você já possui.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">3. Com quem compartilhamos</h2>
          <p className="mt-2">
            Compartilhamos dados apenas com prestadores que operam a infraestrutura do serviço,
            nunca com terceiros para fins de marketing:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Lovable Cloud / Supabase</strong> — hospedagem do banco de dados e
              autenticação.
            </li>
            <li>
              <strong>Pluggy</strong> — conexão Open Finance, apenas se você autorizar.
            </li>
            <li>
              <strong>Google</strong> — login social, apenas se você optar por essa forma de acesso.
            </li>
          </ul>
          <p className="mt-2">
            Se algum desses prestadores processar dados fora do Brasil, garantimos que a
            transferência segue as salvaguardas exigidas pela LGPD (art. 33).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">4. Base legal do tratamento</h2>
          <p className="mt-2">
            Tratamos seus dados com base na <strong>execução de contrato</strong> (para entregar as
            funcionalidades que você contratou ao criar sua conta) e, no caso específico de conexões
            Open Finance, com base no seu <strong>consentimento</strong>, que pode ser revogado a
            qualquer momento sem afetar o restante do serviço.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">5. Seus direitos</h2>
          <p className="mt-2">
            Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Confirmação de que tratamos seus dados e acesso a eles.</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
            <li>
              Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em
              desconformidade com a lei.
            </li>
            <li>Portabilidade dos seus dados a outro fornecedor.</li>
            <li>Eliminação dos dados tratados com base no seu consentimento.</li>
            <li>Revogação do consentimento, incluindo o desligamento de conexões Open Finance.</li>
            <li>Informação sobre com quem compartilhamos seus dados.</li>
          </ul>
          <p className="mt-2">
            Para exercer esses direitos, entre em contato pelo canal informado no topo desta página.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">6. Segurança e retenção</h2>
          <p className="mt-2">
            Seus dados ficam isolados por usuário no banco de dados (controle de acesso em nível de
            linha), e o tráfego entre o app e nossos servidores é criptografado. Mantemos seus dados
            enquanto sua conta estiver ativa; ao solicitar exclusão de conta, eliminamos ou
            anonimizamos os dados pessoais, ressalvado o que a lei exigir manter por período
            determinado.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">7. Alterações desta política</h2>
          <p className="mt-2">
            Podemos atualizar esta política para refletir mudanças no produto ou na legislação.
            Alterações relevantes serão comunicadas por e-mail ou dentro do app antes de entrarem em
            vigor.
          </p>
        </section>
      </div>
    </main>
  );
}
