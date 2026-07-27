// Medical vertical was removed. This stub keeps existing call sites compiling;
// vertical is always 'standard' now.
export function useCompanyVertical() {
  return { data: 'standard' as const, isLoading: false };
}
