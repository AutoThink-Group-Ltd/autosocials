import { defineConfig } from "vitest/config";

/** Focused Edge Function checks use Node Web Crypto, without the browser setup. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/functions/_shared/youtube*.test.ts", "supabase/functions/publish-scheduled-posts/youtube.test.ts", "src/test/publish-delivery.test.ts"],
  },
});
