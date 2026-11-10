export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    bg: 'rgb(var(--bg) / <alpha-value>)',
    card: 'rgb(var(--card) / <alpha-value>)',
    line: 'rgb(var(--line) / <alpha-value>)',
    ink: 'rgb(var(--ink) / <alpha-value>)',
    mute: 'rgb(var(--mute) / <alpha-value>)',
    near: 'rgb(var(--near) / <alpha-value>)',
    onnear: 'rgb(var(--onnear) / <alpha-value>)',
  }, fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] } } },
  plugins: [],
};
