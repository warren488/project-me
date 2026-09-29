// Per-page <title>, description, canonical URL, link-preview and robots
// tags, rendered into the generated HTML. Site-wide tags live in
// nuxt.config.ts; the copy lives in data/site.ts.
import { pageMeta, site } from "@/data/site";

export function usePageMeta(key: keyof typeof pageMeta) {
  const meta = pageMeta[key] ?? pageMeta.home!;
  const path = useRoute().path;
  const url = `${site.url}${path === "/" ? "/" : path}`;
  useSeoMeta({
    title: meta.title,
    description: meta.description,
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogUrl: url,
    ogType: meta.ogType ?? "website",
    twitterTitle: meta.title,
    twitterDescription: meta.description,
    robots: meta.noindex ? "noindex,follow" : "index,follow",
  });
  if (!meta.noindex) useHead({ link: [{ rel: "canonical", href: url }] });
}
