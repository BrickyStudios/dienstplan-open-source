import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // .claude/worktrees enthält temporäre Git-Worktrees paralleler Agents — je nach
    // Nebenläufigkeit volle Kopien des Repos inkl. eigener Test-Dateien. Ohne diesen
    // Ausschluss zählt Vitest dieselben Tests mehrfach (einmal je aktivem Worktree).
    // Restliche Einträge sind Vitests eigene Standard-Ausschlüsse, die durch das
    // Setzen von `exclude` sonst überschrieben (nicht ergänzt) würden.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "**/.claude/worktrees/**",
      // native/ ist eine eigenstaendige React-Native-Codebasis mit eigenem Testlauf
      // (native/package.json). Ohne diesen Ausschluss zieht Vitest sie in den Web-Lauf
      // und scheitert an react-native-Importen, die es im jsdom-Umfeld nicht gibt.
      "**/native/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
