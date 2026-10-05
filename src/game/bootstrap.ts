import { Game } from './Game';
import { h } from '../ui/dom';
import { installDebug } from './debug';

/** Точка входа игры: экран загрузки → мир → системы → меню (или сразу игра по ?autostart=new). */
export async function startGame(params: URLSearchParams): Promise<void> {
  const root = document.getElementById('ui-root')!;
  const bar = h('i');
  const what = h('div', { class: 'what' });
  const loading = h('div', { class: 'loading' }, h('h1', null, 'Магазин бабушки'), h('div', { class: 'sub' }, 'Дубравка · деревенский магазин'), h('div', { class: 'bar' }, bar), what);
  root.append(loading);
  const game = new Game(params);
  installDebug(game);
  const progress = (p: number, label: string) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    what.textContent = label ? `Загрузка: ${label}` : '';
  };
  await game.init((p, label) => progress(p * 0.85, label));
  const { attachSystems } = await import('./systems');
  await attachSystems(game, (p, label) => progress(0.85 + p * 0.15, label));
  loading.remove();
  if (params.get('autostart') === 'new') {
    game.newGame({ skipIntro: params.get('intro') !== '1' });
  } else {
    game.showMainMenu();
  }
  (window as unknown as { __gameReady: boolean }).__gameReady = true;
}
