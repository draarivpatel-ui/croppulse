const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function bounded(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

export function saturation(temp) {
  bounded(temp, -80, 70, 'temperature');
  return 0.6108 * Math.exp(17.27 * temp / (temp + 237.3));
}

export function slope(temp) {
  return 4098 * saturation(temp) / (temp + 237.3) ** 2;
}

export function pressure(elevation) {
  bounded(elevation, -500, 9000, 'elevation');
  return 101.3 * ((293 - 0.0065 * elevation) / 293) ** 5.26;
}

export function extraterrestrial(latitude, doy) {
  const phi = bounded(latitude, -90, 90, 'latitude') * Math.PI / 180;
  bounded(doy, 1, 366, 'day of year');
  if (!Number.isInteger(doy)) throw new RangeError('day of year must be an integer');
  const angle = 2 * Math.PI * doy / 365;
  const distance = 1 + 0.033 * Math.cos(angle);
  const declination = 0.409 * Math.sin(angle - 1.39);
  const sunset = Math.acos(clamp(-Math.tan(phi) * Math.tan(declination), -1, 1));
  const ra = 1440 / Math.PI * 0.0820 * distance *
    (sunset * Math.sin(phi) * Math.sin(declination) +
     Math.cos(phi) * Math.cos(declination) * Math.sin(sunset));
  return { ra: Math.max(0, ra), daylight: 24 / Math.PI * sunset };
}

// FAO-56 Chapter 3, daily grass reference (G = 0).
export function referenceET({ latitude, elevation, doy, tMin, tMax, rhMin, rhMax,
  actualVapor, wind, windHeight = 2, solar, sunshine }) {
  const eMin = saturation(tMin);
  const eMax = saturation(tMax);
  if (tMin > tMax) throw new RangeError('minimum temperature exceeds maximum');
  const temp = (tMin + tMax) / 2;
  const es = (eMin + eMax) / 2;
  let ea;
  if (actualVapor === undefined) {
    bounded(rhMin, 0, 100, 'minimum relative humidity');
    bounded(rhMax, rhMin, 100, 'maximum relative humidity');
    ea = (eMin * rhMax + eMax * rhMin) / 200;
  } else {
    ea = bounded(actualVapor, 0, es, 'actual vapor pressure');
  }
  const gamma = 0.000665 * pressure(elevation);
  const delta = slope(temp);
  bounded(windHeight, 0.5, 100, 'wind height');
  const u2 = bounded(wind, 0, 70, 'wind speed') *
    (windHeight === 2 ? 1 : 4.87 / Math.log(67.8 * windHeight - 5.42));
  const { ra, daylight } = extraterrestrial(latitude, doy);
  const rso = (0.75 + 2e-5 * elevation) * ra;
  const rs = solar === undefined
    ? (0.25 + 0.5 * (bounded(sunshine, 0, daylight, 'sunshine') / (daylight || 1))) * ra
    : bounded(solar, 0, ra, 'solar radiation');
  const rns = 0.77 * rs;
  // Polar night has no observable shortwave ratio; use the zero-cloud-term limit.
  const cloud = rso > 0 ? 1.35 * Math.min(1, rs / rso) - 0.35 : 0;
  const rnl = 4.903e-9 * ((tMax + 273.16) ** 4 + (tMin + 273.16) ** 4) / 2 *
    (0.34 - 0.14 * Math.sqrt(ea)) * cloud;
  const rn = rns - rnl;
  const rawET0 = (0.408 * delta * rn + gamma * (900 / (temp + 273)) * u2 * (es - ea)) /
    (delta + gamma * (1 + 0.34 * u2));
  return { et0: Math.max(0, rawET0), rawET0, temp, es, ea, delta, gamma, u2, ra, daylight,
    rs, rso, rns, rnl, rn };
}

export function rootZone({ fc, wp, depth, p }) {
  bounded(fc, 0, 0.8, 'field capacity');
  bounded(wp, 0, fc, 'wilting point');
  bounded(depth, 0.05, 5, 'root depth');
  bounded(p, 0.01, 0.99, 'depletion fraction');
  if (fc === wp) throw new RangeError('field capacity must exceed wilting point');
  const taw = 1000 * (fc - wp) * depth;
  return { taw, raw: p * taw };
}

// Rain and irrigation enter before ET; overflow drains before uptake.
export function waterDay({ taw, raw, dr, etc, rain, irrigation, infiltration }) {
  bounded(taw, Number.MIN_VALUE, 4000, 'available water');
  bounded(raw, 0, taw, 'readily available water');
  bounded(dr, 0, taw, 'root-zone depletion');
  bounded(etc, 0, 100, 'potential crop ET');
  bounded(rain, 0, 1000, 'rain');
  bounded(irrigation, 0, 1000, 'net irrigation');
  bounded(infiltration, 0, 1000, 'rain infiltration limit');
  const effectiveRain = Math.min(rain, infiltration);
  const runoff = rain - effectiveRain;
  const wet = dr - (effectiveRain + irrigation);
  const dp = Math.max(0, -wet);
  const beforeET = Math.max(0, wet);
  const available = taw - beforeET;
  const ks = beforeET <= raw ? 1 : available / (taw - raw);
  const eta = Math.min(available, ks * etc);
  const next = Math.min(taw, beforeET + eta);
  return { dr: next, ks, etc, eta, rain, effectiveRain, runoff, irrigation, dp,
    critical: next >= 0.9 * taw };
}

export function relativeYield(eta, etc, ky) {
  bounded(etc, 0, Number.MAX_VALUE, 'potential crop ET');
  bounded(eta, 0, etc, 'actual crop ET');
  bounded(ky, 0, 4, 'yield response factor');
  return etc === 0 ? 1 : clamp(1 - ky * (1 - eta / etc), 0, 1);
}
