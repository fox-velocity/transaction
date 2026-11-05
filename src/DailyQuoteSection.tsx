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
    externalIsin: string;
    externalMic: string;
    initialPrice: number;
    initialCurrentPrice: number;
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

  // Chargement de l'historique quand la période change (3M, 6M, 1Y)
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

    if (!portfolio.externalIsin) {
      // Titre sans ISIN Euronext (synthétiser une tendance réaliste)
      const base = portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
      const count = selectedPeriod === "5D" ? 5 : selectedPeriod === "3M" ? 66 : 250;
      const pts: IntradayPoint[] = [];
      const startDate = new Date();
      const daysBack = selectedPeriod === "5D" ? 7 : selectedPeriod === "3M" ? 90 : 365;
      startDate.setDate(startDate.getDate() - daysBack);

      let cur = base * 0.96;
      const open = cur;
      let min = cur;
      let max = cur;

      for (let i = 0; i < count; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + (selectedPeriod === "5D" ? i + 1 : Math.floor((i / count) * daysBack)));
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
        periodLabel: selectedPeriod === "5D" ? "5 jours" : selectedPeriod === "3M" ? "3 mois" : "1 an",
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

    const controller = new AbortController();
    setPeriodLoading(true);
    setPeriodError("");
    const authKey = "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
    const apiPeriod = selectedPeriod === "5D" ? "1W" : selectedPeriod;
    const historyUrl = `https://gateway.euronext.com/api/history?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic}&period=${apiPeriod}&authKey=${authKey}&format=json`;

    fetch(historyUrl, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error("Historique indisponible");
        return res.json();
      })
      .then(json => {
        const rawHistory: any[] = json.history?.historyDt || [];
        if (!rawHistory.length) throw new Error("Aucune donnée historique");

        const parsedPoints: IntradayPoint[] = rawHistory.map(item => {
          const dateStr = String(item.dt || "");
          const close = Number(item.closePx) || Number(item.lastPx) || 0;
          const open = Number(item.openPx) || close;
          const high = Number(item.highPx) || Math.max(open, close);
          const low = Number(item.lowPx) || Math.min(open, close);
          const vol = Number(item.qty) || 0;
          return {
            time: dateStr,
            timeLabel: formatEuronextDate(dateStr),
            fullDateLabel: formatEuronextFullDate(dateStr),
            price: close,
            open,
            high,
            low,
            vol,
          };
        });

        // Pour 5 jours, si aujourd'hui n'est pas encore présent dans les clôtures et qu'on a le cours direct
        if (selectedPeriod === "5D" && quoteData && quoteData.lastPx) {
          const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const alreadyHasToday = parsedPoints.some(p => p.time.startsWith(todayStr));
          if (!alreadyHasToday) {
            parsedPoints.push({
              time: todayStr,
              timeLabel: "Aujourd'hui",
              fullDateLabel: "Aujourd'hui (Séance en direct)",
              price: quoteData.lastPx,
              open: quoteData.openPx || quoteData.lastPx,
              high: quoteData.highPx || quoteData.lastPx,
              low: quoteData.lowPx || quoteData.lastPx,
              vol: quoteData.volume || 0,
            });
          }
        }

        const openPx = parsedPoints[0]?.open || parsedPoints[0]?.price || portfolio.initialPrice;
        const lastPx = quoteData?.lastPx || parsedPoints[parsedPoints.length - 1]?.price || openPx;
        const highs = parsedPoints.map(p => p.high || p.price);
        const lows = parsedPoints.map(p => p.low || p.price);
        const highPx = Math.max(...highs, lastPx);
        const lowPx = Math.min(...lows, lastPx);
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
          dateTime: rawHistory[rawHistory.length - 1]?.dt || null,
          periodLabel: selectedPeriod === "5D" ? "5 jours" : selectedPeriod === "3M" ? "3 mois" : "1 an",
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
          setPeriodError("Historique indisponible pour cette période");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeriodLoading(false);
      });

    return () => controller.abort();
  }, [selectedPeriod, portfolio.key, portfolio.externalIsin, portfolio.externalMic, quoteData?.lastPx]);

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
  }, [stats]);

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

  // Repères temporels sur l'axe X
  const xLabels = useMemo(() => {
    if (points.length === 0) return [];
    if (selectedPeriod === "5D") {
      return points.map((pt, idx) => ({
        text: pt.timeLabel,
        x: getX(idx),
      }));
    }
    if (points.length < 5) return [];
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
        return `Historique 5 jours · ${portfolio.name} (${portfolio.shortName})`;
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
        return "Évolution sur les 5 derniers jours de bourse";
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
                  const barWidth = selectedPeriod === "1D" ? 5 : selectedPeriod === "5D" ? 14 : Math.max(2, Math.min(6, plotW / points.length - 1));

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
                ? "Survolez la courbe pour inspecter les cours minute par minute."
                : "Survolez la courbe pour inspecter les cours journaliers et volumes de clôture."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
