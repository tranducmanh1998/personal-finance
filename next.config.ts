import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "",
  allowedDevOrigins: ["didactic-halibut-q9ppj94v9qjf6wq9-3000.app.github.dev"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

export default nextConfig;
