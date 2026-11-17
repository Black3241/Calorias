/**
 * Tema claro/oscuro. 'auto' sigue la preferencia del sistema.
 */
export function applyTheme(theme = 'auto') {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  // Color de la barra del navegador según el tema efectivo.
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? '#0f1512' : '#16a34a');
    m.removeAttribute('media');
  });
}
