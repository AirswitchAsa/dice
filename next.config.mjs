/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/dice",
  output: "export",
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
