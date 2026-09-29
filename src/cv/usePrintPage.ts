import { onBeforeUnmount, onMounted } from "vue";

// @page rules are global and can't be scoped to a component, so each CV
// layout installs its own while mounted. Only one layout is ever on screen,
// so the one being printed always wins.
export function usePrintPage(rule: string) {
  let el: HTMLStyleElement | undefined;
  onMounted(() => {
    el = document.createElement("style");
    el.textContent = `@media print { @page { ${rule} } }`;
    document.head.appendChild(el);
  });
  onBeforeUnmount(() => el?.remove());
}
