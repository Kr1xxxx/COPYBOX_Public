// vinext 1.1+ needs an explicit Vite config; this is the default `vinext init` writes.
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [vinext()],
});
