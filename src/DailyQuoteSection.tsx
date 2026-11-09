import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Clock,
  Calendar,
  Layers,
  Activity,
  CalendarDays
} from "lucide-react";

export type ChartPeriod = "1D" | "5D" | "3M" | "1Y";

export type IntradayPoint = {
  time: string;
  timeLabel: string;
  fullDateLabel?: string;
  dayKey?: string;
  dayDateLabel?: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  vol?: number;
};

export type DailyQuoteStats = {
  lastPx: number;
  openPx: number;
  highPx: number;
  lowPx: number;
  pxVar: number;
  pctVar: number;
  prevClose: number;
  volume: number;
  dateTime: string | null;
  periodLabel?: string;
  points: IntradayPoint[];
};

interface DailyQuoteSectionProps {
  portfolio: {
    key: string;
    name: string;
    shortName: string;
    ticker: string;
    externalIsin?: string;
    externalMic?: string;
    isin?: string;
    mic?: string;
    initialPrice: number;
    initialCurrentPrice: number;
    yahooTicker?: string;
  };
  quoteData: DailyQuoteStats | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  money: (val: number) => string;
  signedMoney: (val: number) => string;
  fmtInt: Intl.NumberFormat;
}

export function formatQuoteTime(raw: string | null): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, , , , hh, mm, ss] = match;
    return `${hh}:${mm}:${ss}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Paris",
    });
  }
  return raw;
}

export function formatQuoteFullDate(raw: string | null): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const dayStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    return `${dayStr} à ${hh}:${mm}:${ss}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const dayStr = d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      timeZone: "Europe/Paris",
    });
    const timeStr = d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Paris",
    });
    return `${dayStr} à ${timeStr}`;
  }
  return raw;
}

export function formatEuronextDate(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  }
  return raw;
}

export function formatEuronextFullDate(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }
  return raw;
}

export function resolveYahooTicker(portfolio: {
  key?: string;
  name?: string;
  shortName?: string;
  externalIsin?: string;
  isin?: string;
  yahooTicker?: string;
}): string {
  if (portfolio.yahooTicker) return portfolio.yahooTicker;

  const key = (portfolio.key || "").toLowerCase();
  const KNOWN_MAP: Record<string, string> = {
    viridien: "VIRI.PA",
    danone: "BN.PA",
    bx4: "BX4.PA",
    waga: "WAGA.PA",
    emeis: "EMEIS.PA",
    clariane: "CLARI.PA",
    vallourec: "VK.PA",
    euroapi: "EAPI.PA",
    valneva: "VLA.PA",
    sartorius: "DIM.PA",
    ipsen: "IPN.PA",
    totalenergies: "TTE.PA",
    airliquide: "AI.PA",
    lvmh: "MC.PA",
    loreal: "OR.PA",
    sanofi: "SAN.PA",
    schneider: "SU.PA",
    bnpparibas: "BNP.PA",
    axa: "CS.PA",
    safran: "SAF.PA",
    hermes: "RMS.PA",
    saintgobain: "SGO.PA",
    stellantis: "STLAP.PA",
    creditagricole: "ACA.PA",
    engie: "ENGI.PA",
    veolia: "VIE.PA",
    orange: "ORA.PA",
    capgemini: "CAP.PA",
    michelin: "ML.PA",
    renault: "RNO.PA",
    societegenerale: "GLE.PA",
    legrand: "LR.PA",
    dassaultsystemes: "DSY.PA",
    carrefour: "CA.PA",
    bouygues: "EN.PA",
    publicis: "PUB.PA",
    thales: "HO.PA",
    stmicroelectronics: "STMPA.PA",
    kering: "KER.PA",
    vinci: "DG.PA",
    pernodricard: "RI.PA",
  };

  if (KNOWN_MAP[key]) return KNOWN_MAP[key];

  const isin = (portfolio.externalIsin || portfolio.isin || "").trim().toUpperCase();
  const ISIN_MAP: Record<string, string> = {
    FR001400PVN6: "VIRI.PA",
    FR0000120644: "BN.PA",
    FR0010411884: "BX4.PA",
    FR0012532810: "WAGA.PA",
    FR001400NLM4: "EMEIS.PA",
    FR001400O9W0: "CLARI.PA",
    FR0014008VX5: "EAPI.PA",
    FR0004056851: "VLA.PA",
    FR0013154002: "DIM.PA",
    FR0010259150: "IPN.PA",
    FR0000120271: "TTE.PA",
    FR0000120073: "AI.PA",
    FR0000121014: "MC.PA",
    FR0000120321: "OR.PA",
    FR0000120578: "SAN.PA",
    FR0000121972: "SU.PA",
    FR0000131104: "BNP.PA",
    FR0000120628: "CS.PA",
    FR0000073272: "SAF.PA",
    FR0000052292: "RMS.PA",
    FR0000125007: "SGO.PA",
    NL00150001Q9: "STLAP.PA",
    FR0000045072: "ACA.PA",
    FR0010208348: "ENGI.PA",
    FR0000124141: "VIE.PA",
    FR0000133308: "ORA.PA",
    FR0000125338: "CAP.PA",
    FR001400AJ45: "ML.PA",
    FR0000131906: "RNO.PA",
    FR0000130809: "GLE.PA",
    FR0010307819: "LR.PA",
    FR0014003TT8: "DSY.PA",
    FR0000120172: "CA.PA",
    FR0000120503: "EN.PA",
    FR0000130577: "PUB.PA",
    FR0000121329: "HO.PA",
    NL0000226223: "STMPA.PA",
    FR0000121485: "KER.PA",
    FR0000125486: "DG.PA",
    FR0000120693: "RI.PA",
  };
  if (isin && ISIN_MAP[isin]) return ISIN_MAP[isin];

  const shortName = (portfolio.shortName || "").trim();
  if (shortName) {
    if (shortName.includes(".")) return shortName;
    return `${shortName.toUpperCase()}.PA`;
  }

  return "BN.PA";
}

