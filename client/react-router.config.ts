import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Switch to SPA mode to avoid hydration mismatches for browser-driven UI
  ssr: false,
} satisfies Config;
