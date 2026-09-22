import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade | Fluxora" },
      {
        name: "description",
        content: "Como o Fluxora coleta, usa e protege seus dados pessoais e financeiros.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <Link to="/auth" className="text-primary hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-6 font-display text-3xl font-semibold">Política de Privacidade</h1>
      <p className="mt-2 text-muted-foreground">Última atualização: a definir.</p>

      <div className="mt-4 rounded-md border border-destructive/40 bg-destructive-soft p-4 text-destructive">
        <strong>Rascunho — pendente de revisão jurídica.</strong> Este texto descreve, do ponto de
        vista técnico, quais dados o Fluxora coleta e com quem compartilha hoje. Ele precisa ser
        revisado por um profissional jurídico antes de valer como a política oficial do produto.
      </div>

      <section className="mt-8 space-y-4">
        <h2 className="font-display text-xl font-semibold">1. Quem somos</h2>
        <p>
          O Fluxora é um aplicativo de gestão financeira pessoal. O controlador dos dados tratados
          nesta política é [razão social / CNPJ / contato a preencher].
        </p>

        <h2 className="font-display text-xl font-semibold">2. Quais dados coletamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados de cadastro: nome, e-mail e senha (ou login via Google).</li>
          <li>
            Dados financeiros que você cadastra manualmente: contas, cartões, lançamentos,
            categorias, patrimônio, investimentos e orçamentos.
          </li>
          <li>
            Se você conectar um banco: dados de contas, saldos, lançamentos e identificação da conta
            (nome do titular, agência/conta) obtidos via Pluggy (Open Finance), com o client
            ID/secret que você mesmo cadastra para autenticar essa integração.
          </li>
          <li>
            Se você vincular o Telegram: identificador do chat, nome de usuário (opcional) e o
            conteúdo das mensagens/áudios trocados com o bot para categorizar lançamentos e receber
            alertas de orçamento.
          </li>
          <li>
            Se você convidar outra pessoa para acessar sua conta (contas compartilhadas): o e-mail
            dela e o nível de permissão concedido (visualizar, editar, gerenciar conexões bancárias,
            gerenciar outros membros).
          </li>
        </ul>

        <h2 className="font-display text-xl font-semibold">3. Com quem compartilhamos</h2>
        <p>Para operar o app, alguns dados são processados por terceiros:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase / Lovable Cloud</strong> — hospedagem do banco de dados e autenticação.
          </li>
          <li>
            <strong>Pluggy</strong> — agregador de Open Finance, usado para sincronizar contas,
            cartões e investimentos conectados.
          </li>
          <li>
            <strong>Telegram</strong> — plataforma de mensagens, usada para o envio de resumos,
            categorização e alertas de orçamento por chat.
          </li>
          <li>
            <strong>Anthropic (Claude)</strong> — interpreta a categorização em texto livre que você
            manda pelo Telegram (recebe a descrição e o valor dos lançamentos pendentes).
          </li>
          <li>
            <strong>Groq</strong> — transcreve mensagens de voz enviadas pelo Telegram antes de
            interpretar a categorização.
          </li>
        </ul>
        <p>
          Alguns desses provedores processam dados fora do Brasil. Isso caracteriza transferência
          internacional de dados nos termos do art. 33 da LGPD — as salvaguardas contratuais
          aplicáveis a cada um estão em revisão.
        </p>

        <h2 className="font-display text-xl font-semibold">4. Contas compartilhadas</h2>
        <p>
          Se o dono de uma conta convidar você para acessá-la (ou você convidar outra pessoa para
          acessar a sua), os dados financeiros dessa conta passam a ser visíveis também para quem
          aceitar o convite, de acordo com o nível de permissão concedido. Quem convida pode revogar
          esse acesso a qualquer momento em Configurações.
        </p>

        <h2 className="font-display text-xl font-semibold">5. Por que tratamos seus dados</h2>
        <p>
          Para viabilizar as funcionalidades que você ativamente escolhe usar (gestão financeira,
          integração bancária, notificações por Telegram, compartilhamento de conta), com base no
          seu consentimento (art. 7º, I) e, quando aplicável, na execução do serviço que você
          contratou (art. 7º, V).
        </p>

        <h2 className="font-display text-xl font-semibold">6. Por quanto tempo guardamos</h2>
        <p>
          Enquanto sua conta estiver ativa. Ao excluir sua conta (disponível em Configurações), seus
          dados são apagados — ver seção 8.
        </p>

        <h2 className="font-display text-xl font-semibold">7. Segurança</h2>
        <p>
          Seus dados financeiros são protegidos por controle de acesso por usuário (cada pessoa só
          acessa os próprios dados ou os de contas que explicitamente compartilharam com ela).
          Credenciais de integração bancária (client ID/secret da Pluggy) ficam numa tabela isolada,
          sem nenhum acesso direto pelo navegador — só o servidor consegue lê-las.
        </p>

        <h2 className="font-display text-xl font-semibold">8. Seus direitos (art. 18 da LGPD)</h2>
        <p>Você pode, a qualquer momento, em Configurações ou entrando em contato conosco:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Confirmar a existência de tratamento e acessar seus dados;</li>
          <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>Exportar uma cópia dos seus dados em formato legível;</li>
          <li>Excluir permanentemente sua conta e todos os dados associados;</li>
          <li>
            Revogar o consentimento de integrações (Pluggy, Telegram) ou de acesso compartilhado,
            desconectando-as ou removendo o membro em Configurações;
          </li>
          <li>Obter informação sobre com quem compartilhamos seus dados (seção 3 acima).</li>
        </ul>

        <h2 className="font-display text-xl font-semibold">9. Contato</h2>
        <p>
          Dúvidas ou solicitações sobre seus dados: [e-mail de contato / encarregado de dados a
          preencher].
        </p>
      </section>
    </main>
  );
}
