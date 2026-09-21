import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Send, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { interpretDashboardRequest } from "@/lib/dashboard-assistant.functions";
import { DEFAULT_WIDGET_ORDER, WIDGET_LABELS, type WidgetId } from "@/lib/dashboard-widgets";
import { cn } from "@/lib/utils";

type ChatEntry = { role: "user" | "assistant"; text: string };

// Botão "Personalizar" do Dashboard: deixa escolher manualmente quais
// painéis aparecem e em que ordem, ou pedir em texto livre pro assistente
// (Anthropic, mesma integração já usada na categorização por Telegram)
// montar do jeito pedido. `order` só lista os painéis visíveis, na ordem —
// o que não está na lista fica escondido.
export function DashboardCustomizer({
  order,
  onChange,
}: {
  order: WidgetId[];
  onChange: (next: WidgetId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const displayList: WidgetId[] = [
    ...order,
    ...DEFAULT_WIDGET_ORDER.filter((id) => !order.includes(id)),
  ];

  function toggle(id: WidgetId, checked: boolean) {
    onChange(checked ? [...order, id] : order.filter((x) => x !== id));
  }
  function move(id: WidgetId, dir: -1 | 1) {
    const idx = order.indexOf(id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[newIdx]] = [next[newIdx] as WidgetId, next[idx] as WidgetId];
    onChange(next);
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text) return;
    setAsking(true);
    setHistory((h) => [...h, { role: "user", text }]);
    setQuestion("");
    try {
      const result = await interpretDashboardRequest({ data: { text, currentOrder: order } });
      onChange(result.order);
      setHistory((h) => [...h, { role: "assistant", text: result.reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui entender o pedido.";
      toast.error(message);
      setHistory((h) => [...h, { role: "assistant", text: `⚠️ ${message}` }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Personalizar dashboard</DialogTitle>
          <DialogDescription>
            Escolha quais painéis aparecem e em que ordem, ou peça pro assistente montar do jeito
            que você quiser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
            <Sparkles className="size-3.5" />
            Assistente
          </p>
          {history.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto text-sm">
              {history.map((entry, i) => (
                <p
                  key={i}
                  className={entry.role === "user" ? "font-medium" : "text-muted-foreground"}
                >
                  {entry.role === "user" ? "Você: " : "Assistente: "}
                  {entry.text}
                </p>
              ))}
            </div>
          )}
          <form onSubmit={(e) => void handleAsk(e)} className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='Ex.: "mostra só orçamento e previsões, nessa ordem"'
              disabled={asking}
            />
            <Button type="submit" size="icon" disabled={asking || !question.trim()}>
              {asking ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Painéis</p>
          {displayList.map((id) => {
            const visible = order.includes(id);
            const idx = order.indexOf(id);
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  !visible && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={visible}
                  onChange={(e) => toggle(id, e.target.checked)}
                />
                <span className="flex-1">{WIDGET_LABELS[id]}</span>
                {visible && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={idx === 0}
                      aria-label="Mover pra cima"
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={idx === order.length - 1}
                      aria-label="Mover pra baixo"
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={() => onChange(DEFAULT_WIDGET_ORDER)}>
          Restaurar padrão
        </Button>
      </DialogContent>
    </Dialog>
  );
}
