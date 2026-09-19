import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS } from "@/lib/paginate";

export function Pager({
  total,
  page,
  totalPages,
  pageSize,
  itemLabel = "lançamento",
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (!total) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
      <span>
        {total} {itemLabel}
        {total === 1 ? "" : "s"} · página {page + 1} de {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Por página
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
