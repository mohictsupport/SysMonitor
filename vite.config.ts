import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
  },
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "tanstack-vendor": [
            "@tanstack/react-query",
            "@tanstack/react-router",
          ],
          "ui-vendor": ["lucide-react", "sonner"],
          "firebase-vendor": ["firebase/app", "firebase/firestore", "firebase/auth"],
          "pdf-vendor": ["jspdf", "jspdf-autotable"],
          "charts-vendor": ["recharts"],
          "radix-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-select",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slot",
            "@radix-ui/react-label",
            "@radix-ui/react-progress",
            "@radix-ui/react-switch",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-slider",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-accordion",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
