import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode, isPreview }) => {
  // Make .env values (STAFF_TOKEN, ENCODER_TOKEN, DATABASE_URL) visible to
  // server routes during `vite dev`. Real environment variables still win.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });

  return {
    server: { host: "0.0.0.0", port: 8080, strictPort: true },
    preview: { host: "127.0.0.1", port: 8081, strictPort: true },
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      ...(command === "build" || isPreview ? [nitro({ preset: "vercel" })] : []),
      viteReact(),
    ],
  };
});
