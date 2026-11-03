import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Calculator,
  Check,
  Download,
  FileDown,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import viridienData from "./transactions_data.json";
import danoneData from "./dannone_data.json";
import bx4Data from "./bx4_data.json";
import wagaData from "./waga_data.json";
import * as XLSX from "xlsx";

type Transaction = {
  date: string;
  instrument: string;
  isin: string;
  currency: string;
  market: string;
  symbol: string;
  event: string;
  volume: number;
  stock: number;
  price: number;
  transaction: number;
  fees: number;
  booked: number;
  invested: number;
  pl: number;
  kind?: "trade" | "dividend";
};
type WorkbookData = { rows: Transaction[] };
type PortfolioKey = string;
type Portfolio = {
  key: PortfolioKey;
  name: string;
  shortName: string;
  ticker: string;
  description: string;
  data: WorkbookData;
  initialPrice: number;
  initialCurrentPrice: number;
  externalIsin: string;
  externalMic: string;
};
const PORTFOLIOS: Record<PortfolioKey, Portfolio> = {
  viridien: {
    key: "viridien",
    name: "Viridien",
    shortName: "VIRI",
    ticker: "VIRI · Euronext Paris",
    description: "Données du classeur Viridien intégrées",
    data: viridienData as WorkbookData,
    initialPrice: 91.1,
    initialCurrentPrice: 91.1,
    externalIsin: "FR001400PVN6",
    externalMic: "XPAR",
  },
  danone: {
    key: "danone",
    name: "Danone",
    shortName: "BN",
    ticker: "BN · Euronext Paris",
    description: "Données du classeur Danone intégrées",
    data: danoneData as WorkbookData,
    initialPrice: 70.7,
    initialCurrentPrice: 70.7,
    externalIsin: "FR0000120644",
    externalMic: "XPAR",
  },
  bx4: {
    key: "bx4",
    name: "Amundi CAC 40 Daily (-2x) Inverse UCITS ETF",
    shortName: "BX4",
    ticker: "BX4 · Euronext Paris",
    description: "Données importées depuis pasted_content.txt",
    data: bx4Data as WorkbookData,
    initialPrice: 0.65,
    initialCurrentPrice: 0.65,
    externalIsin: "FR0010411884",
    externalMic: "XPAR",
  },
  waga: {
    key: "waga",
    name: "Waga Energy",
    shortName: "WAGA",
    ticker: "WAGA · Euronext Paris",
    description: "Données fournies pour Waga Energy",
    data: wagaData as WorkbookData,
    initialPrice: 18,
    initialCurrentPrice: 18,
    externalIsin: "FR0012532810",
    externalMic: "XPAR",
  },
};
const INITIAL_VOLUME = 1;
const DEFAULT_FEE = 2;
const fmt = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtInt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (value: number) => `${fmt.format(value)} €`;
const signedMoney = (value: number) =>
  `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const today = new Date().toISOString().slice(0, 10);

type TargetCorridorResult =
  | { status: "no_data"; targetPrice: number }
  | {
      status: "already_reached";
      currentEquilibrium: number;
      targetPrice: number;
      marketPrice: number;
    }
  | {
      status: "buy" | "sell";
      action: "buy" | "sell";
      units: number;
      exactUnits: number;
      amount: number;
      netAmount: number;
      targetPrice: number;
      currentEquilibrium: number;
      achievedEquilibrium: number;
      marketPrice: number;
    }
  | {
      status: "impossible_at_market";
      currentEquilibrium: number;
      targetPrice: number;
      marketPrice: number;
    };

type AdjustmentBuyResult = {
  currentEquilibrium: number;
  marketPrice: number;
  currentGapPct: number;
  isGapAlreadyOk: boolean;
  targetEquilibrium1: number;
  units1: number;
  exactUnits1: number;
  amount1: number;
  netAmount1: number;
  achievedEquilibrium1: number;
  achievedGapPct1: number;
  isRatioAlreadyOk: boolean;
  targetEquilibrium2: number;
  units2: number;
  exactUnits2: number;
  amount2: number;
  netAmount2: number;
  achievedEquilibrium2: number;
  achievedGapPct2: number;
};

function computeAdjustmentBuy(
  totalVolume: number,
  totalBooked: number,
  marketPrice: number,
  fee = DEFAULT_FEE
): AdjustmentBuyResult {
  if (totalVolume <= 0 || marketPrice <= 0) {
    return {
      currentEquilibrium: 0,
      marketPrice: 0,
      currentGapPct: 0,
      isGapAlreadyOk: true,
      targetEquilibrium1: 0,
      units1: 0,
      exactUnits1: 0,
      amount1: 0,
      netAmount1: 0,
      achievedEquilibrium1: 0,
      achievedGapPct1: 0,
      isRatioAlreadyOk: true,
      targetEquilibrium2: 0,
      units2: 0,
      exactUnits2: 0,
      amount2: 0,
      netAmount2: 0,
      achievedEquilibrium2: 0,
      achievedGapPct2: 0,
    };
  }
  const currentEquilibrium = -totalBooked / totalVolume;

  const currentGapPct =
    currentEquilibrium > 0
      ? ((marketPrice - currentEquilibrium) / currentEquilibrium) * 100
      : 0;

  // Seuil 1 : Écart au cours marché >= -10.00%
  // (Pm - E) / E = -0.10 => Pm = 0.90 E => E_cible = Pm / 0.90
  const targetEquilibrium1 = marketPrice / 0.90;
  const isGapAlreadyOk = currentGapPct >= -10.00;

  let exactUnits1 = 0;
  let units1 = 0;
  let amount1 = 0;
  let netAmount1 = 0;
  let achievedEquilibrium1 = currentEquilibrium;
  let achievedGapPct1 = currentGapPct;

  if (!isGapAlreadyOk && targetEquilibrium1 > marketPrice) {
    const numerator = -totalBooked - targetEquilibrium1 * totalVolume + fee;
    const denominator = targetEquilibrium1 - marketPrice;
    exactUnits1 = Math.max(0, numerator / denominator);
    units1 = Math.max(1, Math.ceil(exactUnits1));
    amount1 = units1 * marketPrice;
    netAmount1 = amount1 + fee;
    const afterStock1 = totalVolume + units1;
    const afterBooked1 = totalBooked - amount1 - fee;
    achievedEquilibrium1 = afterStock1 > 0 ? -afterBooked1 / afterStock1 : 0;
    achievedGapPct1 =
      achievedEquilibrium1 > 0
        ? ((marketPrice - achievedEquilibrium1) / achievedEquilibrium1) * 100
        : 0;
  }

  // Seuil 2 : Prix d'équilibre <= Cours marché + 10% (E <= 1.10 * Pm)
  const targetEquilibrium2 = marketPrice * 1.10;
  const isRatioAlreadyOk = currentEquilibrium <= targetEquilibrium2;

  let exactUnits2 = 0;
  let units2 = 0;
  let amount2 = 0;
  let netAmount2 = 0;
  let achievedEquilibrium2 = currentEquilibrium;
  let achievedGapPct2 = currentGapPct;

  if (!isRatioAlreadyOk && targetEquilibrium2 > marketPrice) {
    const numerator = -totalBooked - targetEquilibrium2 * totalVolume + fee;
    const denominator = targetEquilibrium2 - marketPrice;
    exactUnits2 = Math.max(0, numerator / denominator);
    units2 = Math.max(1, Math.ceil(exactUnits2));
    amount2 = units2 * marketPrice;
    netAmount2 = amount2 + fee;
    const afterStock2 = totalVolume + units2;
    const afterBooked2 = totalBooked - amount2 - fee;
    achievedEquilibrium2 = afterStock2 > 0 ? -afterBooked2 / afterStock2 : 0;
    achievedGapPct2 =
      achievedEquilibrium2 > 0
        ? ((marketPrice - achievedEquilibrium2) / achievedEquilibrium2) * 100
        : 0;
  }

  return {
    currentEquilibrium,
    marketPrice,
    currentGapPct,
    isGapAlreadyOk,
    targetEquilibrium1,
    units1,
    exactUnits1,
    amount1,
    netAmount1,
    achievedEquilibrium1,
    achievedGapPct1,
    isRatioAlreadyOk,
    targetEquilibrium2,
    units2,
    exactUnits2,
    amount2,
    netAmount2,
    achievedEquilibrium2,
    achievedGapPct2,
  };
}

type SellToCashGainResult = {
  eligible: boolean;
  currentEquilibrium: number;
  marketPrice: number;
  targetThresholdPrice: number;
  totalGain: number;
  units: number;
  exactUnits: number;
  grossAmount: number;
  netCashOut: number;
  remainingStock: number;
  afterEquilibrium: number;
  simPrice: number;
  simGain: number;
  simUnits: number;
  simCashOut: number;
  simRemainingStock: number;
};

function computeSellUnitsToCashOutGain(
  totalVolume: number,
  totalBooked: number,
  marketPrice: number,
  fee = DEFAULT_FEE
): SellToCashGainResult {
  if (totalVolume <= 0 || marketPrice <= 0) {
    return {
      eligible: false,
      currentEquilibrium: 0,
      marketPrice: 0,
      targetThresholdPrice: 0,
      totalGain: 0,
      units: 0,
      exactUnits: 0,
      grossAmount: 0,
      netCashOut: 0,
      remainingStock: 0,
      afterEquilibrium: 0,
      simPrice: 0,
      simGain: 0,
      simUnits: 0,
      simCashOut: 0,
      simRemainingStock: 0,
    };
  }

  const currentEquilibrium = -totalBooked / totalVolume;
  const targetThresholdPrice = currentEquilibrium * 1.10;
  const isEligible = marketPrice >= targetThresholdPrice && currentEquilibrium > 0;

  const totalGain = Math.max(0, totalVolume * (marketPrice - currentEquilibrium));
  const exactUnits = marketPrice > 0 ? totalGain / marketPrice : 0;
  const units = Math.min(totalVolume, Math.max(1, Math.ceil(exactUnits)));
  const grossAmount = units * marketPrice;
  const netCashOut = Math.max(0, grossAmount - fee);
  const remainingStock = Math.max(0, totalVolume - units);
  const afterBooked = totalBooked + grossAmount - fee;
  const afterEquilibrium = remainingStock > 0 ? -afterBooked / remainingStock : 0;

  const simPrice = currentEquilibrium * 1.10;
  const simGain = Math.max(0, totalVolume * (simPrice - currentEquilibrium));
  const simExactUnits = simPrice > 0 ? simGain / simPrice : 0;
  const simUnits = Math.min(totalVolume, Math.max(1, Math.ceil(simExactUnits)));
  const simCashOut = simUnits * simPrice;
  const simRemainingStock = Math.max(0, totalVolume - simUnits);

  return {
    eligible: isEligible,
    currentEquilibrium,
    marketPrice,
    targetThresholdPrice,
    totalGain,
    units,
    exactUnits,
    grossAmount,
    netCashOut,
    remainingStock,
    afterEquilibrium,
    simPrice,
    simGain,
    simUnits,
    simCashOut,
    simRemainingStock,
  };
}

function toStandardDate(input: unknown): string {
  if (!input) return "";
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(input).trim();
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const frMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (frMatch) {
    const [, d, m, y] = frMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return str.slice(0, 10);
}

function formatDateDisplay(raw: string): string {
  const std = toStandardDate(raw);
  if (!std) return raw;
  const parts = std.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const [y, m, d] = parts;
    return dateFmt.format(new Date(y, m - 1, d, 12, 0, 0));
  }
  return raw;
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recalculateRows(source: Transaction[]): Transaction[] {
  const sorted = [...source]
    .map(row => ({
      ...row,
      date: toStandardDate(row.date) || row.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let stock = 0;
  let invested = 0;
  let lastPrice = 0;
  return sorted.map(row => {
    const isDividend =
      row.kind === "dividend" || row.event.toLowerCase().includes("dividende");
    const transaction = isDividend ? 0 : row.volume * row.price;
    const fees = isDividend ? 0 : -Math.abs(row.fees);
    const booked = isDividend
      ? Math.abs(row.booked || row.price || 0)
      : -transaction + fees;
    stock += isDividend ? 0 : row.volume;
    invested += booked;
    lastPrice = isDividend ? lastPrice : row.price;
    return {
      ...row,
      kind: isDividend ? "dividend" : "trade",
      transaction,
      fees,
      booked,
      stock,
      invested,
      pl: lastPrice * stock + invested,
    };
  });
}
function loadRows(portfolio: Portfolio) {
  try {
    const saved = localStorage.getItem(`${portfolio.key}-all-transactions`);
    if (saved) return recalculateRows(JSON.parse(saved));
    const added = localStorage.getItem(`${portfolio.key}-added-transactions`);
    return recalculateRows(
      added
        ? [...portfolio.data.rows, ...JSON.parse(added)]
        : portfolio.data.rows
    );
  } catch {
    return recalculateRows(portfolio.data.rows);
  }
}
function normalizeImportedRows(
  matrix: unknown[][],
  name: string
): Transaction[] {
  const headers = (matrix[0] || []).map(v => String(v ?? "").toLowerCase());
  const find = (...names: string[]) =>
    headers.findIndex(h => names.some(n => h.includes(n)));
  const dateIdx = find("date d’opération", "date d\'opération", "date");
  const eventIdx = find("événement", "evenement", "description");
  const amountIdx = find("montant comptabilisé", "montant", "dividende");
  const priceIdx = find("prix unitaire", "prix");
  const feeIdx = find("coût total", "coût", "frais");
  const parsed: Transaction[] = [];
  for (const row of matrix.slice(1)) {
    const rawDate = row[dateIdx];
    const rawEvent = eventIdx >= 0 ? String(row[eventIdx] ?? "") : "";
    let date = toStandardDate(rawDate);
    if (!date && typeof rawDate === "number") {
      const d = XLSX.SSF.parse_date_code(rawDate);
      date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    if (!date) continue;
    const dividend = rawEvent.toLowerCase().includes("dividende");
    const m = rawEvent.match(
      /(?:acheter|vendre|transfert entrant)\s+(-?\d+(?:[.,]\d+)?)\s*@\s*([\d.,]+)/i
    );
    if (!m && !dividend) continue;
    const num = (v: unknown) =>
      Number(
        String(v ?? "0")
          .replace(",", ".")
          .replace(/[^\d.-]/g, "")
      ) || 0;
    const amount = Math.abs(num(amountIdx >= 0 ? row[amountIdx] : 0));
    const volume = m
      ? m[0].toLowerCase().includes("vendre")
        ? -Math.abs(num(m[1]))
        : Math.abs(num(m[1]))
      : 0;
    const price = m ? num(m[2]) : amount;
    parsed.push({
      date,
      instrument: name,
      isin: "",
      currency: "EUR",
      market: "",
      symbol: "",
      event: rawEvent || `Dividende en espèces ${amount.toFixed(2)} EUR`,
      volume,
      stock: 0,
      price,
      transaction: 0,
      fees: dividend ? 0 : -Math.abs(num(feeIdx >= 0 ? row[feeIdx] : 0)),
      booked: dividend ? amount : 0,
      invested: 0,
      pl: 0,
      kind: dividend ? "dividend" : "trade",
    });
  }
  return parsed.sort((a, b) => a.date.localeCompare(b.date));
}
function exportCsv(rows: Transaction[], portfolio: Portfolio) {
  const headers = [
    "Date",
    "Instrument",
    "Code ISIN",
    "Devise",
    "Marché",
    "Symbole",
    "Événement",
    "Volume",
    "Stock",
    "Prix unitaire",
    "Montant transaction",
    "Frais",
    "Montant comptabilisé",
    "Cumul investi",
    "Plus/moins-value",
    "Équilibre théorique",
  ];
  const values = rows.map(row => [
    row.date,
    row.instrument,
    row.isin,
    row.currency,
    row.market,
    row.symbol,
    row.event,
    row.volume,
    row.stock,
    row.price,
    row.transaction,
    row.fees,
    row.booked,
    row.invested,
    row.pl,
    row.stock ? -row.invested / row.stock : "",
  ]);
  const csv = [headers, ...values]
    .map(line =>
      line.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(";")
    )
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `transactions-${portfolio.key}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [selectedKey, setSelectedKey] = useState<PortfolioKey>(
    () =>
      (localStorage.getItem("selected-portfolio") as PortfolioKey) || "viridien"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portfolio = PORTFOLIOS[selectedKey] || PORTFOLIOS["viridien"];
  const [projectionType, setProjectionType] = useState<"buy" | "sell">(
    () =>
      (localStorage.getItem(`${selectedKey}-projection-type`) as "buy" | "sell") ||
      "buy"
  );
  const [volume, setVolume] = useState(INITIAL_VOLUME);
  const [price, setPrice] = useState(portfolio.initialPrice);
  const [externalQuote, setExternalQuote] = useState<number | null>(null);
  const [externalQuoteTime, setExternalQuoteTime] = useState<string | null>(
    null
  );
  const [externalQuoteError, setExternalQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [rows, setRows] = useState<Transaction[]>(() => loadRows(portfolio));
  const [dateSortOrder, setDateSortOrder] = useState<"desc" | "asc">("desc");

  const displayRows = useMemo(() => {
    const mapped = rows.map((row, index) => ({
      row,
      originalIndex: index,
      isNew: index >= portfolio.data.rows.length,
    }));
    return dateSortOrder === "desc" ? [...mapped].reverse() : mapped;
  }, [rows, dateSortOrder, portfolio.data.rows.length]);

  const [operationType, setOperationType] = useState<"buy" | "sell">("buy");
  const [operationDate, setOperationDate] = useState(today);
  const [operationVolume, setOperationVolume] = useState("5");
  const [operationPrice, setOperationPrice] = useState(
    String(portfolio.initialPrice)
  );
  const [operationFees, setOperationFees] = useState(String(DEFAULT_FEE));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(
    () => localStorage.getItem(`portfolio-last-save-${selectedKey}`) || null
  );
  const [saveSuccessFeedback, setSaveSuccessFeedback] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);

  const handleSaveData = () => {
    try {
      persistRows(rows);
      localStorage.setItem(`${selectedKey}-projection-type`, projectionType);
      localStorage.setItem(`${selectedKey}-projection-volume`, String(volume));
      localStorage.setItem(`${selectedKey}-projection-price`, String(price));

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const dateStr = dateFmt.format(now);
      const fullSavedStr = `${dateStr} à ${timeStr}`;
      localStorage.setItem(`portfolio-last-save-${selectedKey}`, fullSavedStr);
      setLastSavedTime(fullSavedStr);
      setSaveSuccessFeedback(true);
      setSuccessMessage(
        `Données de ${portfolio.name} sauvegardées avec succès (${rows.length} opérations enregistrées).`
      );

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        setSaveSuccessFeedback(false);
      }, 3500);
    } catch {
      setFormError("Erreur lors de l’enregistrement des données dans le navigateur.");
    }
  };

  const exportBackupJson = () => {
    try {
      const backupData = {
        app: "Portfolio Studio",
        version: "1.0",
        exportDate: new Date().toISOString(),
        portfolioKey: selectedKey,
        portfolioName: portfolio.name,
        portfolioTicker: portfolio.ticker,
        transactionsCount: rows.length,
        projection: {
          type: projectionType,
          volume,
          price,
        },
        rows,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sauvegarde-${selectedKey}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      handleSaveData();
    } catch {
      setFormError("Erreur lors de l’export de la sauvegarde JSON.");
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const importedRows = parsed?.rows || parsed?.portfolio?.rows;
        if (Array.isArray(importedRows) && importedRows.length > 0) {
          const pKey = (parsed?.portfolioKey ||
            parsed?.portfolio?.key ||
            selectedKey) as PortfolioKey;
          const nextRows = recalculateRows(importedRows);
          setRows(nextRows);
          persistRows(nextRows);
          if (parsed?.projection || parsed?.portfolio?.projection) {
            const proj = parsed.projection || parsed.portfolio.projection;
            if (proj.type) setProjectionTypeValue(proj.type);
            if (proj.volume) setVolumeValue(String(proj.volume));
            if (proj.price) setPriceValue(String(proj.price));
          }
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const fullSavedStr = `${dateFmt.format(now)} à ${timeStr}`;
          localStorage.setItem(`portfolio-last-save-${pKey}`, fullSavedStr);
          setLastSavedTime(fullSavedStr);
          setSuccessMessage(
            `Sauvegarde JSON restaurée pour ${parsed?.portfolioName || portfolio.name} (${nextRows.length} opérations).`
          );
          setFormError("");
          return;
        }
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const matrix = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, raw: true }
      ) as unknown[][];
      const imported = normalizeImportedRows(
        matrix,
        file.name.replace(/\.(xlsx|xls)$/i, "")
      );
      if (!imported.length) {
        setFormError(
          "Aucune opération ou dividende reconnaissable dans ce fichier."
        );
        return;
      }
      const name =
        imported[0].instrument || file.name.replace(/\.(xlsx|xls)$/i, "");
      const key = (
        name.toLowerCase().includes("danone")
          ? "danone"
          : name.toLowerCase().includes("viridien")
            ? "viridien"
            : `import-${Date.now()}`
      ) as PortfolioKey;
      const nextRows = recalculateRows(imported);
      localStorage.setItem(`${key}-all-transactions`, JSON.stringify(nextRows));
      if (!(key in PORTFOLIOS)) {
        (PORTFOLIOS as Record<string, Portfolio>)[key] = {
          key,
          name,
          shortName: name.slice(0, 5).toUpperCase(),
          ticker: "Import",
          description: `Données importées depuis ${file.name}`,
          data: { rows: nextRows },
          initialPrice: nextRows.at(-1)?.price || 0,
          initialCurrentPrice: nextRows.at(-1)?.price || 0,
          externalIsin: "",
          externalMic: "XPAR",
        };
      }
      setSelectedKey(key);
      setSuccessMessage(
        `${imported.length} lignes importées pour ${name}, dont les dividendes sont ajoutés à la plus/moins-value.`
      );
      setFormError("");
    } catch {
      setFormError("Impossible de lire ce fichier (format Excel ou JSON non reconnu).");
    } finally {
      event.target.value = "";
    }
  };
  const [lastKey, setLastKey] = useState<PortfolioKey>(selectedKey);
  const last =
    rows[rows.length - 1] ||
    ({
      price: 0,
      stock: 0,
      invested: 0,
      instrument: portfolio.name,
      isin: "",
      currency: "EUR",
      market: "",
      symbol: "",
    } as Transaction);

  useEffect(() => {
    const controller = new AbortController();
    setQuoteLoading(true);
    setExternalQuote(null);
    setExternalQuoteError("");
    fetch(
      `https://gateway.euronext.com/api/instrumentDetail?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic}&sessionQuality=RT&view=FULL&authKey=256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a&format=json`,
      { signal: controller.signal }
    )
      .then(response => {
        if (!response.ok) throw new Error("quote unavailable");
        return response.json();
      })
      .then(payload => {
        const result = payload?.instr;
        const quote = Number(result?.currInstrSess?.lastPx);
        if (typeof quote !== "number" || !Number.isFinite(quote))
          throw new Error("quote unavailable");
        setExternalQuote(quote);
        setExternalQuoteTime(result?.currInstrSess?.dataTime || null);
      })
      .catch(error => {
        if (error?.name !== "AbortError")
          setExternalQuoteError("Cours externe indisponible");
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [
    selectedKey,
    portfolio.externalIsin,
    portfolio.externalMic,
    quoteRefresh,
  ]);

  useEffect(() => {
    if (selectedKey === lastKey) return;
    const next = PORTFOLIOS[selectedKey];
    setRows(loadRows(next));
    setProjectionType(
      (localStorage.getItem(`${selectedKey}-projection-type`) as "buy" | "sell") ||
        "buy"
    );
    setVolume(
      Number(
        localStorage.getItem(`${selectedKey}-projection-volume`) ??
          INITIAL_VOLUME
      )
    );
    setPrice(
      Number(
        localStorage.getItem(`${selectedKey}-projection-price`) ??
          next.initialPrice
      )
    );
    setOperationPrice(String(next.initialPrice));
    setOperationDate(today);
    setEditingIndex(null);
    setFormError("");
    setSuccessMessage("");
    setLastSavedTime(
      localStorage.getItem(`portfolio-last-save-${selectedKey}`) || null
    );
    setLastKey(selectedKey);
    localStorage.setItem("selected-portfolio", selectedKey);
  }, [selectedKey, lastKey]);

  useEffect(() => {
    localStorage.setItem("selected-portfolio", selectedKey);
  }, [selectedKey]);

  const calculations = useMemo(() => {
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    const totalTransaction = rows.reduce(
      (sum, row) => sum + row.transaction,
      0
    );
    const totalFees = rows.reduce((sum, row) => sum + row.fees, 0);
    const totalBooked = rows.reduce((sum, row) => sum + row.booked, 0);

    const isSell = projectionType === "sell";
    const signedVolume = isSell ? -volume : volume;
    const afterVolume = Math.max(0, totalVolume + signedVolume);
    const transactionAmount = price * volume;

    // Achat : décaissement (- transaction - frais)
    // Vente : encaissement (+ transaction - frais)
    const afterBooked = isSell
      ? totalBooked + transactionAmount - DEFAULT_FEE
      : totalBooked - transactionAmount - DEFAULT_FEE;

    const afterPl = price * afterVolume + afterBooked;
    const currentEquilibriumPrice =
      totalVolume > 0 ? -totalBooked / totalVolume : 0;
    const equilibriumPrice = afterVolume > 0 ? -afterBooked / afterVolume : 0;
    const marketPrice =
      externalQuote !== null && Number.isFinite(externalQuote)
        ? externalQuote
        : portfolio.initialCurrentPrice;
    const equilibriumGapAmount =
      equilibriumPrice > 0 && marketPrice > 0
        ? marketPrice - equilibriumPrice
        : null;
    const equilibriumGapPct =
      equilibriumPrice > 0 && marketPrice > 0
        ? ((marketPrice - equilibriumPrice) / equilibriumPrice) * 100
        : null;

    const currentPl = marketPrice * totalVolume + totalBooked;

    // Calcul d'équilibrage au cours marché au prix unitaire saisi :
    // Trouver le volume V à acheter au prix unitaire `price` pour que
    // le prix d'équilibre résultant soit égal au cours de marché `marketPrice`.
    let targetStatus: "ok" | "already_balanced" | "price_too_high" | "no_data" = "ok";
    let targetVolumeExact = 0;
    let targetVolumeInt = 0;
    let targetGrossAmount = 0;
    let targetNetAmount = 0;
    let targetAchievedEquilibrium = 0;

    if (totalVolume <= 0 || marketPrice <= 0 || price <= 0) {
      targetStatus = "no_data";
    } else if (currentEquilibriumPrice <= marketPrice) {
      targetStatus = "already_balanced";
    } else if (price >= marketPrice) {
      targetStatus = "price_too_high";
    } else {
      // (-totalBooked + V * price + DEFAULT_FEE) / (totalVolume + V) = marketPrice
      // V * (marketPrice - price) = -totalBooked - marketPrice * totalVolume + DEFAULT_FEE
      // V = (-currentPl + DEFAULT_FEE) / (marketPrice - price)
      targetVolumeExact = Math.max(0, (-currentPl + DEFAULT_FEE) / (marketPrice - price));
      targetVolumeInt = Math.max(1, Math.ceil(targetVolumeExact));
      targetGrossAmount = targetVolumeInt * price;
      targetNetAmount = targetGrossAmount + DEFAULT_FEE;
      const targetAfterStock = totalVolume + targetVolumeInt;
      const targetAfterBooked = totalBooked - targetGrossAmount - DEFAULT_FEE;
      targetAchievedEquilibrium =
        targetAfterStock > 0 ? -targetAfterBooked / targetAfterStock : 0;
    }

    return {
      totalVolume,
      totalTransaction,
      totalFees,
      totalBooked,
      currentEquilibriumPrice,
      currentPl,
      marketPrice,
      usedExternalQuote:
        externalQuote !== null && Number.isFinite(externalQuote),
      transactionAmount,
      afterVolume,
      afterPl,
      equilibriumPrice,
      equilibriumGapAmount,
      equilibriumGapPct,
      isSell,
      exceedsStock: isSell && volume > totalVolume,
      targetStatus,
      targetVolumeExact,
      targetVolumeInt,
      targetGrossAmount,
      targetNetAmount,
      targetAchievedEquilibrium,
    };
  }, [rows, projectionType, volume, price, externalQuote, portfolio.initialCurrentPrice]);

  const adjustmentBuy = useMemo(
    () =>
      computeAdjustmentBuy(
        calculations.totalVolume,
        calculations.totalBooked,
        calculations.marketPrice,
        DEFAULT_FEE
      ),
    [calculations.totalVolume, calculations.totalBooked, calculations.marketPrice]
  );

  const sellToCashGain = useMemo(
    () =>
      computeSellUnitsToCashOutGain(
        calculations.totalVolume,
        calculations.totalBooked,
        calculations.marketPrice,
        DEFAULT_FEE
      ),
    [calculations.totalVolume, calculations.totalBooked, calculations.marketPrice]
  );

  const setProjectionTypeValue = (nextType: "buy" | "sell") => {
    setProjectionType(nextType);
    localStorage.setItem(`${selectedKey}-projection-type`, nextType);
  };

  const setVolumeValue = (value: string) => {
    const next = Math.max(0, parseNumber(value, 0));
    setVolume(next);
    localStorage.setItem(`${selectedKey}-projection-volume`, String(next));
  };

  const setPriceValue = (value: string) => {
    const next = Math.max(0, parseNumber(value, 0));
    setPrice(next);
    localStorage.setItem(`${selectedKey}-projection-price`, String(next));
  };

  const persistRows = (nextRows: Transaction[]) =>
    localStorage.setItem(
      `${selectedKey}-all-transactions`,
      JSON.stringify(nextRows)
    );
  const clearForm = () => {
    setEditingIndex(null);
    setOperationDate(today);
    setOperationVolume("5");
    setOperationPrice(String(portfolio.initialPrice));
    setOperationFees(String(DEFAULT_FEE));
    setOperationType("buy");
  };
  const startEdit = (index: number) => {
    const row = rows[index];
    setEditingIndex(index);
    setOperationDate(row.date);
    setOperationType(row.volume >= 0 ? "buy" : "sell");
    setOperationVolume(String(Math.abs(row.volume)));
    setOperationPrice(String(row.price));
    setOperationFees(String(Math.abs(row.fees)));
    setFormError("");
    setSuccessMessage("");
    document
      .getElementById("operation-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const removeOperation = (index: number) => {
    setDeleteCandidateIndex(index);
  };
  const confirmDeleteOperation = () => {
    if (deleteCandidateIndex === null) return;
    const index = deleteCandidateIndex;
    const candidate = rows.filter((_, rowIndex) => rowIndex !== index);
    const nextRows = recalculateRows(candidate);
    if (nextRows.some(row => row.stock < 0)) {
      setFormError(
        "Suppression impossible : cette opération est requise car des ventes ultérieures dépasseraient le stock restant."
      );
      setDeleteCandidateIndex(null);
      return;
    }
    setRows(nextRows);
    persistRows(nextRows);
    setSuccessMessage(
      "Opération supprimée et cumuls recalculés pour ce titre."
    );
    setFormError("");
    if (editingIndex === index) {
      clearForm();
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
    setDeleteCandidateIndex(null);
  };
  const submitOperation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const enteredVolume = Math.abs(parseNumber(operationVolume, 0));
    const enteredPrice = parseNumber(operationPrice, 0);
    const enteredFees = Math.abs(parseNumber(operationFees, DEFAULT_FEE));
    if (
      !operationDate ||
      enteredVolume <= 0 ||
      enteredPrice <= 0 ||
      enteredFees < 0
    ) {
      setFormError(
        "Renseignez une date, un volume, un prix et des frais valides."
      );
      return;
    }
    const signedVolume =
      operationType === "buy" ? enteredVolume : -enteredVolume;
    const reference = editingIndex === null ? last : rows[editingIndex];
    const editedRow: Transaction = {
      ...reference,
      date: operationDate,
      volume: signedVolume,
      price: enteredPrice,
      fees: -enteredFees,
      event: `${operationType === "buy" ? "Acheter" : "Vendre"} ${operationType === "buy" ? enteredVolume : -enteredVolume} @ ${enteredPrice.toFixed(2)} EUR`,
    };
    const candidate =
      editingIndex === null
        ? [...rows, editedRow]
        : rows.map((row, index) => (index === editingIndex ? editedRow : row));
    const nextRows = recalculateRows(candidate);
    if (nextRows.some(row => row.stock < 0)) {
      setFormError(
        "Opération impossible : une vente dépasse le stock disponible pour ce titre."
      );
      return;
    }
    setRows(nextRows);
    persistRows(nextRows);
    setSuccessMessage(
      editingIndex === null
        ? `${operationType === "buy" ? "Achat" : "Vente"} ajouté pour ${portfolio.name}.`
        : `Opération modifiée pour ${portfolio.name}.`
    );
    clearForm();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <TrendingUp size={18} strokeWidth={2.4} />
        </div>
        <div className="sidebar-copy">
          <span className="eyebrow">Portfolio studio</span>
          <strong>{portfolio.name}</strong>
          <span className="ticker">{portfolio.ticker}</span>
        </div>
        <div className="sidebar-divider" />
        <nav aria-label="Navigation principale">
          <a className="nav-item active" href="#saisie">
            <Calculator size={16} /> Saisie & calcul
          </a>
          <a className="nav-item" href="#historique">
            <TrendingUp size={16} /> Historique
          </a>
        </nav>
        <div className="sidebar-footnote">
          <span className="status-dot" /> {portfolio.description}
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Portefeuille <span>/</span> {portfolio.name}
            </div>
            <h1>{portfolio.name} · Transactions & cumul</h1>
            <p className="subtitle">
              Chaque titre possède son propre historique, ses calculs et ses
              paramètres.
            </p>
          </div>
          <div className="topbar-actions">
            <label className="portfolio-picker">
              <span>Titre suivi</span>
              <select
                aria-label="Sélectionner le titre"
                value={selectedKey}
                onChange={event =>
                  setSelectedKey(event.target.value as PortfolioKey)
                }
              >
                <option value="viridien">Viridien · VIRI</option>
                <option value="danone">Danone · BN</option>
                <option value="bx4">Amundi CAC 40 · BX4</option>
                <option value="waga">Waga Energy · WAGA</option>
              </select>
            </label>
            <button
              type="button"
              className={`save-action-button ${saveSuccessFeedback ? "saved" : ""}`}
              onClick={handleSaveData}
              title="Sauvegarder les données du portefeuille (historique, opérations et paramètres)"
            >
              {saveSuccessFeedback ? (
                <>
                  <Check size={16} />
                  <span>Sauvegardé !</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Sauvegarder les données</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => fileInputRef.current?.click()}
              title="Importer un fichier Excel (.xlsx, .xls) ou un fichier de sauvegarde (.json)"
            >
              <Plus size={16} /> Importer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.json"
              hidden
              onChange={importFile}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => exportCsv(rows, portfolio)}
              title="Exporter les transactions au format CSV"
            >
              <Download size={16} /> Exporter CSV
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={exportBackupJson}
              title="Télécharger une copie de sauvegarde complète des données au format JSON"
            >
              <FileDown size={16} /> Sauvegarde JSON
            </button>
          </div>
        </header>
        <section className="unified-hero-card" id="saisie">
          <div className="hero-card-top">
            <div className="hero-card-top-left">
              <span className="hero-kicker-tag">
                <span className="kicker-dot">•</span> {portfolio.shortName}
              </span>
              <div className="external-quote-card" aria-live="polite">
                <div className="external-quote-info">
                  <span className="external-quote-title">COURS MARCHÉ · SOURCE EXTERNE</span>
                  <strong className="external-quote-val">
                    {quoteLoading
                      ? "…"
                      : externalQuote !== null
                        ? money(externalQuote)
                        : "—"}
                  </strong>
                  <small className="external-quote-sub">
                    {portfolio.externalIsin} · Euronext
                    {externalQuoteTime
                      ? ` · ${externalQuoteTime}`
                      : externalQuoteError
                        ? ` · ${externalQuoteError}`
                        : ""}
                  </small>
                </div>
                <button
                  className="quote-refresh"
                  type="button"
                  aria-label="Actualiser le cours externe"
                  onClick={() => setQuoteRefresh(value => value + 1)}
                >
                  <RefreshCw size={14} className={quoteLoading ? "spin" : ""} />
                </button>
              </div>
              <div className="hero-top-metric">
                <span className="hero-top-metric-label">Position actuelle</span>
                <span className="hero-top-metric-val">
                  <strong>{fmtInt.format(calculations.totalVolume)}</strong> <small>parts</small>
                </span>
              </div>
              <div className="hero-top-metric">
                <span className="hero-top-metric-label">Plus/moins-value au cours actuel</span>
                <span
                  className={`hero-top-metric-val hero-top-pl ${
                    calculations.currentPl >= 0 ? "positive" : "negative"
                  }`}
                >
                  {signedMoney(calculations.currentPl)}
                </span>
              </div>
            </div>
            <span className="live-badge">
              <span className="live-dot" /> Mise à jour en direct
            </span>
          </div>

          <h2 className="unified-hero-title">Testez une nouvelle transaction</h2>
          <p className="unified-hero-subtitle">
            Simulez un achat ou une vente pour observer en direct l’impact sur le stock et le prix d’équilibre de{" "}
            <b>{portfolio.name}</b>.
          </p>

          <div className="unified-hero-body">
            <div className="unified-input-col">
              <div className="projection-type-bar">
                <span className="projection-type-label">SENS :</span>
                <div className="projection-type-toggle" role="group" aria-label="Sens de la transaction">
                  <button
                    type="button"
                    className={`projection-toggle-btn ${projectionType === "buy" ? "active-buy" : ""}`}
                    onClick={() => setProjectionTypeValue("buy")}
                  >
                    <ArrowUpRight size={14} /> Acheter
                  </button>
                  <button
                    type="button"
                    className={`projection-toggle-btn ${projectionType === "sell" ? "active-sell" : ""}`}
                    onClick={() => setProjectionTypeValue("sell")}
                  >
                    <ArrowDownRight size={14} /> Vendre
                  </button>
                </div>
              </div>

              <div className="input-grid">
                <label className="blue-input-wrap">
                  <span>
                    <b>H47</b> · Volume {projectionType === "sell" ? "à vendre" : "à acheter"}
                  </span>
                  <div className="input-with-suffix">
                    <input
                      aria-label={`Volume de ${projectionType === "sell" ? "vente" : "l'achat"}`}
                      type="number"
                      min="0"
                      step="1"
                      value={volume}
                      onChange={event => setVolumeValue(event.target.value)}
                    />
                    <div className="input-suffix-group">
                      <div className="stepper-arrows">
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Augmenter d'une part"
                          onClick={() => setVolumeValue(String(volume + 1))}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Diminuer d'une part"
                          onClick={() => setVolumeValue(String(Math.max(0, volume - 1)))}
                        >
                          ▼
                        </button>
                      </div>
                      <em>parts</em>
                    </div>
                  </div>
                </label>
                <label className="blue-input-wrap">
                  <span>
                    <b>J47</b> · Prix unitaire
                  </span>
                  <div className="input-with-suffix">
                    <input
                      aria-label="Prix unitaire de la nouvelle transaction"
                      type="number"
                      min="0"
                      step="0.05"
                      value={price}
                      onChange={event => setPriceValue(event.target.value)}
                    />
                    <div className="input-suffix-group">
                      <div className="stepper-arrows">
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Augmenter de 0,05 €"
                          onClick={() => setPriceValue((Math.round((price + 0.05) * 100) / 100).toFixed(2))}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Diminuer de 0,05 €"
                          onClick={() => setPriceValue(String(Math.max(0, Math.round((price - 0.05) * 100) / 100).toFixed(2)))}
                        >
                          ▼
                        </button>
                      </div>
                      <em>€</em>
                    </div>
                  </div>
                </label>
                <div className="blue-input-wrap">
                  <span>
                    <b>K47</b> · Montant transaction
                  </span>
                  <div className="input-with-suffix readonly-amount-field">
                    <input
                      aria-label="Montant de la transaction"
                      type="text"
                      readOnly
                      value={fmt.format(calculations.transactionAmount)}
                      title={`Montant brut : ${money(calculations.transactionAmount)}`}
                    />
                    <div className="input-suffix-group">
                      <em>€</em>
                    </div>
                  </div>
                </div>
              </div>

              {calculations.exceedsStock && (
                <div className="stock-warning-banner">
                  ⚠️ Attention : le volume à vendre ({fmtInt.format(volume)} parts) dépasse le stock disponible ({fmtInt.format(calculations.totalVolume)} parts).
                </div>
              )}
            </div>

            <div className="unified-metrics-col">
              <div className={`metric-box ${projectionType === "sell" ? "box-red" : "box-green"}`}>
                <span className="metric-box-label">Stock après opération</span>
                <strong className="metric-box-val">
                  {fmtInt.format(calculations.afterVolume)} <small>parts</small>
                </strong>
                <span className="metric-box-prev">
                  Avant opération : {fmtInt.format(calculations.totalVolume)} parts
                </span>
                <span className="metric-box-note">
                  {projectionType === "buy"
                    ? `+${fmtInt.format(volume)} nouvelles parts`
                    : `−${fmtInt.format(Math.min(volume, calculations.totalVolume))} parts cédées`}
                </span>
              </div>

              <div className="metric-box box-white">
                <span className="metric-box-label">Prix d’équilibre après transaction</span>
                <strong className="metric-box-val">
                  {calculations.afterVolume > 0
                    ? money(calculations.equilibriumPrice)
                    : "0,00 €"}
                </strong>
                {calculations.afterVolume > 0 &&
                  calculations.equilibriumGapAmount !== null &&
                  calculations.equilibriumGapPct !== null && (
                    <span
                      className={`metric-box-gap ${
                        calculations.equilibriumGapAmount >= 0
                          ? "positive"
                          : "negative"
                      }`}
                    >
                      Écart au cours marché :{" "}
                      {calculations.equilibriumGapAmount >= 0 ? "+" : ""}
                      {fmt.format(calculations.equilibriumGapAmount)} € ·{" "}
                      {calculations.equilibriumGapPct >= 0 ? "+" : ""}
                      {fmt.format(calculations.equilibriumGapPct)} %
                    </span>
                  )}
                <span className="metric-box-prev">
                  Avant transaction : {money(calculations.currentEquilibriumPrice)}
                </span>
                <span className="metric-box-note">
                  {calculations.afterVolume > 0
                    ? "pour revenir à zéro"
                    : "position soldée"}
                </span>
              </div>
            </div>
          </div>

          {/* Division : Équilibre au cours marché au prix unitaire saisi */}
          <div className="target-balance-division">
            <div className="target-balance-header">
              <div className="target-badge-icon">
                <Target size={18} />
              </div>
              <div className="target-balance-titles">
                <span className="target-kicker">Équilibrage au cours marché</span>
                <h4>
                  Objectif : Prix d’équilibre = Cours marché ({calculations.marketPrice > 0 ? money(calculations.marketPrice) : "—"})
                </h4>
                <p>
                  Au prix unitaire saisi de <b>{fmt.format(price)} €</b> : volume et montant requis pour ramener votre prix d’équilibre au niveau du cours marché.
                </p>
              </div>
            </div>

            {calculations.targetStatus === "ok" && (
              <div className="target-balance-body">
                <div className="target-metric-item">
                  <span className="target-metric-label">Volume à acheter</span>
                  <strong className="target-metric-value text-blue">
                    {fmtInt.format(calculations.targetVolumeInt)} <small>parts</small>
                  </strong>
                  <span className="target-metric-sub">
                    Calcul exact : {calculations.targetVolumeExact.toFixed(2)} parts
                  </span>
                </div>

                <div className="target-metric-item">
                  <span className="target-metric-label">Montant que cela représente</span>
                  <strong className="target-metric-value">
                    {money(calculations.targetGrossAmount)}
                  </strong>
                  <span className="target-metric-sub">
                    Total net : {money(calculations.targetNetAmount)} (+{money(DEFAULT_FEE)} frais)
                  </span>
                </div>

                <div className="target-metric-item">
                  <span className="target-metric-label">Équilibre résultant</span>
                  <strong className="target-metric-value text-green">
                    {money(calculations.targetAchievedEquilibrium)}
                  </strong>
                  <span className="target-metric-sub">
                    {calculations.targetAchievedEquilibrium <= calculations.marketPrice
                      ? "✓ Atteint le cours marché"
                      : "Proche du cours marché"}
                  </span>
                </div>

                <button
                  type="button"
                  className="target-apply-btn"
                  title="Appliquer ce volume dans le formulaire de simulation ci-dessus"
                  onClick={() => {
                    setVolume(calculations.targetVolumeInt);
                    setProjectionTypeValue("buy");
                  }}
                >
                  <ArrowUpRight size={14} /> Appliquer ce volume
                </button>
              </div>
            )}

            {calculations.targetStatus === "price_too_high" && (
              <div className="target-balance-notice warning">
                <span>
                  ⚠️ Le prix unitaire saisi (<b>{money(price)}</b>) est supérieur ou égal au cours du marché (<b>{money(calculations.marketPrice)}</b>). Pour faire baisser votre prix d’équilibre ({money(calculations.currentEquilibriumPrice)}) jusqu’au cours marché, saisissez un prix d’achat inférieur à <b>{money(calculations.marketPrice)}</b>.
                </span>
              </div>
            )}

            {calculations.targetStatus === "already_balanced" && (
              <div className="target-balance-notice success">
                <span>
                  ✅ Votre prix d’équilibre actuel (<b>{money(calculations.currentEquilibriumPrice)}</b>) est déjà inférieur ou égal au cours du marché (<b>{money(calculations.marketPrice)}</b>). Aucun achat d’équilibrage n’est requis.
                </span>
              </div>
            )}
          </div>

          {/* Division : Ajustement & Prise de gain au cours marché (±10%) */}
          <div className="market-corridor-division">
            <div className="market-corridor-header">
              <div className="market-corridor-icon">
                <Percent size={18} />
              </div>
              <div className="market-corridor-titles">
                <span className="market-corridor-kicker">
                  Règles au cours marché ({calculations.marketPrice > 0 ? money(calculations.marketPrice) : "—"})
                </span>
                <h4>Ajustement d’équilibre (−10 %) & Mise de côté des gains (+10 %)</h4>
                <p>
                  Calcul des unités à acheter si le prix d’équilibre est sous les −10 %, ou à vendre pour sécuriser le gain si la plus-value dépasse +10 %.
                </p>
              </div>
            </div>

            <div className="market-corridor-grid">
              {/* Carte 1 : Prix d'équilibre < -10% du cours marché -> Combien acheter pour ramener à >= -10% */}
              <div className="corridor-card">
                <div className="corridor-card-head">
                  <div>
                    <span className="corridor-badge badge-blue">Achat d'ajustement</span>
                    <h5>Cours d’équilibre ≥ −10 % du marché</h5>
                  </div>
                  <span className="corridor-target-val">
                    Plafond équilibre : {money(adjustmentBuy.targetEquilibrium1)}
                  </span>
                </div>

                {!adjustmentBuy.isGapAlreadyOk ? (
                  <div className="corridor-content">
                    <p style={{ margin: "0", fontSize: "12.5px", color: "#475569", lineHeight: 1.45 }}>
                      Votre cours d’équilibre actuel (<b>{money(adjustmentBuy.currentEquilibrium)}</b>) accuse un retard de <b>{adjustmentBuy.currentGapPct.toFixed(2)} %</b> par rapport au cours de marché (<b>{money(adjustmentBuy.marketPrice)}</b>). Pour ramener votre cours d’équilibre à <b>≥ −10,00 %</b> :
                    </p>

                    <div className="corridor-metric">
                      <span className="corridor-metric-label">Unités requises au cours de marché</span>
                      <strong className="corridor-units text-blue">
                        Acheter {fmtInt.format(adjustmentBuy.units1)} parts
                      </strong>
                      <span className="corridor-sub">
                        Au cours de marché ({money(adjustmentBuy.marketPrice)}) · Calcul exact : {adjustmentBuy.exactUnits1.toFixed(2)} parts
                      </span>
                    </div>

                    <div className="corridor-details-grid">
                      <div>
                        <span>Montant de l’achat</span>
                        <b>{money(adjustmentBuy.amount1)}</b>
                        <small>Total net : {money(adjustmentBuy.netAmount1)} (+{money(DEFAULT_FEE)} frais)</small>
                      </div>
                      <div>
                        <span>Équilibre résultant</span>
                        <b className="text-blue">{money(adjustmentBuy.achievedEquilibrium1)}</b>
                        <small>Écart résultant : {adjustmentBuy.achievedGapPct1 >= 0 ? "+" : ""}{adjustmentBuy.achievedGapPct1.toFixed(2)} % (≥ −10 %)</small>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="corridor-apply-btn"
                      title="Appliquer cet achat au cours de marché dans la simulation"
                      onClick={() => {
                        setVolume(adjustmentBuy.units1);
                        setPrice(calculations.marketPrice);
                        setProjectionTypeValue("buy");
                      }}
                    >
                      <ArrowUpRight size={14} /> Appliquer cet achat ({adjustmentBuy.units1} parts @ {money(adjustmentBuy.marketPrice)})
                    </button>

                    {!adjustmentBuy.isRatioAlreadyOk && adjustmentBuy.units2 !== adjustmentBuy.units1 && (
                      <div style={{ marginTop: "10px", padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", fontSize: "11.5px", color: "#475569", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div>
                          <span>Option cible équilibre ≤ +10 % ({money(adjustmentBuy.targetEquilibrium2)}) : <b>{adjustmentBuy.units2} parts</b> ({money(adjustmentBuy.amount2)})</span>
                        </div>
                        <button
                          type="button"
                          className="corridor-preset-btn"
                          style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                          onClick={() => {
                            setVolume(adjustmentBuy.units2);
                            setPrice(calculations.marketPrice);
                            setProjectionTypeValue("buy");
                          }}
                        >
                          Appliquer ({adjustmentBuy.units2} parts)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="corridor-status-box success">
                    <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#166534" }}>
                      ✓ Cours d’équilibre conforme (≥ −10 %)
                    </p>
                    <p style={{ margin: "0 0 8px", fontSize: "12.5px", color: "#166534", lineHeight: 1.45 }}>
                      Votre cours d’équilibre actuel (<b>{money(adjustmentBuy.currentEquilibrium)}</b>) présente un écart de <b>{adjustmentBuy.currentGapPct >= 0 ? "+" : ""}{adjustmentBuy.currentGapPct.toFixed(2)} %</b> par rapport au cours de marché (<b>{money(adjustmentBuy.marketPrice)}</b>), ce qui est déjà supérieur ou égal à −10 %.
                    </p>
                    <small style={{ display: "block", color: "#15803d" }}>
                      Aucun achat d’ajustement n’est requis pour respecter le seuil de −10 %.
                    </small>
                  </div>
                )}
              </div>

              {/* Carte 2 : Plus-value > +10% -> Combien de parts vendre pour mettre de côté ce gain */}
              <div className="corridor-card">
                <div className="corridor-card-head">
                  <div>
                    <span className="corridor-badge badge-green">Sécurisation du gain</span>
                    <h5>Gain &gt; +10 % : mise de côté</h5>
                  </div>
                  <span className="corridor-target-val">
                    Seuil cours : {money(sellToCashGain?.targetThresholdPrice ?? 0)}
                  </span>
                </div>

                {sellToCashGain?.eligible ? (
                  <div className="corridor-content">
                    <p style={{ margin: "0", fontSize: "12.5px", color: "#475569", lineHeight: 1.45 }}>
                      Votre position affiche un gain supérieur à +10 % (plus-value latente totale : <b>{money(sellToCashGain.totalGain)}</b>). Pour mettre de côté la valeur exacte de ce gain en liquidités :
                    </p>

                    <div className="corridor-metric">
                      <span className="corridor-metric-label">Unités à vendre</span>
                      <strong className="corridor-units text-red">
                        Vendre {fmtInt.format(sellToCashGain.units)} parts
                      </strong>
                      <span className="corridor-sub">
                        Au cours de marché ({money(sellToCashGain.marketPrice)}) · Calcul exact : {sellToCashGain.exactUnits.toFixed(2)} parts
                      </span>
                    </div>

                    <div className="corridor-details-grid">
                      <div>
                        <span>Gain mis de côté en cash</span>
                        <b className="text-green">{money(sellToCashGain.grossAmount)}</b>
                        <small>Net après frais : {money(sellToCashGain.netCashOut)}</small>
                      </div>
                      <div>
                        <span>Stock restant conservé</span>
                        <b>{fmtInt.format(sellToCashGain.remainingStock)} parts</b>
                        <small>Couvre 100 % du capital initial</small>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="corridor-apply-btn btn-sell"
                      title="Appliquer cette vente au cours de marché dans la simulation"
                      onClick={() => {
                        setVolume(sellToCashGain.units);
                        setPrice(calculations.marketPrice);
                        setProjectionTypeValue("sell");
                      }}
                    >
                      <ArrowDownRight size={14} /> Mettre de côté le gain ({sellToCashGain.units} parts @ {money(sellToCashGain.marketPrice)})
                    </button>
                  </div>
                ) : (
                  <div className="corridor-status-box notice">
                    <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#1e293b" }}>
                      Condition non active sur le cours actuel ({money(calculations.marketPrice)})
                    </p>
                    <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "#64748b", lineHeight: 1.45 }}>
                      La position n’a pas encore atteint +10 % de gain (cours actuel à {money(calculations.marketPrice)} vs seuil requis à <b>{money(sellToCashGain?.targetThresholdPrice ?? 0)}</b>).
                    </p>
                    <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "10px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#0f766e", textTransform: "uppercase" }}>
                        Simulation au seuil +10 % ({money(sellToCashGain?.simPrice ?? 0)}) :
                      </span>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#334155" }}>
                        Vendre <b>{fmtInt.format(sellToCashGain?.simUnits ?? 0)} parts</b> permettra d’encaisser et mettre de côté <b>{money(sellToCashGain?.simCashOut ?? 0)}</b> de gain en liquide tout en conservant <b>{fmtInt.format(sellToCashGain?.simRemainingStock ?? 0)} parts</b>.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="corridor-preset-btn"
                      onClick={() => {
                        if (sellToCashGain?.simPrice) {
                          setPrice(Number(sellToCashGain.simPrice.toFixed(2)));
                          setVolume(sellToCashGain.simUnits);
                          setProjectionTypeValue("sell");
                        }
                      }}
                    >
                      Simuler la mise de côté du gain à {money(sellToCashGain?.simPrice ?? 0)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="unified-hero-footer">
            <div className={`preview-tag ${projectionType === "buy" ? "buy-tag" : "sell-tag"}`}>
              {projectionType === "buy" ? (
                <>
                  <ArrowUpRight size={16} /> Acheter {fmtInt.format(volume)} @ {fmt.format(price)} EUR
                </>
              ) : (
                <>
                  <ArrowDownRight size={16} /> Vendre {fmtInt.format(volume)} @ {fmt.format(price)} EUR
                </>
              )}
            </div>
            <div className="preview-amount-wrap">
              <span className={`amount-number ${projectionType === "sell" ? "sell-number" : ""}`}>
                {projectionType === "buy" ? "−" : "+"}{money(calculations.transactionAmount)}
              </span>
              <span className="amount-brut">(brut)</span>
            </div>
          </div>
        </section>
        <section className="table-section" id="historique">
          <div className="section-heading table-heading">
            <div>
              <span className="section-kicker">
                Journal de {portfolio.name}
              </span>
              <h2>Historique des opérations</h2>
            </div>
            <div className="table-heading-actions">
              {lastSavedTime && (
                <span className="last-saved-badge" title="Horodatage de la dernière sauvegarde locale">
                  <span className="save-badge-dot" /> Sauvegardé {lastSavedTime}
                </span>
              )}
              <button
                type="button"
                className={`table-save-button ${saveSuccessFeedback ? "saved" : ""}`}
                onClick={handleSaveData}
                title="Sauvegarder immédiatement les données"
              >
                {saveSuccessFeedback ? <Check size={13} /> : <Save size={13} />}
                {saveSuccessFeedback ? "Sauvegardé !" : "Sauvegarder"}
              </button>
              <button
                type="button"
                className="sort-toggle-button"
                onClick={() => setDateSortOrder(o => o === "desc" ? "asc" : "desc")}
                title="Inverser le classement des dates"
              >
                <ArrowUpDown size={14} />
                {dateSortOrder === "desc"
                  ? "Dates : Du plus récent au plus ancien ↓"
                  : "Dates : Du plus ancien au plus récent ↑"}
              </button>
              <span className="row-count">
                {rows.length} opérations · {portfolio.shortName}
              </span>
            </div>
          </div>
          <form
            className={`operation-form ${editingIndex !== null ? "editing" : ""}`}
            id="operation-form"
            onSubmit={submitOperation}
          >
            <div className="operation-form-header">
              <div>
                <span className="section-kicker">
                  {editingIndex !== null ? (
                    <>
                      <Pencil size={14} /> Modification
                    </>
                  ) : (
                    <>
                      <Plus size={14} /> Nouvelle opération
                    </>
                  )}
                </span>
                <h3>
                  {editingIndex !== null
                    ? "Modifier l’opération"
                    : `Ajouter dans l’historique ${portfolio.name}`}
                </h3>
              </div>
              <span className="form-help">
                Les cumuls de {portfolio.name} seront recalculés automatiquement
              </span>
            </div>
            <div className="operation-fields">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={operationDate}
                  onChange={event => setOperationDate(event.target.value)}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={operationType}
                  onChange={event =>
                    setOperationType(event.target.value as "buy" | "sell")
                  }
                >
                  <option value="buy">Acheter</option>
                  <option value="sell">Vendre</option>
                </select>
              </label>
              <label>
                <span>Volume</span>
                <div className="field-suffix">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={operationVolume}
                    onChange={event => setOperationVolume(event.target.value)}
                  />
                  <em>parts</em>
                </div>
              </label>
              <label>
                <span>Prix unitaire</span>
                <div className="field-suffix">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={operationPrice}
                    onChange={event => setOperationPrice(event.target.value)}
                  />
                  <em>€</em>
                </div>
              </label>
              <label>
                <span>Frais</span>
                <div className="field-suffix">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={operationFees}
                    onChange={event => setOperationFees(event.target.value)}
                  />
                  <em>€</em>
                </div>
              </label>
              <button className="add-button" type="submit">
                {editingIndex !== null ? (
                  <>
                    <Check size={16} /> Enregistrer
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Ajouter l’opération
                  </>
                )}
              </button>
              {editingIndex !== null && (
                <button
                  className="cancel-button"
                  type="button"
                  onClick={clearForm}
                >
                  <X size={15} /> Annuler
                </button>
              )}
            </div>
            {formError && (
              <div className="form-message error">
                <X size={15} /> {formError}
              </div>
            )}
            {successMessage && (
              <div className="form-message success">
                <Check size={15} /> {successMessage}
              </div>
            )}
          </form>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th
                    className="sortable-header"
                    onClick={() => setDateSortOrder(o => o === "desc" ? "asc" : "desc")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                    title="Cliquer pour inverser le classement des dates"
                  >
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span>Date</span>
                      <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 800 }}>
                        {dateSortOrder === "desc" ? "↓" : "↑"}
                      </span>
                    </div>
                  </th>
                  <th>Événement</th>
                  <th className="number">Volume</th>
                  <th className="number">Stock</th>
                  <th className="number">Prix unitaire</th>
                  <th className="number">Transaction</th>
                  <th className="number">Frais</th>
                  <th className="number">Cumul investi</th>
                  <th className="number">Plus/moins-value</th>
                  <th className="number">Équilibre théorique</th>
                  <th className="actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ row, originalIndex, isNew }) => (
                  <tr
                    key={`${row.date}-${originalIndex}`}
                    className={isNew ? "new-row" : ""}
                  >
                    <td className="date-cell">
                      {formatDateDisplay(row.date)}
                    </td>
                    <td>
                      <span
                        className={`event-pill ${row.volume > 0 ? "buy" : "sell"}`}
                      >
                        {row.kind === "dividend" ? (
                          <Plus size={13} />
                        ) : row.volume > 0 ? (
                          <ArrowUpRight size={13} />
                        ) : (
                          <ArrowDownRight size={13} />
                        )}
                        {row.event}
                      </span>
                      {isNew && (
                        <span className="new-tag">NOUVEAU</span>
                      )}
                    </td>
                    <td className="number">
                      {row.kind === "dividend"
                        ? "—"
                        : `${row.volume > 0 ? "+" : ""}${fmtInt.format(row.volume)}`}
                    </td>
                    <td className="number strong-cell">
                      {fmtInt.format(row.stock)}
                    </td>
                    <td className="number">{money(row.price)}</td>
                    <td className="number">{signedMoney(row.transaction)}</td>
                    <td className="number muted-cell">
                      {signedMoney(row.fees)}
                    </td>
                    <td className="number">{signedMoney(row.invested)}</td>
                    <td
                      className={`number ${row.pl >= 0 ? "positive" : "negative"}`}
                    >
                      {signedMoney(row.pl)}
                    </td>
                    <td className="number equilibrium-cell">
                      {row.stock ? money(-row.invested / row.stock) : "—"}
                    </td>
                    <td className="actions-cell">
                      <button
                        className="row-action edit"
                        type="button"
                        title="Modifier cette opération"
                        aria-label={`Modifier ${row.event}`}
                        onClick={() => startEdit(originalIndex)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="row-action delete"
                        type="button"
                        title="Supprimer cette opération"
                        aria-label={`Supprimer ${row.event}`}
                        onClick={() => removeOperation(originalIndex)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="footer-note">
          Source : fichier Excel du titre sélectionné · Les données de{" "}
          <b>{portfolio.name}</b> sont isolées des autres titres et conservées
          séparément dans ce navigateur.
        </footer>

        {deleteCandidateIndex !== null && rows[deleteCandidateIndex] && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-title"
            onClick={() => setDeleteCandidateIndex(null)}
          >
            <div
              className="modal-card"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-icon-wrap danger">
                <Trash2 size={24} />
              </div>
              <h3 id="modal-delete-title">Confirmer la suppression</h3>
              <p className="modal-description">
                Voulez-vous vraiment supprimer cette opération de l’historique de <strong>{portfolio.name}</strong> ?
              </p>
              <div className="modal-op-details">
                <div className="modal-op-row">
                  <span>Date</span>
                  <strong>{formatDateDisplay(rows[deleteCandidateIndex].date)}</strong>
                </div>
                <div className="modal-op-row">
                  <span>Opération</span>
                  <strong>{rows[deleteCandidateIndex].event}</strong>
                </div>
                <div className="modal-op-row">
                  <span>Volume</span>
                  <strong>
                    {rows[deleteCandidateIndex].volume > 0
                      ? `+${rows[deleteCandidateIndex].volume} parts`
                      : rows[deleteCandidateIndex].volume < 0
                      ? `${rows[deleteCandidateIndex].volume} parts`
                      : "Dividende"}
                  </strong>
                </div>
                <div className="modal-op-row">
                  <span>Prix unitaire</span>
                  <strong>{money(rows[deleteCandidateIndex].price)}</strong>
                </div>
              </div>
              <p className="modal-subnote">
                Les cumuls (stock, prix d’équilibre et plus/moins-value) seront recalculés immédiatement.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setDeleteCandidateIndex(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="modal-btn-danger"
                  onClick={confirmDeleteOperation}
                >
                  <Trash2 size={15} /> Supprimer
                </button>
              </div>
            </div>
          </div>
        )}

        {saveSuccessFeedback && (
          <div className="save-toast-banner" role="status" aria-live="polite">
            <div className="save-toast-icon">
              <Check size={18} strokeWidth={2.8} />
            </div>
            <div className="save-toast-text">
              <strong>Données sauvegardées avec succès</strong>
              <span>
                L’historique ({rows.length} opérations), les projections et les réglages de <b>{portfolio.name}</b> ont été enregistrés localement.
              </span>
            </div>
            <button
              type="button"
              className="save-toast-close"
              onClick={() => setSaveSuccessFeedback(false)}
              aria-label="Fermer la notification"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
