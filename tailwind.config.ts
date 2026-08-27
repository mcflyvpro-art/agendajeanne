import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0B12',
        surface: '#14141F',
        raised: '#1D1D2B',
        line: '#2A2A3C',
        muted: '#8B8BA7',
        brand: { DEFAULT: '#7C5CFF', soft: '#A896FF', dark: '#5B3FD9' },
        mint: '#2FD8A5',
        sun: '#FFC44D',
        coral: '#FF6B6B',
        sky: '#4DA6FF',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        pop: { '0%': { transform: 'scale(.85)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        rise: { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(124,92,255,.55)' }, '70%': { boxShadow: '0 0 0 22px rgba(124,92,255,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(124,92,255,0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        pop: 'pop .28s cubic-bezier(.34,1.56,.64,1)',
        rise: 'rise .35s ease-out both',
        pulseRing: 'pulseRing 2.2s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
