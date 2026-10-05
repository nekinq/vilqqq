import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/700.css';
import '@fontsource/pt-serif/700.css';
import './ui/styles.css';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // Шрифты нужны до генерации вывесок на canvas.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 64px "PT Serif"', 'Магазин'),
        document.fonts.load('700 32px "Roboto Condensed"', 'Магазин'),
        document.fonts.load('400 32px "Roboto Condensed"', 'Магазин'),
      ]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* без шрифтов — системные */
  }
  if (params.get('viewer')) {
    const { runViewer } = await import('./dev/viewer');
    await runViewer(params);
    return;
  }
  if (params.get('scene')) {
    const { runScenePreview } = await import('./dev/scenePreview');
    await runScenePreview(params);
    return;
  }
  const { startGame } = await import('./game/bootstrap');
  await startGame(params);
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('ui-root');
  if (el) el.innerHTML = `<div class="fatal">Не удалось запустить игру: ${String(err?.message ?? err)}</div>`;
});
