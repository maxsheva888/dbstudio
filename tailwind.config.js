/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          bg:           '#1e1e1e',
          sidebar:      '#252526',
          activityBar:  '#333333',
          tab:          '#2d2d2d',
          tabActive:    '#1e1e1e',
          tabBorder:    '#1e1e1e',
          statusBar:    '#007acc',
          border:       '#3c3c3c',
          text:         '#d4d4d4',
          textDim:      '#858585',
          hover:        '#2a2d2e',
          selected:     '#094771',
          input:        '#3c3c3c',
          panelHeader:  '#252526',
        }
      },
      fontSize: {
        '2xs': '11px',
        xs: '12px',
        sm: '13px',
      }
    }
  },
  plugins: []
}
