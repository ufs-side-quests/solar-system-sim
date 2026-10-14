import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Scratch probes, builds and evidence live in .tmp/; a change there must
    // not reload pages under test.
    watch: { ignored: ["**/.tmp/**"] },
  },
  worker: {
    format: "es",
  },
});
