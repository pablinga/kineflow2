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
        ink: "#0D1B2A",
        ocean: {
          50: "#EEF4FF",
          100: "#DCE8FF",
          200: "#B8CFFF",
          300: "#85ACFF",
          400: "#4E84FF",
          500: "#1565FF",
          600: "#0F55DC",
          700: "#0B43AE",
          800: "#0A367F",
          900: "#0D1B2A",
        },
        emerald: {
          50: "#ECFDF9",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#22C1A1",
          600: "#17A98E",
          700: "#0F8470",
          800: "#115E56",
          900: "#134E4A",
          950: "#042F2E",
        },
      },
      boxShadow: {
        soft: "0 18px 50px rgba(13, 27, 42, 0.09)",
        card: "0 10px 30px rgba(13, 27, 42, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
