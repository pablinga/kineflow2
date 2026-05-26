import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#102033",
        ocean: {
          50: "#eef9ff",
          100: "#d9f1ff",
          200: "#aee3ff",
          300: "#73ceff",
          400: "#32b5f5",
          500: "#0b97dc",
          600: "#0078bb",
          700: "#075f96",
          800: "#0d507c",
          900: "#104367",
        },
      },
      boxShadow: {
        soft: "0 18px 60px rgba(15, 64, 108, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
