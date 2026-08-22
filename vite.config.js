import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite is the build tool - it's the equivalent of your C++ build system
// (like CMake), but for web projects. `npm run dev` starts a local dev
// server with hot-reload; `npm run build` produces optimized static files.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
