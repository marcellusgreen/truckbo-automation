/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fleet management primary colors
        'fleet': {
          50: '#eff6ff',
          100: '#dbeafe', 
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',  // Primary blue
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',  // Professional blue
          900: '#1e3a8a',
          950: '#172554',
        },
        // Trucking industry specific colors
        'truck': {
          steel: '#64748b',      // Steel gray for vehicle elements
          asphalt: '#1f2937',    // Dark asphalt for backgrounds
          chrome: '#f8fafc',     // Chrome/metallic accents
          safety: '#ef4444',     // Safety red for alerts
          compliant: '#10b981',  // Success green for compliance
          warning: '#f59e0b',    // Warning amber for upcoming deadlines
          diesel: '#0f172a',     // Deep diesel black
        },
        // DOT compliance colors
        'compliance': {
          expired: '#dc2626',     // Red for expired
          warning: '#d97706',     // Orange for expiring soon
          valid: '#059669',       // Green for valid
          pending: '#7c3aed',     // Purple for pending review
          unknown: '#6b7280',     // Gray for unknown status
        },
        // Enhanced semantic colors
        'status': {
          online: '#10b981',
          offline: '#ef4444',
          maintenance: '#f59e0b',
          transit: '#3b82f6',
          idle: '#6b7280',
        }
      },
      fontFamily: {
        'fleet': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'heading': ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'fleet-xs': ['0.75rem', '1rem'],
        'fleet-sm': ['0.875rem', '1.25rem'],
        'fleet-base': ['1rem', '1.5rem'],
        'fleet-lg': ['1.125rem', '1.75rem'],
        'fleet-xl': ['1.25rem', '1.75rem'],
        'fleet-2xl': ['1.5rem', '2rem'],
        'fleet-3xl': ['1.875rem', '2.25rem'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        'fleet': '0.5rem',
        'fleet-lg': '0.75rem', 
        'fleet-xl': '1rem',
      },
      boxShadow: {
        'fleet': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'fleet-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'fleet-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'compliance': '0 0 0 3px rgba(59, 130, 246, 0.1)',
        'compliance-warning': '0 0 0 3px rgba(245, 158, 11, 0.1)',
        'compliance-error': '0 0 0 3px rgba(239, 68, 68, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'compliance-pulse': 'compliancePulse 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        compliancePulse: {
          '0%, 100%': { 
            boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.7)' 
          },
          '70%': { 
            boxShadow: '0 0 0 10px rgba(59, 130, 246, 0)' 
          },
        },
      },
      backgroundImage: {
        'gradient-fleet': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        'gradient-compliance': 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        'gradient-warning': 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        'gradient-danger': 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
      },
    },
  },
  plugins: [],
};
