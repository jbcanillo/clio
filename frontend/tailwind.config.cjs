/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // teal.DEFAULT follows the theme (#0D4C55 light, #3FA6B4 dark); on-teal is the text/icon colour on it
        // (white in light, deep teal in dark, since white on #3FA6B4 is only ~2.9:1).
        teal: { DEFAULT: 'rgb(var(--teal-rgb) / <alpha-value>)', light: '#146B78', dark: '#072B30' },
        'on-teal': 'rgb(var(--on-teal-rgb) / <alpha-value>)',
        ember: { DEFAULT: '#FF6B35', light: '#FA824C', soft: '#FFE8DF', tint: '#FFF8F5' },
        // Neutral tokens follow the theme: channels live in index.css (:root and .dark).
        canvas: 'rgb(var(--canvas-rgb) / <alpha-value>)',
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        inset: 'rgb(var(--inset-rgb) / <alpha-value>)',
        hairline: 'rgb(var(--hairline-rgb) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink-rgb) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft-rgb) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted-rgb) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 8px 24px -4px rgba(13, 76, 85, 0.05)',
        ai: '0 12px 32px -6px rgba(255, 107, 53, 0.12)',
        modal: '0 16px 40px -8px rgba(7, 43, 48, 0.14)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        'clio-light': {
          primary: '#0D4C55',
          'primary-content': '#FFFFFF',
          secondary: '#FF6B35',
          'secondary-content': '#FFFFFF',
          accent: '#146B78',
          'accent-content': '#FFFFFF',
          neutral: '#072B30',
          'neutral-content': '#F8FAFA',
          'base-100': '#FFFFFF',
          'base-200': '#F8FAFA',
          'base-300': '#EDF2F2',
          'base-content': '#131E22',
          info: '#146B78',
          success: '#1F9D6B',
          warning: '#E0A100',
          error: '#BA1A1A',
          '--rounded-box': '1rem',
          '--rounded-btn': '0.75rem',
          '--rounded-badge': '9999px',
        },
        'clio-dark': {
          'color-scheme': 'dark',
          primary: '#3FA6B4',
          'primary-content': '#072B30',
          secondary: '#FF6B35',
          'secondary-content': '#FFFFFF',
          accent: '#85BBC6',
          'accent-content': '#072B30',
          neutral: '#EDF2F2',
          'neutral-content': '#072B30',
          'base-100': '#0E2229',
          'base-200': '#08161B',
          'base-300': '#132C34',
          'base-content': '#E6F0F1',
          info: '#85BBC6',
          success: '#4FD1A0',
          warning: '#F5C542',
          error: '#FF8A80',
          '--rounded-box': '1rem',
          '--rounded-btn': '0.75rem',
          '--rounded-badge': '9999px',
        },
      },
    ],
    darkTheme: 'clio-dark',
    base: true,
    styled: true,
    utils: true,
    rtl: false,
    log: false,
  },
};
