// Hand-drawn SVG character avatars. Each avatar = character id + body color.
(function () {
  const COLORS = ['#ff5c8a', '#ffb020', '#2ed3b7', '#4d9bff', '#9b6bff', '#ff7a45', '#33d17a', '#f15bb5'];
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  const eyes = (y = 48, gap = 13, r = 7) => `
    <circle cx="${50 - gap}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${50 + gap}" cy="${y}" r="${r}" fill="#fff"/>
    <circle cx="${50 - gap + 1.5}" cy="${y + 1}" r="${r * 0.5}" fill="#1b1240"/><circle cx="${50 + gap + 1.5}" cy="${y + 1}" r="${r * 0.5}" fill="#1b1240"/>
    <circle cx="${50 - gap + 3}" cy="${y - 1.5}" r="1.6" fill="#fff"/><circle cx="${50 + gap + 3}" cy="${y - 1.5}" r="1.6" fill="#fff"/>`;
  const smile = (y = 62, w = 10) => `<path d="M${50 - w} ${y} Q50 ${y + w * 0.9} ${50 + w} ${y}" stroke="#1b1240" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const cheeks = (y = 60) => `<circle cx="28" cy="${y}" r="4.5" fill="#fff" opacity=".28"/><circle cx="72" cy="${y}" r="4.5" fill="#fff" opacity=".28"/>`;

  const CHARS = {
    blip: { name: 'Blip', draw: (c, d) => `<circle cx="50" cy="55" r="34" fill="${c}"/><ellipse cx="40" cy="36" rx="10" ry="6" fill="#fff" opacity=".25"/>${eyes()}${smile()}${cheeks()}` },
    kit: { name: 'Kit', draw: (c, d) => `<path d="M20 40 L24 10 L44 28 Z" fill="${d}"/><path d="M80 40 L76 10 L56 28 Z" fill="${d}"/><circle cx="50" cy="56" r="33" fill="${c}"/>${eyes(50)}<path d="M46 60 L54 60 L50 64 Z" fill="#1b1240"/><path d="M50 64 Q45 70 40 66 M50 64 Q55 70 60 66" stroke="#1b1240" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M14 58 L30 60 M14 66 L30 64 M86 58 L70 60 M86 66 L70 64" stroke="#fff" stroke-width="2" opacity=".6"/>` },
    bun: { name: 'Bun', draw: (c, d) => `<ellipse cx="36" cy="22" rx="8" ry="20" fill="${d}"/><ellipse cx="64" cy="22" rx="8" ry="20" fill="${d}"/><ellipse cx="36" cy="22" rx="3.5" ry="13" fill="#fff" opacity=".35"/><ellipse cx="64" cy="22" rx="3.5" ry="13" fill="#fff" opacity=".35"/><circle cx="50" cy="60" r="31" fill="${c}"/>${eyes(55)}<rect x="45" y="66" width="10" height="8" rx="2" fill="#fff"/>${smile(66, 8)}${cheeks(66)}` },
    rex: { name: 'Rex', draw: (c, d) => `<path d="M30 26 L36 12 L42 24 L48 8 L54 24 L60 12 L66 26 Z" fill="${d}"/><rect x="17" y="24" width="66" height="62" rx="30" fill="${c}"/>${eyes(48)}<path d="M32 64 Q50 78 68 64" stroke="#1b1240" stroke-width="3.5" fill="#fff" stroke-linejoin="round"/><path d="M40 66 L43 71 L46 67 M54 67 L57 71 L60 66" stroke="#1b1240" stroke-width="2" fill="none"/>` },
    bolt: { name: 'Bolt', draw: (c, d) => `<line x1="50" y1="8" x2="50" y2="22" stroke="${d}" stroke-width="4"/><circle cx="50" cy="8" r="6" fill="#ffc94d"/><rect x="18" y="22" width="64" height="62" rx="14" fill="${c}"/><rect x="10" y="44" width="8" height="18" rx="3" fill="${d}"/><rect x="82" y="44" width="8" height="18" rx="3" fill="${d}"/><rect x="27" y="36" width="46" height="24" rx="10" fill="#1b1240"/><circle cx="39" cy="48" r="6" fill="#2ed3b7"/><circle cx="61" cy="48" r="6" fill="#2ed3b7"/><rect x="34" y="68" width="32" height="7" rx="3.5" fill="${d}"/><rect x="40" y="68" width="3" height="7" fill="${c}"/><rect x="48" y="68" width="3" height="7" fill="${c}"/><rect x="56" y="68" width="3" height="7" fill="${c}"/>` },
    zork: { name: 'Zork', draw: (c, d) => `<line x1="34" y1="28" x2="24" y2="8" stroke="${d}" stroke-width="4"/><line x1="66" y1="28" x2="76" y2="8" stroke="${d}" stroke-width="4"/><circle cx="24" cy="8" r="6" fill="#33d17a"/><circle cx="76" cy="8" r="6" fill="#33d17a"/><ellipse cx="50" cy="56" rx="36" ry="32" fill="${c}"/><circle cx="50" cy="44" r="11" fill="#fff"/><circle cx="51" cy="45" r="6" fill="#1b1240"/><circle cx="53" cy="42" r="2" fill="#fff"/><circle cx="30" cy="52" r="5" fill="#fff"/><circle cx="31" cy="53" r="2.6" fill="#1b1240"/><circle cx="70" cy="52" r="5" fill="#fff"/><circle cx="71" cy="53" r="2.6" fill="#1b1240"/><path d="M38 68 Q50 76 62 68" stroke="#1b1240" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
    boo: { name: 'Boo', draw: (c, d) => `<path d="M18 52 Q18 16 50 16 Q82 16 82 52 L82 86 L72 78 L61 86 L50 78 L39 86 L28 78 L18 86 Z" fill="${c}"/><ellipse cx="38" cy="30" rx="9" ry="5" fill="#fff" opacity=".25"/>${eyes(46, 12, 7)}<ellipse cx="50" cy="64" rx="6" ry="7" fill="#1b1240"/>${cheeks(58)}` },
    hoot: { name: 'Hoot', draw: (c, d) => `<path d="M22 30 L30 14 L40 26 Z M78 30 L70 14 L60 26 Z" fill="${d}"/><ellipse cx="50" cy="56" rx="33" ry="34" fill="${c}"/><ellipse cx="50" cy="68" rx="18" ry="16" fill="#fff" opacity=".25"/><circle cx="36" cy="44" r="12" fill="#fff"/><circle cx="64" cy="44" r="12" fill="#fff"/><circle cx="37" cy="45" r="6" fill="#1b1240"/><circle cx="65" cy="45" r="6" fill="#1b1240"/><circle cx="39" cy="42" r="2" fill="#fff"/><circle cx="67" cy="42" r="2" fill="#fff"/><path d="M44 54 L56 54 L50 64 Z" fill="#ffc94d"/>` },
    imp: { name: 'Imp', draw: (c, d) => `<path d="M26 34 Q18 14 30 8 Q30 22 40 28 Z M74 34 Q82 14 70 8 Q70 22 60 28 Z" fill="#fffdf7"/><circle cx="50" cy="56" r="33" fill="${c}"/><path d="M30 42 L44 46 M70 42 L56 46" stroke="#1b1240" stroke-width="3.5" stroke-linecap="round"/>${eyes(52, 13, 6)}<path d="M36 66 Q50 76 64 66" stroke="#1b1240" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M58 68 L60 73 L62 67" fill="#fff"/>` },
    ace: { name: 'Ace', draw: (c, d) => `<circle cx="50" cy="56" r="33" fill="${c}"/><path d="M20 38 Q50 14 80 38 Q66 30 50 32 Q34 30 20 38 Z" fill="${d}"/><rect x="22" y="42" width="24" height="14" rx="6" fill="#1b1240"/><rect x="54" y="42" width="24" height="14" rx="6" fill="#1b1240"/><rect x="44" y="46" width="12" height="3" fill="#1b1240"/><path d="M26 46 L34 46" stroke="#fff" stroke-width="2.5" opacity=".6" stroke-linecap="round"/><path d="M58 46 L66 46" stroke="#fff" stroke-width="2.5" opacity=".6" stroke-linecap="round"/><path d="M38 68 Q52 76 64 64" stroke="#1b1240" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
    royal: { name: 'Royal', draw: (c, d) => `<circle cx="50" cy="58" r="31" fill="${c}"/><path d="M28 32 L28 12 L39 22 L50 8 L61 22 L72 12 L72 32 Z" fill="#ffc94d" stroke="#e09b00" stroke-width="2"/><circle cx="50" cy="20" r="3.5" fill="#ff5c8a"/>${eyes(54, 12, 6.5)}${smile(66, 9)}${cheeks(64)}` },
    ninja: { name: 'Ninja', draw: (c, d) => `<circle cx="50" cy="54" r="34" fill="${c}"/><rect x="16" y="38" width="68" height="22" rx="8" fill="#1b1240"/><path d="M82 44 Q94 40 96 30 M82 50 Q96 52 98 44" stroke="#1b1240" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M30 48 Q36 44 42 48 Q36 54 30 48 Z M58 48 Q64 44 70 48 Q64 54 58 48 Z" fill="#fff"/><circle cx="36" cy="48" r="2.6" fill="#1b1240"/><circle cx="64" cy="48" r="2.6" fill="#1b1240"/>${smile(72, 7)}` },
  };
  const IDS = Object.keys(CHARS);

  function avatarSVG(id, color, size = 48) {
    const ch = CHARS[id] || CHARS.blip;
    const c = color || COLORS[0];
    const d = shade(c, -45);
    return `<span class="avatar" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100" aria-label="${ch.name}">${ch.draw(c, d)}</svg></span>`;
  }

  window.Avatars = { COLORS, IDS, CHARS, avatarSVG };
})();
