// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            output: {
              // Keep every dependency in a single vendor chunk. The default
              // per-library splitting created circular chunk imports, so the
              // shared CJS helper was still undefined when a chunk evaluated
              // ("__commonJSMin is not a function" → every page 500ed).
              advancedChunks: {
                groups: [{ name: "vendor", test: /node_modules/, priority: 100 }],
              },
            },
          },
        },
      },
    },
  },
});

