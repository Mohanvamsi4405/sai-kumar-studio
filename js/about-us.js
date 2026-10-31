    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          "colors": {
            "primary": "#5C0930",
            "secondary": "#6B4552",
            "cta": "#C2185B",
            "surface": "#FFFFFF",
            "surface-container-low": "#FDF2F7",
            "surface-container": "#FCE7F0",
            "outline-variant": "#F3D6E4",
            "background": "#FFFFFF",
            "on-background": "#3F1522"
          },
          "borderRadius": {
            "DEFAULT": "0.375rem",
            "lg": "0.75rem",
            "xl": "1rem",
            "2xl": "1.5rem",
            "full": "9999px"
          },
          "spacing": {
            "container-max": "1240px",
            "margin-mobile": "20px",
            "margin-desktop": "32px",
            "gutter": "24px",
            "section-gap": "64px"
          },
          "fontFamily": {
            "headline-lg": ["Playfair Display", "serif"],
            "display-lg": ["Playfair Display", "serif"],
            "headline-md": ["Playfair Display", "serif"],
            "body-lg": ["Manrope", "sans-serif"],
            "body-md": ["Manrope", "sans-serif"],
            "label-sm": ["Manrope", "sans-serif"]
          }
        },
      },
    }
