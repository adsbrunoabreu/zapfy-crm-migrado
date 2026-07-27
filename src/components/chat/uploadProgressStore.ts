// Singleton store mapping optimistic message id → upload progress (0-100).
// Allows MessageBubble to subscribe to progress without prop drilling.
import { useSyncExternalStore } from 'react';

const progressMap = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const uploadProgressStore = {
  set(id: string, value: number) {
    progressMap.set(id, Math.max(0, Math.min(100, value)));
    emit();
  },
  clear(id: string) {
    if (progressMap.delete(id)) emit();
  },
  get(id: string): number | undefined {
    return progressMap.get(id);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUploadProgress(id: string | undefined): number | undefined {
  return useSyncExternalStore(
    uploadProgressStore.subscribe,
    () => (id ? progressMap.get(id) : undefined),
    () => undefined,
  );
}
