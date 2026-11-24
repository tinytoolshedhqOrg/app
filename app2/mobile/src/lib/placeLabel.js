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

export function placeName(place) {
  return String(place?.name || '').trim();
}

/**
 * Sheet / marker title.
 * Brand types stay "7-11 台場". Generic types show the name only, or the
 * type when the name is empty (so an unnamed 公廁 still has a title).
 */
export function placeLabel(place) {
  const type = String(place?.type || '').trim();
  const name = placeName(place);
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

/**
 * Google Maps search text when the place has a real name.
 * Brand types stay in the query ("7-11 台場"); generic types are omitted.
 * Address is appended when present (same Taiwan behavior as before PR #81,
 * minus generic category prefixes).
 */
export function navigationTextQuery(place) {
  const type = String(place?.type || '').trim();
  const name = placeName(place);
  const addr = String(place?.['地址'] || '').trim();
  const parts = [];
  if (type && !isGenericPlaceType(type) && name) parts.push(type);
  if (name) parts.push(name);
  if (name && addr) parts.push(addr);
  return [...new Set(parts)].join(' ');
}

/**
 * Search by name when one exists; otherwise fall back to coordinates.
 * Used by tests and as the human-readable destination summary.
 */
export function navigationDestination(place) {
  return navigationTextQuery(place) || coordinateDestination(place);
}

/**
 * Google Maps URLs.
 * Named places: search query (plus center=lat,lng when coords exist, to
 * bias the correct branch). Unnamed places: directions to lat,lng.
 */
export function googleMapsUrls(place) {
  const text = navigationTextQuery(place);
  const coords = coordinateDestination(place);

  if (text) {
    const q = encodeURIComponent(text);
    const web = `https://www.google.com/maps/search/?api=1&query=${q}`;
    const app = coords
      ? `comgooglemaps://?q=${q}&center=${coords}`
      : `comgooglemaps://?q=${q}`;
    return {
      web: coords ? `${web}&center=${coords}` : web,
      app,
    };
  }

  if (!coords) return null;
  const encoded = encodeURIComponent(coords);
  return {
    web: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=walking`,
    app: `comgooglemaps://?daddr=${encoded}&directionsmode=walking`,
  };
}
