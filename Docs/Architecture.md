# Архитектура (Three.js, браузер)

Стек: **TypeScript + Vite + three.js (WebGLRenderer)**, UI — HTML/CSS поверх канваса, звук — WebAudio,
сохранения — IndexedDB, модели — GLB (GLTFLoader). Ни Unity, ни других движков: старые упоминания
Unity в документации — только историческое описание геймплея.

## Слои

```text
┌──────────────────────── UI (DOM) ────────────────────────┐
│ HUD · Планшет · Модалки · Меню · Настройки · Субтитры     │  читает состояние, шлёт команды
└───────────────▲──────────────────────────┬───────────────┘
                │ события (EventBus)       │ команды
┌───────────────┴──────── Сервисы (чистые данные) ─────────┐
│ Time/Day · Economy+Ledger · Progression · Reputation      │  детерминированы, без three.js,
│ Inventory (секции, коробки, резервы) · Orders · Equipment │  покрыты юнит-тестами,
│ Restoration · Dirt · Staff · Story/Tutorial · Customers*  │  сериализуются в сейв
└───────────────▲──────────────────────────┬───────────────┘
                │                          │
┌───────────────┴──────── Мир (three.js) ──▼───────────────┐
│ Village · Shop · Views (мебель, товар, коробки, грязь)    │  строится из данных,
│ Characters (риги) · Navigation · Colliders · DayNight     │  синхронизируется по событиям
│ Player (контроллер, взаимодействие, руки, инструменты)    │
└───────────────▲──────────────────────────────────────────┘
                │
┌───────────────┴──────── Ядро ────────────────────────────┐
│ Game · GameLoop · Input · EventBus · AssetManager ·        │
│ Renderer/Quality · Audio · Settings · SaveManager          │
└──────────────────────────────────────────────────────────┘
```

Правило: **сервисы не знают о three.js**. Мир читает их состояние и подписан на события.
Поэтому сохранение = сериализация сервисов, загрузка = восстановление сервисов + пересборка вида.

## Структура проекта

```text
index.html               точка входа, корневые DOM-контейнеры
src/
  main.ts                бутстрап: шрифты, настройки, ассеты, меню
  core/                  Game, GameLoop, Input, EventBus, AssetManager, Renderer, Audio, Settings, rng, math
  art/                   MaterialLibrary, TextureFactory (canvas), ModelKit, models/* (строители моделей), manifest
  world/                 Village, VillageLayout (данные карты), Ground, Vegetation, Shop, ShopLayout, DayNight, Sky,
                         Colliders, RoadGraph, NavGrid, Doors, Signs
  player/                PlayerController, PlayerInteraction, Viewmodel (руки), Tools, HeldItem
  inventory/             InventoryService, StockSection, Box, ProductView (инстансы), BoxView
  equipment/             EquipmentService, Placement (призрак, сетка, R-поворот), FurnitureView
  suppliers/             SupplierService, OrderService, SupplierNPC, DeliveryZone
  customers/             CustomerDirector (расписание), CustomerAgent (FSM), CustomerView, appearance
  checkout/              CheckoutService (сессия, очередь), CounterView, CashDrawer, CardTerminal, CashierNPC
  economy/               EconomyService, DailyLedger, ProgressionService, ReputationService
  cleaning/              DirtService, DirtView, Broom, RestorationService, RestorationView
  story/                 Intro (автобус), PhoneCall, Dialogue, Tutorial, Ending
  save/                  SaveManager, IndexedDbStore, SaveSchema (+ миграции)
  ui/                    HUD, Tablet, Modals (Catalog, Price, Report, Terminal, Drawer), MainMenu, PauseMenu,
                         Settings, SaveSlots, Notifications, Subtitles, icons, dom-хелперы
  data/                  products, suppliers, licenses, equipment, progression, balance, dialogue, strings (ru)
tools/
  export-models.ts       строители моделей → public/assets/models/*.glb (Node + GLTFExporter)
  gen-asset-table.ts     таблица ассетов для Docs/AssetBriefs.md из манифеста
public/assets/models/    сгенерированные GLB
tests/                   vitest: экономика, сток, касса/сдача, прогрессия, сейвы, расписание
```

## Игровой цикл

```text
requestAnimationFrame
 ├─ Input.beginFrame()                    — опрос клавиш, дельта мыши
 ├─ if (!paused)
 │   ├─ Player.update(dt)                 — движение, коллизии, ступени
 │   ├─ Interaction.update(dt)            — raycast, контекст, удержание ЛКМ
 │   ├─ Simulation.update(dt)             — время дня, директор покупателей, агенты, касса, кассир, грязь
 │   ├─ Animation.update(dt)              — риги персонажей, вьюмодель, полёт товара, двери
 │   └─ DayNight.update(gameTime)         — небо, солнце, фонари, окна
 ├─ Renderer.render(scene) + viewmodel    — второй проход рук поверх (clearDepth)
 └─ UI.update(dt)                         — HUD с троттлингом ~10 Гц, без DOM-дребезга
```

- `dt` = реальная дельта, ограничена 1/20 с (после сворачивания вкладки — без «прыжков»).
- Логика зависит только от `dt` и событий, не от FPS. Экономика — событийная и детерминированная.
- Пауза полностью замораживает симуляцию; UI и меню продолжают работать.
- Вкладка в фоне → автопауза.

## Ассеты

1. **Строители моделей** (`src/art/models/*`) создают low-poly модели из примитивов с общими материалами
   (по имени материала) и вершинными цветами.
2. `npm run models` экспортирует их в **GLB** (`public/assets/models/<id>.glb`) — их можно открыть в Blender и заменить.
3. **AssetManager** грузит GLB через `GLTFLoader` (с поддержкой Meshopt/Draco/KTX2 при необходимости), кэширует,
   показывает прогресс, клонирует экземпляры с общей геометрией, подменяет материалы на общие из
   `MaterialLibrary` по имени, при ошибке — фолбэк на строитель, затем на серый бокс-заглушку.
4. Текстуры (доски, черепица, брусчатка, штукатурка, трава, вывески, этикетки) генерируются на canvas при старте —
   ноль загрузок, тайлинг, мипмапы.

## Рендер

- `WebGLRenderer`, sRGB-вывод, ACES-тонмаппинг, одна направленная тень (солнце/луна) с камерой, следующей за игроком.
- Небо — градиентный шейдер на сфере + солнце/луна + звёзды ночью + несколько low-poly облаков.
- Вьюмодель (руки/инструменты) — отдельная сцена и камера, рисуется поверх без клиппинга в стены.
- Повторяющееся (деревья, кусты, трава, цветы, камни, заборы, фонари, товар на полках) — `InstancedMesh`.

## Ввод

- `Input` хранит привязки «действие → код клавиши/кнопки мыши», переназначаемые из настроек.
- Pointer Lock для обзора; выход из него (Esc) открывает паузу, открытие планшета/модалки отпускает курсор намеренно.
- `beforeunload`-защита от случайного Ctrl+W (присед на Ctrl), Keyboard Lock в полноэкранном режиме.
