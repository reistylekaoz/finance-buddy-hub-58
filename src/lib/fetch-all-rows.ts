// O PostgREST (Supabase) limita cada resposta a 1000 linhas por padrão —
// um .select("*") sem paginação corta silenciosamente o restante. Como o
// corte é pela ordenação pedida, itens mais antigos (ou mais novos, a
// depender da ordem) somem sem erro nenhum, distorcendo qualquer soma
// feita no cliente (ex.: saldo de conta) assim que o total passar de 1000
// linhas. Isso paginha até esgotar os resultados.
export async function fetchAllRows<T>(
  pageFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await pageFactory(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
