import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // Content Security Policy
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';",
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',
      // Control referrer information
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Disable potentially dangerous features
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()',
      // Force HTTPS in production
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      // Prevent XSS attacks
      'X-XSS-Protection': '1; mode=block'
    }
  },
  build: {
    // Enable source maps for debugging in production
    sourcemap: true,
    // Security: Don't inline small assets
    assetsInlineLimit: 0
  }
});
