// Los dos colores que más aparecen en un logo (píxeles RGBA de un <canvas>). Ignora transparentes,
// casi blancos y casi negros —son el fondo, no la marca— y agrupa tonos parecidos en saltos de 32.
// ponytail: conteo por frecuencia; un clustering de color (k-means) si los logos con degradado fallan.
export function dominantColors(data: Uint8ClampedArray): string[] {
  const counts = new Map<string, number>();
  const q = (v: number) => Math.min(255, Math.round(v / 32) * 32);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 128) continue;
    const light = (r + g + b) / 3;
    if (light > 235 || light < 20) continue;
    const hex = `#${[q(r), q(g), q(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([hex]) => hex);
}
