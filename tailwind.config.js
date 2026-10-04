/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scans both the HTML pages and the shared JS files (sidebar.js/footer.js
  // build their markup — including Tailwind classes — dynamically at
  // runtime, so their classes wouldn't be found by scanning HTML alone).
  content: ['./public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {},
  },
  plugins: [],
};
