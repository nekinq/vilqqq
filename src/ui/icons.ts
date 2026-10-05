/** Контурные SVG-иконки в одном стиле (24×24, currentColor, 2 px) — как в UI-01/UI-02. */

const S = (body: string, fill = false) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  calendar: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" stroke-width="1.6"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  wallet: S('<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 13h5v-3h-5a1.5 1.5 0 0 0 0 3z"/>'),
  star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', true),
  thumb: S('<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7"/>'),
  broom: S('<path d="M19 3l-7.5 7.5"/><path d="M11.5 10.5l2 2-2.5 7.5c-3-.5-6-3.5-6.5-6.5z"/><path d="M8 14l3 3M6.5 16.5l2 2"/>'),
  box: S('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  hand: S('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L3 15.2a1.6 1.6 0 0 1 2.4-2l2.6 2.3"/>'),
  tablet: S('<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  home: S('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  chart: S('<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>'),
  shelf: S('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16M4 15h16"/><path d="M7 6h3M12 12h4M8 18h3"/>'),
  people: S('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>'),
  truck: S('<path d="M2 6h12v10H2z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>'),
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  check: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  alert: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>'),
  cart: S('<path d="M3 4h2l2.5 11h10L20 7H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'),
  coin: S('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),
  card: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  cash: S('<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>'),
  bread: S('<path d="M5 13c-1.5-3 .5-7 7-7s8.5 4 7 7c-.7 1.6-1 3.2-1 5H6c0-1.8-.3-3.4-1-5z"/><path d="M9 10l1.5 2M13 9.5l1.5 2"/>'),
  bottle: S('<path d="M10 2h4v4l1.5 3v12h-7V9L10 6z"/><path d="M8.5 13h7"/>'),
  carrot: S('<path d="M14 10L5 21l-1-1 9-11"/><path d="M14 10c2-2 3-4 6-5M15 9c1-3 0-5-1-6M16 11c3-1 4 0 5 1"/>'),
  milk: S('<path d="M8 3h8v3l2 3v12H6V9l2-3z"/><path d="M6 12h12"/>'),
  meat: S('<path d="M15 4c3.5 1 5.5 4.5 4.5 8.5-1 3.5-5 5.5-9 4.5L7 20.5l-3.5-3.5L7 13c-1-4 4-10 8-9z"/><circle cx="14" cy="10" r="2"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  save: S('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
  play: S('<path d="M7 4l13 8-13 8z"/>', true),
  door: S('<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M3 21h18M15 12h.5"/>'),
  store: S('<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11z"/><path d="M5 13v8h14v-8M10 21v-5h4v5"/>'),
  phone: S('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  scanner: S('<path d="M4 7h11l3 4v3H8l-1 7H4z"/><path d="M15 7l5-3"/>'),
  sparkle: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  exit: S('<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = ICONS[name];
  return s;
}
