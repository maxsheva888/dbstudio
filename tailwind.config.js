/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          bg:          'var(--vs-bg)',
          sidebar:     'var(--vs-sidebar)',
          activityBar: 'var(--vs-activity-bar)',
          tab:         'var(--vs-tab)',
          tabActive:   'var(--vs-tab-active)',
          border:      'var(--vs-border)',
          text:        'var(--vs-text)',
          textDim:     'var(--vs-text-dim)',
          hover:       'var(--vs-hover)',
          selected:    'var(--vs-selected)',
          input:       'var(--vs-input)',
          panelHeader: 'var(--vs-panel-header)',
          statusBar:   'var(--vs-status-bar)',
        }
      },
      fontSize: {
        '2xs': '11px',
        xs:    '12px',
        sm:    '13px',
      }
    }
  },
  plugins: []
}