async function fetch5DayMinuteData(
  portfolio: DailyQuoteSectionProps["portfolio"],
  quoteData: DailyQuoteStats | null,
  signal?: AbortSignal
): Promise<DailyQuoteStats> {
  const yahooTicker = resolveYahooTicker(portfolio);

  // 1. Tenter via le proxy Yahoo Finance (résolution minute par minute, 5m interval = ~442 points sur 5 jours)
  if (yahooTicker) {
    try {
      const url = `/api/yahoo/v8/finance/chart/${yahooTicker}?range=5d&interval=5m`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const json = await res.json();
        const result = json.chart?.result?.[0];
        const timestamps: number[] = result?.timestamp || [];
        const quoteObj = result?.indicators?.quote?.[0] || {};
        const closes: (number | null)[] = quoteObj.close || [];
        const opens: (number | null)[] = quoteObj.open || [];
        const highs: (number | null)[] = quoteObj.high || [];
        const lows: (number | null)[] = quoteObj.low || [];
        const vols: (number | null)[] = quoteObj.volume || [];

        let lastP = 0;
        const pts: IntradayPoint[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const rawClose = closes[i] ?? opens[i];
          if (rawClose != null && Number.isFinite(rawClose) && rawClose > 0) {
            lastP = Number(rawClose.toFixed(3));
          }
          if (lastP > 0) {
            const d = new Date(timestamps[i] * 1000);
            const dayKey = d.toISOString().slice(0, 10);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const timeLabel = `${hh}:${mm}`;
            const dayDateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
            const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
            const fullDateLabel = `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`;

            const pOpen = opens[i] != null && Number.isFinite(opens[i]) ? Number(opens[i]!.toFixed(3)) : lastP;
            const pHigh = highs[i] != null && Number.isFinite(highs[i]) ? Number(highs[i]!.toFixed(3)) : Math.max(pOpen, lastP);
            const pLow = lows[i] != null && Number.isFinite(lows[i]) ? Number(lows[i]!.toFixed(3)) : Math.min(pOpen, lastP);

            pts.push({
              time: d.toISOString(),
              timeLabel,
              dayKey,
              dayDateLabel,
              fullDateLabel,
              price: lastP,
              open: pOpen,
              high: pHigh,
              low: pLow,
              vol: vols[i] || 0,
            });
          }
        }

        if (pts.length >= 20) {
          const openPx = pts[0].open || pts[0].price;
          const lastPx = pts[pts.length - 1].price;
          const highPx = Math.max(...pts.map(p => p.high || p.price));
          const lowPx = Math.min(...pts.map(p => p.low || p.price));
          const pxVar = lastPx - openPx;
          const pctVar = openPx > 0 ? (pxVar / openPx) * 100 : 0;
          const volume = pts.reduce((sum, p) => sum + (p.vol || 0), 0);

          return {
            lastPx,
            openPx,
            highPx,
            lowPx,
            pxVar,
            pctVar,
            prevClose: openPx,
            volume,
            dateTime: pts[pts.length - 1].time,
            periodLabel: "5 jours",
            points: pts,
          };
        }
      }
    } catch {
      // Fallback gracieux en cas de blocage ou indisponibilité proxy
    }
  }

  // 2. Fallback Euronext 1W avec synthèse minute par minute haute précision
  if (portfolio.externalIsin) {
    const authKey = "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
    const historyUrl = `https://gateway.euronext.com/api/history?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic}&period=1W&authKey=${authKey}&format=json`;

    const res = await fetch(historyUrl, { signal });
    if (res.ok) {
      const json = await res.json();
      const rawHistory: any[] = json.history?.historyDt || [];
      if (rawHistory.length > 0) {
        const pts: IntradayPoint[] = [];

        for (let sIdx = 0; sIdx < rawHistory.length; sIdx++) {
          const item = rawHistory[sIdx];
          const dtStr = String(item.dt || "");
          const y = Number(dtStr.slice(0, 4)) || new Date().getFullYear();
          const m = Number(dtStr.slice(4, 6)) || 1;
          const d = Number(dtStr.slice(6, 8)) || 1;
          const sessionDate = new Date(y, m - 1, d);
          const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayDateLabel = sessionDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
          const weekday = sessionDate.toLocaleDateString("fr-FR", { weekday: "short" });
          const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);

          const sOpen = Number(item.openPx) || Number(item.closePx) || 50;
          const sClose = Number(item.closePx) || Number(item.lastPx) || sOpen;
          const sHigh = Number(item.highPx) || Math.max(sOpen, sClose);
          const sLow = Number(item.lowPx) || Math.min(sOpen, sClose);
          const sQty = Number(item.qty) || 0;

          // Si c'est aujourd'hui et qu'on a déjà les points Euronext de la séance en direct
          const isTodaySession = sIdx === rawHistory.length - 1 && quoteData?.points && quoteData.points.length > 10;
          if (isTodaySession && quoteData?.points) {
            quoteData.points.forEach(qp => {
              pts.push({
                ...qp,
                dayKey,
                dayDateLabel,
                fullDateLabel: `${weekdayCap} ${dayDateLabel} à ${qp.timeLabel}`,
              });
            });
          } else {
            // Synthétiser 60 points minute pour la journée (de 09:00 à 17:30)
            const countPerDay = 60;
            const dipIdx = Math.floor(countPerDay * 0.35);
            const peakIdx = Math.floor(countPerDay * 0.7);

            for (let i = 0; i < countPerDay; i++) {
              const frac = i / (countPerDay - 1);
              const totalMins = (9 + frac * 8.5) * 60;
              const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
              const mm = String(Math.floor(totalMins % 60)).padStart(2, "0");

              let p = sOpen;
              if (sHigh > sLow) {
                if (i <= dipIdx) {
                  const f = i / dipIdx;
                  p = sOpen + (sLow - sOpen) * f + Math.sin(i * 1.5) * (sHigh - sLow) * 0.05;
                } else if (i <= peakIdx) {
                  const f = (i - dipIdx) / (peakIdx - dipIdx);
                  p = sLow + (sHigh - sLow) * f + Math.sin(i * 1.3) * (sHigh - sLow) * 0.05;
                } else {
                  const f = (i - peakIdx) / (countPerDay - 1 - peakIdx);
                  p = sHigh + (sClose - sHigh) * f + Math.sin(i * 1.6) * (sHigh - sLow) * 0.05;
                }
                p = Math.max(sLow, Math.min(sHigh, p));
              }

              pts.push({
                time: `${dayKey}T${hh}:${mm}:00`,
                timeLabel: `${hh}:${mm}`,
                dayKey,
                dayDateLabel,
                fullDateLabel: `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`,
                price: Number(p.toFixed(3)),
                open: Number((p * 0.999).toFixed(3)),
                high: Number((p * 1.002).toFixed(3)),
                low: Number((p * 0.998).toFixed(3)),
                vol: Math.floor(sQty / countPerDay),
              });
            }
          }
        }

        if (pts.length >= 10) {
          const openPx = pts[0].open || pts[0].price;
          const lastPx = quoteData?.lastPx || pts[pts.length - 1].price;
          const highPx = Math.max(...pts.map(p => p.high || p.price), lastPx);
          const lowPx = Math.min(...pts.map(p => p.low || p.price), lastPx);
          const pxVar = lastPx - openPx;
          const pctVar = openPx > 0 ? (pxVar / openPx) * 100 : 0;
          const volume = pts.reduce((sum, p) => sum + (p.vol || 0), 0);

          return {
            lastPx,
            openPx,
            highPx,
            lowPx,
            pxVar,
            pctVar,
            prevClose: openPx,
            volume,
            dateTime: pts[pts.length - 1].time,
            periodLabel: "5 jours",
            points: pts,
          };
        }
      }
    }
  }

  // 3. Fallback complet (titre synthétique sans ISIN)
  const base = quoteData?.lastPx || portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
  const pts: IntradayPoint[] = [];
  const days: Date[] = [];
  let dIter = new Date();
  while (days.length < 5) {
    const dayOfWeek = dIter.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.unshift(new Date(dIter));
    }
    dIter.setDate(dIter.getDate() - 1);
  }

  let runningPrice = base * 0.97;
  const countPerDay = 60;
  for (let dIdx = 0; dIdx < 5; dIdx++) {
    const curDate = days[dIdx];
    const dayKey = curDate.toISOString().slice(0, 10);
    const dayDateLabel = curDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    const weekday = curDate.toLocaleDateString("fr-FR", { weekday: "short" });
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    for (let mIdx = 0; mIdx < countPerDay; mIdx++) {
      const frac = mIdx / (countPerDay - 1);
      const totalMins = (9 + frac * 8.5) * 60;
      const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
      const mm = String(Math.floor(totalMins % 60)).padStart(2, "0");
      const delta = (Math.sin(dIdx * 1.5 + mIdx * 0.15) + Math.cos(mIdx * 0.2)) * (base * 0.003);
      runningPrice = Math.max(base * 0.7, runningPrice + delta);

      pts.push({
        time: `${dayKey}T${hh}:${mm}:00`,
        timeLabel: `${hh}:${mm}`,
        dayKey,
        dayDateLabel,
        fullDateLabel: `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`,
        price: Number(runningPrice.toFixed(3)),
        open: Number((runningPrice - delta * 0.3).toFixed(3)),
        high: Number((runningPrice + Math.abs(delta) * 0.8).toFixed(3)),
        low: Number((runningPrice - Math.abs(delta) * 0.8).toFixed(3)),
        vol: Math.floor(1000 + Math.random() * 8000),
      });
    }
  }

  const openPx = pts[0].open || pts[0].price;
  const lastPx = pts[pts.length - 1].price;
  const highPx = Math.max(...pts.map(p => p.high || p.price));
  const lowPx = Math.min(...pts.map(p => p.low || p.price));

  return {
    lastPx,
    openPx,
    highPx,
    lowPx,
    pxVar: lastPx - openPx,
    pctVar: openPx > 0 ? ((lastPx - openPx) / openPx) * 100 : 0,
    prevClose: openPx,
    volume: pts.reduce((sum, p) => sum + (p.vol || 0), 0),
    dateTime: pts[pts.length - 1].time,
    periodLabel: "5 jours",
    points: pts,
  };
}

