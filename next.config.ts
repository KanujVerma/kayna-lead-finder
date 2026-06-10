import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// OpenNext Cloudflare dev initialization (Phase 1 spike)
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) =>
    m.initOpenNextCloudflareForDev?.()
  );
}

export default nextConfig;
