/**
 * 潮间 · 内置城市表（≥ 40）与按系统时区猜城市
 *
 * 零依赖、零 IO。城市表只含「经纬度 + IANA 时区」，不含任何气候/水温等外部数据。
 */

/** 内置城市表：id 用拉丁小写，zh/en 给 i18n 用 */
export const CITIES = Object.freeze(
  [
    { id: 'shanghai', zh: '上海', en: 'Shanghai', lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' },
    { id: 'beijing', zh: '北京', en: 'Beijing', lat: 39.9, lon: 116.41, tz: 'Asia/Shanghai' },
    { id: 'guangzhou', zh: '广州', en: 'Guangzhou', lat: 23.13, lon: 113.26, tz: 'Asia/Shanghai' },
    { id: 'shenzhen', zh: '深圳', en: 'Shenzhen', lat: 22.54, lon: 114.06, tz: 'Asia/Shanghai' },
    { id: 'chengdu', zh: '成都', en: 'Chengdu', lat: 30.57, lon: 104.07, tz: 'Asia/Shanghai' },
    { id: 'hangzhou', zh: '杭州', en: 'Hangzhou', lat: 30.27, lon: 120.15, tz: 'Asia/Shanghai' },
    { id: 'nanjing', zh: '南京', en: 'Nanjing', lat: 32.06, lon: 118.8, tz: 'Asia/Shanghai' },
    { id: 'wuhan', zh: '武汉', en: 'Wuhan', lat: 30.59, lon: 114.31, tz: 'Asia/Shanghai' },
    { id: 'xian', zh: '西安', en: "Xi'an", lat: 34.34, lon: 108.94, tz: 'Asia/Shanghai' },
    { id: 'chongqing', zh: '重庆', en: 'Chongqing', lat: 29.56, lon: 106.55, tz: 'Asia/Shanghai' },
    { id: 'qingdao', zh: '青岛', en: 'Qingdao', lat: 36.07, lon: 120.38, tz: 'Asia/Shanghai' },
    { id: 'xiamen', zh: '厦门', en: 'Xiamen', lat: 24.48, lon: 118.09, tz: 'Asia/Shanghai' },
    { id: 'harbin', zh: '哈尔滨', en: 'Harbin', lat: 45.8, lon: 126.53, tz: 'Asia/Shanghai' },
    { id: 'kunming', zh: '昆明', en: 'Kunming', lat: 25.04, lon: 102.71, tz: 'Asia/Shanghai' },
    { id: 'urumqi', zh: '乌鲁木齐', en: 'Urumqi', lat: 43.83, lon: 87.62, tz: 'Asia/Shanghai' },
    { id: 'lhasa', zh: '拉萨', en: 'Lhasa', lat: 29.65, lon: 91.14, tz: 'Asia/Shanghai' },
    { id: 'hongkong', zh: '香港', en: 'Hong Kong', lat: 22.32, lon: 114.17, tz: 'Asia/Hong_Kong' },
    { id: 'macau', zh: '澳门', en: 'Macau', lat: 22.2, lon: 113.54, tz: 'Asia/Macau' },
    { id: 'taipei', zh: '台北', en: 'Taipei', lat: 25.03, lon: 121.57, tz: 'Asia/Taipei' },
    { id: 'tokyo', zh: '东京', en: 'Tokyo', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
    { id: 'osaka', zh: '大阪', en: 'Osaka', lat: 34.69, lon: 135.5, tz: 'Asia/Tokyo' },
    { id: 'seoul', zh: '首尔', en: 'Seoul', lat: 37.57, lon: 126.98, tz: 'Asia/Seoul' },
    { id: 'singapore', zh: '新加坡', en: 'Singapore', lat: 1.35, lon: 103.82, tz: 'Asia/Singapore' },
    { id: 'bangkok', zh: '曼谷', en: 'Bangkok', lat: 13.76, lon: 100.5, tz: 'Asia/Bangkok' },
    { id: 'hochiminh', zh: '胡志明市', en: 'Ho Chi Minh City', lat: 10.82, lon: 106.63, tz: 'Asia/Ho_Chi_Minh' },
    { id: 'jakarta', zh: '雅加达', en: 'Jakarta', lat: -6.21, lon: 106.85, tz: 'Asia/Jakarta' },
    { id: 'kualalumpur', zh: '吉隆坡', en: 'Kuala Lumpur', lat: 3.14, lon: 101.69, tz: 'Asia/Kuala_Lumpur' },
    { id: 'manila', zh: '马尼拉', en: 'Manila', lat: 14.6, lon: 120.98, tz: 'Asia/Manila' },
    { id: 'mumbai', zh: '孟买', en: 'Mumbai', lat: 19.08, lon: 72.88, tz: 'Asia/Kolkata' },
    { id: 'delhi', zh: '新德里', en: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
    { id: 'dubai', zh: '迪拜', en: 'Dubai', lat: 25.2, lon: 55.27, tz: 'Asia/Dubai' },
    { id: 'istanbul', zh: '伊斯坦布尔', en: 'Istanbul', lat: 41.01, lon: 28.98, tz: 'Europe/Istanbul' },
    { id: 'moscow', zh: '莫斯科', en: 'Moscow', lat: 55.76, lon: 37.62, tz: 'Europe/Moscow' },
    { id: 'athens', zh: '雅典', en: 'Athens', lat: 37.98, lon: 23.73, tz: 'Europe/Athens' },
    { id: 'rome', zh: '罗马', en: 'Rome', lat: 41.9, lon: 12.5, tz: 'Europe/Rome' },
    { id: 'berlin', zh: '柏林', en: 'Berlin', lat: 52.52, lon: 13.4, tz: 'Europe/Berlin' },
    { id: 'paris', zh: '巴黎', en: 'Paris', lat: 48.86, lon: 2.35, tz: 'Europe/Paris' },
    { id: 'madrid', zh: '马德里', en: 'Madrid', lat: 40.42, lon: -3.7, tz: 'Europe/Madrid' },
    { id: 'lisbon', zh: '里斯本', en: 'Lisbon', lat: 38.72, lon: -9.14, tz: 'Europe/Lisbon' },
    { id: 'amsterdam', zh: '阿姆斯特丹', en: 'Amsterdam', lat: 52.37, lon: 4.9, tz: 'Europe/Amsterdam' },
    { id: 'london', zh: '伦敦', en: 'London', lat: 51.51, lon: -0.13, tz: 'Europe/London' },
    { id: 'stockholm', zh: '斯德哥尔摩', en: 'Stockholm', lat: 59.33, lon: 18.07, tz: 'Europe/Stockholm' },
    { id: 'oslo', zh: '奥斯陆', en: 'Oslo', lat: 59.91, lon: 10.75, tz: 'Europe/Oslo' },
    { id: 'helsinki', zh: '赫尔辛基', en: 'Helsinki', lat: 60.17, lon: 24.94, tz: 'Europe/Helsinki' },
    { id: 'reykjavik', zh: '雷克雅未克', en: 'Reykjavik', lat: 64.15, lon: -21.94, tz: 'Atlantic/Reykjavik' },
    { id: 'tromso', zh: '特罗姆瑟', en: 'Tromso', lat: 69.65, lon: 18.96, tz: 'Europe/Oslo' },
    { id: 'longyearbyen', zh: '朗伊尔城', en: 'Longyearbyen', lat: 78.22, lon: 15.65, tz: 'Arctic/Longyearbyen' },
    { id: 'newyork', zh: '纽约', en: 'New York', lat: 40.71, lon: -74.01, tz: 'America/New_York' },
    { id: 'losangeles', zh: '洛杉矶', en: 'Los Angeles', lat: 34.05, lon: -118.24, tz: 'America/Los_Angeles' },
    { id: 'sanfrancisco', zh: '旧金山', en: 'San Francisco', lat: 37.77, lon: -122.42, tz: 'America/Los_Angeles' },
    { id: 'seattle', zh: '西雅图', en: 'Seattle', lat: 47.61, lon: -122.33, tz: 'America/Los_Angeles' },
    { id: 'chicago', zh: '芝加哥', en: 'Chicago', lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
    { id: 'denver', zh: '丹佛', en: 'Denver', lat: 39.74, lon: -104.99, tz: 'America/Denver' },
    { id: 'anchorage', zh: '安克雷奇', en: 'Anchorage', lat: 61.22, lon: -149.9, tz: 'America/Anchorage' },
    { id: 'toronto', zh: '多伦多', en: 'Toronto', lat: 43.65, lon: -79.38, tz: 'America/Toronto' },
    { id: 'vancouver', zh: '温哥华', en: 'Vancouver', lat: 49.28, lon: -123.12, tz: 'America/Vancouver' },
    { id: 'mexicocity', zh: '墨西哥城', en: 'Mexico City', lat: 19.43, lon: -99.13, tz: 'America/Mexico_City' },
    { id: 'bogota', zh: '波哥大', en: 'Bogota', lat: 4.71, lon: -74.07, tz: 'America/Bogota' },
    { id: 'lima', zh: '利马', en: 'Lima', lat: -12.05, lon: -77.04, tz: 'America/Lima' },
    { id: 'saopaulo', zh: '圣保罗', en: 'Sao Paulo', lat: -23.55, lon: -46.63, tz: 'America/Sao_Paulo' },
    { id: 'buenosaires', zh: '布宜诺斯艾利斯', en: 'Buenos Aires', lat: -34.6, lon: -58.38, tz: 'America/Argentina/Buenos_Aires' },
    { id: 'santiago', zh: '圣地亚哥', en: 'Santiago', lat: -33.45, lon: -70.67, tz: 'America/Santiago' },
    { id: 'cairo', zh: '开罗', en: 'Cairo', lat: 30.04, lon: 31.24, tz: 'Africa/Cairo' },
    { id: 'nairobi', zh: '内罗毕', en: 'Nairobi', lat: -1.29, lon: 36.82, tz: 'Africa/Nairobi' },
    { id: 'lagos', zh: '拉各斯', en: 'Lagos', lat: 6.52, lon: 3.38, tz: 'Africa/Lagos' },
    { id: 'capetown', zh: '开普敦', en: 'Cape Town', lat: -33.92, lon: 18.42, tz: 'Africa/Johannesburg' },
    { id: 'sydney', zh: '悉尼', en: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
    { id: 'melbourne', zh: '墨尔本', en: 'Melbourne', lat: -37.81, lon: 144.96, tz: 'Australia/Melbourne' },
    { id: 'brisbane', zh: '布里斯班', en: 'Brisbane', lat: -27.47, lon: 153.03, tz: 'Australia/Brisbane' },
    { id: 'perth', zh: '珀斯', en: 'Perth', lat: -31.95, lon: 115.86, tz: 'Australia/Perth' },
    { id: 'auckland', zh: '奥克兰', en: 'Auckland', lat: -36.85, lon: 174.76, tz: 'Pacific/Auckland' },
    { id: 'wellington', zh: '惠灵顿', en: 'Wellington', lat: -41.29, lon: 174.78, tz: 'Pacific/Auckland' },
    { id: 'honolulu', zh: '檀香山', en: 'Honolulu', lat: 21.31, lon: -157.86, tz: 'Pacific/Honolulu' },
  ].map(Object.freeze),
);

/** 兜底城市：猜不到就回上海（契约要求 guessCity 永不返回 undefined） */
const FALLBACK_CITY = CITIES[0];

const REGION_CITY = Object.freeze({
  CN: 'shanghai', TW: 'taipei', HK: 'hongkong', MO: 'macau',
  JP: 'tokyo', KR: 'seoul', SG: 'singapore', TH: 'bangkok',
  VN: 'hochiminh', ID: 'jakarta', MY: 'kualalumpur', PH: 'manila',
  IN: 'mumbai', AE: 'dubai', TR: 'istanbul', RU: 'moscow',
  GR: 'athens', IT: 'rome', DE: 'berlin', FR: 'paris',
  ES: 'madrid', PT: 'lisbon', NL: 'amsterdam', GB: 'london',
  SE: 'stockholm', NO: 'oslo', FI: 'helsinki', IS: 'reykjavik',
  US: 'newyork', CA: 'toronto', MX: 'mexicocity', BR: 'saopaulo',
  AR: 'buenosaires', CL: 'santiago', CO: 'bogota', PE: 'lima',
  EG: 'cairo', KE: 'nairobi', NG: 'lagos', ZA: 'capetown',
  AU: 'sydney', NZ: 'auckland',
});

/** 球面距离（km） */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearestOf(list, lat, lon) {
  let best = list[0];
  let bestD = Infinity;
  for (const city of list) {
    const d = distanceKm(lat, lon, city.lat, city.lon);
    if (d < bestD) {
      bestD = d;
      best = city;
    }
  }
  return best;
}

/**
 * 按 tz / locale / 坐标猜城市。永不返回 undefined（猜不到就返回上海）。
 * 优先级：tz 精确命中 → 坐标最近 → locale 区域 → 上海。
 */
export function guessCity(input) {
  const opts = input && typeof input === 'object' ? input : {};
  const { tz, locale } = opts;
  const lat = Number(opts.lat);
  const lon = Number(opts.lon);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  if (typeof tz === 'string' && tz) {
    const sameTz = CITIES.filter((c) => c.tz === tz);
    if (sameTz.length > 0) return hasCoords ? nearestOf(sameTz, lat, lon) : sameTz[0];
  }

  if (hasCoords) return nearestOf(CITIES, lat, lon);

  if (typeof locale === 'string' && locale) {
    const region = locale.split(/[-_]/)[1];
    const id = region ? REGION_CITY[region.toUpperCase()] : undefined;
    const hit = id ? findCity(id) : undefined;
    if (hit) return hit;
  }

  return FALLBACK_CITY;
}

/** 按 id / 中文名 / 英文名查城市（忽略大小写与首尾空格） */
export function findCity(id) {
  if (typeof id !== 'string') return undefined;
  const key = id.trim().toLowerCase();
  if (!key) return undefined;
  return CITIES.find(
    (c) => c.id === key || c.zh === id.trim() || c.en.toLowerCase() === key,
  );
}