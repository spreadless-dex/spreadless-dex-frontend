import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Docs content lives as MDX under src/content/docs/**. Ordering and section
// grouping in the sidebar come from src/lib/docs-nav.ts — the frontmatter here
// only carries per-page metadata (title/description shown in the page header
// and <head>), so the two never fight over navigation as the source of truth.
const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    /** Optional short label for the sidebar/prev-next when the title is long. */
    navLabel: z.string().optional(),
  }),
});

export const collections = { docs };
