/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light Sea Blue & Obsidian Black palette
        primary: "#20B2AA", // light sea blue
        secondary: "#0B0C10", // obsidian black-ish
        cyan: {
          400: "#20B2AA",
          600: "#1aa39c"
        },
        gray: {
          800: "#121417",
          900: "#0B0C10"
        }
      },
    },
  },
  plugins: [],
}
