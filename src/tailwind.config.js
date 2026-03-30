/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        cjk: ['"Noto Sans CJK SC"', '"Noto Sans SC"', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#1a1a2e',
          50: '#f0f0f8',
          100: '#d8d8ef',
          200: '#b0b0de',
          300: '#8888cd',
          400: '#6060bc',
          500: '#3838ab',
          600: '#2a2a8a',
          700: '#1e1e6a',
          800: '#14144a',
          900: '#0a0a2a',
        },
        jade: {
          DEFAULT: '#00b894',
          light: '#00d4a8',
          dark: '#008f76',
        },
        amber: {
          DEFAULT: '#fdcb6e',
          light: '#ffeaa7',
          dark: '#e17055',
        },
        coral: {
          DEFAULT: '#e17055',
          light: '#fab1a0',
        },
        slate: {
          surface: '#16213e',
          card: '#0f3460',
          border: '#1e3a5f',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'flip': 'flip 0.4s ease-in-out',
        'shimmer': 'shimmer 1.5s infinite',
        'pulse-soft': 'pulseSoft 2s infinite',
      },
      keyframes: {
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseSoft: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
