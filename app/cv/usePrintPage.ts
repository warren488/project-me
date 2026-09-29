import { useHead } from "#imports";

// @page rules are global and can't be scoped to a component, so each CV
// layout installs its own while mounted (useHead removes it on unmount).
// Only one layout is ever on screen, so the one being printed always wins.
export function usePrintPage(rule: string) {
  useHead({ style: [{ innerHTML: `@media print { @page { ${rule} } }` }] });
}
