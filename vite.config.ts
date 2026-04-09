import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const inlineInitialCss = () => ({
  name: "inline-initial-css",
  apply: "build" as const,
  enforce: "post" as const,
  generateBundle(_: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
    const htmlAsset = Object.values(bundle).find(
      (asset) => asset.type === "asset" && asset.fileName === "index.html",
    );

    if (!htmlAsset || typeof htmlAsset.source !== "string") {
      return;
    }

    let html = htmlAsset.source;

    Object.values(bundle)
      .filter((asset) => asset.type === "asset" && asset.fileName.endsWith(".css"))
      .forEach((cssAsset) => {
        const hrefVariants = [
          `href="/${cssAsset.fileName}"`,
          `href="./${cssAsset.fileName}"`,
          `href="${cssAsset.fileName}"`,
        ];

        const linkTag = html
          .split("\n")
          .find((line) => line.includes("<link") && hrefVariants.some((href) => line.includes(href)));

        if (!linkTag) {
          return;
        }

        const cssSource = typeof cssAsset.source === "string"
          ? cssAsset.source
          : Buffer.from(cssAsset.source ?? "").toString("utf-8");

        html = html.replace(linkTag, `<style>${cssSource.replace(/<\/style>/g, "<\\/style>")}</style>`);
        delete bundle[cssAsset.fileName];
      });

    htmlAsset.source = html;
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
  plugins: [react(), inlineInitialCss(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
