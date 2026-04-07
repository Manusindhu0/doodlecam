/* ═══════════════════════════════════════════════════════════════
   DoodleCam — Theme Manager
   Handles theme switching: Dark Neon / Playful / Cyberpunk
   ═══════════════════════════════════════════════════════════════ */

export class ThemeManager {
  constructor() {
    this.themes = ['dark-neon', 'playful', 'cyberpunk'];
    this.currentIndex = 0;
    this.currentTheme = this.themes[0];
  }

  init() {
    // Load saved theme
    const saved = localStorage.getItem('doodlecam-theme');
    if (saved && this.themes.includes(saved)) {
      this.currentTheme = saved;
      this.currentIndex = this.themes.indexOf(saved);
    }
    this.apply();
  }

  apply() {
    document.body.setAttribute('data-theme', this.currentTheme);
  }

  cycle() {
    this.currentIndex = (this.currentIndex + 1) % this.themes.length;
    this.currentTheme = this.themes[this.currentIndex];
    this.apply();
    localStorage.setItem('doodlecam-theme', this.currentTheme);
    return this.currentTheme;
  }

  getThemeName() {
    const names = {
      'dark-neon': 'Dark Neon',
      'playful': 'Playful',
      'cyberpunk': 'Cyberpunk'
    };
    return names[this.currentTheme] || this.currentTheme;
  }
}
