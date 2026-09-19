import { toast } from "sonner";

// Tamanho do lote pra alterações em massa (Lançamentos e Conciliação): evita
// mandar uma única atualização gigante de uma vez só, que pesaria no banco
// quando o usuário seleciona centenas de registros.
export const BULK_BATCH_SIZE = 20;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Toast persistente com o andamento de uma operação em lote — só aparece
// quando o total passa de BULK_BATCH_SIZE, pra não incomodar em seleções
// pequenas que resolvem numa tacada só.
export function batchProgress(label: string, total: number) {
  const id = total > BULK_BATCH_SIZE ? toast.loading(`${label} 0/${total}…`) : undefined;
  return {
    update(done: number) {
      if (id !== undefined) toast.loading(`${label} ${done}/${total}…`, { id });
    },
    dismiss() {
      if (id !== undefined) toast.dismiss(id);
    },
  };
}
