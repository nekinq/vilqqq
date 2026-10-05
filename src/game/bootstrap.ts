/** Точка входа игры (заполняется по мере реализации систем). */
export async function startGame(params: URLSearchParams): Promise<void> {
  const { runScenePreview } = await import('../dev/scenePreview');
  await runScenePreview(params);
}
