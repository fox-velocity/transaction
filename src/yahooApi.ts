/**
 * Adaptateur de requêtes Yahoo Finance
 * Fonctionne en environnement de développement local (via le proxy Vite /api/yahoo)
 * ET en production statique sur GitHub Pages (via relais CORS publics résilients).
 */

export async function fetchYahooApi(path: string, signal?: AbortSignal): Promise<any> {
  const isGithubPages =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith("github.io") ||
      window.location.hostname.includes("pages.dev") ||
      window.location.hostname.includes("web.app"));

  // 1. Si on est en local ou sur un serveur Node avec proxy actif, tester /api/yahoo
  if (!isGithubPages) {
    try {
      const localRes = await fetch(`/api/yahoo${path}`, { signal });
      if (localRes.ok) {
        const json = await localRes.json();
        if (json?.chart?.result || json?.quotes) {
          return json;
        }
      }
    } catch {
      // Si /api/yahoo échoue, basculer sur les proxys publics
    }
  }

  // 2. Sur GitHub Pages ou hébergeur statique sans backend : relayer via des proxys CORS fiables
  const targetUrl = `https://query1.finance.yahoo.com${path}`;
  const corsProxies = [
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  ];

  for (const proxyUrl of corsProxies) {
    try {
      const proxyRes = await fetch(proxyUrl, { signal });
      if (proxyRes.ok) {
        const text = await proxyRes.text();
        const json = JSON.parse(text);
        if (json?.chart?.result || json?.quotes) {
          return json;
        }
      }
    } catch {
      // Passer au proxy suivant en cas de coupure
    }
  }

  // 3. Dernier essai direct (au cas où le navigateur supporte la requête ou PWA)
  try {
    const directRes = await fetch(`/api/yahoo${path}`, { signal });
    if (directRes.ok) {
      const json = await directRes.json();
      if (json?.chart?.result || json?.quotes) return json;
    }
  } catch {
    // ignore
  }

  throw new Error("Impossible de joindre les serveurs de cotation boursière");
}

/**
 * Générateur de courbe de secours réaliste si tout réseau externe est coupé.
 * Permet à l'application de rester 100% fonctionnelle sur GitHub Pages même sans internet.
 */
export function generateSyntheticPoints(
  basePrice: number,
  period: "1D" | "5D" | "3M" | "1Y"
) {
  const points: any[] = [];
  const base = basePrice > 0 ? basePrice : 50;

  if (period === "1D") {
    const totalMinutes = 78; // Intervalles de 5 minutes de 9h00 à 17h30
    let cur = base * 0.995;
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const dayDateLabel = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

    for (let i = 0; i < totalMinutes; i++) {
      const totalMinFromNine = i * 5;
      const hh = String(9 + Math.floor(totalMinFromNine / 60)).padStart(2, "0");
      const mm = String(totalMinFromNine % 60).padStart(2, "0");
      const delta = (Math.sin(i * 0.35) * 0.4 + Math.cos(i * 0.7) * 0.3) * (base * 0.003);
      cur = Number(Math.max(base * 0.85, cur + delta).toFixed(3));
      const pOpen = Number((cur * 0.999).toFixed(3));
      const pHigh = Number((cur * 1.002).toFixed(3));
      const pLow = Number((cur * 0.998).toFixed(3));

      points.push({
        time: `${dayKey}T${hh}:${mm}:00`,
        timeLabel: `${hh}:${mm}`,
        dayKey,
        dayDateLabel,
        fullDateLabel: `Aujourd'hui à ${hh}:${mm}`,
        price: cur,
        open: pOpen,
        high: pHigh,
        low: pLow,
        vol: Math.floor(1000 + Math.abs(Math.sin(i)) * 5000),
      });
    }
  } else if (period === "5D") {
    const days: Date[] = [];
    let dIter = new Date();
    while (days.length < 5) {
      if (dIter.getDay() !== 0 && dIter.getDay() !== 6) {
        days.unshift(new Date(dIter));
      }
      dIter.setDate(dIter.getDate() - 1);
    }
    let cur = base * 0.98;
    for (let d = 0; d < 5; d++) {
      const dayDate = days[d];
      const dayKey = dayDate.toISOString().slice(0, 10);
      const dayDateLabel = dayDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
      const weekday = dayDate.toLocaleDateString("fr-FR", { weekday: "short" });
      const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);

      for (let m = 0; m < 40; m++) {
        const totalMin = m * 10;
        const hh = String(9 + Math.floor(totalMin / 60)).padStart(2, "0");
        const mm = String(totalMin % 60).padStart(2, "0");
        const delta = (Math.sin(d * 1.7 + m * 0.3) * 0.5 + Math.cos(m * 0.5) * 0.3) * (base * 0.0035);
        cur = Number(Math.max(base * 0.8, cur + delta).toFixed(3));
        points.push({
          time: `${dayKey}T${hh}:${mm}:00`,
          timeLabel: `${hh}:${mm}`,
          dayKey,
          dayDateLabel,
          fullDateLabel: `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`,
          price: cur,
          open: cur,
          high: Number((cur * 1.002).toFixed(3)),
          low: Number((cur * 0.998).toFixed(3)),
          vol: Math.floor(1500 + Math.random() * 4000),
        });
      }
    }
  } else {
    const count = period === "3M" ? 65 : 250;
    let cur = period === "3M" ? base * 0.93 : base * 0.88;
    let d = new Date();
    d.setDate(d.getDate() - (period === "3M" ? 90 : 365));

    for (let i = 0; i < count; i++) {
      d.setDate(d.getDate() + (period === "3M" ? 1.4 : 1.46));
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);

      const delta = (Math.sin(i * 0.15) * 0.6 + Math.cos(i * 0.28) * 0.4) * (base * 0.008);
      cur = Number(Math.max(base * 0.7, cur + delta).toFixed(3));
      const dateStr = d.toISOString().slice(0, 10);
      points.push({
        time: dateStr,
        timeLabel: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        fullDateLabel: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
        price: cur,
        open: Number((cur - delta * 0.5).toFixed(3)),
        high: Number((cur + Math.abs(delta) * 0.7).toFixed(3)),
        low: Number((cur - Math.abs(delta) * 0.7).toFixed(3)),
        vol: Math.floor(10000 + Math.random() * 50000),
      });
    }
  }

  return points;
}
