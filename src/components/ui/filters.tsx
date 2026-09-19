import { useState } from "react";
import { CalendarRange, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const triggerClass =
  "flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring";

export type FilterOption = { id: string; label: string };

// Popover + Command (mesmo padrão do CategoryCombobox da Conciliação): busca
// em tempo real na lista, com checkbox por item pra permitir marcar vários
// de uma vez sem fechar o menu a cada clique.
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Buscar…",
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const triggerLabel =
    selected.size === 0
      ? label
      : selected.size === 1
        ? (options.find((o) => selected.has(o.id))?.label ?? label)
        : `${label} (${selected.size})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(triggerClass, selected.size > 0 && "border-primary text-primary")}
        >
          <span className="max-w-[160px] truncate">{triggerLabel}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(280px,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {selected.size > 0 && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => onChange(new Set())}
                  className="text-muted-foreground"
                >
                  Limpar seleção
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.label}
                  onSelect={() => toggle(option.id)}
                >
                  <Check
                    className={cn("size-4", selected.has(option.id) ? "opacity-100" : "opacity-0")}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type Period = { from: string; to: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    from || to
      ? `${from ? from.split("-").reverse().join("/") : "…"} – ${to ? to.split("-").reverse().join("/") : "…"}`
      : "Período";

  function preset(kind: "month" | "lastMonth" | "last30" | "year") {
    const today = new Date();
    let start: Date;
    let end = today;
    if (kind === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (kind === "lastMonth") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (kind === "year") {
      start = new Date(today.getFullYear(), 0, 1);
    } else {
      start = new Date(today);
      start.setDate(start.getDate() - 30);
    }
    onChange({ from: isoDate(start), to: isoDate(end) });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(triggerClass, (from || to) && "border-primary text-primary")}
        >
          <CalendarRange className="size-3.5 shrink-0 opacity-50" />
          <span className="max-w-[180px] truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(300px,90vw)] space-y-3 p-3" align="start">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => preset("month")}>
            Este mês
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => preset("lastMonth")}>
            Mês passado
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => preset("last30")}>
            Últimos 30 dias
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => preset("year")}>
            Este ano
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            De
            <input
              type="date"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              value={from}
              onChange={(e) => onChange({ from: e.target.value, to })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Até
            <input
              type="date"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              value={to}
              onChange={(e) => onChange({ from, to: e.target.value })}
            />
          </label>
        </div>
        {(from || to) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onChange({ from: "", to: "" })}
          >
            Limpar período
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
