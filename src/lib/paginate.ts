export const PAGE_SIZE_OPTIONS = [10, 30, 100] as const;

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * pageSize;
  return { slice: items.slice(start, start + pageSize), page: clampedPage, totalPages };
}
