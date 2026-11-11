/** React's native attributes allow explicit undefined; React Aria expects omission. */
export function definedProps<T extends object>(props: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result = { ...props }
  for (const key of Object.keys(result) as (keyof T)[]) {
    if (result[key] === undefined) delete result[key]
  }
  // The runtime loop above enforces the mapped type; no DOM values are coerced.
  return result as { [K in keyof T]: Exclude<T[K], undefined> }
}
