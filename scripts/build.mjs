import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile, mergeConfig } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const loadedConfig = await loadConfigFromFile(
  {
    command: "build",
    mode: "production",
  },
  resolve(projectRoot, "vite.config.ts"),
);
const baseConfig = loadedConfig?.config ?? {};

await build(
  mergeConfig(baseConfig, {
    build: {
      ...baseConfig.build,
      outDir: "dist",
      emptyOutDir: true,
      copyPublicDir: true,
    },
  }),
);

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(projectRoot, "src/content/index.ts"),
      name: "WikeepContentScript",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(projectRoot, "src/content/pageWorldProbe.ts"),
      name: "WikeepPageWorldProbe",
      formats: ["iife"],
      fileName: () => "pageWorldProbe.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
