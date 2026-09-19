import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Pager } from "@/components/ui/pager";
import { batchProgress, BULK_BATCH_SIZE } from "@/lib/batch";
import { paginate } from "@/lib/paginate";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Account = Database["public"]["Tables"]["accounts"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type CardTransactionRow = Database["public"]["Tables"]["credit_card_transactions"]["Row"];
type CreditCardRow = Database["public"]["Tables"]["credit_cards"]["Row"];

type PendingEdit = { category_id: string; cost_center_id: string; reconcile_with: string };
const emptyEdit: PendingEdit = { category_id: "", cost_center_id: "", reconcile_with: "" };

export type ParsedRow = {
  key: string;
  date: string;
  description: string;
  amount: number;
  fitid: string | null;
  selected: boolean;
  duplicate: boolean;
  category_id: string;
  cost_center_id: string;
  reconcile_with: string;
};

function daysBetween(a: string, b: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / msPerDay,
  );
}

function matchScore(row: { date: string; amount: number }, provision: TransactionRow) {
  const amountAbs = Math.abs(row.amount);
  const amountDiff = Math.abs(amountAbs - provision.amount);
  const tolerance = Math.max(1, provision.amount * 0.05);
  if (amountDiff > tolerance) return null;
  const dateDiff = Math.abs(daysBetween(row.date, provision.transaction_date));
  if (dateDiff > 60) return null;
  return amountDiff * 100 + dateDiff;
}

