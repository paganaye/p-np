import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    // Relative asset paths, so the build works from any sub-path
    // (e.g. https://paganaye.github.io/p-np/).
    base: "./",
    plugins: [tailwindcss()],
});
