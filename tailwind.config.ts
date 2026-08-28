import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fonds clairs, très légèrement lavande
        canvas:  '#FAF7FF',
        card:    '#FFFFFF',
        soft:    '#F4EFFE',
        line:    '#EBE3F9',
        // Textes
        ink:     '#2E2445',
        muted:   '#8E86A8',
        // Marque, reprise du logo
        grape:   { light: '#EDE4FF', DEFAULT: '#7C4DEE', dark: '#5B34C4' },
        rose:    { light: '#FFE3F1', DEFAULT: '#E6438B', dark: '#C22C70' },
        leaf:    { light: '#D9F8EC', DEFAULT: '#1FC08A', dark: '#159169' },
        sun:     { light: '#FFF0D2', DEFAULT: '#F5A524', dark: '#C77F12' },
        sky:     { light: '#DCEEFF', DEFAULT: '#2E9BF0', dark: '#1D74BC' },
        flame:   { light: '#FFE1E1', DEFAULT: '#F4525C', dark: '#C43640' },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      borderRadius: { '4xl': '1.75rem', '5xl': '2.25rem' },
      boxShadow: {
        float:  '0 10px 30px -12px rgba(93, 58, 173, .28)',
        lift:   '0 18px 44px -18px rgba(93, 58, 173, .35)',
        inset1: 'inset 0 1px 0 rgba(255,255,255,.7)',
      },
      keyframes: {
        pop:   { '0%': { transform: 'scale(.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        rise:  { '0%': { transform: 'translateY(14px)', opacity: '0' }, '100%': { transform: 'none', opacity: '1' } },
        bob:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        wiggle:{ '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
        halo:  { '0%': { boxShadow: '0 0 0 0 rgba(124,77,238,.45)' }, '70%': { boxShadow: '0 0 0 20px rgba(124,77,238,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(124,77,238,0)' } },
      },
      animation: {
        pop:  'pop .3s cubic-bezier(.34,1.56,.64,1)',
        rise: 'rise .38s cubic-bezier(.2,.9,.3,1) both',
        bob:  'bob 2.6s ease-in-out infinite',
        wiggle: 'wiggle .5s ease-in-out',
        halo: 'halo 2.4s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
