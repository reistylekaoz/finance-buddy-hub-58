export type SortKey =
  "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "description_asc" | "description_desc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "Mais recentes primeiro" },
  { value: "date_asc", label: "Mais antigos primeiro" },
  { value: "amount_desc", label: "Maior valor primeiro" },
  { value: "amount_asc", label: "Menor valor primeiro" },
  { value: "description_asc", label: "Descrição (A-Z)" },
  { value: "description_desc", label: "Descrição (Z-A)" },
];

// Genérico o bastante pra ordenar tanto lançamentos de conta (transaction_date)
// quanto de cartão (purchase_date) — quem chama só passa como acessar cada campo.
export function sortByKey<T>(
  items: T[],
  key: SortKey,
  getters: {
    date: (item: T) => string;
    amount: (item: T) => number;
    description: (item: T) => string;
  },
): T[] {
  const sorted = [...items];
  switch (key) {
    case "date_desc":
      return sorted.sort((a, b) => getters.date(b).localeCompare(getters.date(a)));
    case "date_asc":
      return sorted.sort((a, b) => getters.date(a).localeCompare(getters.date(b)));
    case "amount_desc":
      return sorted.sort((a, b) => getters.amount(b) - getters.amount(a));
    case "amount_asc":
      return sorted.sort((a, b) => getters.amount(a) - getters.amount(b));
    case "description_asc":
      return sorted.sort((a, b) =>
        getters.description(a).localeCompare(getters.description(b), "pt-BR"),
      );
    case "description_desc":
      return sorted.sort((a, b) =>
        getters.description(b).localeCompare(getters.description(a), "pt-BR"),
      );
  }
}
