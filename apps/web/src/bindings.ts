import { useSyncExternalStore, useCallback, useMemo } from 'react'
export interface Source<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
export function useSource<T>(source: Source<T>): T {
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const snapshot = useCallback(() => source.getSnapshot(), [source])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function useMediaQuery(query: string) {
  const media = useMemo(() => window.matchMedia(query), [query])
  const source = useMemo(
    () => ({
      getSnapshot: () => media.matches,
      subscribe: (listener: () => void) => {
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
      },
    }),
    [media],
  )
  return useSource(source)
}
