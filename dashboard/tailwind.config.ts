import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F4EC',
        card: '#FFFFFF',
        border: '#EAE4D4',
        borderSoft: '#F2EEE1',
        ink: '#1C1B18',
        inkInverse: '#FDFAF3',
        muted: '#8A8578',
        mutedSoft: '#B0AA95',
        mutedDeep: '#5C5850',
        orange: '#FF6A39',
        orangeBg: '#FDF3EC',
        orangeText: '#B9603A',
        orangeBorder: '#F6DBC7',
        green: '#58CC02',
        greenText: '#3F9600',
        dark: '#1C1B18',
        darkSoft: '#2A2924',
        darkMuted: '#6B675E',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        reconRowIn: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        reconRowIn: 'reconRowIn 0.4s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
