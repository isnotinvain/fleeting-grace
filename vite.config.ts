import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "node",
    server: {
      deps: {
        inline: ["quickhull3d", "get-plane-normal"],
      },
    },
  },
});
