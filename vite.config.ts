import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Pré-bundle das libs pesadas → reduz cascata de centenas de requests no dev
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@supabase/supabase-js",
      "@tanstack/react-query",
      "lucide-react",
      "framer-motion",
      "recharts",
      "date-fns",
      "sonner",
      "clsx",
      "tailwind-merge",
    ],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Isola libs pesadas em chunks próprios. Evita que rotas que importam
        // qualquer dashboard ou export arrastem recharts/framer-motion/xlsx/jspdf
        // para o chunk inicial da página.
        manualChunks: {
          "vendor-recharts": ["recharts"],
          "vendor-motion": ["framer-motion"],
          "vendor-xlsx": ["xlsx"],
          "vendor-jspdf": ["jspdf", "jspdf-autotable"],
          "vendor-emoji": ["emoji-picker-react"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
}));
