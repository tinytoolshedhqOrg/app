/** Category labels that are not a brand. Omitted from titles and text queries. */
export const GENERIC_PLACE_TYPES = new Set([
  '咖啡',
  '餐廳',
  '公廁',
  '商場',
  '博物館',
  '車站',
  '公車站',
  '景點',
  '加油站',
  '飯店',
  '主題樂園',
  '公衆トイレ',
  '駅トイレ',
  '道の駅',
  'SA/PA',
  '泳灘及游泳池',
  '大型公園',
  '體育館及室內體育設施',
  '運動場',
  '水上活動中心',
  '花園、康樂場地及公園',
  '地區康樂事務辦事處',
  '表演場地',
  '售票網',
  '圖書館',
  '大球場',
  '度假營及康樂中心',
  '騎術學校',
  '總部',
]);

export function isGenericPlaceType(type) {
  return GENERIC_PLACE_TYPES.has(String(type || '').trim());
}

/**
 * Sheet / marker title.
 * Brand types stay "7-11 台場". Generic types show the name only, or the
 * type when the name is empty (so an unnamed 公廁 still has a title).
 */
export function placeLabel(place) {
  const type = String(place?.type || '').trim();
  const name = String(place?.name || '').trim();
  if (isGenericPlaceType(type)) {
    return name || type;
  }
  if (type && name) return `${type} ${name}`;
  return type || name;
}

export function coordinateDestination(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat},${lng}`;
}

/** Text fallback if coordinates are missing. Generic category types are omitted. */
export function navigationTextQuery(place) {
  const type = String(place?.type || '').trim();
  const name = String(place?.name || '').trim();
  const addr = String(place?.['地址'] || '').trim();
  const parts = [];
  if (type && !isGenericPlaceType(type)) parts.push(type);
  if (name) parts.push(name);
  if (addr) parts.push(addr);
  return [...new Set(parts)].join(' ');
}

/**
 * Destination string for Google Maps (web `destination=` / app `daddr=`).
 * Coordinates first so navigation always hits the pin.
 */
export function navigationDestination(place) {
  return coordinateDestination(place) || navigationTextQuery(place);
}

export function googleMapsUrls(place) {
  const dest = navigationDestination(place);
  if (!dest) return null;
  const encoded = encodeURIComponent(dest);
  return {
    web: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=walking`,
    app: `comgooglemaps://?daddr=${encoded}&directionsmode=walking`,
  };
}
