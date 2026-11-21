export const STAGES = ['establish', 'flower', 'fill'];
const crops = {
  maize: { names: ['Maize', 'Ma\u00edz'], kc: [0.3, 1.2, 1.05], ky: [0.4, 1.5, 0.5],
    p: 0.55, kgHa: 6500, kcalKg: 3650, valueKg: 0.22 },
  tomato: { names: ['Tomato', 'Tomate'], kc: [0.6, 1.15, 0.9], ky: [0.4, 1.1, 0.8],
    p: 0.4, kgHa: 41000, kcalKg: 180, valueKg: 0.65 },
  sorghum: { names: ['Sorghum', 'Sorgo'], kc: [0.3, 1, 0.75], ky: [0.2, 0.55, 0.45],
    p: 0.55, kgHa: 4500, kcalKg: 3290, valueKg: 0.24 },
  bean: { names: ['Dry bean', 'Frijol seco'], kc: [0.4, 1.15, 0.9], ky: [0.2, 1.1, 0.75],
    p: 0.45, kgHa: 1900, kcalKg: 3400, valueKg: 0.92 },
  rice: { names: ['Upland rice', 'Arroz de secano'], kc: [0.65, 1.15, 0.95], ky: [0.5, 1.5, 0.8],
    p: 0.2, kgHa: 3200, kcalKg: 3600, valueKg: 0.38 },
};

const plot = (id, crop, stage, area, fc, wp, depth, start, infiltration, efficiency, calendar) =>
  ({ id, cropId: crop, crop: crops[crop], stage, area, fc, wp, depth, start, infiltration, efficiency, calendar });

export const SCENARIOS = [
  {
    id: 'high-plains', names: ['High Plains drought week', 'Semana seca en las Grandes Llanuras'],
    regions: ['Texas High Plains', 'Grandes Llanuras de Texas'], latitude: 34.5, elevation: 1080,
    start: '2027-07-12', startHour: 12, quota: 126, lot: 18, flow: 30, pumpMinutes: 78,
    plots: [
      plot('A', 'maize', 'flower', 1550, 0.28, 0.13, 0.82, 0.78, 18, 0.84, [1, 4, 6]),
      plot('B', 'sorghum', 'fill', 1100, 0.26, 0.12, 0.86, 0.58, 19, 0.82, [0, 3, 5]),
      plot('C', 'bean', 'flower', 820, 0.23, 0.10, 0.50, 0.81, 23, 0.87, [2, 5]),
    ],
    weather: [
      [21, 36, 21, 68, 3.0, 26, 0], [22, 37, 19, 63, 3.4, 27, 0],
      [23, 38, 17, 55, 3.7, 28, 0], [24, 39, 17, 54, 4.1, 27, 0],
      [22, 34, 26, 73, 2.8, 21, 7], [21, 35, 23, 68, 2.5, 25, 0],
      [22, 37, 21, 63, 3.2, 27, 0],
    ],
  },
  {
    id: 'cooperative', names: ['Semi-arid cooperative', 'Cooperativa semi\u00e1rida'],
    regions: ['Semi-arid uplands', 'Tierras altas semi\u00e1ridas'], latitude: 20.7, elevation: 1580,
    start: '2027-04-19', startHour: 13, quota: 144, lot: 18, flow: 30, pumpMinutes: 74,
    plots: [
      plot('A', 'maize', 'flower', 1250, 0.25, 0.11, 0.78, 0.69, 22, 0.87, [0, 3, 6]),
      plot('B', 'tomato', 'flower', 680, 0.24, 0.10, 0.55, 0.74, 25, 0.90, [0, 2, 5]),
      plot('C', 'tomato', 'establish', 730, 0.30, 0.15, 0.32, 0.35, 17, 0.84, [1, 3, 5]),
    ],
    weather: [
      [15, 30, 27, 70, 2.0, 24, 0], [16, 32, 22, 64, 2.3, 26, 0],
      [17, 32, 23, 61, 2.1, 25, 0], [18, 31, 28, 74, 2.7, 22, 4],
      [16, 29, 32, 78, 2.4, 20, 1], [16, 31, 27, 71, 2.5, 24, 0],
      [17, 33, 24, 65, 2.8, 26, 0],
    ],
  },
  {
    id: 'terraces', names: ['Monsoon-delay terraces', 'Terrazas con monz\u00f3n tard\u00edo'],
    regions: ['Monsoon foothills', 'Estribaciones monz\u00f3nicas'], latitude: 27.6, elevation: 790,
    start: '2027-06-14', startHour: 1, quota: 144, lot: 18, flow: 30, pumpMinutes: 72,
    plots: [
      plot('A', 'rice', 'flower', 940, 0.34, 0.19, 0.42, 0.77, 17, 0.78, [1, 4, 6]),
      plot('B', 'bean', 'fill', 820, 0.30, 0.15, 0.58, 0.60, 20, 0.81, [0, 3, 6]),
      plot('C', 'maize', 'establish', 1000, 0.28, 0.13, 0.40, 0.45, 24, 0.79, [2, 4]),
    ],
    weather: [
      [23, 34, 46, 87, 1.1, 21, 0], [24, 35, 41, 84, 1.3, 22, 0],
      [24, 36, 40, 83, 1.4, 23, 0], [25, 36, 38, 82, 1.4, 22, 0],
      [24, 34, 45, 89, 1.2, 20, 11], [23, 30, 63, 95, 1.0, 14, 39],
      [23, 31, 61, 94, 1.1, 16, 9],
    ],
  },
];
