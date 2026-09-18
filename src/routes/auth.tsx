import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import lightLogo from "@/assets/fluxora-logo-light-transparent.png.asset.json";
import darkLogo from "@/assets/fluxora-logo-dark-transparent.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso | Fluxora" },
      {
        name: "description",
        content: "Entre no Fluxora para organizar suas contas e seu patrimônio.",
      },
      { property: "og:title", content: "Acesso | Fluxora" },
      { property: "og:description", content: "Gestão financeira pessoal simples e segura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (mode === "forgot") {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) setError(err.message);
      else setMessage("Enviamos um link de recuperação para seu e-mail.");
    } else if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
      });
      if (err) setError(err.message);
      else if (!data.session) setMessage("Conta criada. Confirme seu e-mail para continuar.");
      else navigate({ to: "/dashboard" });
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError("E-mail ou senha incorretos.");
      else navigate({ to: "/dashboard" });
    }
    setBusy(false);
  }
  async function google() {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setError(result.error.message);
    else if (!result.redirected) navigate({ to: "/dashboard" });
  }
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <section className="hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
        <img
          src={darkLogo.url}
          alt="Fluxora — Gestão financeira inteligente"
          className="h-auto w-64"
        />
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase text-primary-light">Clareza financeira</p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-tight">
            Seu dinheiro organizado.
            <br />
            Seu futuro mais claro.
          </h1>
          <p className="mt-5 max-w-md text-base text-background/65">
            Contas, lançamentos e patrimônio reunidos em um controle simples, seguro e realmente
            seu.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-background/60">
          <span>Dados privados</span>
          <span>Contas ilimitadas</span>
          <span>Balanço completo</span>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <img
            src={lightLogo.url}
            alt="Fluxora — Gestão financeira inteligente"
            className="mb-9 h-auto w-48 lg:hidden"
          />
          {message ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-10 text-income" />
              <h1 className="mt-4 font-display text-2xl font-semibold">Verifique seu e-mail</h1>
              <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              <Button className="mt-6" variant="outline" onClick={() => setMode("login")}>
                Voltar ao acesso
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium uppercase text-primary">
                Gestão financeira pessoal
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold">
                {mode === "login"
                  ? "Bem-vindo de volta"
                  : mode === "signup"
                    ? "Crie sua conta"
                    : "Recupere seu acesso"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "forgot"
                  ? "Informe seu e-mail para receber um link seguro."
                  : "Acesse seu controle financeiro com segurança."}
              </p>
              <form onSubmit={submit} className="mt-7 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label>Nome</Label>
                    <Input
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Como devemos chamar você?"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                  />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <Label>Senha</Label>
                    <Input
                      required
                      minLength={6}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                    />
                  </div>
                )}
                {error && (
                  <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button className="w-full" type="submit" disabled={busy}>
                  {busy
                    ? "Aguarde…"
                    : mode === "login"
                      ? "Entrar"
                      : mode === "signup"
                        ? "Criar conta"
                        : "Enviar link"}
                  <ArrowRight />
                </Button>
                {mode === "signup" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Ao criar sua conta, você concorda com os{" "}
                    <Link to="/termos" className="text-primary hover:underline">
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link to="/privacidade" className="text-primary hover:underline">
                      Política de Privacidade
                    </Link>
                    .
                  </p>
                )}
              </form>
              {mode !== "forgot" && (
                <>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    ou
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button variant="outline" className="w-full" onClick={google}>
                    Continuar com Google
                  </Button>
                </>
              )}
              <div className="mt-6 flex justify-between text-sm">
                <button
                  className="text-primary hover:underline"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? "Criar uma conta" : "Já tenho uma conta"}
                </button>
                {mode === "login" && (
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setMode("forgot")}
                  >
                    Esqueci a senha
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
