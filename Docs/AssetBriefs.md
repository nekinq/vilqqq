# Брифы ассетов

Каждый ассет: **ID, название, функция, референс, размеры, пивот, материалы, LOD, коллайдер, анимации, путь GLB, статус**.
Полная таблица с актуальными статусами генерируется из `src/art/manifest.ts` командой `npm run asset-table`
и записывается в раздел «Таблица» ниже.

Общие правила: метры; пивот — центр основания; фасад/лицо смотрит в +Z; материалы только из общей библиотеки
(`wood`, `plaster`, `roof`, `stone`, `brick`, `metal`, `glass`, `fabric`, `flat`, `foliage`, `emissive`, `sign:*`);
коллайдеры — в данных карты/манифеста, не в меше.

## Группы

| Группа | Ассеты |
|---|---|
| Магазин | `shop_shell`, `shop_door`, `shop_sign_old`, `shop_sign_painted`, `shop_porch_decor_*`, `delivery_pallet`, `dumpster`, `hand_truck` |
| Реставрация | `board_plank`, `cobweb`, `trash_bag`, `trash_sack`, `stain_decal`, `footprints_decal`, `dirt_decal`, `paper_litter`, `dry_weeds` |
| Оборудование | `shelf_gondola`, `storage_rack`, `fridge`, `freezer`, `checkout_counter`, `register_monitor`, `scanner`, `card_terminal`, `cash_drawer`, `basket`, `paper_bag` |
| Инструменты | `broom`, `tablet`, `phone`, `fp_arms` |
| Товары (17) | `prod_bread`, `prod_water`, `prod_apples`, `prod_flour`, `prod_pasta`, `prod_canned`, `prod_buns`, `prod_tomatoes`, `prod_carrots`, `prod_condensed_milk`, `prod_milk`, `prod_cheese`, `prod_yogurt`, `prod_butter`, `prod_sausage`, `prod_chicken`, `prod_steaks`, `box_cardboard` |
| Поставщики | `bld_grocery`, `bld_bakery`, `bld_produce`, `bld_greenhouse`, `bld_dairy_house`, `bld_barn`, `bld_butcher`, `stall_*`, `cow` |
| Жилые дома | `house_cottage`, `house_twostorey`, `house_timber` (+ варианты цвета крыши/стен) |
| Деревня | `tree_oak_big`, `tree_round`, `tree_pine`, `bush`, `grass_tuft`, `flower_*`, `sunflower`, `rock_*`, `fence_post`, `fence_rail`, `stone_border`, `street_lamp`, `bench`, `planter`, `crate`, `barrel`, `milk_can`, `woodpile`, `sign_post`, `well` |
| Транспорт | `bus`, `bus_stop` |
| Персонажи | `char_woman`, `char_man`, `char_old_woman`, `char_old_man`, `char_young`, `char_grocer`, `char_baker`, `char_farmer`, `char_dairy`, `char_butcher`, `char_grandma`, `char_driver`, `char_cashier` |

## Персонажи — риг

Сегментный риг без скиннинга, узлы: `hips` (корень, высота бедра), `spine`, `chest`, `neck`, `head`,
`arm_L`/`arm_R` (плечо) → `forearm_L`/`forearm_R` → `hand_L`/`hand_R`, `leg_L`/`leg_R` (бедро) → `shin_L`/`shin_R` → `foot_L`/`foot_R`.
Анимации процедурные (ходьба, ожидание, взять товар, заплатить, разговор, приветствие).

## Таблица

<!-- ASSET_TABLE_START -->
_Будет сгенерирована из манифеста._
<!-- ASSET_TABLE_END -->
