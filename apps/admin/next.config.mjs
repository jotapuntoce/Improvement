/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@jotapuntoce/db", "@jotapuntoce/ui"],
  // Los expedientes (lib/procesos.js) se leen del disco en runtime: hay que empacarlos con las
  // rutas de /planos o en producción la carpeta no existe.
  outputFileTracingIncludes: {
    "/planos": ["./procesos/**/*"],
    "/planos/[proyecto]": ["./procesos/**/*"],
    "/planos/archivo/[...ruta]": ["./procesos/**/*"],
  },
};

export default nextConfig;
