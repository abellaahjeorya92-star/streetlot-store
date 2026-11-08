/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0a0a0b', 900: '#111113', 800: '#1a1a1d', 700: '#26262b', 600: '#3a3a41' },
        volt: { DEFAULT: '#c6ff3d', dark: '#a8e01f' },
      },
      fontFamily: {
        display: ['Impact', 'Haettenschweiler', '"Arial Narrow Bold"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
