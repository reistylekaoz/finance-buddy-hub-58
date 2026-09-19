import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso | Fluxora" },
      { name: "description", content: "Condições de uso do Fluxora." },
    ],
  }),
  component: TermsOfUse,
});

function TermsOfUse() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <Link to="/auth" className="text-primary hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-6 font-display text-3xl font-semibold">Termos de Uso</h1>
      <p className="mt-2 text-muted-foreground">Última atualização: a definir.</p>

      <div className="mt-4 rounded-md border border-destructive/40 bg-destructive-soft p-4 text-destructive">
        <strong>Rascunho — pendente de revisão jurídica.</strong> Este texto ainda precisa ser
        revisado por um profissional jurídico antes de valer como os termos oficiais do produto.
      </div>

      <section className="mt-8 space-y-4">
        <h2 className="font-display text-xl font-semibold">1. O serviço</h2>
        <p>
          O Fluxora é uma ferramenta de gestão financeira pessoal: controle de contas, cartões,
          lançamentos, categorias e patrimônio, com integrações opcionais de sincronização bancária
          (via Pluggy) e notificações por Telegram.
        </p>

        <h2 className="font-display text-xl font-semibold">2. Sua conta</h2>
        <p>
          Você é responsável por manter a confidencialidade da sua senha e por toda atividade
          realizada na sua conta. Avise-nos imediatamente em caso de uso não autorizado.
        </p>

        <h2 className="font-display text-xl font-semibold">3. Integrações de terceiros</h2>
        <p>
          Funcionalidades como conexão bancária (Pluggy) e notificações (Telegram) dependem de
          serviços de terceiros. O Fluxora não controla a disponibilidade, precisão ou políticas
          desses serviços e não se responsabiliza por falhas fora do seu controle.
        </p>

        <h2 className="font-display text-xl font-semibold">4. Isenção de responsabilidade</h2>
        <p>
          O Fluxora é uma ferramenta de organização financeira, não um serviço de consultoria
          financeira, contábil ou de investimentos. As decisões tomadas com base nas informações
          apresentadas são de sua exclusiva responsabilidade.
        </p>

        <h2 className="font-display text-xl font-semibold">5. Cancelamento</h2>
        <p>
          Você pode excluir sua conta a qualquer momento em Configurações. A exclusão remove
          permanentemente seus dados, conforme descrito na Política de Privacidade.
        </p>

        <h2 className="font-display text-xl font-semibold">6. Alterações</h2>
        <p>
          Podemos atualizar estes termos. Mudanças relevantes serão comunicadas dentro do próprio
          aplicativo.
        </p>

        <h2 className="font-display text-xl font-semibold">7. Lei aplicável</h2>
        <p>Estes termos são regidos pelas leis da República Federativa do Brasil.</p>
      </section>
    </main>
  );
}
