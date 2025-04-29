/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/:path*',
        has: [{ type: 'host', value: 'sailabs.xyz' }],
      },
      {
        source: '/:path*',
        destination: '/dashboard/:path*',
        has: [{ type: 'host', value: 'app.sailabs.xyz' }],
      },
    ];
  },
  domains: ['app.sailabs.xyz', 'sailabs.xyz'],
  eslint: {
    ignoreDuringBuilds: true, // Tạm thời bỏ qua ESLint khi build
  },
};