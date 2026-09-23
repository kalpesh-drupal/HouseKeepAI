import type { NextConfig } from "next";
import path from "path";
import { APP_PORT } from "./src/lib/app-config";

// Pin this application to port 3006 (scripts also pass -p 3006).
process.env.PORT = process.env.PORT || String(APP_PORT);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["unpdf"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
