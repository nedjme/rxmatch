import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          50:  '#e8eef5',
          100: '#c5d4e6',
          200: '#9db8d4',
          300: '#6f95bb',
          400: '#4a7aa8',
          500: '#2a5a8c',
          600: '#1e4575',
          700: '#1B3A5C',
          800: '#142d48',
          900: '#0d1f33',
        },
        teal: {
          50:  '#e0faf8',
          100: '#b3f2ed',
          200: '#7de8e0',
          300: '#40d9d0',
          400: '#15ccc2',
          500: '#0CBFB0',
          600: '#09a99b',
          700: '#078c81',
          800: '#056e65',
          900: '#03504a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
