// SOLO si tu proyecto de Vercel es Next.js: agrega esto dentro de next.config.js
// (en vez de usar vercel.json).
async rewrites() {
  return [
    { source: '/futbol', destination: '/futbol/futbol.html' },
    { source: '/futbol/admin', destination: '/futbol/futbol-admin.html' },
    { source: '/api/futbol/:path*', destination: 'https://api.picalereplay.com/api/futbol/:path*' },
  ];
},
