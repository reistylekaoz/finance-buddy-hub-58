import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso | Fluxora" },
      {
        name: "description",
        content: "Condições de uso do Fluxora, gestão financeira pessoal.",
      },
      { property: "og:title", content: "Termos de Uso | Fluxora" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsOfUse,
});

function TermsOfUse() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link to="/auth" className="text-sm text-primary hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Termos de Uso</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: 18 de setembro de 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Estes Termos de Uso regulam o acesso e uso do <strong>Fluxora</strong>, aplicativo de
            gestão financeira pessoal ("Serviço"), operado por{" "}
            <em>[preencher: nome/razão social, CPF ou CNPJ]</em>. Ao criar uma conta, você declara
            ter lido, compreendido e aceitado estes Termos e a nossa{" "}
            <Link to="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">1. O que é o Fluxora</h2>
          <p className="mt-2">
            O Fluxora é uma ferramenta para organizar contas bancárias, lançamentos de receitas e
            despesas, categorização, patrimônio e fluxo de caixa. Ele pode, opcionalmente,
            sincronizar dados automaticamente com instituições financeiras que você autorizar, por
            meio de um provedor de Open Finance regulado pelo Banco Central.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">2. O que o Fluxora não é</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              O Fluxora <strong>não é uma instituição financeira ou de pagamento</strong>: não
              movimenta, custodia nem transfere seu dinheiro. Ele apenas exibe e organiza
              informações que você fornece ou autoriza acessar.
            </li>
            <li>
              O Fluxora{" "}
              <strong>
                não presta consultoria financeira, contábil, tributária ou de investimentos
              </strong>
              . Categorizações, projeções e indicadores exibidos no app são informativos e não
              substituem a orientação de um profissional habilitado (contador, planejador
              financeiro, advogado tributarista) para decisões de declaração de imposto de renda,
              investimentos ou planejamento patrimonial.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">3. Cadastro e elegibilidade</h2>
          <p className="mt-2">
            Você deve ter ao menos 18 anos e capacidade civil plena para criar uma conta. Você é
            responsável por manter a confidencialidade da sua senha e por todas as atividades
            realizadas na sua conta. Informe dados verdadeiros, completos e atualizados no cadastro.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            4. Conexão automática com bancos (Open Finance)
          </h2>
          <p className="mt-2">
            Se você optar por conectar uma conta automaticamente, o Fluxora usa um parceiro regulado
            (Pluggy) para obter, com sua autorização explícita, os dados de saldo e extrato da
            instituição selecionada. Você pode revogar essa autorização a qualquer momento
            diretamente no app, o que interrompe a sincronização automática — os lançamentos já
            importados permanecem no seu histórico, salvo se você optar por excluí-los.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">5. Uso aceitável</h2>
          <p className="mt-2">Ao usar o Fluxora, você concorda em não:</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              Usar a conta de outra pessoa ou fornecer dados financeiros de terceiros sem
              autorização;
            </li>
            <li>Tentar acessar dados de outros usuários ou contornar controles de segurança;</li>
            <li>Usar o Serviço para fins ilícitos, incluindo lavagem de dinheiro ou fraude.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            6. Disponibilidade e limitação de responsabilidade
          </h2>
          <p className="mt-2">
            O Serviço é fornecido "como está". Fazemos esforços razoáveis para mantê-lo disponível e
            seguro, mas não garantimos operação ininterrupta, isenta de erros, nem a exatidão de
            dados sincronizados automaticamente de terceiros (ex.: instabilidade do banco conectado
            ou do provedor de Open Finance). Na máxima extensão permitida por lei, não nos
            responsabilizamos por decisões financeiras tomadas com base nas informações exibidas no
            app.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">7. Encerramento de conta</h2>
          <p className="mt-2">
            Você pode encerrar sua conta a qualquer momento solicitando pelo canal de contato
            informado na Política de Privacidade. Podemos suspender ou encerrar contas que violem
            estes Termos, mediante aviso prévio quando possível.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">8. Alterações destes Termos</h2>
          <p className="mt-2">
            Podemos atualizar estes Termos para refletir mudanças no Serviço ou na legislação
            aplicável. Alterações relevantes serão comunicadas com antecedência razoável.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">9. Lei aplicável e foro</h2>
          <p className="mt-2">
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
            foro da comarca de <em>[preencher]</em> para dirimir eventuais controvérsias, ressalvado
            o foro do domicílio do consumidor quando aplicável por lei.
          </p>
        </section>
      </div>
    </main>
  );
}
