import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@feedbackiq/supabase", "@feedbackiq/analyzer", "@feedbackiq/collectors"],
};

export default nextConfig;
