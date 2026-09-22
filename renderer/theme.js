(function exposeTheme(root) {
  const STORAGE_KEY = 'notch-appearance-v1';
  const defaults = {
    theme: 'midnight',
    accent: 'blue',
    density: 'comfortable',
    fontSize: 'standard',
    reduceMotion: false,
    browserMedia: true,
    showProgress: true,
    showVolume: true,
  };
  const accents = {
    blue: '#6EA8FF',
    green: '#4DD58C',
    orange: '#F5A15B',
    pink: '#F07DA8',
    purple: '#A98CFF',
    gray: '#A9AFBA',
  };

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      theme: ['system', 'midnight', 'graphite', 'frost', 'ocean', 'forest'].includes(source.theme)
        ? source.theme
        : defaults.theme,
      accent: Object.hasOwn(accents, source.accent) ? source.accent : defaults.accent,
      density: ['compact', 'comfortable'].includes(source.density) ? source.density : defaults.density,
      fontSize: ['standard', 'large'].includes(source.fontSize) ? source.fontSize : defaults.fontSize,
      reduceMotion: source.reduceMotion === true,
      browserMedia: source.browserMedia !== false,
      showProgress: source.showProgress !== false,
      showVolume: source.showVolume !== false,
    };
  }

  let settings = normalize(read());
  const listeners = new Set();

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function resolvedTheme() {
    if (settings.theme !== 'system') return settings.theme;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'frost' : 'midnight';
  }

  function apply() {
    const html = document.documentElement;
    const theme = resolvedTheme();
    html.dataset.theme = theme;
    html.dataset.density = settings.density;
    html.dataset.fontSize = settings.fontSize;
    html.dataset.reduceMotion = String(settings.reduceMotion);
    html.style.setProperty('--focus-ring', accents[settings.accent]);
    html.style.setProperty('--accent-blue', accents[settings.accent]);
    html.style.colorScheme = theme === 'frost' ? 'light' : 'dark';
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    apply();
    listeners.forEach((listener) => listener(settings));
  }

  function update(patch) {
    settings = normalize({ ...settings, ...(patch || {}) });
    save();
    return settings;
  }

  function reset() {
    settings = { ...defaults };
    save();
    return settings;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
  apply();
  root.NotchTheme = Object.freeze({
    defaults: { ...defaults },
    getSettings: () => ({ ...settings }),
    update,
    reset,
    subscribe,
  });
})(window);
