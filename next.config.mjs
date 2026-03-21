/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},
  experimental: {
    proxyClientMaxBodySize: 200 * 1024 * 1024, // 200 MB — allow large video uploads
  },
  // Enable cross-origin isolation for SharedArrayBuffer (required by ONNX Runtime threaded WASM)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ]
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      'pdfjs-dist/build/pdf.worker.mjs': false,
    }
    return config
  },
}

export default nextConfig
