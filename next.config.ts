module.exports = {
  basePath: '', // Đảm bảo không có basePath cố định
  assetPrefix: '', // Để trống để tài nguyên tải từ domain hiện tại
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
  domains: ['sailabs.xyz', 'app.sailabs.xyz'],
  eslint: {
    ignoreDuringBuilds: true, // Tạm thời bỏ qua ESLint khi build
  },
};