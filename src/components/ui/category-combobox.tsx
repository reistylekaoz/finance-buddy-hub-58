import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { triggerClass } from "@/components/ui/filters";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Tables"]["categories"]["Row"];

// Combobox com busca (em vez de <select> nativo): categorias sempre em
// ordem alfabética pelo caminho completo (ex.: "Casa › Reforma"), com um
// campo de texto que filtra a lista em tempo real.
export function CategoryCombobox({
  categories,
  categoryPath,
  value,
  onValueChange,
  placeholder,
  emptyOptionLabel,
  filter,
  disabled,
}: {
  categories: Category[];
  categoryPath: (id: string | null) => string;
  value: string;
  onValueChange: (categoryId: string) => void;
  placeholder: string;
  emptyOptionLabel?: string;
  filter?: (category: Category) => boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    const list = filter ? categories.filter(filter) : categories;
    return [...list].sort((a, b) => categoryPath(a.id).localeCompare(categoryPath(b.id), "pt-BR"));
  }, [categories, filter, categoryPath]);
  const label = value ? categoryPath(value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            triggerClass,
            "justify-between disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria…" />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {emptyOptionLabel && (
                <CommandItem
                  value={emptyOptionLabel}
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                  {emptyOptionLabel}
                </CommandItem>
              )}
              {options.map((category) => (
                <CommandItem
                  key={category.id}
                  value={categoryPath(category.id)}
                  onSelect={() => {
                    onValueChange(category.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", value === category.id ? "opacity-100" : "opacity-0")}
                  />
                  {categoryPath(category.id)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
