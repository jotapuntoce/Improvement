/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@jotapuntoce/db", "@jotapuntoce/ui"],
  // La importación sube archivos de hasta 5 MB por Server Action (default de Next: 1 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
