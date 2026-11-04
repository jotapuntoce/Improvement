/** @type {import('next').NextConfig} */
const nextConfig = {
  // En producción la app vive en jotapuntoce.com/improvement (rewrite del proyecto jotapuntoce-site):
  // NEXT_PUBLIC_BASE_PATH=/improvement en Vercel; vacío en local y en E2E, que siguen en la raíz.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  transpilePackages: ["@jotapuntoce/db", "@jotapuntoce/ui"],
  experimental: {
    serverActions: {
      // La importación sube archivos de hasta 5 MB por Server Action (default de Next: 1 MB).
      bodySizeLimit: "6mb",
      // El rewrite llega con Origin jotapuntoce.com; sin esto Next rechaza las Server Actions.
      allowedOrigins: ["jotapuntoce.com", "www.jotapuntoce.com"],
    },
  },
};

export default nextConfig;
