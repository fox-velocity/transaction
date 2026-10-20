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
  ArrowUpRight,
  Calculator,
  Check,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
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
const INITIAL_VOLUME = 10;
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

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function recalculateRows(source: Transaction[]): Transaction[] {
  let stock = 0;
  let invested = 0;
  let lastPrice = 0;
  return source.map(row => {
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
    let date = "";
    if (rawDate instanceof Date) date = rawDate.toISOString().slice(0, 10);
    else if (typeof rawDate === "number") {
      const d = XLSX.SSF.parse_date_code(rawDate);
      date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } else if (rawDate) date = String(rawDate).slice(0, 10);
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
  const [volume, setVolume] = useState(INITIAL_VOLUME);
  const [price, setPrice] = useState(portfolio.initialPrice);
  const [currentPrice, setCurrentPrice] = useState(
    portfolio.initialCurrentPrice
  );
  const [externalQuote, setExternalQuote] = useState<number | null>(null);
  const [externalQuoteTime, setExternalQuoteTime] = useState<string | null>(
    null
  );
  const [externalQuoteError, setExternalQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [rows, setRows] = useState<Transaction[]>(() => loadRows(portfolio));
  const [operationType, setOperationType] = useState<"buy" | "sell">("buy");
  const [operationDate, setOperationDate] = useState(today);
  const [operationVolume, setOperationVolume] = useState("5");
  const [operationPrice, setOperationPrice] = useState(
    String(portfolio.initialPrice)
  );
  const [operationFees, setOperationFees] = useState(String(DEFAULT_FEE));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
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
          "Aucune opération ou dividende reconnaissable dans ce fichier Excel."
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
          ticker: "Import Excel",
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
      setFormError("Impossible de lire ce fichier Excel.");
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
    setCurrentPrice(
      Number(
        localStorage.getItem(`${selectedKey}-current-price`) ??
          next.initialCurrentPrice
      )
    );
    setOperationPrice(String(next.initialPrice));
    setOperationDate(today);
    setEditingIndex(null);
    setFormError("");
    setSuccessMessage("");
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
    const afterVolume = totalVolume + volume;
    const transactionAmount = price * volume;
    const afterBooked = totalBooked - transactionAmount - DEFAULT_FEE;
    const afterPl = price * afterVolume + afterBooked;
    const equilibriumPrice = afterVolume ? -afterBooked / afterVolume : 0;
    return {
      totalVolume,
      totalTransaction,
      totalFees,
      totalBooked,
      currentPl: currentPrice * totalVolume + totalBooked,
      transactionAmount,
      afterVolume,
      afterPl,
      equilibriumPrice,
    };
  }, [rows, volume, price, currentPrice]);
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
  const setCurrentPriceValue = (value: string) => {
    const next = Math.max(0, parseNumber(value, 0));
    setCurrentPrice(next);
    localStorage.setItem(`${selectedKey}-current-price`, String(next));
  };
  const resetProjection = () => {
    setVolume(INITIAL_VOLUME);
    setPrice(portfolio.initialPrice);
    localStorage.setItem(
      `${selectedKey}-projection-volume`,
      String(INITIAL_VOLUME)
    );
    localStorage.setItem(
      `${selectedKey}-projection-price`,
      String(portfolio.initialPrice)
    );
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
    if (
      !window.confirm(
        `Supprimer cette opération de ${portfolio.name} ? Les cumuls de ce titre seront recalculés.`
      )
    )
      return;
    const nextRows = recalculateRows(
      rows.filter((_, rowIndex) => rowIndex !== index)
    );
    setRows(nextRows);
    persistRows(nextRows);
    setSuccessMessage(
      "Opération supprimée et cumuls recalculés pour ce titre."
    );
    setFormError("");
    if (editingIndex === index) clearForm();
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
              className="ghost-button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={16} /> Importer Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={importExcel}
            />
            <button
              className="ghost-button"
              onClick={() => exportCsv(rows, portfolio)}
            >
              <Download size={16} /> Exporter CSV
            </button>
          </div>
        </header>
        <section className="hero-grid" id="saisie">
          <div className="hero-card">
            <div className="hero-card-top">
              <span className="section-kicker">
                <Sparkles size={14} /> Projection · {portfolio.shortName}
              </span>
              <span className="live-badge">
                <span /> Mise à jour en direct
              </span>
            </div>
            <h2>Testez une nouvelle transaction</h2>
            <p>
              Les cellules bleues servent uniquement au titre sélectionné :{" "}
              <b>{portfolio.name}</b>.
            </p>
            <div className="input-grid">
              <label className="blue-input-wrap">
                <span>
                  <b>H47</b> · Volume
                </span>
                <div className="input-with-suffix">
                  <input
                    aria-label="Volume de la nouvelle transaction"
                    type="number"
                    min="0"
                    step="1"
                    value={volume}
                    onChange={event => setVolumeValue(event.target.value)}
                  />
                  <em>parts</em>
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
                    step="0.01"
                    value={price}
                    onChange={event => setPriceValue(event.target.value)}
                  />
                  <em>€</em>
                </div>
              </label>
            </div>
            <div className="transaction-preview">
              <span>
                Acheter {fmtInt.format(volume)} @ {fmt.format(price)} EUR
              </span>
              <span className="preview-amount">
                {money(calculations.transactionAmount)}
              </span>
            </div>
          </div>
          <div className="metric-stack">
            <div className="metric-card accent-blue">
              <span className="metric-label">Stock après opération</span>
              <strong>
                {fmtInt.format(calculations.afterVolume)} <small>parts</small>
              </strong>
              <span className="metric-note">
                {fmtInt.format(volume)} nouvelles parts
              </span>
            </div>
            <div className="metric-card accent-ink">
              <span className="metric-label">Prix d’équilibre</span>
              <strong>{money(calculations.equilibriumPrice)}</strong>
              <span className="metric-note">pour revenir à zéro</span>
            </div>
          </div>
        </section>
        <section className="summary-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                Tableau de bord · {portfolio.name}
              </span>
              <h2>Vue synthétique</h2>
            </div>
            <div className="dashboard-actions">
              <div className="external-quote-card" aria-live="polite">
                <div>
                  <span>Cours marché · source externe</span>
                  <strong>
                    {quoteLoading
                      ? "…"
                      : externalQuote !== null
                        ? money(externalQuote)
                        : "—"}
                  </strong>
                  <small>
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
                  <RefreshCw size={13} className={quoteLoading ? "spin" : ""} />
                </button>
              </div>
              <label className="current-price-control">
                <span>Cours actuel</span>
                <div>
                  <input
                    aria-label="Cours actuel de la part"
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentPrice}
                    onChange={event => setCurrentPriceValue(event.target.value)}
                  />
                  <em>€</em>
                </div>
              </label>
              <button className="reset-button" onClick={resetProjection}>
                <RotateCcw size={15} /> Réinitialiser
              </button>
            </div>
          </div>
          <div className="summary-grid">
            <div className="summary-card">
              <span>Position actuelle</span>
              <strong>
                {fmtInt.format(calculations.totalVolume)} <small>parts</small>
              </strong>
              <div className="summary-line">
                <span>Plus/moins-value au cours actuel</span>
                <b
                  className={
                    calculations.currentPl >= 0 ? "positive" : "negative"
                  }
                >
                  {signedMoney(calculations.currentPl)}
                </b>
              </div>
            </div>
            <div className="summary-card">
              <span>Après transaction</span>
              <strong>
                {fmtInt.format(calculations.afterVolume)} <small>parts</small>
              </strong>
              <div className="summary-line">
                <span>Investi net projeté</span>
                <b
                  className={
                    calculations.afterPl >= 0 ? "positive" : "negative"
                  }
                >
                  {signedMoney(calculations.afterPl)}
                </b>
              </div>
            </div>
            <div className="summary-card">
              <span>Équilibre théorique</span>
              <strong>{money(calculations.equilibriumPrice)}</strong>
              <div className="summary-line">
                <span>Cours saisi</span>
                <b>{money(currentPrice)}</b>
              </div>
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
            <span className="row-count">
              {rows.length} opérations · {portfolio.shortName}
            </span>
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
                  <th>Date</th>
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
                {rows.map((row, index) => (
                  <tr
                    key={`${row.date}-${index}`}
                    className={
                      index >= portfolio.data.rows.length ? "new-row" : ""
                    }
                  >
                    <td className="date-cell">
                      {dateFmt.format(new Date(`${row.date}T12:00:00`))}
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
                      {index >= portfolio.data.rows.length && (
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
                        onClick={() => startEdit(index)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="row-action delete"
                        type="button"
                        title="Supprimer cette opération"
                        aria-label={`Supprimer ${row.event}`}
                        onClick={() => removeOperation(index)}
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
      </main>
    </div>
  );
}