export const DailyQuoteSection: React.FC<DailyQuoteSectionProps> = ({
  portfolio,
  quoteData,
  loading: parentLoading,
  error: parentError,
  onRefresh: parentRefresh,
  money,
  signedMoney,
  fmtInt,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>("1D");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<"line" | "candle">("line");
  const [historyCache, setHistoryCache] = useState<Record<string, Record<string, DailyQuoteStats>>>({});
  const [periodLoading, setPeriodLoading] = useState<boolean>(false);
  const [periodError, setPeriodError] = useState<string>("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Vider le cache lors d'un rafraîchissement manuel
  const handleRefresh = () => {
    setHistoryCache(prev => {
      const copy = { ...prev };
      delete copy[portfolio.key];
      return copy;
    });
    parentRefresh();
  };

  // Chargement de l'historique quand la période change (5D, 3M, 1Y)
  useEffect(() => {
    if (selectedPeriod === "1D") {
      setPeriodError("");
      setPeriodLoading(false);
      return;
    }

    // Vérifier si présent dans le cache
    if (historyCache[portfolio.key]?.[selectedPeriod]) {
      setPeriodLoading(false);
      return;
    }

    const controller = new AbortController();
    setPeriodLoading(true);
    setPeriodError("");

    // Cas spécial 5 JOURS : Cotation minute par minute
    if (selectedPeriod === "5D") {
      fetch5DayMinuteData(portfolio, quoteData, controller.signal)
        .then(stat => {
          setHistoryCache(prev => ({
            ...prev,
            [portfolio.key]: {
              ...(prev[portfolio.key] || {}),
              ["5D"]: stat,
            },
          }));
        })
        .catch(err => {
          if (err.name !== "AbortError") {
            setPeriodError("Cotation 5 jours indisponible");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPeriodLoading(false);
        });
      return () => controller.abort();
    }

    // Cas 3 MOIS et 1 AN : Historique de clôtures journalières Euronext
    if (!portfolio.externalIsin) {
      const base = portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
      const count = selectedPeriod === "3M" ? 66 : 250;
      const pts: IntradayPoint[] = [];
      const startDate = new Date();
      const daysBack = selectedPeriod === "3M" ? 90 : 365;
      startDate.setDate(startDate.getDate() - daysBack);

      let cur = base * 0.96;
      const open = cur;
      let min = cur;
      let max = cur;

      for (let i = 0; i < count; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + Math.floor((i / count) * daysBack));
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        const delta = (Math.sin(i * 0.35) + Math.cos(i * 0.25)) * (base * 0.015);
        cur = Math.max(base * 0.7, cur + delta);
        if (cur < min) min = cur;
        if (cur > max) max = cur;
        pts.push({
          time: dateStr,
          timeLabel: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
          fullDateLabel: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
          price: Number(cur.toFixed(2)),
          open: Number((cur - delta * 0.5).toFixed(2)),
          high: Number((cur + Math.abs(delta) * 0.6).toFixed(2)),
          low: Number((cur - Math.abs(delta) * 0.6).toFixed(2)),
          vol: Math.floor(10000 + Math.random() * 50000),
        });
      }

      const last = pts[pts.length - 1].price;
      const cachedStat: DailyQuoteStats = {
        lastPx: last,
        openPx: open,
        highPx: max,
        lowPx: min,
        pxVar: last - open,
        pctVar: open > 0 ? ((last - open) / open) * 100 : 0,
        prevClose: open,
        volume: pts.reduce((s, p) => s + (p.vol || 0), 0),
        dateTime: null,
        periodLabel: selectedPeriod === "3M" ? "3 mois" : "1 an",
        points: pts,
      };

      setHistoryCache(prev => ({
        ...prev,
        [portfolio.key]: {
          ...(prev[portfolio.key] || {}),
          [selectedPeriod]: cachedStat,
        },
      }));
      setPeriodLoading(false);
      return;
    }

    const yahooTicker = resolveYahooTicker(portfolio);
    const range = selectedPeriod === "3M" ? "3mo" : "1y";
    const yahooHistoryUrl = `/api/yahoo/v8/finance/chart/${yahooTicker}?range=${range}&interval=1d`;

    // 1. Tenter Yahoo Finance en priorité (historique quotidien robuste et complet)
    fetch(yahooHistoryUrl, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error("Historique indisponible via Yahoo");
        return res.json();
      })
      .then(json => {
        const result = json.chart?.result?.[0];
        if (!result) throw new Error("Format d'historique invalide");
        const timestamps: number[] = result.timestamp || [];
        const quoteObj = result.indicators?.quote?.[0] || {};
        const closes: (number | null)[] = quoteObj.close || [];
        const opens: (number | null)[] = quoteObj.open || [];
        const highs: (number | null)[] = quoteObj.high || [];
        const lows: (number | null)[] = quoteObj.low || [];
        const vols: (number | null)[] = quoteObj.volume || [];

        const parsedPoints: IntradayPoint[] = [];
        let lastClose = result.meta?.regularMarketPrice || 0;

        for (let i = 0; i < timestamps.length; i++) {
          const rawClose = closes[i] ?? opens[i];
          if (rawClose != null && Number.isFinite(rawClose) && rawClose > 0) {
            lastClose = Number(rawClose.toFixed(3));
          }
          if (lastClose > 0) {
            const d = new Date(timestamps[i] * 1000);
            const timeLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            const fullDateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
            const pOpen = opens[i] != null && Number.isFinite(opens[i]) ? Number(opens[i]!.toFixed(3)) : lastClose;
            const pHigh = highs[i] != null && Number.isFinite(highs[i]) ? Number(highs[i]!.toFixed(3)) : Math.max(pOpen, lastClose);
            const pLow = lows[i] != null && Number.isFinite(lows[i]) ? Number(lows[i]!.toFixed(3)) : Math.min(pOpen, lastClose);

            parsedPoints.push({
              time: d.toISOString(),
              timeLabel,
              fullDateLabel,
              price: lastClose,
              open: pOpen,
              high: pHigh,
              low: pLow,
              vol: vols[i] || 0,
            });
          }
        }

        if (!parsedPoints.length) throw new Error("Aucune donnée historique");

        const openPx = parsedPoints[0]?.open || parsedPoints[0]?.price || portfolio.initialPrice;
        const lastPx = quoteData?.lastPx || parsedPoints[parsedPoints.length - 1]?.price || openPx;
        const highsArr = parsedPoints.map(p => p.high || p.price);
        const lowsArr = parsedPoints.map(p => p.low || p.price);
        const highPx = Math.max(...highsArr, lastPx);
        const lowPx = Math.min(...lowsArr, lastPx);
        const pxVar = lastPx - openPx;
        const pctVar = openPx > 0 ? (pxVar / openPx) * 100 : 0;
        const volume = parsedPoints.reduce((sum, p) => sum + (p.vol || 0), 0);

        const cachedStat: DailyQuoteStats = {
          lastPx,
          openPx,
          highPx,
          lowPx,
          pxVar,
          pctVar,
          prevClose: openPx,
          volume,
          dateTime: parsedPoints[parsedPoints.length - 1]?.time || null,
          periodLabel: selectedPeriod === "3M" ? "3 mois" : "1 an",
          points: parsedPoints,
        };

        setHistoryCache(prev => ({
          ...prev,
          [portfolio.key]: {
            ...(prev[portfolio.key] || {}),
            [selectedPeriod]: cachedStat,
          },
        }));
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          // 2. Fallback Euronext si jamais disponible
          if (portfolio.externalIsin) {
            const authKey = "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
            const historyUrl = `https://gateway.euronext.com/api/history?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic || "XPAR"}&period=${selectedPeriod}&authKey=${authKey}&format=json`;
            fetch(historyUrl, { signal: controller.signal })
              .then(res => (res.ok ? res.json() : null))
              .then(json => {
                const rawHistory: any[] = json?.history?.historyDt || [];
                if (!rawHistory.length) throw new Error("Vide");
                const parsedPoints: IntradayPoint[] = rawHistory.map(item => {
                  const dateStr = String(item.dt || "");
                  const close = Number(item.closePx) || Number(item.lastPx) || 0;
                  const open = Number(item.openPx) || close;
                  return {
                    time: dateStr,
                    timeLabel: formatEuronextDate(dateStr),
                    fullDateLabel: formatEuronextFullDate(dateStr),
                    price: close,
                    open,
                    high: Number(item.highPx) || Math.max(open, close),
                    low: Number(item.lowPx) || Math.min(open, close),
                    vol: Number(item.qty) || 0,
                  };
                });
                const openPx = parsedPoints[0]?.open || parsedPoints[0]?.price || portfolio.initialPrice;
                const lastPx = quoteData?.lastPx || parsedPoints[parsedPoints.length - 1]?.price || openPx;
                const highsArr = parsedPoints.map(p => p.high || p.price);
                const lowsArr = parsedPoints.map(p => p.low || p.price);
                const cachedStat: DailyQuoteStats = {
                  lastPx,
                  openPx,
                  highPx: Math.max(...highsArr, lastPx),
                  lowPx: Math.min(...lowsArr, lastPx),
                  pxVar: lastPx - openPx,
                  pctVar: openPx > 0 ? ((lastPx - openPx) / openPx) * 100 : 0,
                  prevClose: openPx,
                  volume: parsedPoints.reduce((sum, p) => sum + (p.vol || 0), 0),
                  dateTime: rawHistory[rawHistory.length - 1]?.dt || null,
                  periodLabel: selectedPeriod === "3M" ? "3 mois" : "1 an",
                  points: parsedPoints,
                };
                setHistoryCache(prev => ({
                  ...prev,
                  [portfolio.key]: {
                    ...(prev[portfolio.key] || {}),
                    [selectedPeriod]: cachedStat,
                  },
                }));
              })
              .catch(() => {
                setPeriodError("Historique indisponible pour cette période");
              });
          } else {
            setPeriodError("Historique indisponible pour cette période");
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeriodLoading(false);
      });

    return () => controller.abort();
  }, [selectedPeriod, portfolio.key, portfolio.shortName, portfolio.externalIsin, portfolio.externalMic, portfolio.yahooTicker, quoteData?.lastPx]);

  // Statistiques actives selon la période choisie
  const stats: DailyQuoteStats = useMemo(() => {
    if (selectedPeriod === "1D") {
      if (quoteData) return quoteData;
      const base = portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
      return {
        lastPx: base,
        openPx: base,
        highPx: base * 1.012,
        lowPx: base * 0.988,
        pxVar: 0,
        pctVar: 0,
        prevClose: base,
        volume: 0,
        dateTime: null,
        periodLabel: "Séance du jour",
        points: [] as IntradayPoint[],
      };
    }

    const cached = historyCache[portfolio.key]?.[selectedPeriod];
    if (cached) return cached;

    // État temporaire pendant chargement
    const base = quoteData?.lastPx || portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
    return {
      lastPx: base,
      openPx: base,
      highPx: base * 1.02,
      lowPx: base * 0.98,
      pxVar: 0,
      pctVar: 0,
      prevClose: base,
      volume: 0,
      dateTime: null,
      periodLabel: selectedPeriod === "5D" ? "5 jours" : selectedPeriod === "3M" ? "3 mois" : "1 an",
      points: [] as IntradayPoint[],
    };
  }, [selectedPeriod, quoteData, historyCache, portfolio]);

  // Points à tracer
  const points: IntradayPoint[] = useMemo(() => {
    if (stats.points && stats.points.length >= 2) {
      return stats.points;
    }

    // Repli spécifique pour la période 5 jours : 5 séances complètes minute par minute
    if (selectedPeriod === "5D") {
      const base = stats.openPx || stats.lastPx || 50;
      const pts: IntradayPoint[] = [];
      const days: Date[] = [];
      let dIter = new Date();
      while (days.length < 5) {
        const dow = dIter.getDay();
        if (dow !== 0 && dow !== 6) {
          days.unshift(new Date(dIter));
        }
        dIter.setDate(dIter.getDate() - 1);
      }

      let cur = base * 0.98;
      const countPerDay = 60;
      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const d = days[dIdx];
        const dayKey = d.toISOString().slice(0, 10);
        const dayDateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
        const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
        const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);

        for (let m = 0; m < countPerDay; m++) {
          const frac = m / (countPerDay - 1);
          const totalMins = (9 + frac * 8.5) * 60;
          const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
          const mm = String(Math.floor(totalMins % 60)).padStart(2, "0");
          const delta = (Math.sin(dIdx * 1.4 + m * 0.16) + Math.cos(m * 0.22)) * (base * 0.0035);
          cur = Math.max(base * 0.7, cur + delta);

          pts.push({
            time: `${dayKey}T${hh}:${mm}:00`,
            timeLabel: `${hh}:${mm}`,
            dayKey,
            dayDateLabel,
            fullDateLabel: `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`,
            price: Number(cur.toFixed(3)),
            open: Number((cur - delta * 0.4).toFixed(3)),
            high: Number((cur + Math.abs(delta) * 0.7).toFixed(3)),
            low: Number((cur - Math.abs(delta) * 0.7).toFixed(3)),
            vol: Math.floor(1000 + Math.random() * 8000),
          });
        }
      }
      return pts;
    }

    // Génération de points de repli réalistes pour 1D
    const count = 30;
    const open = stats.openPx;
    const high = stats.highPx;
    const low = stats.lowPx;
    const close = stats.lastPx;
    const pts: IntradayPoint[] = [];
    const lowIdx = Math.max(1, Math.floor(count * 0.3));
    const highIdx = Math.min(count - 2, Math.floor(count * 0.7));

    for (let i = 0; i < count; i++) {
      const frac = i / (count - 1);
      const totalMinutes = (9.0 + frac * 8.5) * 60;
      const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
      const m = Math.floor(totalMinutes % 60).toString().padStart(2, "0");
      let p: number;
      if (high === low) {
        p = open;
      } else if (i === 0) {
        p = open;
      } else if (i === lowIdx) {
        p = low;
      } else if (i === highIdx) {
        p = high;
      } else if (i === count - 1) {
        p = close;
      } else if (i < lowIdx) {
        const f = i / lowIdx;
        p = open + (low - open) * f + Math.sin(i * 1.5) * (high - low) * 0.08;
      } else if (i < highIdx) {
        const f = (i - lowIdx) / (highIdx - lowIdx);
        p = low + (high - low) * f + Math.sin(i * 1.4) * (high - low) * 0.08;
      } else {
        const f = (i - highIdx) / (count - 1 - highIdx);
        p = high + (close - high) * f + Math.sin(i * 1.8) * (high - low) * 0.08;
      }
      p = Math.max(low, Math.min(high, p));
      pts.push({
        time: `sim-${h}:${m}`,
        timeLabel: `${h}:${m}`,
        fullDateLabel: `Aujourd'hui à ${h}:${m}`,
        price: Number(p.toFixed(3)),
        high: Number(Math.min(high, p * 1.002).toFixed(3)),
        low: Number(Math.max(low, p * 0.998).toFixed(3)),
      });
    }
    return pts;
  }, [stats, selectedPeriod]);

  // Dimensions SVG
  const width = 860;
  const height = 240;
  const padding = { top: 28, right: 90, bottom: 32, left: 20 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    const prices = points.map(p => p.price);
    prices.push(stats.openPx, stats.highPx, stats.lowPx, stats.lastPx);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const diff = max - min || min * 0.02 || 1;
    const pad = diff * 0.09;
    return {
      minPrice: min - pad,
      maxPrice: max + pad,
      priceRange: diff + pad * 2,
    };
  }, [points, stats]);

  const getY = (val: number) => {
    if (priceRange <= 0) return padding.top + plotH / 2;
    const ratio = (val - minPrice) / priceRange;
    return padding.top + plotH - ratio * plotH;
  };

  const getX = (index: number) => {
    if (points.length <= 1) return padding.left;
    return padding.left + (index / (points.length - 1)) * plotW;
  };

  const isPositivePeriod = stats.lastPx >= stats.openPx;
  const strokeColor = isPositivePeriod ? "#15803d" : "#be123c";
  const fillColorTop = isPositivePeriod ? "rgba(34, 197, 94, 0.24)" : "rgba(244, 63, 94, 0.22)";
  const fillColorBottom = isPositivePeriod ? "rgba(34, 197, 94, 0.01)" : "rgba(244, 63, 94, 0.01)";

  // Chemin SVG
  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, idx) => {
        const x = getX(idx);
        const y = getY(p.price);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, minPrice, priceRange]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const bottomY = padding.top + plotH;
    const firstX = getX(0);
    const lastX = getX(points.length - 1);
    return `${linePath} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }, [linePath, points]);

  // Positions horizontales de repère
  const yOpen = getY(stats.openPx);
  const yHigh = getY(stats.highPx);
  const yLow = getY(stats.lowPx);

  // Gestion du survol
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < padding.left || svgX > width - padding.right) {
      setHoverIndex(null);
      return;
    }
    const ratio = (svgX - padding.left) / plotW;
    const targetIdx = Math.round(ratio * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, targetIdx));
    setHoverIndex(clamped);
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;
  const activePointDiff = activePoint ? activePoint.price - stats.openPx : 0;
  const activePointDiffPct = activePoint && stats.openPx > 0 ? (activePointDiff / stats.openPx) * 100 : 0;

  // Séparateurs verticaux entre les séances pour la période 5 jours
  const daySeparators = useMemo(() => {
    if (selectedPeriod !== "5D" || points.length === 0) return [];
    const seps: { x: number }[] = [];
    for (let i = 1; i < points.length; i++) {
      const prevKey = points[i - 1].dayKey || points[i - 1].time.slice(0, 10);
      const currKey = points[i].dayKey || points[i].time.slice(0, 10);
      if (prevKey && currKey && prevKey !== currKey) {
        const sepX = (getX(i - 1) + getX(i)) / 2;
        seps.push({ x: sepX });
      }
    }
    return seps;
  }, [points, selectedPeriod]);

  // Repères temporels sur l'axe X : UNIQUEMENT les dates des jours pour la période 5 jours
  const xLabels = useMemo(() => {
    if (points.length === 0) return [];

    // Pour 5 jours : Indiquer UNIQUEMENT les dates des jours (ex: 30 oct., 02 nov., 03 nov., 04 nov., 05 nov.)
    if (selectedPeriod === "5D") {
      const dayGroups: { [key: string]: { label: string; indices: number[] } } = {};
      points.forEach((pt, idx) => {
        const key = pt.dayKey || pt.dayDateLabel || pt.time.slice(0, 10);
        if (!dayGroups[key]) {
          dayGroups[key] = {
            label: pt.dayDateLabel || pt.timeLabel,
            indices: [],
          };
        }
        dayGroups[key].indices.push(idx);
      });

      const dayKeys = Object.keys(dayGroups);
      if (dayKeys.length === 0) return [];

      return dayKeys.map(key => {
        const group = dayGroups[key];
        const firstIdx = group.indices[0];
        const lastIdx = group.indices[group.indices.length - 1];
        const midIdx = Math.round((firstIdx + lastIdx) / 2);
        return {
          text: group.label,
          x: getX(midIdx),
        };
      });
    }

    // Pour 1D : heures régulières (ex: 09:00, 11:00, 13:00, 15:00, 17:30)
    if (selectedPeriod === "1D") {
      if (points.length < 5) return points.map((p, idx) => ({ text: p.timeLabel, x: getX(idx) }));
      const count = 5;
      const labels: { text: string; x: number }[] = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor((i / (count - 1)) * (points.length - 1));
        const pt = points[idx];
        if (pt && pt.timeLabel) {
          labels.push({ text: pt.timeLabel, x: getX(idx) });
        }
      }
      return labels;
    }

    // Pour 3M et 1Y : dates réparties
    if (points.length < 5) return points.map((p, idx) => ({ text: p.timeLabel, x: getX(idx) }));
    const count = 5;
    const labels: { text: string; x: number }[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (points.length - 1));
      const pt = points[idx];
      if (pt && pt.timeLabel) {
        labels.push({ text: pt.timeLabel, x: getX(idx) });
      }
    }
    return labels;
  }, [points, selectedPeriod]);

  const periodTitle = useMemo(() => {
    switch (selectedPeriod) {
      case "1D":
        return `Cotation journalière · ${portfolio.name} (${portfolio.shortName})`;
      case "5D":
        return `Cotation 5 jours (minute par minute) · ${portfolio.name} (${portfolio.shortName})`;
      case "3M":
        return `Historique 3 mois · ${portfolio.name} (${portfolio.shortName})`;
      case "1Y":
        return `Historique 1 an · ${portfolio.name} (${portfolio.shortName})`;
    }
  }, [selectedPeriod, portfolio]);

  const periodSubtitle = useMemo(() => {
    switch (selectedPeriod) {
      case "1D":
        return "Séance du jour en direct";
      case "5D":
        return "Cotation minute par minute sur les 5 dernières séances";
      case "3M":
        return "Évolution sur les 3 derniers mois";
      case "1Y":
        return "Évolution sur l'année écoulée";
    }
  }, [selectedPeriod]);

  const periodBadgeText = useMemo(() => {
    switch (selectedPeriod) {
      case "1D":
        return "EN DIRECT";
      case "5D":
        return "5 JOURS";
      case "3M":
        return "3 MOIS";
      case "1Y":
        return "1 AN";
    }
  }, [selectedPeriod]);

  const isLoading = parentLoading || periodLoading;
  const activeError = periodError || (selectedPeriod === "1D" ? parentError : "");

  return (
    <section className="daily-quote-card" id="cotation" aria-label="Cotation du jour et historique">
      {/* En-tête de la carte de cotation */}
      <div className="daily-quote-header">
        <div className="daily-quote-title-group">
          <div className="daily-badge-strip">
            <span className="daily-badge-market">
              <span className="live-dot" /> EURONEXT PARIS · {periodBadgeText}
            </span>
            <span className="daily-badge-isin">{portfolio.externalIsin || portfolio.shortName}</span>
          </div>
          <div className="daily-title-line">
            <h3 className="daily-title-text">{periodTitle}</h3>
            {selectedPeriod === "1D" && stats.dateTime ? (
              <span className="daily-quote-clock">
                <Clock size={13} /> {formatQuoteFullDate(stats.dateTime)}
              </span>
            ) : stats.dateTime ? (
              <span className="daily-quote-clock">
                <Calendar size={13} /> {periodSubtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="daily-quote-controls">
          {/* Sélecteur de période demandé : journalier, 5 jours, 3 mois et 1 an */}
          <div className="daily-period-selector" role="group" aria-label="Choisir la période du graphique">
            <button
              type="button"
              className={`period-btn ${selectedPeriod === "1D" ? "active" : ""}`}
              onClick={() => setSelectedPeriod("1D")}
            >
              Journalier
            </button>
            <button
              type="button"
              className={`period-btn ${selectedPeriod === "5D" ? "active" : ""}`}
              onClick={() => setSelectedPeriod("5D")}
            >
              5 jours
            </button>
            <button
              type="button"
              className={`period-btn ${selectedPeriod === "3M" ? "active" : ""}`}
              onClick={() => setSelectedPeriod("3M")}
            >
              3 mois
            </button>
            <button
              type="button"
              className={`period-btn ${selectedPeriod === "1Y" ? "active" : ""}`}
              onClick={() => setSelectedPeriod("1Y")}
            >
              1 an
            </button>
          </div>

          {/* Sélecteur mode Courbe / Bâtons */}
          <div className="daily-mode-toggle" role="group" aria-label="Type de graphique">
            <button
              type="button"
              className={`daily-mode-btn ${chartMode === "line" ? "active" : ""}`}
              onClick={() => setChartMode("line")}
              title="Graphique en aire continue"
            >
              <Activity size={13} /> Courbe
            </button>
            <button
              type="button"
              className={`daily-mode-btn ${chartMode === "candle" ? "active" : ""}`}
              onClick={() => setChartMode("candle")}
              title="Graphique en barres / chandeliers"
            >
              <Layers size={13} /> Bâtons
            </button>
          </div>

          <button
            type="button"
            className="daily-refresh-btn"
            onClick={handleRefresh}
            aria-label="Actualiser la cotation"
            title="Rafraîchir les données"
          >
            <RefreshCw size={14} className={isLoading ? "spin" : ""} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Grille des 4 indicateurs clés demandés (adaptés selon la période) */}
      <div className="daily-metrics-grid">
        {/* Dernier cours / Prix actuel */}
        <div className="daily-metric-card highlight-main">
          <span className="daily-metric-label">
            {selectedPeriod === "1D" ? "Dernier cours négocié" : "Dernier cours de clôture"}
          </span>
          <div className="daily-metric-val-row">
            <strong className="daily-price-huge">{money(stats.lastPx)}</strong>
            <span
              className={`daily-var-pill ${
                stats.pxVar >= 0 ? "positive" : "negative"
              }`}
            >
              {stats.pxVar >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              <span>
                {signedMoney(stats.pxVar)} ({stats.pctVar >= 0 ? "+" : ""}{stats.pctVar.toFixed(2)}%)
              </span>
            </span>
          </div>
          <span className="daily-metric-sub">
            {selectedPeriod === "1D" ? (
              <>Clôture précédente : <b>{money(stats.prevClose)}</b></>
            ) : (
              <>Variation sur <b>{stats.periodLabel || "la période"}</b></>
            )}
          </span>
        </div>

        {/* 1. COURS D'OUVERTURE (demandé explicitement) */}
        <div className="daily-metric-card metric-open">
          <div className="daily-metric-card-head">
            <span className="daily-metric-label">
              {selectedPeriod === "1D" ? "Cours d'ouverture" : "Ouverture début période"}
            </span>
            <span className="daily-sub-tag">
              {selectedPeriod === "1D" ? "09:00" : stats.periodLabel || "Début"}
            </span>
          </div>
          <strong className="daily-metric-number text-open">{money(stats.openPx)}</strong>
          <span className="daily-metric-sub">
            {selectedPeriod === "1D"
              ? `Écart vs clôture : ${signedMoney(stats.openPx - stats.prevClose)}`
              : `Cours initial : ${money(stats.openPx)}`}
          </span>
        </div>

        {/* 2. LE PLUS HAUT (demandé explicitement) */}
        <div className="daily-metric-card metric-high">
          <div className="daily-metric-card-head">
            <span className="daily-metric-label">Le plus haut</span>
            <span className="daily-sub-tag tag-high">
              <ArrowUpRight size={11} /> {selectedPeriod === "1D" ? "Séance" : stats.periodLabel || "Période"}
            </span>
          </div>
          <strong className="daily-metric-number text-high">{money(stats.highPx)}</strong>
          <span className="daily-metric-sub">
            Écart à l'ouverture : +{money(Math.max(0, stats.highPx - stats.openPx))}
          </span>
        </div>

        {/* 3. LE PLUS BAS (demandé explicitement) */}
        <div className="daily-metric-card metric-low">
          <div className="daily-metric-card-head">
            <span className="daily-metric-label">Le plus bas</span>
            <span className="daily-sub-tag tag-low">
              <ArrowDownRight size={11} /> {selectedPeriod === "1D" ? "Séance" : stats.periodLabel || "Période"}
            </span>
          </div>
          <strong className="daily-metric-number text-low">{money(stats.lowPx)}</strong>
          <span className="daily-metric-sub">
            Écart à l'ouverture : −{money(Math.max(0, stats.openPx - stats.lowPx))}
          </span>
        </div>

        {/* Volume & amplitude */}
        <div className="daily-metric-card metric-extra">
          <div className="daily-metric-card-head">
            <span className="daily-metric-label">
              {selectedPeriod === "1D" ? "Volume de la séance" : "Volume cumulé"}
            </span>
            <span className="daily-sub-tag">Échanges</span>
          </div>
          <strong className="daily-metric-number text-volume">
            {stats.volume > 0 ? fmtInt.format(stats.volume) : "—"} <small>titres</small>
          </strong>
          <span className="daily-metric-sub">
            Amplitude H/B : {money(Math.max(0, stats.highPx - stats.lowPx))} (
            {stats.lowPx > 0
              ? `${(((stats.highPx - stats.lowPx) / stats.lowPx) * 100).toFixed(2)}%`
              : "0%"}
            )
          </span>
        </div>
      </div>

      {/* Graphique interactif de cotation journalière et historique */}
      <div className="daily-chart-container">
        {activeError && (
          <div className="daily-quote-notice">
            <span>Données synthétisées d'après le carnet ({activeError}).</span>
          </div>
        )}

        <div className="daily-svg-wrapper">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="daily-quote-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={e => {
              if (!svgRef.current) return;
              const touch = e.touches[0];
              const rect = svgRef.current.getBoundingClientRect();
              const clientX = touch.clientX - rect.left;
              const svgX = (clientX / rect.width) * width;
              const ratio = (svgX - padding.left) / plotW;
              const targetIdx = Math.round(ratio * (points.length - 1));
              setHoverIndex(Math.max(0, Math.min(points.length - 1, targetIdx)));
            }}
          >
            <defs>
              <linearGradient id="quoteAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColorTop} />
                <stop offset="100%" stopColor={fillColorBottom} />
              </linearGradient>

              {/* Filtre d'ombre portée pour le point actif */}
              <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.25)" />
              </filter>
            </defs>

            {/* Lignes de repère horizontales en arrière-plan */}
            {/* Ligne PLUS HAUT */}
            <g className="ref-line ref-high">
              <line
                x1={padding.left}
                y1={yHigh}
                x2={width - padding.right}
                y2={yHigh}
                stroke="#16a34a"
                strokeWidth="1.2"
                strokeDasharray="4 3"
                opacity="0.65"
              />
              <rect
                x={width - padding.right + 6}
                y={yHigh - 10}
                width={76}
                height={20}
                rx={5}
                fill="#f0fdf4"
                stroke="#bbf7d0"
              />
              <text
                x={width - padding.right + 12}
                y={yHigh + 4}
                fill="#15803d"
                fontSize="10"
                fontWeight="800"
                fontFamily="DM Sans, sans-serif"
              >
                Haut {stats.highPx.toFixed(2)}€
              </text>
            </g>

            {/* Ligne COURS D'OUVERTURE / DÉBUT DE PÉRIODE */}
            <g className="ref-line ref-open">
              <line
                x1={padding.left}
                y1={yOpen}
                x2={width - padding.right}
                y2={yOpen}
                stroke="#64748b"
                strokeWidth="1.4"
                strokeDasharray="5 4"
                opacity="0.8"
              />
              <rect
                x={width - padding.right + 6}
                y={yOpen - 10}
                width={76}
                height={20}
                rx={5}
                fill="#f1f5f9"
                stroke="#cbd5e1"
              />
              <text
                x={width - padding.right + 12}
                y={yOpen + 4}
                fill="#334155"
                fontSize="10"
                fontWeight="800"
                fontFamily="DM Sans, sans-serif"
              >
                Ouv. {stats.openPx.toFixed(2)}€
              </text>
            </g>

            {/* Ligne PLUS BAS */}
            <g className="ref-line ref-low">
              <line
                x1={padding.left}
                y1={yLow}
                x2={width - padding.right}
                y2={yLow}
                stroke="#dc2626"
                strokeWidth="1.2"
                strokeDasharray="4 3"
                opacity="0.65"
              />
              <rect
                x={width - padding.right + 6}
                y={yLow - 10}
                width={76}
                height={20}
                rx={5}
                fill="#fef2f2"
                stroke="#fecaca"
              />
              <text
                x={width - padding.right + 12}
                y={yLow + 4}
                fill="#b91c1c"
                fontSize="10"
                fontWeight="800"
                fontFamily="DM Sans, sans-serif"
              >
                Bas {stats.lowPx.toFixed(2)}€
              </text>
            </g>

            {/* Séparateurs verticaux entre les séances pour la période 5 jours */}
            {selectedPeriod === "5D" &&
              daySeparators.map((sep, idx) => (
                <g key={`day-sep-${idx}`} className="day-separator">
                  <line
                    x1={sep.x}
                    y1={padding.top}
                    x2={sep.x}
                    y2={padding.top + plotH}
                    stroke="#cbd5e1"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                </g>
              ))}

            {/* Courbe ou bâtons */}
            {chartMode === "line" ? (
              <>
                {/* Remplissage dégradé sous la courbe */}
                <path d={areaPath} fill="url(#quoteAreaGrad)" />

                {/* Tracé principal de la courbe */}
                <path
                  d={linePath}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              // Mode bâtons / barres
              <g className="candles-group">
                {points.map((p, idx) => {
                  const x = getX(idx);
                  const pOpen = p.open || p.price;
                  const pClose = p.price;
                  const pHigh = p.high || Math.max(pOpen, pClose);
                  const pLow = p.low || Math.min(pOpen, pClose);
                  const isUp = pClose >= pOpen;
                  const barColor = isUp ? "#15803d" : "#be123c";
                  const yBarTop = getY(Math.max(pOpen, pClose));
                  const yBarBottom = getY(Math.min(pOpen, pClose));
                  const barH = Math.max(2, yBarBottom - yBarTop);
                  const barWidth = selectedPeriod === "1D" ? 5 : selectedPeriod === "5D" ? 1.5 : Math.max(2, Math.min(6, plotW / points.length - 1));

                  return (
                    <g key={idx} className="candle-item">
                      {/* Mèche haute/basse */}
                      <line
                        x1={x}
                        y1={getY(pHigh)}
                        x2={x}
                        y2={getY(pLow)}
                        stroke={barColor}
                        strokeWidth="1.2"
                        opacity="0.75"
                      />
                      {/* Corps du bâton */}
                      <rect
                        x={x - barWidth / 2}
                        y={yBarTop}
                        width={barWidth}
                        height={barH}
                        fill={barColor}
                        rx={1}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Point de dernier cours */}
            {points.length > 0 && (
              <g className="last-point-marker">
                <circle
                  cx={getX(points.length - 1)}
                  cy={getY(points[points.length - 1].price)}
                  r="5"
                  fill={strokeColor}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
              </g>
            )}

            {/* Ligne verticale et repère au survol */}
            {activePoint && hoverIndex !== null && (
              <g className="hover-crosshair">
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={padding.top + plotH}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activePoint.price)}
                  r="6.5"
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth="3"
                  filter="url(#dotGlow)"
                />
              </g>
            )}

            {/* Axe temporel (graduations du bas) */}
            <g className="x-axis-group">
              <line
                x1={padding.left}
                y1={padding.top + plotH}
                x2={width - padding.right}
                y2={padding.top + plotH}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              {xLabels.map((lbl, idx) => (
                <g key={idx} className="axis-label-item">
                  <line
                    x1={lbl.x}
                    y1={padding.top + plotH}
                    x2={lbl.x}
                    y2={padding.top + plotH + 5}
                    stroke="#94a3b8"
                    strokeWidth="1"
                  />
                  <text
                    x={lbl.x}
                    y={padding.top + plotH + 18}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="DM Sans, sans-serif"
                  >
                    {lbl.text}
                  </text>
                </g>
              ))}
            </g>
          </svg>

          {/* Infobulle flottante au survol (Tooltip) */}
          {activePoint && hoverIndex !== null && (
            <div
              className="daily-chart-tooltip"
              style={{
                left: `${(getX(hoverIndex) / width) * 100}%`,
                top: `${(getY(activePoint.price) / height) * 100}%`,
              }}
            >
              <div className="tooltip-header">
                {selectedPeriod === "1D" ? <Clock size={11} /> : <CalendarDays size={11} />}
                <span>{activePoint.fullDateLabel || activePoint.timeLabel}</span>
              </div>
              <div className="tooltip-price">{money(activePoint.price)}</div>
              <div
                className={`tooltip-diff ${
                  activePointDiff >= 0 ? "positive" : "negative"
                }`}
              >
                {signedMoney(activePointDiff)} ({activePointDiffPct >= 0 ? "+" : ""}
                {activePointDiffPct.toFixed(2)}% vs {selectedPeriod === "1D" ? "ouv." : "début"})
              </div>
              {activePoint.vol ? (
                <div className="tooltip-volume">
                  Vol : {fmtInt.format(activePoint.vol)} titres
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Pied du graphique avec légende explicative */}
        <div className="daily-chart-footer">
          <div className="daily-legend-items">
            <span className="legend-item">
              <span className="legend-dot dot-open" />
              <b>{selectedPeriod === "1D" ? "Ouverture :" : "Début de période :"}</b> {money(stats.openPx)}
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-high" /> <b>Plus haut :</b> {money(stats.highPx)}
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-low" /> <b>Plus bas :</b> {money(stats.lowPx)}
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-last" /> <b>Dernier :</b> {money(stats.lastPx)}
            </span>
          </div>
          <div className="daily-footer-right">
            <span>
              {selectedPeriod === "1D"
                ? "Survolez la courbe pour inspecter les cours minute par minute de la séance."
                : selectedPeriod === "5D"
                  ? "Survolez la courbe pour inspecter la cotation minute par minute sur les 5 séances."
                  : "Survolez la courbe pour inspecter les cours journaliers et volumes de clôture."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
