<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { INLINE_EDIT } from "@/cv/inlineEdit";
import type { TextSource } from "@/cv/inlineEdit";

// One piece of text on a CV. On the site it is plain markup. In the
// dashboard's preview, where an editor is provided and the text has a
// source, it can be typed into: the sheet reflows as it changes and the
// editor stores the result.
const props = withDefaults(
  defineProps<{
    tag?: string;
    value?: string;
    html?: boolean; // the text carries inline markup (bullets, the summary)
    src?: TextSource;
  }>(),
  { tag: "span", value: "", src: undefined }
);

const editor = inject(INLINE_EDIT, null);

// Static markup binds `innerHTML`, which is what v-html compiles to: the
// linter won't have v-html on <component>, though with a tag name it is an
// ordinary element.

const mode = computed(() => {
  const src = props.src;
  if (!editor?.enabled.value || !src) return "static";
  return src.kind === "open" || src.kind === "profile" ? "open" : "edit";
});
// A line that doesn't exist yet: it is created when the field is left.
const isNew = computed(() => props.src?.kind === "line" && !props.src.line.id);

const el = ref<HTMLElement | null>(null);
let focused = false;
let started = false; // stored once since focus arrived
let pending = false; // typed in since it was last stored
let shown = ""; // what the element was last given
let before = ""; // what it held when focus arrived, for Escape
let timer: number | undefined;

const read = () =>
  (props.html ? el.value?.innerHTML : el.value?.textContent) ?? "";

function show(text: string) {
  shown = text;
  if (!el.value) return;
  if (props.html) el.value.innerHTML = text;
  else el.value.textContent = text;
}

// The element owns its content while focused, so a preview refresh can't
// move the caret or undo what is being typed.
watch(
  [el, () => props.value],
  () => {
    if (!focused) show(props.value);
  },
  { flush: "post" }
);

// A new line takes the focus as it appears (in the copy that is on screen).
watch(
  [el, isNew],
  () => {
    if (isNew.value && el.value?.offsetParent) el.value.focus();
  },
  { flush: "post" }
);

// Hands the text to the editor and remembers what it kept. `exact` puts
// the text from before the edit back as it was.
function store(exact = false) {
  window.clearTimeout(timer);
  pending = false;
  if (!editor || !props.src) return;
  shown = editor.commit(props.src, exact ? before : read(), exact);
}

function onFocus() {
  focused = true;
  started = false;
  pending = false;
  before = shown;
  if (props.src) editor?.focus(props.src);
}

function onBlur() {
  if (pending || isNew.value) store();
  focused = false;
  show(shown);
  editor?.focus(null);
}

// The first keystroke is stored at once (so the dashboard knows there is
// something to save), the rest when typing pauses. A new line waits until
// it is left, when its id can be made from the whole text.
function onInput() {
  editor?.typing();
  pending = true;
  if (isNew.value) return;
  if (!started) {
    store();
    // A keystroke that changed nothing worth storing (a space) doesn't count.
    started = shown !== before;
  } else {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => store(), 300);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    show(before);
    if (!isNew.value) store(true);
    el.value?.blur();
  } else if (event.key === "Enter") {
    // One line per field. In a bullet, Enter starts the next one.
    event.preventDefault();
    const src = props.src;
    if (src?.kind !== "line") return el.value?.blur();
    store();
    if (shown) editor?.addAfter(src);
    else el.value?.blur();
  }
}

// Pasted text arrives as plain text, whatever it was copied from.
function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text.replace(/\s+/g, " "));
}

function onOpen() {
  if (props.src) editor?.open(props.src);
}

onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <component
    :is="tag"
    v-if="mode === 'edit'"
    ref="el"
    class="cv-edit"
    :class="{ 'is-new': isNew }"
    :contenteditable="html ? 'true' : 'plaintext-only'"
    spellcheck="true"
    @focus="onFocus"
    @blur="onBlur"
    @input="onInput"
    @keydown="onKeydown"
    @paste="onPaste"
  />
  <component :is="tag" v-else-if="html" v-bind="{ innerHTML: value }" />
  <component
    :is="tag"
    v-else
    :class="mode === 'open' ? 'cv-open' : undefined"
    :title="mode === 'open' ? 'Click to edit' : undefined"
    v-on="mode === 'open' ? { click: onOpen } : {}"
    >{{ value }}</component
  >
</template>

<style scoped>
/* Only the dashboard ever sets these classes, and never on paper. */
@media screen {
  .cv-edit {
    outline: 1px dashed transparent;
    outline-offset: 2px;
    border-radius: 2px;
    cursor: text;
  }

  .cv-edit:hover {
    outline-color: color-mix(in srgb, currentColor 45%, transparent);
  }

  .cv-edit:focus {
    outline: 2px solid #f59e0b;
  }

  .cv-edit.is-new:empty::after {
    content: "New bullet";
    opacity: 0.45;
  }

  .cv-open {
    cursor: pointer;
  }

  .cv-open:hover {
    outline: 1px dashed color-mix(in srgb, currentColor 45%, transparent);
    outline-offset: 2px;
  }
}
</style>
