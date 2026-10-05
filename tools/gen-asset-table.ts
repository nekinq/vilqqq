/**
 * Таблица ассетов для Docs/AssetBriefs.md (между маркерами ASSET_TABLE_START/END):
 * id, название, категория, функция, референс, габариты, треугольники, пивот, коллайдер, анимации, GLB, статус.
 * Запуск: npm run asset-table (после npm run models — тогда в таблице будут размеры GLB).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

const { allAssets } = await import('../src/art/registry');
await import('../src/art/models');

const CAT: Record<string, string> = {
  shop: 'Магазин',
  restoration: 'Реставрация',
  equipment: 'Оборудование',
  product: 'Товары',
  tool: 'Инструменты',
  supplier: 'Поставщики',
  house: 'Дома',
  village: 'Деревня',
  nature: 'Природа',
  vehicle: 'Транспорт',
  character: 'Персонажи',
};
const STATUS: Record<string, string> = {
  planned: 'запланирован',
  'concept-approved': 'концепт утверждён',
  modeling: 'моделируется',
  exported: 'экспортирован',
  integrated: 'в игре',
  verified: 'проверен',
  'visual-approved': 'визуал утверждён',
};

const manifestPath = join(process.cwd(), 'public', 'assets', 'models', 'manifest.json');
const manifest: Record<string, { bytes: number }> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).assets : {};

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rows: string[] = [];
const defs = allAssets().sort((a, b) => (a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category)));
let totalTris = 0;
for (const d of defs) {
  const obj = d.build();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  let tris = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  totalTris += tris;
  const glb = manifest[d.id] ? `\`assets/models/${d.id}.glb\` (${(manifest[d.id]!.bytes / 1024).toFixed(0)} КБ)` : `\`assets/models/${d.id}.glb\``;
  rows.push(`| \`${d.id}\` | ${esc(d.name)} | ${CAT[d.category] ?? d.category} | ${esc(d.func)} | ${esc(d.ref)} | ${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)} | ${Math.round(tris)} | ${esc(d.pivot)} | ${esc(d.collider)} | ${esc(d.anims)} | ${glb} | ${STATUS[d.status] ?? d.status} |`);
}
const table = [
  `Всего ассетов: **${defs.length}**, треугольников (по одному экземпляру): **${Math.round(totalTris).toLocaleString('ru-RU')}**.`,
  '',
  '| ID | Название | Группа | Функция | Референс | Габариты, м (Ш×В×Г) | Треуг. | Пивот | Коллайдер | Анимации | GLB | Статус |',
  '|---|---|---|---|---|---|---:|---|---|---|---|---|',
  ...rows,
].join('\n');

const docPath = join(process.cwd(), 'Docs', 'AssetBriefs.md');
const doc = readFileSync(docPath, 'utf8');
const out = doc.replace(/<!-- ASSET_TABLE_START -->[\s\S]*<!-- ASSET_TABLE_END -->/, `<!-- ASSET_TABLE_START -->\n${table}\n<!-- ASSET_TABLE_END -->`);
writeFileSync(docPath, out);
console.log(`Таблица ассетов обновлена: ${defs.length} строк → Docs/AssetBriefs.md`);
