/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/dice",
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
