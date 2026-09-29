// The site content for a page. `nuxi generate` fetches it once per page and
// bakes it into the HTML and payload, so a visitor sees the text with no
// request at all. After hydration the browser fetches the live document once
// per visit and swaps it in only when its version differs, so a publish from
// the dashboard shows up on the next visit without a rebuild.
import { computed, onMounted } from "vue";
import { contentUrl, fetchContent, type ContentDoc } from "@/data/content";

// Client only: the newest document seen this visit. Later page navigations
// reuse it instead of the build-time snapshot.
let latest: ContentDoc | null = null;
let revalidated = false;

export function useContent() {
  const base = useRuntimeConfig().public.firestoreEmulator || undefined;

  // Start the live-content check while the scripts download. Same URL and
  // credentials mode as fetchContent(), so the browser reuses the response.
  useHead({
    link: [
      { rel: "preconnect", href: new URL(contentUrl(base)).origin },
      {
        rel: "preload",
        as: "fetch",
        crossorigin: "anonymous",
        href: contentUrl(base),
      },
    ],
  });

  const { data, error } = useAsyncData("content", () => fetchContent(base), {
    getCachedData: (key, nuxtApp) =>
      latest ??
      (nuxtApp.isHydrating
        ? nuxtApp.payload.data[key]
        : nuxtApp.static.data[key]),
  });

  // A build with no content would ship an empty site: fail it instead.
  if (import.meta.prerender) {
    onServerPrefetch(async () => {
      if (error.value)
        throw createError({
          statusCode: 500,
          statusMessage: `Content unavailable: ${error.value.message}`,
        });
    });
  }

  onMounted(async () => {
    if (revalidated) return;
    revalidated = true;
    try {
      const fresh = await fetchContent(base);
      latest = fresh;
      if (fresh.version !== data.value?.version) data.value = fresh;
    } catch {
      // Offline or blocked: the baked-in copy is still on screen.
    }
  });

  const content = computed(() => data.value?.content ?? null);
  return {
    content,
    version: computed(() => data.value?.version ?? 0),
    ready: computed(() => !!data.value),
    error: computed(() => error.value?.message ?? ""),
    published: computed(() => content.value?.published ?? null),
    timeline: computed(() => content.value?.timeline ?? null),
    projects: computed(() => content.value?.projects ?? []),
  };
}