function guessReconciliations(
  rows: { date: string; amount: number }[],
  provisions: TransactionRow[],
): string[] {
  const claimed = new Set<string>();
  return rows.map((row) => {
    let best: TransactionRow | null = null;
    let bestScore = Infinity;
    for (const provision of provisions) {
      if (claimed.has(provision.id)) continue;
      if (provision.transaction_type !== (row.amount >= 0 ? "income" : "expense")) continue;
      const score = matchScore(row, provision);
      if (score !== null && score < bestScore) {
        bestScore = score;
        best = provision;
      }
    }
    if (best) claimed.add(best.id);
    return best?.id ?? "";
  });
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring";

function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  let match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})[/\-.](\d{2})[/\-.](\d{4})/.exec(value);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = /^(\d{2})[/\-.](\d{2})[/\-.](\d{2})$/.exec(value);
  if (match) return `20${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function normalizeAmount(raw: string): number | null {
  let value = raw.replace(/\s|R\$|"/g, "").trim();
  if (!value) return null;
  const negative = /^\(.*\)$/.test(value) || value.startsWith("-");
  value = value.replace(/[()\-+]/g, "");
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseOfx(text: string) {
  const rows: { date: string; description: string; amount: number; fitid: string | null }[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const tag = (name: string) => {
      const found = new RegExp(`<${name}>([^<\r\n]*)`, "i").exec(block);
      return found?.[1]?.trim() ?? "";
    };
    const date = normalizeDate(tag("DTPOSTED"));
    const amount = normalizeAmount(tag("TRNAMT"));
    if (!date || amount === null) continue;
    const description = tag("MEMO") || tag("NAME") || tag("TRNTYPE") || "Lançamento importado";
    rows.push({ date, description, amount, fitid: tag("FITID") || null });
  }
  return rows;
}

function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out.map((cell) => cell.trim());
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const first = lines[0] ?? "";
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const strip = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const header = splitCsvLine(first, delimiter).map(strip);
  const findIndex = (terms: string[]) =>
    header.findIndex((cell) => terms.some((term) => cell.includes(term)));
  let dateIndex = findIndex(["data", "date"]);
  let amountIndex = findIndex(["valor", "amount", "montante"]);
  let descIndex = findIndex([
    "descricao",
    "historico",
    "title",
    "lancamento",
    "memo",
    "estabelecimento",
  ]);
  const idIndex = findIndex(["identificador", "id"]);
  const body = dateIndex >= 0 && amountIndex >= 0 ? lines.slice(1) : lines;
  if (dateIndex < 0 || amountIndex < 0) {
    const sample = splitCsvLine(first, delimiter);
    dateIndex = sample.findIndex((cell) => normalizeDate(cell) !== null);
    amountIndex = sample.findIndex(
      (cell, index) => index !== dateIndex && normalizeAmount(cell) !== null,
    );
    descIndex = sample.findIndex(
      (cell, index) => index !== dateIndex && index !== amountIndex && cell.length > 2,
    );
  }
  const rows: { date: string; description: string; amount: number; fitid: string | null }[] = [];
  for (const line of body) {
    const cells = splitCsvLine(line, delimiter);
    const date = dateIndex >= 0 ? normalizeDate(cells[dateIndex] ?? "") : null;
    const amount = amountIndex >= 0 ? normalizeAmount(cells[amountIndex] ?? "") : null;
    if (!date || amount === null || amount === 0) continue;
    rows.push({
      date,
      description: (descIndex >= 0 ? cells[descIndex] : "") || "Lançamento importado",
      amount,
      fitid: idIndex >= 0 ? cells[idIndex] || null : null,
    });
  }
  return rows;
}

export function StatementImport({
  accounts,
  categories,
  costCenters,
  categoryPath,
  provisions,
  pendingBankTransactions,
  onImported,
}: {
  accounts: Account[];
  categories: Category[];
  costCenters: CostCenter[];
  categoryPath: (id: string | null) => string;
  provisions: TransactionRow[];
  pendingBankTransactions: TransactionRow[];
  onImported: () => void;
}) {
  const manualAccounts = useMemo(() => accounts.filter((a) => !a.bank_connection_id), [accounts]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(manualAccounts[0]?.id ?? "");

  const [cards, setCards] = useState<CreditCardRow[]>([]);
  const [pendingCardTxs, setPendingCardTxs] = useState<CardTransactionRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [bankEdits, setBankEdits] = useState<Record<string, PendingEdit>>({});
  const [cardEdits, setCardEdits] = useState<Record<string, PendingEdit>>({});
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [bankPage, setBankPage] = useState(0);
  const [bankPageSize, setBankPageSize] = useState<number>(30);
  const [cardPage, setCardPage] = useState(0);
  const [cardPageSize, setCardPageSize] = useState<number>(30);
  const [ofxPage, setOfxPage] = useState(0);
  const [ofxPageSize, setOfxPageSize] = useState<number>(30);
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  function toggleId(current: Set<string>, id: string, checked: boolean): Set<string> {
    const next = new Set(current);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  }
  function toggleIds(current: Set<string>, ids: string[], checked: boolean): Set<string> {
    const next = new Set(current);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    return next;
  }

  // Categoria/centro de custo escolhidos na caixa de aplicação em massa só
  // ficam "de prontidão" — nada é gravado em bankEdits/cardEdits/rows até o
  // usuário clicar em "Confirmar", em vez de aplicar no instante em que
  // escolhe cada campo.
  const [bulkBankCategoryId, setBulkBankCategoryId] = useState("");
  const [bulkBankCostCenterId, setBulkBankCostCenterId] = useState("");
  const [bulkCardCategoryId, setBulkCardCategoryId] = useState("");
  const [bulkCardCostCenterId, setBulkCardCostCenterId] = useState("");
  const [bulkOfxCategoryId, setBulkOfxCategoryId] = useState("");
  const [bulkOfxCostCenterId, setBulkOfxCostCenterId] = useState("");

  // Aplica só nas linhas marcadas com a caixinha (a lista inteira pode ter
  // centenas de itens espalhados por várias páginas — a seleção continua
  // marcada ao trocar de página).
  function confirmBulkBank() {
    if (!bulkBankCategoryId && !bulkBankCostCenterId) {
      toast.error("Escolha uma categoria e/ou um centro de custo antes de confirmar.");
      return;
    }
    let applied = 0;
    setBankEdits((current) => {
      const next = { ...current };
      for (const row of pendingBankTransactions) {
        if (!selectedBankIds.has(row.id)) continue;
        // linhas marcadas pra conciliar com uma provisão não usam categoria
        // própria (herdam da provisão), então ficam de fora do "aplicar aos selecionados".
        if ((current[row.id] ?? emptyEdit).reconcile_with) continue;
        next[row.id] = {
          ...(next[row.id] ?? emptyEdit),
          ...(bulkBankCategoryId ? { category_id: bulkBankCategoryId } : {}),
          ...(bulkBankCostCenterId ? { cost_center_id: bulkBankCostCenterId } : {}),
        };
        applied += 1;
      }
      return next;
    });
    if (applied) {
      toast.success(`Aplicado a ${applied} lançamento${applied === 1 ? "" : "s"}.`);
      setBulkBankCategoryId("");
      setBulkBankCostCenterId("");
    } else {
      toast.error(
        "Nenhum lançamento selecionado recebeu a alteração (os marcados para conciliar usam a categoria da provisão).",
      );
    }
  }
  function confirmBulkCards() {
    if (!bulkCardCategoryId && !bulkCardCostCenterId) {
      toast.error("Escolha uma categoria e/ou um centro de custo antes de confirmar.");
      return;
    }
    let applied = 0;
    setCardEdits((current) => {
      const next = { ...current };
      for (const row of pendingCardTxs) {
        if (!selectedCardIds.has(row.id)) continue;
        next[row.id] = {
          ...(next[row.id] ?? emptyEdit),
          ...(bulkCardCategoryId ? { category_id: bulkCardCategoryId } : {}),
          ...(bulkCardCostCenterId ? { cost_center_id: bulkCardCostCenterId } : {}),
        };
        applied += 1;
      }
      return next;
    });
    if (applied) {
      toast.success(`Aplicado a ${applied} compra${applied === 1 ? "" : "s"}.`);
      setBulkCardCategoryId("");
      setBulkCardCostCenterId("");
    } else {
      toast.error("Nenhuma compra selecionada.");
    }
  }

  async function loadPendingCards() {
    setPendingLoading(true);
    const [cardRows, cardTxRows] = await Promise.all([
      supabase.from("credit_cards").select("*"),
      supabase
        .from("credit_card_transactions")
        .select("*")
        .eq("source", "api")
        .is("reviewed_at", null)
        .order("purchase_date", { ascending: false }),
    ]);
    setCards(cardRows.data ?? []);
    setPendingCardTxs(cardTxRows.data ?? []);
    setPendingLoading(false);
  }
  useEffect(() => {
    void loadPendingCards();
  }, []);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const chosen = rows.filter((row) => row.selected);
    return {
      count: chosen.length,
      income: chosen.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0),
      expense: chosen.filter((r) => r.amount < 0).reduce((sum, r) => sum - r.amount, 0),
      duplicates: rows.filter((r) => r.duplicate).length,
      reconciled: chosen.filter((r) => r.reconcile_with).length,
    };
  }, [rows]);

  const handleFile = async (file: File) => {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (!accountId) throw new Error("Escolha primeiro em qual conta os lançamentos entram.");
      const text = await file.text();
      const isOfx = /\.ofx$/i.test(file.name) || /<STMTTRN>/i.test(text);
      const parsed = isOfx ? parseOfx(text) : parseCsv(text);
      if (!parsed.length)
        throw new Error(
          "Não encontrei lançamentos nesse arquivo. Baixe o extrato em OFX ou CSV direto no aplicativo do banco.",
        );
      const keys = parsed.map(
        (row) =>
          `${accountId}:${row.fitid ?? `${row.date}|${row.amount.toFixed(2)}|${row.description.slice(0, 40)}`}`,
      );
      const { data: existing } = await supabase
        .from("transactions")
        .select("external_id")
        .in("external_id", keys);
      const seen = new Set(
        (existing ?? []).map((row: { external_id: string | null }) => row.external_id),
      );
      const candidatePool = provisions.filter(
        (p) => p.account_id === accountId && p.transaction_type !== "transfer",
      );
      const guesses = guessReconciliations(parsed, candidatePool);
      setRows(
        parsed.map((row, index) => {
          const key = keys[index] as string;
          const duplicate = seen.has(key);
          return {
            ...row,
            key,
            duplicate,
            selected: !duplicate,
            category_id: "",
            cost_center_id: "",
            reconcile_with: duplicate ? "" : (guesses[index] ?? ""),
          };
        }),
      );
      setFileName(file.name);
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : "Não consegui ler esse arquivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const patch = (key: string, next: Partial<ParsedRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
  function confirmBulkOfx() {
    if (!bulkOfxCategoryId && !bulkOfxCostCenterId) {
      toast.error("Escolha uma categoria e/ou um centro de custo antes de confirmar.");
      return;
    }
    const applied = rows.filter((row) => row.selected).length;
    setRows((current) =>
      current.map((row) =>
        row.selected
          ? {
              ...row,
              ...(bulkOfxCategoryId ? { category_id: bulkOfxCategoryId } : {}),
              ...(bulkOfxCostCenterId ? { cost_center_id: bulkOfxCostCenterId } : {}),
            }
          : row,
      ),
    );
    if (applied) {
      toast.success(`Aplicado a ${applied} lançamento${applied === 1 ? "" : "s"}.`);
      setBulkOfxCategoryId("");
      setBulkOfxCostCenterId("");
    } else {
      toast.error("Nenhum lançamento selecionado.");
    }
  }

  const candidatePool = useMemo(
    () => provisions.filter((p) => p.account_id === accountId && p.transaction_type !== "transfer"),
    [provisions, accountId],
  );
  const candidatesFor = (row: ParsedRow) => {
    const usedElsewhere = new Set(
      rows.filter((r) => r.key !== row.key && r.reconcile_with).map((r) => r.reconcile_with),
    );
    return candidatePool.filter(
      (p) =>
        p.transaction_type === (row.amount >= 0 ? "income" : "expense") &&
        (!usedElsewhere.has(p.id) || p.id === row.reconcile_with),
    );
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    const chosen = rows.filter((row) => row.selected);
    if (!userId || !chosen.length) {
      setBusy(false);
      return;
    }
    const toReconcile = chosen.filter((row) => row.reconcile_with);
    const toInsertAll = chosen.filter((row) => !row.reconcile_with);
    // Sem categoria e centro de custo escolhidos, o lançamento continua na
    // lista em vez de ser importado pela metade.
    const toInsert = toInsertAll.filter((row) => row.category_id && row.cost_center_id);
    const incomplete = toInsertAll.filter((row) => !row.category_id || !row.cost_center_id);

    if (toInsert.length) {
      const payload = toInsert.map((row) => ({
        user_id: userId,
        transaction_type: (row.amount >= 0 ? "income" : "expense") as "income" | "expense",
        account_id: accountId,
        category_id: row.category_id,
        cost_center_id: row.cost_center_id,
        amount: Math.abs(row.amount),
        transaction_date: row.date,
        description: row.description.slice(0, 180),
        external_id: row.key,
        source: "import",
      }));
      const { error: insertError } = await supabase.from("transactions").insert(payload);
      if (insertError) {
        setBusy(false);
        setError(insertError.message);
        return;
      }
    }

    for (const row of toReconcile) {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "confirmed",
          transaction_date: row.date,
          amount: Math.abs(row.amount),
          external_id: row.key,
        })
        .eq("id", row.reconcile_with);
      if (updateError) {
        setBusy(false);
        setError(`Não foi possível conciliar "${row.description}": ${updateError.message}`);
        return;
      }
    }

    setBusy(false);
    setRows(incomplete);
    if (!incomplete.length) setFileName("");
    const processedCount = toInsert.length + toReconcile.length;
    const parts: string[] = [];
    if (toInsert.length) parts.push(`${toInsert.length} novo${toInsert.length === 1 ? "" : "s"}`);
    if (toReconcile.length)
      parts.push(`${toReconcile.length} conciliado${toReconcile.length === 1 ? "" : "s"}`);
    let msg = processedCount
      ? `${processedCount} lançamento${processedCount === 1 ? "" : "s"} processado${processedCount === 1 ? "" : "s"} (${parts.join(" · ")}).`
      : "";
    if (incomplete.length) {
      msg += `${msg ? " " : ""}${incomplete.length} continua${incomplete.length === 1 ? "" : "m"} pendente${incomplete.length === 1 ? "" : "s"} por falta de categoria e/ou centro de custo.`;
    }
    setMessage(msg || "Nenhum lançamento processado.");
    onImported();
  };

  function pendingCandidatesFor(row: TransactionRow): TransactionRow[] {
    const usedElsewhere = new Set(
      Object.entries(bankEdits)
        .filter(([id]) => id !== row.id)
        .map(([, edit]) => edit.reconcile_with)
        .filter(Boolean),
    );
    return provisions.filter(
      (p) =>
        p.account_id === row.account_id &&
        p.transaction_type === row.transaction_type &&
        (!usedElsewhere.has(p.id) || p.id === (bankEdits[row.id]?.reconcile_with ?? "")),
    );
  }

  async function savePendingBank() {
    setPendingBusy(true);
    setPendingMessage("");
    const processedIds = new Set<string>();
    let reviewed = 0;
    let reconciled = 0;
    let incomplete = 0;
    let done = 0;
    const progress = batchProgress("Salvando lançamentos…", pendingBankTransactions.length);
    for (const row of pendingBankTransactions) {
      const edit = bankEdits[row.id] ?? emptyEdit;
      if (edit.reconcile_with) {
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            status: "confirmed",
            transaction_date: row.transaction_date,
            amount: row.amount,
            external_id: row.external_id,
          })
          .eq("id", edit.reconcile_with);
        if (updateError) {
          progress.dismiss();
          setPendingBusy(false);
          setPendingMessage(`Erro ao conciliar "${row.description}": ${updateError.message}`);
          return;
        }
        const { error: deleteError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", row.id);
        if (deleteError) {
          progress.dismiss();
          setPendingBusy(false);
          setPendingMessage(
            `Erro ao remover duplicado "${row.description}": ${deleteError.message}`,
          );
          return;
        }
        processedIds.add(row.id);
        reconciled += 1;
      } else if (!edit.category_id || !edit.cost_center_id) {
        // Sem categoria e centro de custo escolhidos, o lançamento continua
        // pendente de revisão em vez de ser salvo pela metade.
        incomplete += 1;
      } else {
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            category_id: edit.category_id,
            cost_center_id: edit.cost_center_id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) {
          progress.dismiss();
          setPendingBusy(false);
          setPendingMessage(`Erro ao salvar "${row.description}": ${updateError.message}`);
          return;
        }
        processedIds.add(row.id);
        reviewed += 1;
      }
      done += 1;
      if (done % BULK_BATCH_SIZE === 0) progress.update(done);
    }
    progress.dismiss();
    setBankEdits((current) => {
      const next = { ...current };
      for (const id of processedIds) delete next[id];
      return next;
    });
    setSelectedBankIds((current) => new Set([...current].filter((id) => !processedIds.has(id))));
    setPendingBusy(false);
    const parts: string[] = [];
    if (reviewed) parts.push(`${reviewed} revisado${reviewed === 1 ? "" : "s"}`);
    if (reconciled) parts.push(`${reconciled} conciliado${reconciled === 1 ? "" : "s"}`);
    let msg = parts.length ? `${parts.join(" · ")}.` : "";
    if (incomplete) {
      msg += `${msg ? " " : ""}${incomplete} continua${incomplete === 1 ? "" : "m"} pendente${incomplete === 1 ? "" : "s"} por falta de categoria e/ou centro de custo.`;
    }
    setPendingMessage(msg || "Nenhum lançamento processado.");
    onImported();
  }

  async function savePendingCards() {
    setPendingBusy(true);
    setPendingMessage("");
    const processedIds = new Set<string>();
    let incomplete = 0;
    let done = 0;
    const progress = batchProgress("Salvando compras de cartão…", pendingCardTxs.length);
    for (const row of pendingCardTxs) {
      const edit = cardEdits[row.id] ?? emptyEdit;
      if (!edit.category_id || !edit.cost_center_id) {
        // Sem categoria e centro de custo escolhidos, a compra continua
        // pendente de revisão em vez de ser salva pela metade.
        incomplete += 1;
      } else {
        const { error: updateError } = await supabase
          .from("credit_card_transactions")
          .update({
            category_id: edit.category_id,
            cost_center_id: edit.cost_center_id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) {
          progress.dismiss();
          setPendingBusy(false);
          setPendingMessage(`Erro ao salvar "${row.description}": ${updateError.message}`);
          return;
        }
        processedIds.add(row.id);
      }
      done += 1;
      if (done % BULK_BATCH_SIZE === 0) progress.update(done);
    }
    progress.dismiss();
    setCardEdits((current) => {
      const next = { ...current };
      for (const id of processedIds) delete next[id];
      return next;
    });
    setSelectedCardIds((current) => new Set([...current].filter((id) => !processedIds.has(id))));
    setPendingBusy(false);
    const saved = processedIds.size;
    let msg = saved
      ? `${saved} compra${saved === 1 ? "" : "s"} de cartão revisada${saved === 1 ? "" : "s"}.`
      : "";
    if (incomplete) {
      msg += `${msg ? " " : ""}${incomplete} continua${incomplete === 1 ? "" : "m"} pendente${incomplete === 1 ? "" : "s"} por falta de categoria e/ou centro de custo.`;
    }
    setPendingMessage(msg || "Nenhuma compra processada.");
    await loadPendingCards();
  }

  const bankPaged = useMemo(
    () => paginate(pendingBankTransactions, bankPage, bankPageSize),
    [pendingBankTransactions, bankPage, bankPageSize],
  );
  const cardPaged = useMemo(
    () => paginate(pendingCardTxs, cardPage, cardPageSize),
    [pendingCardTxs, cardPage, cardPageSize],
  );
  const ofxPaged = useMemo(
    () => paginate(rows, ofxPage, ofxPageSize),
    [rows, ofxPage, ofxPageSize],
  );

  if (!accounts.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Cadastre uma conta antes de importar um extrato.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingMessage && (
        <p className="rounded-md bg-income-soft p-3 text-sm text-income">{pendingMessage}</p>
      )}

      {pendingBankTransactions.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Lançamentos bancários pendentes de revisão</h2>
              <p className="text-xs text-muted-foreground">
                Vieram da sua integração bancária. Categorize ou conclua conciliando com uma
                provisão já lançada.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedBankIds.size} selecionado{selectedBankIds.size === 1 ? "" : "s"}
              </span>
              <CategoryCombobox
                categories={categories}
                categoryPath={categoryPath}
                value={bulkBankCategoryId}
                onValueChange={setBulkBankCategoryId}
                placeholder="Categoria para os selecionados"
                disabled={!selectedBankIds.size}
              />
              <select
                className={selectClass}
                value={bulkBankCostCenterId}
                disabled={!selectedBankIds.size}
                onChange={(event) => setBulkBankCostCenterId(event.target.value)}
              >
                <option value="">Centro de custo para os selecionados</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={confirmBulkBank}
                disabled={!selectedBankIds.size || (!bulkBankCategoryId && !bulkBankCostCenterId)}
              >
                <Check />
                Confirmar
              </Button>
              <Button onClick={() => void savePendingBank()} disabled={pendingBusy}>
                {pendingBusy ? <Loader2 className="animate-spin" /> : <FileUp />}Salvar revisão
              </Button>
            </div>
          </div>
          <Pager
            total={pendingBankTransactions.length}
            page={bankPaged.page}
            totalPages={bankPaged.totalPages}
            pageSize={bankPageSize}
            onPageChange={setBankPage}
            onPageSizeChange={(size) => {
              setBankPageSize(size);
              setBankPage(0);
            }}
          />
          <div className="flex items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={
                bankPaged.slice.length > 0 &&
                bankPaged.slice.every((row) => selectedBankIds.has(row.id))
              }
              onChange={(event) =>
                setSelectedBankIds((current) =>
                  toggleIds(
                    current,
                    bankPaged.slice.map((row) => row.id),
                    event.target.checked,
                  ),
                )
              }
              aria-label="Selecionar todos nesta página"
            />
            Selecionar todos nesta página
          </div>
          <div className="divide-y divide-border">
            {bankPaged.slice.map((row) => {
              const edit = bankEdits[row.id] ?? emptyEdit;
              const candidates = pendingCandidatesFor(row);
              const matched = edit.reconcile_with
                ? provisions.find((p) => p.id === edit.reconcile_with)
                : undefined;
              const account = accounts.find((a) => a.id === row.account_id);
              return (
                <div
                  key={row.id}
                  className="grid gap-3 px-5 py-3 sm:grid-cols-[auto_1fr_auto_minmax(240px,340px)] sm:items-start"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--primary)]"
                    checked={selectedBankIds.has(row.id)}
                    onChange={(event) =>
                      setSelectedBankIds((current) =>
                        toggleId(current, row.id, event.target.checked),
                      )
                    }
                    aria-label={`Selecionar ${row.description}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{row.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.transaction_date.split("-").reverse().join("/")}
                      {account ? ` · ${account.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      row.transaction_type === "income" ? "text-income" : "text-expense",
                    )}
                  >
                    {money.format(row.transaction_type === "income" ? row.amount : -row.amount)}
                  </span>
                  <div className="flex flex-col gap-2">
                    {(candidates.length > 0 || edit.reconcile_with) && (
                      <select
                        className={selectClass}
                        value={edit.reconcile_with}
                        onChange={(event) =>
                          setBankEdits((current) => ({
                            ...current,
                            [row.id]: { ...edit, reconcile_with: event.target.value },
                          }))
                        }
                      >
                        <option value="">Manter lançamento próprio</option>
                        {candidates.map((provision) => (
                          <option key={provision.id} value={provision.id}>
                            Conciliar: {provision.description} · prev.{" "}
                            {provision.transaction_date.split("-").reverse().join("/")} ·{" "}
                            {money.format(provision.amount)}
                          </option>
                        ))}
                      </select>
                    )}
                    {matched ? (
                      <p className="text-xs text-muted-foreground">
                        Vai confirmar a provisão "{matched.description}" com esta data e valor, e
                        remover o lançamento duplicado da integração.
                      </p>
                    ) : (
                      <>
                        <CategoryCombobox
                          categories={categories}
                          categoryPath={categoryPath}
                          value={edit.category_id}
                          onValueChange={(id) =>
                            setBankEdits((current) => ({
                              ...current,
                              [row.id]: { ...edit, category_id: id },
                            }))
                          }
                          placeholder="Selecione uma categoria"
                          filter={(category) => category.category_type === row.transaction_type}
                        />
                        <select
                          className={selectClass}
                          value={edit.cost_center_id}
                          onChange={(event) =>
                            setBankEdits((current) => ({
                              ...current,
                              [row.id]: { ...edit, cost_center_id: event.target.value },
                            }))
                          }
                        >
                          <option value="">Selecione um centro de custos</option>
                          {costCenters.map((center) => (
                            <option key={center.id} value={center.id}>
                              {center.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pager
            total={pendingBankTransactions.length}
            page={bankPaged.page}
            totalPages={bankPaged.totalPages}
            pageSize={bankPageSize}
            onPageChange={setBankPage}
            onPageSizeChange={(size) => {
              setBankPageSize(size);
              setBankPage(0);
            }}
          />
        </section>
      )}

      {!pendingLoading && pendingCardTxs.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Compras de cartão pendentes de revisão</h2>
              <p className="text-xs text-muted-foreground">
                Vieram da sincronização do cartão de crédito. Só falta a categoria.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedCardIds.size} selecionado{selectedCardIds.size === 1 ? "" : "s"}
              </span>
              <CategoryCombobox
                categories={categories}
                categoryPath={categoryPath}
                value={bulkCardCategoryId}
                onValueChange={setBulkCardCategoryId}
                placeholder="Categoria para os selecionados"
                filter={(category) => category.category_type === "expense"}
                disabled={!selectedCardIds.size}
              />
              <select
                className={selectClass}
                value={bulkCardCostCenterId}
                disabled={!selectedCardIds.size}
                onChange={(event) => setBulkCardCostCenterId(event.target.value)}
              >
                <option value="">Centro de custo para os selecionados</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={confirmBulkCards}
                disabled={!selectedCardIds.size || (!bulkCardCategoryId && !bulkCardCostCenterId)}
              >
                <Check />
                Confirmar
              </Button>
              <Button onClick={() => void savePendingCards()} disabled={pendingBusy}>
                {pendingBusy ? <Loader2 className="animate-spin" /> : <FileUp />}Salvar revisão
              </Button>
            </div>
          </div>
          <Pager
            total={pendingCardTxs.length}
            page={cardPaged.page}
            totalPages={cardPaged.totalPages}
            pageSize={cardPageSize}
            onPageChange={setCardPage}
            onPageSizeChange={(size) => {
              setCardPageSize(size);
              setCardPage(0);
            }}
          />
          <div className="flex items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={
                cardPaged.slice.length > 0 &&
                cardPaged.slice.every((row) => selectedCardIds.has(row.id))
              }
              onChange={(event) =>
                setSelectedCardIds((current) =>
                  toggleIds(
                    current,
                    cardPaged.slice.map((row) => row.id),
                    event.target.checked,
                  ),
                )
              }
              aria-label="Selecionar todos nesta página"
            />
            Selecionar todos nesta página
          </div>
          <div className="divide-y divide-border">
            {cardPaged.slice.map((row) => {
              const edit = cardEdits[row.id] ?? emptyEdit;
              const card = cards.find((c) => c.id === row.card_id);
              return (
                <div
                  key={row.id}
                  className="grid gap-3 px-5 py-3 sm:grid-cols-[auto_1fr_auto_minmax(240px,340px)] sm:items-start"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--primary)]"
                    checked={selectedCardIds.has(row.id)}
                    onChange={(event) =>
                      setSelectedCardIds((current) =>
                        toggleId(current, row.id, event.target.checked),
                      )
                    }
                    aria-label={`Selecionar ${row.description}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{row.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.purchase_date.split("-").reverse().join("/")}
                      {card ? ` · ${card.name}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-expense">
                    {money.format(row.amount)}
                  </span>
                  <div className="flex flex-col gap-2">
                    <CategoryCombobox
                      categories={categories}
                      categoryPath={categoryPath}
                      value={edit.category_id}
                      onValueChange={(id) =>
                        setCardEdits((current) => ({
                          ...current,
                          [row.id]: { ...edit, category_id: id },
                        }))
                      }
                      placeholder="Selecione uma categoria"
                      filter={(category) => category.category_type === "expense"}
                    />
                    <select
                      className={selectClass}
                      value={edit.cost_center_id}
                      onChange={(event) =>
                        setCardEdits((current) => ({
                          ...current,
                          [row.id]: { ...edit, cost_center_id: event.target.value },
                        }))
                      }
                    >
                      <option value="">Selecione um centro de custos</option>
                      {costCenters.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <Pager
            total={pendingCardTxs.length}
            page={cardPaged.page}
            totalPages={cardPaged.totalPages}
            pageSize={cardPageSize}
            onPageChange={setCardPage}
            onPageSizeChange={(size) => {
              setCardPageSize(size);
              setCardPage(0);
            }}
          />
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-semibold">Importar extrato do banco</h2>
        {manualAccounts.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Baixe o extrato em OFX ou CSV no app do Nubank, C6 ou Inter e envie aqui. Lançamentos
              repetidos são identificados e ficam desmarcados. Quando um movimento bater com uma
              provisão já lançada, você pode conciliar em vez de criar um novo lançamento.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  Conta de destino
                </span>
                <select
                  className={cn(selectClass, "h-10 text-sm")}
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {manualAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}Escolher arquivo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".ofx,.csv,.txt,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </div>
            {fileName && <p className="mt-3 text-xs text-muted-foreground">Arquivo: {fileName}</p>}
            {error && (
              <p className="mt-3 rounded-md bg-destructive-soft p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p className="mt-3 rounded-md bg-income-soft p-3 text-sm text-income">{message}</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as suas contas já têm integração bancária automática — a importação manual de
            extrato fica bloqueada para elas, para não duplicar lançamentos. Cadastre uma conta sem
            integração se precisar importar um extrato manualmente.
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">
                {totals.count} de {rows.length} lançamentos selecionados
              </h2>
              <p className="text-xs text-muted-foreground">
                Entradas {money.format(totals.income)} · Saídas {money.format(totals.expense)}
                {totals.duplicates ? ` · ${totals.duplicates} já existiam` : ""}
                {totals.reconciled ? ` · ${totals.reconciled} conciliado(s) com provisão` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryCombobox
                categories={categories}
                categoryPath={categoryPath}
                value={bulkOfxCategoryId}
                onValueChange={setBulkOfxCategoryId}
                placeholder="Categoria para os selecionados"
                disabled={!totals.count}
              />
              <select
                className={selectClass}
                value={bulkOfxCostCenterId}
                disabled={!totals.count}
                onChange={(event) => setBulkOfxCostCenterId(event.target.value)}
              >
                <option value="">Centro de custo para os selecionados</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={confirmBulkOfx}
                disabled={!totals.count || (!bulkOfxCategoryId && !bulkOfxCostCenterId)}
              >
                <Check />
                Confirmar
              </Button>
              <Button onClick={() => void save()} disabled={busy || !totals.count}>
                {busy ? <Loader2 className="animate-spin" /> : <FileUp />}Importar selecionados
              </Button>
            </div>
          </div>
          <Pager
            total={rows.length}
            page={ofxPaged.page}
            totalPages={ofxPaged.totalPages}
            pageSize={ofxPageSize}
            onPageChange={setOfxPage}
            onPageSizeChange={(size) => {
              setOfxPageSize(size);
              setOfxPage(0);
            }}
          />
          <div className="flex items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={ofxPaged.slice.length > 0 && ofxPaged.slice.every((row) => row.selected)}
              onChange={(event) => {
                const checked = event.target.checked;
                const pageKeys = new Set(ofxPaged.slice.map((row) => row.key));
                setRows((current) =>
                  current.map((row) =>
                    pageKeys.has(row.key) ? { ...row, selected: checked } : row,
                  ),
                );
              }}
              aria-label="Selecionar todos nesta página"
            />
            Selecionar todos nesta página
          </div>
          <div className="divide-y divide-border">
            {ofxPaged.slice.map((row) => {
              const candidates = candidatesFor(row);
              const matched = row.reconcile_with
                ? candidatePool.find((p) => p.id === row.reconcile_with)
                : undefined;
              return (
                <div
                  key={row.key}
                  className={cn(
                    "grid gap-3 px-5 py-3 sm:grid-cols-[auto_1fr_auto_minmax(240px,340px)] sm:items-start",
                    row.duplicate && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--primary)]"
                    checked={row.selected}
                    onChange={(event) => patch(row.key, { selected: event.target.checked })}
                    aria-label={`Selecionar ${row.description}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{row.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.date.split("-").reverse().join("/")}
                      {row.duplicate ? " · já importado antes" : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      row.amount >= 0 ? "text-income" : "text-expense",
                    )}
                  >
                    {money.format(row.amount)}
                  </span>
                  <div className="flex flex-col gap-2">
                    {(candidates.length > 0 || row.reconcile_with) && (
                      <select
                        className={selectClass}
                        value={row.reconcile_with}
                        onChange={(event) => patch(row.key, { reconcile_with: event.target.value })}
                      >
                        <option value="">Criar novo lançamento</option>
                        {candidates.map((provision) => (
                          <option key={provision.id} value={provision.id}>
                            Conciliar: {provision.description} · prev.{" "}
                            {provision.transaction_date.split("-").reverse().join("/")} ·{" "}
                            {money.format(provision.amount)}
                          </option>
                        ))}
                      </select>
                    )}
                    {matched ? (
                      <p className="text-xs text-muted-foreground">
                        Vai confirmar a provisão "{matched.description}" com esta data e valor;
                        categoria e centro de custo continuam os da provisão.
                      </p>
                    ) : (
                      <>
                        <CategoryCombobox
                          categories={categories}
                          categoryPath={categoryPath}
                          value={row.category_id}
                          onValueChange={(id) => patch(row.key, { category_id: id })}
                          placeholder="Selecione uma categoria"
                          filter={(category) =>
                            category.category_type === (row.amount >= 0 ? "income" : "expense")
                          }
                        />
                        <select
                          className={selectClass}
                          value={row.cost_center_id}
                          onChange={(event) =>
                            patch(row.key, { cost_center_id: event.target.value })
                          }
                        >
                          <option value="">Selecione um centro de custos</option>
                          {costCenters.map((center) => (
                            <option key={center.id} value={center.id}>
                              {center.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pager
            total={rows.length}
            page={ofxPaged.page}
            totalPages={ofxPaged.totalPages}
            pageSize={ofxPageSize}
            onPageChange={setOfxPage}
            onPageSizeChange={(size) => {
              setOfxPageSize(size);
              setOfxPage(0);
            }}
          />
        </section>
      )}
    </div>
  );
}
