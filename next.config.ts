/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // tu peux laisser Typescript faire échouer le build si tu préfères
  // typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
