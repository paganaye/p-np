import { defineConfig } from "vitest/config";

/**
 * Kept separate from `vite.config.ts` on purpose: the tests are pure
 * computation, they never import CSS, so they have no business pulling the
 * Tailwind plugin into a Node run.
 */
export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
});
