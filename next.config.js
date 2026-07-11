/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  assetPrefix: isProd ? './' : '',
  images: {
    unoptimized: true,
  },
  reactStrictMode: false, // Fabric.js runs cleaner with strict mode off in dev
};

module.exports = nextConfig;
