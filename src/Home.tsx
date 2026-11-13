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
  BellRing,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  Download,
  FileDown,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  User as UserIcon,
  X,
} from "lucide-react";
import viridienData from "./transactions_data.json";
import danoneData from "./dannone_data.json";
import bx4Data from "./bx4_data.json";
import wagaData from "./waga_data.json";
import * as XLSX from "xlsx";
import {
  DailyQuoteSection,
  DailyQuoteStats,
  IntradayPoint,
  resolveYahooTicker,
  formatQuoteTime,
} from "./DailyQuoteSection";
import { fetchYahooApi, generateSyntheticPoints } from "./yahooApi";
import {
  auth,
  signInWithGoogle,
  signInWithGoogleRedirect,
  checkRedirectResult,
  signOutUser,
  subscribeToAuth,
  syncPortfolioToCloud,
  deletePortfolioFromCloud,
  subscribeToUserPortfolios,
  syncPreferencesToCloud,
  subscribeToUserPreferences,
  uploadAllLocalPortfoliosToCloud,
  syncAlertToCloud,
  deleteAlertFromCloud,
  subscribeToUserAlerts,
} from "./firebase";
import {
  PriceAlertsSection,
  PriceAlert,
  NotifPermissionState,
} from "./PriceAlertsSection";
import type { User } from "firebase/auth";

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
  yahooTicker?: string;
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
    yahooTicker: "VIRI.PA",
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
    yahooTicker: "BN.PA",
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
    yahooTicker: "BX4.PA",
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
    yahooTicker: "WAGA.PA",
  },
  emeis: {
    key: "emeis",
    name: "emeis (ex-Orpea)",
    shortName: "EMEIS",
    ticker: "EMEIS · Euronext Paris",
    description: "Titre éligible au PEA · Code ISIN FR001400NLM4",
    data: { rows: [] },
    initialPrice: 10.44,
    initialCurrentPrice: 10.44,
    externalIsin: "FR001400NLM4",
    externalMic: "XPAR",
    yahooTicker: "EMEIS.PA",
  },
};

export type PeaSecurity = {
  key: string;
  name: string;
  shortName: string;
  ticker: string;
  isin: string;
  mic: string;
  category: string;
  initialPrice: number;
  aliases?: string[];
  isLive?: boolean;
  yahooTicker?: string;
};

export const PEA_SECURITIES: PeaSecurity[] = [
  // 1. Titres du portefeuille intégrés & phares
  { key: "danone", name: "Danone", shortName: "BN", ticker: "BN · Euronext Paris", isin: "FR0000120644", mic: "XPAR", category: "Agroalimentaire", initialPrice: 70.7, aliases: ["danone", "bn"] },
  { key: "viridien", name: "Viridien (ex-CGG)", shortName: "VIRI", ticker: "VIRI · Euronext Paris", isin: "FR001400PVN6", mic: "XPAR", category: "Énergie & Géosciences", initialPrice: 91.1, aliases: ["cgg", "viridien", "viri"] },
  { key: "waga", name: "Waga Energy", shortName: "WAGA", ticker: "WAGA · Euronext Paris", isin: "FR0012532810", mic: "XPAR", category: "Biométhane & Transition", initialPrice: 18.0, aliases: ["waga", "biomethane"] },
  { key: "bx4", name: "Amundi CAC 40 Daily (-2x) Inverse", shortName: "BX4", ticker: "BX4 · Euronext Paris", isin: "FR0010411884", mic: "XPAR", category: "ETF Inversé Éligible PEA", initialPrice: 0.65, aliases: ["bx4", "inverse"] },

  // 2. Santé, Maisons de retraite & Recovery (EMEIS & Clariane au premier plan)
  { key: "emeis", name: "emeis (ex-Orpea)", shortName: "EMEIS", ticker: "EMEIS · Euronext Paris", isin: "FR001400NLM4", mic: "XPAR", category: "Santé & Dépendance", initialPrice: 10.44, aliases: ["orpea", "emeis", "FR001400NLM4", "ehpad", "clinique"] },
  { key: "clariane", name: "Clariane (ex-Korian)", shortName: "CLARI", ticker: "CLARI · Euronext Paris", isin: "FR001400O9W0", mic: "XPAR", category: "Santé & Soins", initialPrice: 1.85, aliases: ["korian", "clariane", "FR001400O9W0"] },
  { key: "euroapi", name: "Euroapi", shortName: "EAPI", ticker: "EAPI · Euronext Paris", isin: "FR0014008VX5", mic: "XPAR", category: "Principes actifs pharmaceutiques", initialPrice: 3.20, aliases: ["euroapi"] },
  { key: "valneva", name: "Valneva", shortName: "VLA", ticker: "VLA · Euronext Paris", isin: "FR0004056851", mic: "XPAR", category: "Biotechnologies & Vaccins", initialPrice: 3.10, aliases: ["valneva"] },
  { key: "sartorius", name: "Sartorius Stedim Biotech", shortName: "DIM", ticker: "DIM · Euronext Paris", isin: "FR0013154002", mic: "XPAR", category: "Bio-procédés & Équipements", initialPrice: 185.0, aliases: ["sartorius", "stedim"] },
  { key: "ipsen", name: "Ipsen", shortName: "IPN", ticker: "IPN · Euronext Paris", isin: "FR0010259150", mic: "XPAR", category: "Pharmacie de spécialité", initialPrice: 115.0, aliases: ["ipsen"] },

  // 3. Poids lourds du CAC 40 (100% éligibles PEA)
  { key: "totalenergies", name: "TotalEnergies", shortName: "TTE", ticker: "TTE · Euronext Paris", isin: "FR0000120271", mic: "XPAR", category: "Énergie & Pétrole", initialPrice: 81.25, aliases: ["total", "totalenergies", "tte"] },
  { key: "airliquide", name: "Air Liquide", shortName: "AI", ticker: "AI · Euronext Paris", isin: "FR0000120073", mic: "XPAR", category: "Gaz industriels & Santé", initialPrice: 190.0, aliases: ["air liquide", "ai"] },
  { key: "lvmh", name: "LVMH Moët Hennessy", shortName: "MC", ticker: "MC · Euronext Paris", isin: "FR0000121014", mic: "XPAR", category: "Luxe & Mode", initialPrice: 420.8, aliases: ["lvmh", "louis vuitton", "mc"] },
  { key: "loreal", name: "L'Oréal", shortName: "OR", ticker: "OR · Euronext Paris", isin: "FR0000120321", mic: "XPAR", category: "Cosmétiques & Beauté", initialPrice: 355.0, aliases: ["loreal", "or"] },
  { key: "sanofi", name: "Sanofi", shortName: "SAN", ticker: "SAN · Euronext Paris", isin: "FR0000120578", mic: "XPAR", category: "Pharmacie & Santé", initialPrice: 89.2, aliases: ["sanofi", "san"] },
  { key: "schneider", name: "Schneider Electric", shortName: "SU", ticker: "SU · Euronext Paris", isin: "FR0000121972", mic: "XPAR", category: "Gestion d'énergie & Automation", initialPrice: 242.0, aliases: ["schneider", "su"] },
  { key: "bnpparibas", name: "BNP Paribas", shortName: "BNP", ticker: "BNP · Euronext Paris", isin: "FR0000131104", mic: "XPAR", category: "Banque & Finance", initialPrice: 64.8, aliases: ["bnp", "paribas"] },
  { key: "axa", name: "AXA", shortName: "CS", ticker: "CS · Euronext Paris", isin: "FR0000120628", mic: "XPAR", category: "Assurance", initialPrice: 34.1, aliases: ["axa"] },
  { key: "safran", name: "Safran", shortName: "SAF", ticker: "SAF · Euronext Paris", isin: "FR0000073272", mic: "XPAR", category: "Aéronautique & Défense", initialPrice: 215.0, aliases: ["safran", "saf"] },
  { key: "hermes", name: "Hermès International", shortName: "RMS", ticker: "RMS · Euronext Paris", isin: "FR0000052292", mic: "XPAR", category: "Luxe & Maroquinerie", initialPrice: 2080.0, aliases: ["hermes", "rms"] },
  { key: "saintgobain", name: "Saint-Gobain", shortName: "SGO", ticker: "SGO · Euronext Paris", isin: "FR0000125007", mic: "XPAR", category: "Matériaux de construction", initialPrice: 83.5, aliases: ["saint gobain", "sgo"] },
  { key: "stellantis", name: "Stellantis", shortName: "STLAP", ticker: "STLAP · Euronext Paris", isin: "NL00150001Q9", mic: "XPAR", category: "Automobile & Mobilité", initialPrice: 12.3, aliases: ["stellantis", "peugeot", "fiat"] },
  { key: "creditagricole", name: "Crédit Agricole", shortName: "ACA", ticker: "ACA · Euronext Paris", isin: "FR0000045072", mic: "XPAR", category: "Banque", initialPrice: 14.2, aliases: ["credit agricole", "aca"] },
  { key: "engie", name: "Engie", shortName: "ENGI", ticker: "ENGI · Euronext Paris", isin: "FR0010208348", mic: "XPAR", category: "Énergie, Gaz & Renouvelables", initialPrice: 15.6, aliases: ["engie", "gdf"] },
  { key: "veolia", name: "Veolia Environnement", shortName: "VIE", ticker: "VIE · Euronext Paris", isin: "FR0000124141", mic: "XPAR", category: "Environnement, Eau & Déchets", initialPrice: 29.8, aliases: ["veolia", "vie"] },
  { key: "orange", name: "Orange", shortName: "ORA", ticker: "ORA · Euronext Paris", isin: "FR0000133308", mic: "XPAR", category: "Télécommunications", initialPrice: 10.4, aliases: ["orange", "telecom"] },
  { key: "capgemini", name: "Capgemini", shortName: "CAP", ticker: "CAP · Euronext Paris", isin: "FR0000125338", mic: "XPAR", category: "Services numériques & IT", initialPrice: 172.0, aliases: ["capgemini", "cap"] },
  { key: "michelin", name: "Michelin", shortName: "ML", ticker: "ML · Euronext Paris", isin: "FR001400AJ45", mic: "XPAR", category: "Pneumatiques", initialPrice: 33.5, aliases: ["michelin", "ml"] },
  { key: "renault", name: "Renault", shortName: "RNO", ticker: "RNO · Euronext Paris", isin: "FR0000131906", mic: "XPAR", category: "Automobile", initialPrice: 42.1, aliases: ["renault", "rno"] },
  { key: "societegenerale", name: "Société Générale", shortName: "GLE", ticker: "GLE · Euronext Paris", isin: "FR0000130809", mic: "XPAR", category: "Banque", initialPrice: 26.5, aliases: ["societe generale", "gle", "sg"] },
  { key: "legrand", name: "Legrand", shortName: "LR", ticker: "LR · Euronext Paris", isin: "FR0010307819", mic: "XPAR", category: "Infrastructures électriques", initialPrice: 101.0, aliases: ["legrand", "lr"] },
  { key: "dassaultsystemes", name: "Dassault Systèmes", shortName: "DSY", ticker: "DSY · Euronext Paris", isin: "FR0014003TT8", mic: "XPAR", category: "Logiciels 3D & PLM", initialPrice: 34.2, aliases: ["dassault", "dsy"] },
  { key: "carrefour", name: "Carrefour", shortName: "CA", ticker: "CA · Euronext Paris", isin: "FR0000120172", mic: "XPAR", category: "Grande distribution", initialPrice: 14.8, aliases: ["carrefour", "ca"] },
  { key: "bouygues", name: "Bouygues", shortName: "EN", ticker: "EN · Euronext Paris", isin: "FR0000120503", mic: "XPAR", category: "BTP & Télécoms", initialPrice: 31.5, aliases: ["bouygues", "en"] },
  { key: "publicis", name: "Publicis Groupe", shortName: "PUB", ticker: "PUB · Euronext Paris", isin: "FR0000130577", mic: "XPAR", category: "Communication & Publicité", initialPrice: 102.0, aliases: ["publicis", "pub"] },
  { key: "thales", name: "Thales", shortName: "HO", ticker: "HO · Euronext Paris", isin: "FR0000121329", mic: "XPAR", category: "Défense & Aérospatial", initialPrice: 154.0, aliases: ["thales", "ho"] },
  { key: "stmicroelectronics", name: "STMicroelectronics", shortName: "STMPA", ticker: "STMPA · Euronext Paris", isin: "NL0000226223", mic: "XPAR", category: "Semi-conducteurs", initialPrice: 25.8, aliases: ["stm", "stmicroelectronics"] },
  { key: "kering", name: "Kering", shortName: "KER", ticker: "KER · Euronext Paris", isin: "FR0000121485", mic: "XPAR", category: "Luxe & Mode", initialPrice: 220.0, aliases: ["kering", "gucci"] },
  { key: "vinci", name: "Vinci", shortName: "DG", ticker: "DG · Euronext Paris", isin: "FR0000125486", mic: "XPAR", category: "Concessions & BTP", initialPrice: 118.0, aliases: ["vinci", "dg"] },
  { key: "pernodricard", name: "Pernod Ricard", shortName: "RI", ticker: "RI · Euronext Paris", isin: "FR0000120693", mic: "XPAR", category: "Vins & Spiritueux", initialPrice: 112.0, aliases: ["pernod", "ricard", "ri"] },
  { key: "edenred", name: "Edenred", shortName: "EDEN", ticker: "EDEN · Euronext Paris", isin: "FR0010908533", mic: "XPAR", category: "Services prépayés & Avantages", initialPrice: 32.5, aliases: ["edenred", "ticket restaurant"] },
  { key: "teleperformance", name: "Teleperformance", shortName: "TEP", ticker: "TEP · Euronext Paris", isin: "FR0000051807", mic: "XPAR", category: "Services clients & Digital", initialPrice: 94.0, aliases: ["teleperformance", "tep"] },
  { key: "eurofins", name: "Eurofins Scientific", shortName: "ERF", ticker: "ERF · Euronext Paris", isin: "FR0014000MR3", mic: "XPAR", category: "Bio-analyse & Laboratoires", initialPrice: 51.0, aliases: ["eurofins", "erf"] },
  { key: "alstom", name: "Alstom", shortName: "ALO", ticker: "ALO · Euronext Paris", isin: "FR0010220475", mic: "XPAR", category: "Mobilité & Matériel ferroviaire", initialPrice: 19.5, aliases: ["alstom", "alo"] },
  { key: "arcelormittal", name: "ArcelorMittal", shortName: "MT", ticker: "MT · Euronext Paris", isin: "LU1598757687", mic: "XPAR", category: "Acier & Mines", initialPrice: 23.4, aliases: ["arcelor", "mittal", "mt"] },

  // 4. SBF 120, Mid-caps & Valeurs de croissance PEA
  { key: "vallourec", name: "Vallourec", shortName: "VK", ticker: "VK · Euronext Paris", isin: "FR0013506730", mic: "XPAR", category: "Tubes sans soudure & Énergie", initialPrice: 16.20, aliases: ["vallourec", "vk", "FR0013506730"] },
  { key: "rubis", name: "Rubis", shortName: "RUI", ticker: "RUI · Euronext Paris", isin: "FR0013269123", mic: "XPAR", category: "Distribution d'énergie & Logistique", initialPrice: 28.50, aliases: ["rubis", "rui"] },
  { key: "fdj", name: "La Française des Jeux (FDJ)", shortName: "FDJ", ticker: "FDJ · Euronext Paris", isin: "FR0013451333", mic: "XPAR", category: "Jeux & Paris sportifs", initialPrice: 37.80, aliases: ["fdj", "francaise des jeux"] },
  { key: "gtt", name: "GTT (Gaztransport & Technigaz)", shortName: "GTT", ticker: "GTT · Euronext Paris", isin: "FR0011726835", mic: "XPAR", category: "Transport de gaz GNL", initialPrice: 138.0, aliases: ["gtt", "gnl"] },
  { key: "eiffage", name: "Eiffage", shortName: "FGR", ticker: "FGR · Euronext Paris", isin: "FR0000130452", mic: "XPAR", category: "BTP & Concessions", initialPrice: 92.0, aliases: ["eiffage", "fgr"] },
  { key: "nexans", name: "Nexans", shortName: "NEX", ticker: "NEX · Euronext Paris", isin: "FR0007035534", mic: "XPAR", category: "Câblage & Électrification", initialPrice: 122.0, aliases: ["nexans", "nex"] },
  { key: "spie", name: "Spie", shortName: "SPIE", ticker: "SPIE · Euronext Paris", isin: "FR0012757854", mic: "XPAR", category: "Services multi-techniques", initialPrice: 38.0, aliases: ["spie"] },
  { key: "soprasteria", name: "Sopra Steria Group", shortName: "SOP", ticker: "SOP · Euronext Paris", isin: "FR0000050809", mic: "XPAR", category: "Conseil & Solutions IT", initialPrice: 202.0, aliases: ["sopra", "steria", "sop"] },
  { key: "alten", name: "Alten", shortName: "ATE", ticker: "ATE · Euronext Paris", isin: "FR0000071946", mic: "XPAR", category: "Ingénierie & Conseil IT", initialPrice: 108.0, aliases: ["alten", "ate"] },
  { key: "elis", name: "Elis", shortName: "ELIS", ticker: "ELIS · Euronext Paris", isin: "FR0012435121", mic: "XPAR", category: "Services circulaires & Hygiène", initialPrice: 21.0, aliases: ["elis"] },
  { key: "verallia", name: "Verallia", shortName: "VRLA", ticker: "VRLA · Euronext Paris", isin: "FR0013447729", mic: "XPAR", category: "Emballage en verre", initialPrice: 31.0, aliases: ["verallia", "vrla"] },
  { key: "soitec", name: "Soitec", shortName: "SOI", ticker: "SOI · Euronext Paris", isin: "FR0013227113", mic: "XPAR", category: "Matériaux semi-conducteurs", initialPrice: 75.0, aliases: ["soitec", "soi"] },
  { key: "vusiongroup", name: "VusionGroup (ex-SES-imagotag)", shortName: "VU", ticker: "VU · Euronext Paris", isin: "FR0010282822", mic: "XPAR", category: "Étiquettes électroniques & IoT", initialPrice: 142.0, aliases: ["ses", "imagotag", "vusiongroup", "vu"] },
  { key: "beneteau", name: "Bénéteau", shortName: "BEN", ticker: "BEN · Euronext Paris", isin: "FR0000034160", mic: "XPAR", category: "Nautisme & Bateaux", initialPrice: 9.50, aliases: ["beneteau", "jeanneau"] },
  { key: "derichebourg", name: "Derichebourg", shortName: "DBG", ticker: "DBG · Euronext Paris", isin: "FR0000053381", mic: "XPAR", category: "Recyclage de métaux & Services", initialPrice: 5.20, aliases: ["derichebourg", "dbg"] },
  { key: "ovhcloud", name: "OVHcloud", shortName: "OVH", ticker: "OVH · Euronext Paris", isin: "FR0014005O92", mic: "XPAR", category: "Cloud & Hébergement Web", initialPrice: 8.50, aliases: ["ovh", "ovhcloud"] },
  { key: "pluxee", name: "Pluxee", shortName: "PLX", ticker: "PLX · Euronext Paris", isin: "NL0015001W49", mic: "XPAR", category: "Avantages salariés & Cadeaux", initialPrice: 18.0, aliases: ["pluxee", "sodexo"] },
  { key: "solutions30", name: "Solutions 30", shortName: "S30", ticker: "S30 · Euronext Paris", isin: "FR0013379484", mic: "XPAR", category: "Télécoms, Fibre & Compteurs", initialPrice: 1.65, aliases: ["solutions 30", "s30"] },
  { key: "neoen", name: "Neoen", shortName: "NEOEN", ticker: "NEOEN · Euronext Paris", isin: "FR0013369018", mic: "XPAR", category: "Énergies renouvelables (Solaire/Éolien)", initialPrice: 39.50, aliases: ["neoen"] },
  { key: "voltalia", name: "Voltalia", shortName: "VLTSA", ticker: "VLTSA · Euronext Paris", isin: "FR0011995588", mic: "XPAR", category: "Producteur d'énergie verte", initialPrice: 8.20, aliases: ["voltalia"] },
  { key: "mcphy", name: "McPhy Energy", shortName: "MCPHY", ticker: "MCPHY · Euronext Paris", isin: "FR0011742329", mic: "XPAR", category: "Hydrogène vert & Électrolyseurs", initialPrice: 1.30, aliases: ["mcphy", "hydrogene"] },
  { key: "forvia", name: "Forvia (ex-Faurecia)", shortName: "FRVIA", ticker: "FRVIA · Euronext Paris", isin: "FR0000121147", mic: "XPAR", category: "Équipementier automobile", initialPrice: 8.80, aliases: ["faurecia", "forvia"] },
  { key: "idlogistics", name: "ID Logistics", shortName: "IDL", ticker: "IDL · Euronext Paris", isin: "FR0010929125", mic: "XPAR", category: "Logistique contractuelle", initialPrice: 380.0, aliases: ["id logistics"] },
  { key: "trigano", name: "Trigano", shortName: "TRI", ticker: "TRI · Euronext Paris", isin: "FR0005691656", mic: "XPAR", category: "Camping-cars & Véhicules de loisirs", initialPrice: 115.0, aliases: ["trigano"] },
  { key: "coface", name: "Coface", shortName: "COFA", ticker: "COFA · Euronext Paris", isin: "FR0010667147", mic: "XPAR", category: "Assurance-crédit", initialPrice: 14.50, aliases: ["coface"] },
  { key: "scor", name: "Scor", shortName: "SCR", ticker: "SCR · Euronext Paris", isin: "FR0010411983", mic: "XPAR", category: "Réassurance mondiale", initialPrice: 22.50, aliases: ["scor"] },
  { key: "rexel", name: "Rexel", shortName: "RXL", ticker: "RXL · Euronext Paris", isin: "FR0010451203", mic: "XPAR", category: "Distribution de matériel électrique", initialPrice: 27.50, aliases: ["rexel"] },
  { key: "bureauveritas", name: "Bureau Veritas", shortName: "BVI", ticker: "BVI · Euronext Paris", isin: "FR0006174348", mic: "XPAR", category: "Inspection, Certification & Essais", initialPrice: 29.00, aliases: ["bureau veritas", "bvi"] },
  { key: "arkema", name: "Arkema", shortName: "AKE", ticker: "AKE · Euronext Paris", isin: "FR0010313833", mic: "XPAR", category: "Matériaux de spécialités & Chimie", initialPrice: 85.0, aliases: ["arkema", "ake"] },
  { key: "bic", name: "Société Bic", shortName: "BB", ticker: "BB · Euronext Paris", isin: "FR0000120966", mic: "XPAR", category: "Stylos, Briquets & Rasoirs", initialPrice: 62.0, aliases: ["bic", "bb"] },
  { key: "ubisoft", name: "Ubisoft Entertainment", shortName: "UBI", ticker: "UBI · Euronext Paris", isin: "FR0000054470", mic: "XPAR", category: "Jeux vidéo & Divertissement", initialPrice: 13.50, aliases: ["ubisoft", "ubi"] },
  { key: "atos", name: "Atos", shortName: "ATO", ticker: "ATO · Euronext Paris", isin: "FR0000051732", mic: "XPAR", category: "Services numériques & Cybersécurité", initialPrice: 0.05, aliases: ["atos", "ato"] },
  { key: "airfrance", name: "Air France-KLM", shortName: "AF", ticker: "AF · Euronext Paris", isin: "FR001400J770", mic: "XPAR", category: "Compagnie aérienne", initialPrice: 8.20, aliases: ["air france", "klm", "af"] },
  { key: "elior", name: "Elior Group", shortName: "ELIOR", ticker: "ELIOR · Euronext Paris", isin: "FR0011950732", mic: "XPAR", category: "Restauration collective", initialPrice: 3.40, aliases: ["elior", "derichebourg"] },

  // 5. Titres européens majeurs éligibles au PEA (Pays de l'Union Européenne)
  { key: "asml", name: "ASML Holding", shortName: "ASML", ticker: "ASML · Euronext Amsterdam", isin: "NL0010273215", mic: "XAMS", category: "Lithographie & Semi-conducteurs", initialPrice: 680.0, aliases: ["asml"] },
  { key: "sap", name: "SAP SE", shortName: "SAP", ticker: "SAP · XETRA Francfort", isin: "DE0007164600", mic: "XETR", category: "Logiciels d'entreprise & ERP", initialPrice: 215.0, aliases: ["sap"] },
  { key: "siemens", name: "Siemens AG", shortName: "SIE", ticker: "SIE · XETRA Francfort", isin: "DE0007236101", mic: "XETR", category: "Industrie, Santé & Digital", initialPrice: 182.0, aliases: ["siemens"] },
  { key: "allianz", name: "Allianz SE", shortName: "ALV", ticker: "ALV · XETRA Francfort", isin: "DE0008404005", mic: "XETR", category: "Assurance & Gestion d'actifs", initialPrice: 295.0, aliases: ["allianz"] },
  { key: "mercedes", name: "Mercedes-Benz Group", shortName: "MBG", ticker: "MBG · XETRA Francfort", isin: "DE0007100000", mic: "XETR", category: "Automobile haut de gamme", initialPrice: 56.0, aliases: ["mercedes", "daimler"] },
  { key: "bmw", name: "BMW Group", shortName: "BMW", ticker: "BMW · XETRA Francfort", isin: "DE0005190003", mic: "XETR", category: "Automobile & Motos", initialPrice: 72.0, aliases: ["bmw"] },
  { key: "iberdrola", name: "Iberdrola", shortName: "IBE", ticker: "IBE · Bolsa de Madrid", isin: "ES0144580Y14", mic: "XMAD", category: "Énergie électrique & Éolien", initialPrice: 13.50, aliases: ["iberdrola"] },
  { key: "santander", name: "Banco Santander", shortName: "SAN-ES", ticker: "SAN · Bolsa de Madrid", isin: "ES0113900J37", mic: "XMAD", category: "Banque européenne", initialPrice: 4.40, aliases: ["santander"] },
  { key: "enel", name: "Enel SpA", shortName: "ENEL", ticker: "ENEL · Borsa Italiana", isin: "IT0003128367", mic: "XMIL", category: "Électricité & Énergies vertes", initialPrice: 7.10, aliases: ["enel"] },
  { key: "ferrari", name: "Ferrari NV", shortName: "RACE", ticker: "RACE · Borsa Italiana", isin: "NL0011585146", mic: "XMIL", category: "Voitures de sport & Luxe", initialPrice: 420.0, aliases: ["ferrari", "race"] },

  // 6. Principaux ETFs réputés éligibles au PEA (Amundi & BNP)
  { key: "cw8", name: "Amundi PEA MSCI World", shortName: "CW8", ticker: "CW8 · Euronext Paris", isin: "FR0011869353", mic: "XPAR", category: "ETF Monde Éligible PEA", initialPrice: 535.0, aliases: ["cw8", "msci world", "world"] },
  { key: "pe500", name: "Amundi PEA S&P 500", shortName: "PE500", ticker: "PE500 · Euronext Paris", isin: "FR0013412285", mic: "XPAR", category: "ETF USA Éligible PEA", initialPrice: 38.5, aliases: ["pe500", "sp500", "s&p"] },
  { key: "pust", name: "Amundi PEA NASDAQ-100", shortName: "PUST", ticker: "PUST · Euronext Paris", isin: "FR0013412269", mic: "XPAR", category: "ETF Tech USA Éligible PEA", initialPrice: 62.0, aliases: ["pust", "nasdaq"] },
  { key: "cac40etf", name: "Amundi CAC 40 UCITS ETF", shortName: "C40", ticker: "C40 · Euronext Paris", isin: "FR0007052782", mic: "XPAR", category: "ETF CAC 40 Éligible PEA", initialPrice: 75.0, aliases: ["c40", "cac 40 etf"] },
  { key: "ptp", name: "Amundi PEA MSCI Europe", shortName: "PTP", ticker: "PTP · Euronext Paris", isin: "FR0013412038", mic: "XPAR", category: "ETF Europe Éligible PEA", initialPrice: 310.0, aliases: ["ptp", "europe"] },
  { key: "paeem", name: "Amundi PEA MSCI Emerging Markets", shortName: "PAEEM", ticker: "PAEEM · Euronext Paris", isin: "FR0013412020", mic: "XPAR", category: "ETF Émergents Éligible PEA", initialPrice: 24.0, aliases: ["paeem", "emergents"] },
  { key: "ese", name: "BNP Paribas Easy S&P 500", shortName: "ESE", ticker: "ESE · Euronext Paris", isin: "FR0011550185", mic: "XPAR", category: "ETF S&P 500 Éligible PEA", initialPrice: 25.5, aliases: ["ese", "bnp sp500"] },
  { key: "rs2k", name: "Amundi PEA Russell 2000", shortName: "RS2K", ticker: "RS2K · Euronext Paris", isin: "FR0013412277", mic: "XPAR", category: "ETF Petites valeurs USA", initialPrice: 320.0, aliases: ["rs2k", "russell"] },
  { key: "c50", name: "Amundi PEA Euro Stoxx 50", shortName: "C50", ticker: "C50 · Euronext Paris", isin: "FR0013412053", mic: "XPAR", category: "ETF Zone Euro Éligible PEA", initialPrice: 85.0, aliases: ["c50", "eurostoxx"] },
];

function loadSavedCustomPortfolios() {
  try {
    const raw = localStorage.getItem("custom-pea-portfolios");
    if (!raw) return;
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      list.forEach((p: Portfolio) => {
        if (p && p.key && !(p.key in PORTFOLIOS)) {
          PORTFOLIOS[p.key] = p;
        }
      });
    }
  } catch {
    // Ignore error
  }
}
loadSavedCustomPortfolios();

const INITIAL_VOLUME = 1;
const DEFAULT_FEE = 2;
const fmt = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtUnitPrice = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const fmtInt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (value: number) => `${fmt.format(value)} €`;
const unitPriceMoney = (value: number) => `${fmtUnitPrice.format(value)} €`;
const formatEventPrice = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded
    .toFixed(4)
    .replace(/(\.\d{2})0+$/, "$1")
    .replace(/(\.\d{3})0$/, "$1");
};
const signedMoney = (value: number) =>
  `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const getTodayLocalIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const today = getTodayLocalIso();

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

const ALERTS_STORAGE_KEY = "price-alerts-v1";

function loadLocalAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalAlerts(alerts: PriceAlert[]) {
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // ignore storage errors
  }
}

type TriggeredPushToast = {
  toastId: string;
  portfolioKey: string;
  portfolioName: string;
  shortName: string;
  targetPrice: number;
  livePrice: number;
  direction: "above" | "below";
  timeLabel: string;
  isTest?: boolean;
};

export default function Home() {
  const [selectedKey, setSelectedKey] = useState<PortfolioKey>(() => {
    const saved = localStorage.getItem("selected-portfolio") as PortfolioKey | null;
    return saved && saved in PORTFOLIOS ? saved : "viridien";
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portfolio =
    PORTFOLIOS[selectedKey] ||
    PORTFOLIOS["viridien"] ||
    Object.values(PORTFOLIOS)[0];
  const activeKey = portfolio.key;
  const selectedKeyRef = useRef<PortfolioKey>(activeKey);
  selectedKeyRef.current = activeKey;
  const hasUserManuallySelectedRef = useRef(false);
  const hasAppliedInitialCloudPrefsRef = useRef(false);
  const [portfolioListVersion, setPortfolioListVersion] = useState(0);

  const [projectionType, setProjectionType] = useState<"buy" | "sell">(
    () =>
      (localStorage.getItem(`${activeKey}-projection-type`) as "buy" | "sell") ||
      "buy"
  );
  const [volume, setVolume] = useState(INITIAL_VOLUME);
  const [price, setPrice] = useState(portfolio.initialPrice);
  const [priceInput, setPriceInput] = useState(() => String(portfolio.initialPrice));
  const lastTypedPriceRef = useRef<number>(portfolio.initialPrice);
  useEffect(() => {
    if (lastTypedPriceRef.current !== price) {
      lastTypedPriceRef.current = price;
      setPriceInput(String(price));
    }
  }, [price]);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [quoteState, setQuoteState] = useState<{
    key: PortfolioKey;
    externalQuote: number | null;
    externalQuoteTime: string | null;
    externalQuoteError: string;
    dailyQuoteData: DailyQuoteStats | null;
    loading: boolean;
  }>(() => ({
    key: portfolio.key,
    externalQuote: null,
    externalQuoteTime: null,
    externalQuoteError: "",
    dailyQuoteData: null,
    loading: true,
  }));
  const isCurrentQuote = quoteState.key === activeKey;
  const externalQuote = isCurrentQuote ? quoteState.externalQuote : null;
  const externalQuoteTime = isCurrentQuote ? quoteState.externalQuoteTime : null;
  const externalQuoteError = isCurrentQuote ? quoteState.externalQuoteError : "";
  const dailyQuoteData = isCurrentQuote ? quoteState.dailyQuoteData : null;
  const quoteLoading = isCurrentQuote ? quoteState.loading : true;
  const [rowsState, setRowsState] = useState<{
    key: PortfolioKey;
    rows: Transaction[];
  }>(() => ({
    key: portfolio.key,
    rows: loadRows(portfolio),
  }));
  const rows = useMemo(() => {
    return rowsState.key === activeKey ? rowsState.rows : loadRows(portfolio);
  }, [rowsState, activeKey, portfolio]);
  const [dateSortOrder, setDateSortOrder] = useState<"desc" | "asc">("desc");

  // Liste des titres toujours triés par ordre alphabétique
  const sortedPortfolios = useMemo(() => {
    return Object.values(PORTFOLIOS).slice().sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
    );
  }, [activeKey, portfolioListVersion]);

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

  // État pour la recherche et sélection d'un titre éligible au PEA dans la sidebar
  const [peaSearchQuery, setPeaSearchQuery] = useState("");
  const [peaDropdownOpen, setPeaDropdownOpen] = useState(false);
  const peaSearchRef = useRef<HTMLDivElement>(null);

  // État de repli de la barre latérale
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // État d'enroulement/déroulement de la division couloir de marché (par défaut enroulé)
  const [isCorridorExpanded, setIsCorridorExpanded] = useState<boolean>(false);

  // État de l'authentification et de la synchronisation Cloud
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<"synced" | "syncing" | "error" | "offline" | "idle">("idle");
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string>("");
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(null);
  const isInitialCloudSyncDone = useRef(false);
  const isInitialAlertsSyncDone = useRef(false);
  const isSigningInRef = useRef(false);

  // Alertes de prix seuil & notifications push
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadLocalAlerts());
  const alertsRef = useRef<PriceAlert[]>(alerts);
  alertsRef.current = alerts;
  const [livePricesByPortfolio, setLivePricesByPortfolio] = useState<
    Record<string, number>
  >({});
  const [checkingAlerts, setCheckingAlerts] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [triggeredPushToasts, setTriggeredPushToasts] = useState<
    TriggeredPushToast[]
  >([]);
  const [notifPermission, setNotifPermission] = useState<NotifPermissionState>(
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? (Notification.permission as NotifPermissionState)
        : "unsupported"
  );
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const dispatchedTriggerSetRef = useRef<Set<string>>(new Set());

  // Enregistrement du Service Worker pour les notifications push
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setNotifPermission(Notification.permission as NotifPermissionState);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(reg => {
          swRegistrationRef.current = reg;
        })
        .catch(() => {
          // Repli silencieux sur l'API Notification directe
        });
    }
  }, []);

  // Vérification au chargement si l'utilisateur revient d'une redirection Google
  useEffect(() => {
    checkRedirectResult()
      .then(user => {
        if (user) {
          setCurrentUser(user);
          setSuccessMessage(`Connecté avec succès en tant que ${user.displayName || user.email} !`);
        }
      })
      .catch(err => {
        console.warn("Résultat de redirection Google:", err);
      });
  }, []);

  // Écoute de l'état d'authentification Firebase
  useEffect(() => {
    const unsubscribe = subscribeToAuth(user => {
      setCurrentUser(user);
      if (!user) {
        setCloudSyncStatus("idle");
        setCloudSyncMessage("");
        isInitialCloudSyncDone.current = false;
        isInitialAlertsSyncDone.current = false;
        hasAppliedInitialCloudPrefsRef.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  // Synchronisation en direct avec Firestore lorsque l'utilisateur est connecté
  useEffect(() => {
    if (!currentUser) return;
    setCloudSyncStatus("syncing");
    setCloudSyncMessage("Connexion au Cloud...");

    const unsubscribePortfolios = subscribeToUserPortfolios(
      currentUser.uid,
      cloudData => {
        const currentSelected = selectedKeyRef.current;
        const cloudKeys = Object.keys(cloudData);
        if (cloudKeys.length === 0 && !isInitialCloudSyncDone.current) {
          // Si le compte dans le Cloud est vierge, amorcer automatiquement avec les portefeuilles locaux existants
          isInitialCloudSyncDone.current = true;
          setCloudSyncStatus("syncing");
          setCloudSyncMessage("Amorçage de votre Cloud personnel...");
          uploadAllLocalPortfoliosToCloud(
            currentUser.uid,
            PORTFOLIOS,
            currentSelected,
            projectionType,
            volume,
            price
          )
            .then(() => {
              setCloudSyncStatus("synced");
              const now = new Date();
              setLastCloudSyncTime(
                `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
              );
              setCloudSyncMessage("Cloud initialisé avec succès !");
            })
            .catch(err => {
              console.error("Erreur amorçage Cloud initial:", err);
              setCloudSyncStatus("error");
            });
          return;
        }

        isInitialCloudSyncDone.current = true;
        let hasCustomChanges = false;
        const currentCustomRaw = localStorage.getItem("custom-pea-portfolios");
        let currentCustomList = currentCustomRaw ? JSON.parse(currentCustomRaw) : [];

        cloudKeys.forEach(key => {
          const cp = cloudData[key];
          if (!cp) return;

          // Sauvegarde dans le cache local hors-ligne
          localStorage.setItem(
            `${key}-all-transactions`,
            JSON.stringify(cp.rows || [])
          );
          if (cp.projectionType) {
            localStorage.setItem(`${key}-projection-type`, cp.projectionType);
          }
          if (cp.projectionVolume !== undefined) {
            localStorage.setItem(
              `${key}-projection-volume`,
              String(cp.projectionVolume)
            );
          }
          if (cp.projectionPrice !== undefined) {
            localStorage.setItem(
              `${key}-projection-price`,
              String(cp.projectionPrice)
            );
          }

          if (!(key in PORTFOLIOS)) {
            const newP: Portfolio = {
              key: cp.key,
              name: cp.name,
              shortName: cp.shortName || cp.key.slice(0, 5).toUpperCase(),
              ticker: cp.ticker || `${cp.name} · Euronext`,
              description: `Synchronisé depuis le cloud · ${cp.externalIsin || ""}`,
              data: { rows: cp.rows || [] },
              initialPrice: cp.projectionPrice || 10,
              initialCurrentPrice: cp.projectionPrice || 10,
              externalIsin: cp.externalIsin || "",
              externalMic: cp.externalMic || "XPAR",
              yahooTicker: cp.yahooTicker,
            };
            PORTFOLIOS[key] = newP;
            if (!currentCustomList.some((p: any) => p.key === newP.key)) {
              currentCustomList.push(newP);
            }
            hasCustomChanges = true;
          } else {
            PORTFOLIOS[key].data = { rows: cp.rows || [] };
            if (cp.yahooTicker) PORTFOLIOS[key].yahooTicker = cp.yahooTicker;
          }

          // Mettre à jour uniquement la vue du titre réellement sélectionné en ce moment
          if (key === selectedKeyRef.current) {
            setRowsState({
              key,
              rows: recalculateRows(cp.rows || []),
            });
            if (cp.projectionType) setProjectionType(cp.projectionType);
            if (cp.projectionVolume !== undefined) setVolume(cp.projectionVolume);
            if (cp.projectionPrice !== undefined) setPrice(cp.projectionPrice);
          }
        });

        if (hasCustomChanges) {
          localStorage.setItem(
            "custom-pea-portfolios",
            JSON.stringify(currentCustomList)
          );
          setPortfolioListVersion(v => v + 1);
        }

        setCloudSyncStatus("synced");
        const now = new Date();
        setLastCloudSyncTime(
          `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        );
      },
      err => {
        console.error("Erreur écoute cloud:", err);
        setCloudSyncStatus("error");
        setCloudSyncMessage("Erreur de synchronisation cloud");
      }
    );

    // Écouteur des préférences utilisateur : appliqué uniquement à la connexion initiale si l'utilisateur n'a pas encore changé de titre manuellement
    const unsubscribePrefs = subscribeToUserPreferences(
      currentUser.uid,
      prefs => {
        if (!hasAppliedInitialCloudPrefsRef.current) {
          hasAppliedInitialCloudPrefsRef.current = true;
          if (
            !hasUserManuallySelectedRef.current &&
            prefs?.selectedKey &&
            prefs.selectedKey !== selectedKeyRef.current &&
            prefs.selectedKey in PORTFOLIOS
          ) {
            setSelectedKey(prefs.selectedKey);
          }
        }
      }
    );

    // Écouteur temps réel des alertes de prix seuil
    const unsubscribeAlerts = subscribeToUserAlerts(
      currentUser.uid,
      cloudAlerts => {
        if (cloudAlerts.length === 0 && !isInitialAlertsSyncDone.current) {
          isInitialAlertsSyncDone.current = true;
          const localList = alertsRef.current;
          if (localList.length > 0) {
            localList.forEach(a => {
              syncAlertToCloud(currentUser.uid, a).catch(err =>
                console.warn("Erreur amorçage alerte cloud:", err)
              );
            });
          }
          return;
        }

        isInitialAlertsSyncDone.current = true;
        const mergedMap = new Map<string, PriceAlert>();
        for (const localItem of alertsRef.current) {
          mergedMap.set(localItem.id, localItem);
        }
        for (const cloudItem of cloudAlerts) {
          const existing = mergedMap.get(cloudItem.id);
          if (
            !existing ||
            (cloudItem.updatedAt || "") >= (existing.updatedAt || "")
          ) {
            mergedMap.set(cloudItem.id, cloudItem);
          }
        }
        const merged = Array.from(mergedMap.values()).sort((a, b) =>
          (b.createdAt || "").localeCompare(a.createdAt || "")
        );
        alertsRef.current = merged;
        saveLocalAlerts(merged);
        setAlerts(merged);
      },
      err => {
        console.warn("Erreur écoute alertes cloud:", err);
      }
    );

    return () => {
      unsubscribePortfolios();
      unsubscribePrefs();
      unsubscribeAlerts();
    };
  }, [currentUser]);

  // Actions de connexion et de synchronisation
  const handleGoogleSignIn = async () => {
    if (isSigningInRef.current) return;
    isSigningInRef.current = true;
    setAuthLoading(true);
    setFormError("");

    try {
      await signInWithGoogle();
      setSuccessMessage("Connexion Google réussie ! Synchronisation Cloud active.");
    } catch (err: any) {
      console.error("Erreur de connexion Google:", err);
      const code = err?.code || "";
      if (code === "auth/popup-blocked") {
        setFormError("La fenêtre de connexion a été bloquée par le navigateur. Veuillez autoriser les fenêtres contextuelles.");
      } else if (code === "auth/popup-closed-by-user") {
        setFormError("La fenêtre de connexion a été fermée avant la validation.");
      } else if (code === "auth/unauthorized-domain") {
        setFormError("Ce domaine n'est pas autorisé dans Firebase Authentication.");
      } else if (code === "auth/cancelled-popup-request") {
        // Ignorer le double-clic
      } else {
        setFormError("Échec de la connexion Google. Veuillez réessayer.");
      }
    } finally {
      isSigningInRef.current = false;
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthLoading(true);
      await signOutUser();
      setSuccessMessage("Déconnexion réussie. Vos données restent conservées sur cet appareil.");
    } catch (err: any) {
      console.error("Erreur lors de la déconnexion:", err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForceCloudSync = async () => {
    if (!currentUser) return;
    try {
      setCloudSyncStatus("syncing");
      await syncPortfolioToCloud(currentUser.uid, activeKey, {
        name: portfolio.name,
        shortName: portfolio.shortName,
        ticker: portfolio.ticker,
        externalIsin: portfolio.externalIsin,
        externalMic: portfolio.externalMic,
        yahooTicker: portfolio.yahooTicker,
        rows,
        projectionType,
        projectionVolume: volume,
        projectionPrice: price,
      });
      setCloudSyncStatus("synced");
      const now = new Date();
      setLastCloudSyncTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      );
      setSuccessMessage(`Titre ${portfolio.name} synchronisé avec succès sur le Cloud.`);
    } catch (err) {
      console.error("Erreur synchronisation manuelle:", err);
      setCloudSyncStatus("error");
      setFormError("Erreur lors de la synchronisation manuelle vers le Cloud.");
    }
  };

  // Modal de suppression du titre actif
  const [showDeletePortfolioModal, setShowDeletePortfolioModal] = useState(false);

  const handleDeletePortfolio = () => {
    const keyToDelete = activeKey;
    const allKeys = Object.keys(PORTFOLIOS);
    const remainingKeys = allKeys.filter(k => k !== keyToDelete);

    if (remainingKeys.length === 0) {
      setFormError("Impossible de supprimer le seul titre restant.");
      setShowDeletePortfolioModal(false);
      return;
    }

    // Supprimer les données locales du titre
    localStorage.removeItem(`${keyToDelete}-all-transactions`);
    localStorage.removeItem(`${keyToDelete}-added-transactions`);
    localStorage.removeItem(`portfolio-transactions-${keyToDelete}`);
    localStorage.removeItem(`${keyToDelete}-projection-type`);
    localStorage.removeItem(`${keyToDelete}-projection-volume`);
    localStorage.removeItem(`${keyToDelete}-projection-price`);
    localStorage.removeItem(`portfolio-last-save-${keyToDelete}`);

    // Si c'est un titre custom, le retirer du stockage
    try {
      const stored = JSON.parse(
        localStorage.getItem("custom-pea-portfolios") || "[]"
      );
      const updated = stored.filter((p: any) => p.key !== keyToDelete);
      localStorage.setItem("custom-pea-portfolios", JSON.stringify(updated));
    } catch {
      // ignore
    }

    // Si connecté, supprimer également du Cloud
    if (currentUser) {
      deletePortfolioFromCloud(currentUser.uid, keyToDelete).catch(err =>
        console.error("Erreur suppression Cloud:", err)
      );
    }

    // Supprimer du dictionnaire
    delete (PORTFOLIOS as Record<string, Portfolio>)[keyToDelete];
    setPortfolioListVersion(v => v + 1);

    // Basculer sur un autre titre
    const nextKey = remainingKeys[0];
    hasUserManuallySelectedRef.current = true;
    setSelectedKey(nextKey);
    setShowDeletePortfolioModal(false);
    setSuccessMessage(`Le titre « ${portfolio.name} » a été supprimé.`);
  };

  // Fermer le menu déroulant lors d'un clic en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        peaSearchRef.current &&
        !peaSearchRef.current.contains(e.target as Node)
      ) {
        setPeaDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [liveResults, setLiveResults] = useState<PeaSecurity[]>([]);
  const [isLiveSearching, setIsLiveSearching] = useState(false);

  // Recherche en direct sur Euronext Paris et les marchés européens via l'API
  useEffect(() => {
    const raw = peaSearchQuery.trim();
    if (raw.length < 2) {
      setLiveResults([]);
      setIsLiveSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsLiveSearching(true);

    const timeout = setTimeout(async () => {
      try {
        const cleanIsin = raw.toUpperCase().replace(/\s+/g, "");
        const isPotentialIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cleanIsin);

        const promises: Promise<any>[] = [];

        // 1. Recherche Yahoo Finance (couvre l'ensemble d'Euronext et des valeurs européennes)
        const yahooPromise = fetchYahooApi(
          `/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=12&newsCount=0`,
          controller.signal
        ).catch(() => null);
        promises.push(yahooPromise);

        // 2. Si la saisie ressemble à un code ISIN (ex: FR001400NLM4), interroger Euronext directement
        if (
          isPotentialIsin ||
          cleanIsin.startsWith("FR") ||
          cleanIsin.startsWith("NL") ||
          cleanIsin.startsWith("DE") ||
          cleanIsin.startsWith("LU")
        ) {
          const authKey =
            "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
          const euronextUrl = `https://gateway.euronext.com/api/instrumentDetail?code=${cleanIsin}&codification=ISIN&exchCode=XPAR&sessionQuality=RT&view=FULL&authKey=${authKey}&format=json`;
          const euronextPromise = fetch(euronextUrl, {
            signal: controller.signal,
          })
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);
          promises.push(euronextPromise);
        }

        const [yahooData, euronextData] = await Promise.all(promises);

        const discovered: PeaSecurity[] = [];

        // Si Euronext a répondu avec l'instrument exact (cas ISIN immédiat comme FR001400NLM4)
        if (euronextData?.instr) {
          const instr = euronextData.instr;
          const sess = instr.currInstrSess || {};
          const dayPerf =
            (instr.perf || []).find((p: any) => p.perType === "D") || {};
          const px =
            Number(sess.lastPx) || Number(dayPerf.lastPx) || 10.44;
          const symbolCode =
            instr.instrLst?.shrtNm ||
            instr.instrLst?.mne ||
            cleanIsin.slice(-5);
          const name =
            instr.instrLst?.shrtNm ||
            instr.instrLst?.lstLbl ||
            `Titre Euronext ${cleanIsin}`;
          discovered.push({
            key: `pea-enx-${cleanIsin.toLowerCase()}`,
            name: `${name}`,
            shortName: symbolCode,
            ticker: `${symbolCode} · Euronext Paris`,
            isin: cleanIsin,
            mic: "XPAR",
            category: "Euronext Paris · Titre Éligible PEA",
            initialPrice: px,
            isLive: true,
          });
        }

        // Traiter les résultats de l'API Yahoo Finance
        const quotes: any[] = yahooData?.quotes || [];
        for (const q of quotes) {
          const symbol: string = q.symbol || "";
          const shortname: string = q.shortname || symbol;
          const longname: string = q.longname || shortname;
          const exch: string = q.exchange || "";
          const exchDisp: string = q.exchDisp || "";
          const isParis =
            symbol.endsWith(".PA") ||
            exch === "PAR" ||
            exch === "XPAR" ||
            exchDisp.toLowerCase().includes("paris");
          const isEurope =
            isParis ||
            symbol.endsWith(".AS") ||
            symbol.endsWith(".BR") ||
            symbol.endsWith(".MI") ||
            symbol.endsWith(".DE") ||
            symbol.endsWith(".MC");

          // Retenir les titres actions et ETF européens
          if (isEurope && (q.quoteType === "EQUITY" || q.quoteType === "ETF")) {
            const cleanShort = (q.shortname || symbol)
              .replace(/\.(PA|AS|BR|MI|DE|MC)$/, "")
              .toUpperCase();
            const cleanKey = `pea-live-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
            const isinGuess = isPotentialIsin ? cleanIsin : "";
            const cat =
              q.sectorDisp ||
              q.sector ||
              (isParis ? "Euronext Paris · PEA" : `${exchDisp || "Marché UE"} · PEA`);

            if (
              !discovered.some(
                d => d.shortName.toUpperCase() === cleanShort
              )
            ) {
              discovered.push({
                key: cleanKey,
                name: longname,
                shortName: cleanShort,
                ticker: `${cleanShort} · ${isParis ? "Euronext Paris" : exchDisp || "Euronext"}`,
                isin: isinGuess,
                mic: isParis ? "XPAR" : "XAMS",
                category: cat,
                initialPrice: 10,
                isLive: true,
                yahooTicker: symbol,
              });
            }
          }
        }

        setLiveResults(discovered);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // ignore error
        }
      } finally {
        setIsLiveSearching(false);
      }
    }, 220);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [peaSearchQuery]);

  const filteredPeaSecurities = useMemo(() => {
    const clean = (str: string) =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const q = clean(peaSearchQuery);
    if (!q) {
      return PEA_SECURITIES.slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
        )
        .slice(0, 10);
    }

    // 1. Recherche instantanée dans le catalogue complet PEA
    const staticMatches = PEA_SECURITIES.filter(sec => {
      const n = clean(sec.name);
      const s = clean(sec.shortName);
      const i = clean(sec.isin);
      const aliasMatch =
        sec.aliases?.some(a => clean(a).includes(q)) ?? false;
      return n.includes(q) || s.includes(q) || i.includes(q) || aliasMatch;
    });

    // 2. Fusionner avec les résultats en direct Euronext / Yahoo (dé-doublonnage)
    const merged = [...staticMatches];
    for (const live of liveResults) {
      const isAlreadyIn = merged.some(
        m =>
          clean(m.shortName) === clean(live.shortName) ||
          (m.isin && live.isin && clean(m.isin) === clean(live.isin)) ||
          clean(m.name) === clean(live.name)
      );
      if (!isAlreadyIn) {
        merged.push(live);
      }
    }

    return merged.sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
    );
  }, [peaSearchQuery, liveResults]);

  const handleSelectPeaSecurity = (sec: PeaSecurity) => {
    if (!(sec.key in PORTFOLIOS)) {
      const created: Portfolio = {
        key: sec.key,
        name: sec.name,
        shortName: sec.shortName,
        ticker: sec.ticker || `${sec.shortName} · Euronext Paris`,
        description: `Titre éligible au PEA · ${sec.isin ? `Code ISIN ${sec.isin}` : sec.category}`,
        data: { rows: [] },
        initialPrice: sec.initialPrice || 10,
        initialCurrentPrice: sec.initialPrice || 10,
        externalIsin: sec.isin || "",
        externalMic: sec.mic || "XPAR",
        yahooTicker: sec.yahooTicker || (sec.shortName ? (sec.shortName.includes(".") ? sec.shortName : `${sec.shortName}.PA`) : undefined),
      };
      (PORTFOLIOS as Record<string, Portfolio>)[sec.key] = created;
      setPortfolioListVersion(v => v + 1);
      try {
        const stored = JSON.parse(
          localStorage.getItem("custom-pea-portfolios") || "[]"
        );
        if (!stored.some((p: { key: string }) => p.key === sec.key)) {
          stored.push(created);
          localStorage.setItem("custom-pea-portfolios", JSON.stringify(stored));
        }
      } catch {
        // ignore
      }
      if (currentUser) {
        syncPortfolioToCloud(currentUser.uid, sec.key, {
          name: created.name,
          shortName: created.shortName,
          ticker: created.ticker,
          externalIsin: created.externalIsin,
          externalMic: created.externalMic,
          yahooTicker: created.yahooTicker,
          rows: [],
          projectionType: "buy",
          projectionVolume: INITIAL_VOLUME,
          projectionPrice: created.initialPrice,
        }).catch(err => console.error("Erreur création titre cloud:", err));
      }
    }
    hasUserManuallySelectedRef.current = true;
    setSelectedKey(sec.key);
    setPeaSearchQuery("");
    setPeaDropdownOpen(false);
    setSuccessMessage(
      `Titre éligible au PEA sélectionné : ${sec.name} (${sec.shortName}).`
    );
  };

  const handleAddCustomPea = (nameInput: string) => {
    const cleanName = nameInput.trim();
    if (!cleanName) return;
    const key = `pea-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const shortName =
      cleanName
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 5)
        .toUpperCase() || "PEA";

    const created: Portfolio = {
      key,
      name: cleanName,
      shortName,
      ticker: `${shortName} · Titre PEA`,
      description: `Titre personnalisé éligible au PEA`,
      data: { rows: [] },
      initialPrice: 50,
      initialCurrentPrice: 50,
      externalIsin: "",
      externalMic: "XPAR",
      yahooTicker: `${shortName}.PA`,
    };
    (PORTFOLIOS as Record<string, Portfolio>)[key] = created;
    setPortfolioListVersion(v => v + 1);
    try {
      const stored = JSON.parse(
        localStorage.getItem("custom-pea-portfolios") || "[]"
      );
      if (!stored.some((p: { key: string }) => p.key === key)) {
        stored.push(created);
        localStorage.setItem("custom-pea-portfolios", JSON.stringify(stored));
      }
    } catch {
      // ignore
    }
    if (currentUser) {
      syncPortfolioToCloud(currentUser.uid, key, {
        name: created.name,
        shortName: created.shortName,
        ticker: created.ticker,
        externalIsin: created.externalIsin,
        externalMic: created.externalMic,
        yahooTicker: created.yahooTicker,
        rows: [],
        projectionType: "buy",
        projectionVolume: INITIAL_VOLUME,
        projectionPrice: created.initialPrice,
      }).catch(err => console.error("Erreur création titre custom cloud:", err));
    }
    hasUserManuallySelectedRef.current = true;
    setSelectedKey(key);
    setPeaSearchQuery("");
    setPeaDropdownOpen(false);
    setSuccessMessage(`Nouveau titre PEA créé et sélectionné : ${cleanName}.`);
  };

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(
    () => localStorage.getItem(`portfolio-last-save-${activeKey}`) || null
  );
  const [saveSuccessFeedback, setSaveSuccessFeedback] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);

  const handleSaveData = () => {
    try {
      persistRows(rows, activeKey, portfolio);
      localStorage.setItem(`${activeKey}-projection-type`, projectionType);
      localStorage.setItem(`${activeKey}-projection-volume`, String(volume));
      localStorage.setItem(`${activeKey}-projection-price`, String(price));

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const dateStr = dateFmt.format(now);
      const fullSavedStr = `${dateStr} à ${timeStr}`;
      localStorage.setItem(`portfolio-last-save-${activeKey}`, fullSavedStr);
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
        portfolioKey: activeKey,
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
      link.download = `sauvegarde-${activeKey}-${new Date().toISOString().slice(0, 10)}.json`;
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
          const rawKey = (parsed?.portfolioKey ||
            parsed?.portfolio?.key ||
            activeKey) as PortfolioKey;
          const pKey = rawKey in PORTFOLIOS ? rawKey : activeKey;
          const targetPortfolio = PORTFOLIOS[pKey];
          const nextRows = recalculateRows(importedRows);
          if (pKey !== activeKey) {
            hasUserManuallySelectedRef.current = true;
            setSelectedKey(pKey);
          }
          setRowsState({ key: pKey, rows: nextRows });
          persistRows(nextRows, pKey, targetPortfolio);
          if (parsed?.projection || parsed?.portfolio?.projection) {
            const proj = parsed.projection || parsed.portfolio.projection;
            if (proj.type) {
              setProjectionType(proj.type);
              localStorage.setItem(`${pKey}-projection-type`, proj.type);
            }
            if (proj.volume) {
              const v = Math.max(0, parseNumber(String(proj.volume), 0));
              setVolume(v);
              localStorage.setItem(`${pKey}-projection-volume`, String(v));
            }
            if (proj.price) {
              const pr = Math.max(0, parseNumber(String(proj.price), 0));
              setPrice(pr);
              localStorage.setItem(`${pKey}-projection-price`, String(pr));
            }
          }
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const fullSavedStr = `${dateFmt.format(now)} à ${timeStr}`;
          localStorage.setItem(`portfolio-last-save-${pKey}`, fullSavedStr);
          setLastSavedTime(fullSavedStr);
          setSuccessMessage(
            `Sauvegarde JSON restaurée pour ${parsed?.portfolioName || targetPortfolio.name} (${nextRows.length} opérations).`
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
        setPortfolioListVersion(v => v + 1);
      }
      hasUserManuallySelectedRef.current = true;
      setSelectedKey(key);
      setRowsState({ key, rows: nextRows });
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
  const [lastKey, setLastKey] = useState<PortfolioKey>(activeKey);
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
    const fetchKey = activeKey;
    setQuoteState(prev =>
      prev.key === fetchKey
        ? { ...prev, loading: true, externalQuoteError: "" }
        : {
            key: fetchKey,
            externalQuote: null,
            externalQuoteTime: null,
            externalQuoteError: "",
            dailyQuoteData: null,
            loading: true,
          }
    );

    const yahooTicker = resolveYahooTicker(portfolio);

    const applyQuoteSuccess = (payload: {
      externalQuote: number;
      externalQuoteTime: string | null;
      externalQuoteError?: string;
      dailyQuoteData: DailyQuoteStats;
    }) => {
      if (controller.signal.aborted || selectedKeyRef.current !== fetchKey) return;
      setQuoteState({
        key: fetchKey,
        externalQuote: payload.externalQuote,
        externalQuoteTime: payload.externalQuoteTime,
        externalQuoteError: payload.externalQuoteError || "",
        dailyQuoteData: payload.dailyQuoteData,
        loading: false,
      });
    };

    const applyOfflineFallback = () => {
      if (controller.signal.aborted || selectedKeyRef.current !== fetchKey) return;
      const fallbackBase = portfolio.initialCurrentPrice || portfolio.initialPrice || 50;
      const synPoints = generateSyntheticPoints(fallbackBase, "1D");
      setQuoteState({
        key: fetchKey,
        externalQuote: fallbackBase,
        externalQuoteTime: null,
        externalQuoteError: "Mode hors ligne · Repli local",
        dailyQuoteData: {
          lastPx: fallbackBase,
          openPx: fallbackBase,
          highPx: Number((fallbackBase * 1.015).toFixed(3)),
          lowPx: Number((fallbackBase * 0.985).toFixed(3)),
          pxVar: 0,
          pctVar: 0,
          prevClose: fallbackBase,
          volume: 120000,
          dateTime: new Date().toISOString(),
          points: synPoints,
        },
        loading: false,
      });
    };

    // 1. Interroger Yahoo Finance (temps réel & courbe intraday minute par minute)
    const fetchYahooQuote = async () => {
      const data = await fetchYahooApi(
        `/v8/finance/chart/${yahooTicker}?range=1d&interval=2m`,
        controller.signal
      );
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error("Format de cotation Yahoo invalide");

      const meta = result.meta || {};
      const timestamps: number[] = result.timestamp || [];
      const quoteObj = result.indicators?.quote?.[0] || {};
      const closes: (number | null)[] = quoteObj.close || [];
      const opens: (number | null)[] = quoteObj.open || [];
      const highs: (number | null)[] = quoteObj.high || [];
      const lows: (number | null)[] = quoteObj.low || [];
      const vols: (number | null)[] = quoteObj.volume || [];

      const parsedPoints: IntradayPoint[] = [];
      let lastClose = Number(meta.regularMarketPrice) || 0;

      for (let i = 0; i < timestamps.length; i++) {
        const rawClose = closes[i] ?? opens[i];
        if (rawClose != null && Number.isFinite(rawClose) && rawClose > 0) {
          lastClose = Number(rawClose.toFixed(3));
        }
        if (lastClose > 0) {
          const d = new Date(timestamps[i] * 1000);
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          const timeLabel = `${hh}:${mm}`;
          const dayDateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
          const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
          const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
          const fullDateLabel = `${weekdayCap} ${dayDateLabel} à ${hh}:${mm}`;

          const pOpen = opens[i] != null && Number.isFinite(opens[i]) ? Number(opens[i]!.toFixed(3)) : lastClose;
          const pHigh = highs[i] != null && Number.isFinite(highs[i]) ? Number(highs[i]!.toFixed(3)) : Math.max(pOpen, lastClose);
          const pLow = lows[i] != null && Number.isFinite(lows[i]) ? Number(lows[i]!.toFixed(3)) : Math.min(pOpen, lastClose);

          parsedPoints.push({
            time: d.toISOString(),
            timeLabel,
            dayKey: d.toISOString().slice(0, 10),
            dayDateLabel,
            fullDateLabel,
            price: lastClose,
            open: pOpen,
            high: pHigh,
            low: pLow,
            vol: vols[i] || 0,
          });
        }
      }

      const quote =
        Number(meta.regularMarketPrice) ||
        (parsedPoints.length ? parsedPoints[parsedPoints.length - 1].price : (portfolio.initialCurrentPrice || portfolio.initialPrice));
      const prevClose =
        Number(meta.chartPreviousClose) ||
        Number(meta.previousClose) ||
        (parsedPoints.length ? parsedPoints[0].open || quote : quote);
      const openPx =
        parsedPoints.length && parsedPoints[0].open
          ? parsedPoints[0].open
          : prevClose;
      const highPx =
        Number(meta.regularMarketDayHigh) ||
        (parsedPoints.length ? Math.max(...parsedPoints.map(p => p.high || p.price), quote) : quote);
      const lowPx =
        Number(meta.regularMarketDayLow) ||
        (parsedPoints.length ? Math.min(...parsedPoints.map(p => p.low || p.price), quote) : quote);
      const pxVar = quote - prevClose;
      const pctVar =
        meta.regularMarketChangePercent !== undefined
          ? Number(meta.regularMarketChangePercent)
          : prevClose > 0
            ? (pxVar / prevClose) * 100
            : 0;
      const volume =
        Number(meta.regularMarketVolume) ||
        parsedPoints.reduce((acc, p) => acc + (p.vol || 0), 0);
      const dateTime = meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();

      return {
        quote,
        openPx,
        highPx,
        lowPx,
        pxVar,
        pctVar,
        prevClose,
        volume,
        dateTime,
        points: parsedPoints,
      };
    };

    fetchYahooQuote()
      .then(res => {
        applyQuoteSuccess({
          externalQuote: res.quote,
          externalQuoteTime: formatQuoteTime(res.dateTime),
          dailyQuoteData: {
            lastPx: res.quote,
            openPx: res.openPx,
            highPx: res.highPx,
            lowPx: res.lowPx,
            pxVar: res.pxVar,
            pctVar: res.pctVar,
            prevClose: res.prevClose,
            volume: res.volume,
            dateTime: res.dateTime,
            points: res.points,
          },
        });
      })
      .catch(error => {
        if (error?.name === "AbortError" || controller.signal.aborted) return;

        // 2. Fallback Euronext si code ISIN disponible
        if (portfolio.externalIsin) {
          const authKey =
            "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
          const detailUrl = `https://gateway.euronext.com/api/instrumentDetail?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic || "XPAR"}&sessionQuality=RT&view=FULL&authKey=${authKey}&format=json`;
          const intraUrl = `https://gateway.euronext.com/api/intradayHistoricalData?code=${portfolio.externalIsin}&codification=ISIN&exchCode=${portfolio.externalMic || "XPAR"}&authKey=${authKey}&format=json`;

          return Promise.all([
            fetch(detailUrl, { signal: controller.signal }).then(r => (r.ok ? r.json() : null)),
            fetch(intraUrl, { signal: controller.signal }).then(r => (r.ok ? r.json() : null)),
          ])
            .then(([detailPayload, intraPayload]) => {
              if (controller.signal.aborted || selectedKeyRef.current !== fetchKey) return;
              const result = detailPayload?.instr;
              const sess = result?.currInstrSess || {};
              const dayPerf =
                result?.perf?.find((p: { perType?: string }) => p.perType === "D") || {};
              const quote = Number(sess.lastPx) || Number(dayPerf.lastPx);
              if (!quote || !Number.isFinite(quote)) throw new Error("Fallback failed");

              const openPx = Number(sess.openPx) || Number(dayPerf.perStartPx) || quote;
              const highPx = Number(dayPerf.highPx) || Math.max(openPx, quote);
              const lowPx = Number(dayPerf.lowPx) || Math.min(openPx, quote);
              const pxVar = Number(dayPerf.pxVar) || quote - openPx;
              const pctVar =
                dayPerf.var !== undefined
                  ? Number(dayPerf.var) * 100
                  : openPx > 0
                    ? ((quote - openPx) / openPx) * 100
                    : 0;
              const volume = Number(sess.tradedQty) || Number(dayPerf.tradedQty) || 0;
              const dateTime = sess.dateTime || sess.lastUpdate || null;

              const rawPoints: any[] = intraPayload?.intradayPoint || [];
              const parsedPoints: IntradayPoint[] = rawPoints.map(p => {
                const rawTime = p.time || "";
                const timeMatch = rawTime.match(/-(\d{2}):(\d{2})/);
                const timeLabel = timeMatch
                  ? `${timeMatch[1]}:${timeMatch[2]}`
                  : p.beginTime
                    ? String(p.beginTime).slice(0, 5)
                    : "";
                const pClose = Number(p.endPx) || Number(p.beginPx) || quote;
                const pOpen = Number(p.beginPx) || pClose;
                return {
                  time: rawTime,
                  timeLabel,
                  price: pClose,
                  open: pOpen,
                  high: Number(p.highPx) || Math.max(pOpen, pClose),
                  low: Number(p.lowPx) || Math.min(pOpen, pClose),
                  vol: Number(p.vol) || 0,
                };
              });

              applyQuoteSuccess({
                externalQuote: quote,
                externalQuoteTime: dateTime,
                dailyQuoteData: {
                  lastPx: quote,
                  openPx,
                  highPx,
                  lowPx,
                  pxVar,
                  pctVar,
                  prevClose: Number(sess.prevAdjClosingPrice) || openPx,
                  volume,
                  dateTime,
                  points: parsedPoints,
                },
              });
            })
            .catch(fallbackErr => {
              if (fallbackErr?.name === "AbortError" || controller.signal.aborted) return;
              applyOfflineFallback();
            });
        } else {
          applyOfflineFallback();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && selectedKeyRef.current === fetchKey) {
          setQuoteState(prev =>
            prev.key === fetchKey && prev.loading ? { ...prev, loading: false } : prev
          );
        }
      });

    return () => controller.abort();
  }, [
    activeKey,
    portfolio.key,
    portfolio.shortName,
    portfolio.externalIsin,
    portfolio.externalMic,
    portfolio.yahooTicker,
    portfolio.initialCurrentPrice,
    portfolio.initialPrice,
    quoteRefresh,
  ]);

  const playAlertChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [880, 1174.66];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.26);
      });
    } catch {
      // ignore audio restrictions
    }
  };

  const sendBrowserPush = async (title: string, body: string, tag: string) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    try {
      const swReg =
        swRegistrationRef.current ||
        ("serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined);
      if (swReg && typeof swReg.showNotification === "function") {
        await swReg.showNotification(title, {
          body,
          tag,
          renotify: true,
          data: { url: window.location.href },
        } as NotificationOptions);
        return;
      }
      new Notification(title, { body, tag });
    } catch {
      try {
        new Notification(title, { body, tag });
      } catch {
        // ignore in restricted iframes
      }
    }
  };

  const dispatchPushAlert = (alert: PriceAlert, livePrice: number) => {
    const dispatchKey = `${alert.id}:${alert.triggeredAt || alert.updatedAt}`;
    if (dispatchedTriggerSetRef.current.has(dispatchKey)) return;
    dispatchedTriggerSetRef.current.add(dispatchKey);

    playAlertChime();

    const dirLabel = alert.direction === "above" ? "≥" : "≤";
    const title = `Alerte ${alert.shortName} : ${unitPriceMoney(livePrice)}`;
    const body = `${alert.portfolioName} a atteint le seuil ${dirLabel} ${unitPriceMoney(alert.targetPrice)}${alert.note ? ` · ${alert.note}` : ""}`;

    void sendBrowserPush(title, body, `price-alert-${alert.id}`);

    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    setTriggeredPushToasts(prev => [
      {
        toastId: `${alert.id}-${Date.now()}`,
        portfolioKey: alert.portfolioKey,
        portfolioName: alert.portfolioName,
        shortName: alert.shortName,
        targetPrice: alert.targetPrice,
        livePrice,
        direction: alert.direction,
        timeLabel,
      },
      ...prev.slice(0, 3),
    ]);
  };

  const evaluatePriceForPortfolio = (
    targetKey: string,
    livePrice: number
  ) => {
    if (!Number.isFinite(livePrice) || livePrice <= 0) return;

    setLivePricesByPortfolio(prev =>
      prev[targetKey] === livePrice ? prev : { ...prev, [targetKey]: livePrice }
    );

    const currentAlerts = alertsRef.current;
    const toTrigger = currentAlerts.filter(
      a =>
        a.portfolioKey === targetKey &&
        a.active &&
        !a.triggered &&
        (a.direction === "above"
          ? livePrice >= a.targetPrice
          : livePrice <= a.targetPrice)
    );

    if (toTrigger.length === 0) return;

    const nowIso = new Date().toISOString();
    const triggeredIds = new Set(toTrigger.map(a => a.id));
    const updatedAlerts = currentAlerts.map(a => {
      if (!triggeredIds.has(a.id)) return a;
      const updated: PriceAlert = {
        ...a,
        active: false,
        triggered: true,
        triggeredAt: nowIso,
        triggeredPrice: livePrice,
        updatedAt: nowIso,
      };
      return updated;
    });

    alertsRef.current = updatedAlerts;
    saveLocalAlerts(updatedAlerts);
    setAlerts(updatedAlerts);

    updatedAlerts.forEach(a => {
      if (triggeredIds.has(a.id)) {
        if (currentUser) {
          syncAlertToCloud(currentUser.uid, a).catch(err =>
            console.warn("Erreur sync alerte déclenchée:", err)
          );
        }
        dispatchPushAlert(a, livePrice);
      }
    });
  };

  const fetchSingleQuoteForAlert = async (
    sampleAlert: PriceAlert
  ): Promise<number | null> => {
    const known = PORTFOLIOS[sampleAlert.portfolioKey];
    const ticker = resolveYahooTicker({
      key: sampleAlert.portfolioKey,
      name: sampleAlert.portfolioName,
      shortName: sampleAlert.shortName,
      externalIsin: known?.externalIsin || sampleAlert.externalIsin,
      yahooTicker: known?.yahooTicker || sampleAlert.yahooTicker,
    });

    try {
      const data = await fetchYahooApi(
        `/v8/finance/chart/${ticker}?range=1d&interval=5m`
      );
      const result = data?.chart?.result?.[0];
      const meta = result?.meta || {};
      const closes: (number | null)[] =
        result?.indicators?.quote?.[0]?.close || [];
      let px = Number(meta.regularMarketPrice) || 0;
      if (!px && closes.length) {
        for (let i = closes.length - 1; i >= 0; i--) {
          if (closes[i] && Number.isFinite(closes[i])) {
            px = Number(closes[i]);
            break;
          }
        }
      }
      if (px > 0 && Number.isFinite(px)) return px;
    } catch {
      // Fallback Euronext ci-dessous
    }

    const isin = known?.externalIsin || sampleAlert.externalIsin;
    const mic = known?.externalMic || sampleAlert.externalMic || "XPAR";
    if (isin) {
      try {
        const authKey =
          "256f0720127269acfcb390b5adef10c242469c41afd08426744324bee3e2d75a";
        const detailUrl = `https://gateway.euronext.com/api/instrumentDetail?code=${isin}&codification=ISIN&exchCode=${mic}&sessionQuality=RT&view=FULL&authKey=${authKey}&format=json`;
        const resp = await fetch(detailUrl);
        if (resp.ok) {
          const payload = await resp.json();
          const sess = payload?.instr?.currInstrSess || {};
          const dayPerf =
            payload?.instr?.perf?.find(
              (p: { perType?: string }) => p.perType === "D"
            ) || {};
          const px = Number(sess.lastPx) || Number(dayPerf.lastPx);
          if (px > 0 && Number.isFinite(px)) return px;
        }
      } catch {
        // ignore
      }
    }
    return null;
  };

  const checkAllActiveAlerts = async () => {
    const activeAlerts = alertsRef.current.filter(
      a => a.active && !a.triggered
    );
    if (activeAlerts.length === 0) return;

    setCheckingAlerts(true);
    try {
      const sampleByKey = new Map<string, PriceAlert>();
      for (const a of activeAlerts) {
        if (!sampleByKey.has(a.portfolioKey)) {
          sampleByKey.set(a.portfolioKey, a);
        }
      }

      await Promise.all(
        Array.from(sampleByKey.values()).map(async sample => {
          const livePx = await fetchSingleQuoteForAlert(sample);
          if (livePx !== null) {
            evaluatePriceForPortfolio(sample.portfolioKey, livePx);
          }
        })
      );

      const now = new Date();
      setLastCheckedAt(
        `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes()
        ).padStart(2, "0")}`
      );
    } finally {
      setCheckingAlerts(false);
    }
  };

  // Évaluation immédiate dès que le cours du titre sélectionné est actualisé
  useEffect(() => {
    if (
      !quoteLoading &&
      externalQuote !== null &&
      Number.isFinite(externalQuote) &&
      externalQuote > 0
    ) {
      evaluatePriceForPortfolio(activeKey, externalQuote);
    }
  }, [activeKey, externalQuote, quoteLoading]);

  // Surveillance périodique toutes les 60 secondes pour tous les titres ayant une alerte active
  useEffect(() => {
    const hasActive = alerts.some(a => a.active && !a.triggered);
    if (!hasActive) return;

    const intervalId = window.setInterval(() => {
      void checkAllActiveAlerts();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [alerts, currentUser]);

  const handleRequestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm as NotifPermissionState);
      if (perm === "granted") {
        await sendBrowserPush(
          "Notifications push activées",
          "Vous recevrez une alerte dès qu’un titre atteindra votre prix seuil.",
          "push-permission-ok"
        );
      }
    } catch {
      setNotifPermission(Notification.permission as NotifPermissionState);
    }
  };

  const handleSendTestNotification = async () => {
    playAlertChime();
    const refPx =
      externalQuote !== null && externalQuote > 0
        ? externalQuote
        : portfolio.initialCurrentPrice || portfolio.initialPrice || 10;
    await sendBrowserPush(
      `Test push · ${portfolio.shortName}`,
      `Notification push opérationnelle pour ${portfolio.name} (cours suivi : ${unitPriceMoney(refPx)}).`,
      `test-push-${Date.now()}`
    );
    const now = new Date();
    setTriggeredPushToasts(prev => [
      {
        toastId: `test-${Date.now()}`,
        portfolioKey: activeKey,
        portfolioName: portfolio.name,
        shortName: portfolio.shortName,
        targetPrice: refPx,
        livePrice: refPx,
        direction: "above",
        timeLabel: `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes()
        ).padStart(2, "0")}`,
        isTest: true,
      },
      ...prev.slice(0, 3),
    ]);
  };

  const handleCreateAlert = (input: {
    targetPrice: number;
    direction: "above" | "below";
    note: string;
  }) => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void handleRequestNotificationPermission();
    }

    const nowIso = new Date().toISOString();
    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: currentUser?.uid,
      portfolioKey: activeKey,
      portfolioName: portfolio.name,
      shortName: portfolio.shortName,
      externalIsin: portfolio.externalIsin || "",
      externalMic: portfolio.externalMic || "XPAR",
      yahooTicker: portfolio.yahooTicker || "",
      targetPrice: input.targetPrice,
      direction: input.direction,
      active: true,
      triggered: false,
      triggeredAt: null,
      triggeredPrice: null,
      note: input.note,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const next = [newAlert, ...alertsRef.current];
    alertsRef.current = next;
    saveLocalAlerts(next);
    setAlerts(next);

    if (currentUser) {
      syncAlertToCloud(currentUser.uid, newAlert).catch(err =>
        console.warn("Erreur sauvegarde alerte cloud:", err)
      );
    }

    if (
      externalQuote !== null &&
      Number.isFinite(externalQuote) &&
      externalQuote > 0
    ) {
      evaluatePriceForPortfolio(activeKey, externalQuote);
    }
  };

  const handleToggleAlert = (alertId: string) => {
    const nowIso = new Date().toISOString();
    let updatedItem: PriceAlert | null = null;
    const next = alertsRef.current.map(a => {
      if (a.id !== alertId) return a;
      updatedItem = { ...a, active: !a.active, updatedAt: nowIso };
      return updatedItem;
    });
    alertsRef.current = next;
    saveLocalAlerts(next);
    setAlerts(next);
    if (currentUser && updatedItem) {
      syncAlertToCloud(currentUser.uid, updatedItem).catch(err =>
        console.warn("Erreur mise à jour alerte cloud:", err)
      );
    }
  };

  const handleRearmAlert = (alertId: string) => {
    const nowIso = new Date().toISOString();
    let updatedItem: PriceAlert | null = null;
    const next = alertsRef.current.map(a => {
      if (a.id !== alertId) return a;
      updatedItem = {
        ...a,
        active: true,
        triggered: false,
        triggeredAt: null,
        triggeredPrice: null,
        updatedAt: nowIso,
      };
      return updatedItem;
    });
    alertsRef.current = next;
    saveLocalAlerts(next);
    setAlerts(next);
    if (currentUser && updatedItem) {
      syncAlertToCloud(currentUser.uid, updatedItem).catch(err =>
        console.warn("Erreur réarmement alerte cloud:", err)
      );
    }
  };

  const handleDeleteAlert = (alertId: string) => {
    const next = alertsRef.current.filter(a => a.id !== alertId);
    alertsRef.current = next;
    saveLocalAlerts(next);
    setAlerts(next);
    if (currentUser) {
      deleteAlertFromCloud(currentUser.uid, alertId).catch(err =>
        console.warn("Erreur suppression alerte cloud:", err)
      );
    }
  };

  useEffect(() => {
    if (activeKey === lastKey) return;
    const next = PORTFOLIOS[activeKey] || portfolio;
    setRowsState({ key: next.key, rows: loadRows(next) });
    setProjectionType(
      (localStorage.getItem(`${activeKey}-projection-type`) as "buy" | "sell") ||
        "buy"
    );
    setVolume(
      Number(
        localStorage.getItem(`${activeKey}-projection-volume`) ??
          INITIAL_VOLUME
      )
    );
    setPrice(
      Number(
        localStorage.getItem(`${activeKey}-projection-price`) ??
          next.initialPrice
      )
    );
    setOperationPrice(String(next.initialPrice));
    setOperationDate(today);
    setEditingIndex(null);
    setFormError("");
    setSuccessMessage("");
    setLastSavedTime(
      localStorage.getItem(`portfolio-last-save-${activeKey}`) || null
    );
    setLastKey(activeKey);
    localStorage.setItem("selected-portfolio", activeKey);
  }, [activeKey, lastKey, portfolio]);

  useEffect(() => {
    localStorage.setItem("selected-portfolio", activeKey);
    if (currentUser) {
      syncPreferencesToCloud(currentUser.uid, {
        selectedKey: activeKey,
        isSidebarCollapsed,
      }).catch(err => console.warn("Erreur sync preferences:", err));
    }
  }, [activeKey, isSidebarCollapsed, currentUser]);

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

    // Calcul de la plus ou moins-value cumulée déjà réalisée (PRU pondéré sur cessions + dividendes encaissés)
    let heldQty = 0;
    let heldCostBasis = 0;
    let realizedPl = 0;
    let closedSellCount = 0;
    let dividendCount = 0;

    for (const row of rows) {
      const isDividend =
        row.kind === "dividend" ||
        row.event.toLowerCase().includes("dividende") ||
        (row.volume === 0 && row.booked > 0);
      if (isDividend) {
        realizedPl += row.booked;
        dividendCount += 1;
      } else if (row.volume > 0) {
        heldQty += row.volume;
        heldCostBasis += row.volume * row.price + Math.abs(row.fees);
      } else if (row.volume < 0) {
        const qty = Math.abs(row.volume);
        const soldFromHeld = Math.min(heldQty, qty);
        const avgCost = heldQty > 0 ? heldCostBasis / heldQty : 0;
        const costOfSold = avgCost * soldFromHeld;
        const proceeds = qty * row.price - Math.abs(row.fees);
        realizedPl += proceeds - costOfSold;
        heldQty = Math.max(0, heldQty - qty);
        heldCostBasis = Math.max(0, heldCostBasis - costOfSold);
        closedSellCount += 1;
      }
    }

    const prevClosePrice =
      dailyQuoteData?.prevClose && Number.isFinite(dailyQuoteData.prevClose) && dailyQuoteData.prevClose > 0
        ? dailyQuoteData.prevClose
        : marketPrice;
    const prevCloseTotalValue = totalVolume * prevClosePrice;

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
      realizedPl,
      closedSellCount,
      dividendCount,
      prevClosePrice,
      prevCloseTotalValue,
    };
  }, [activeKey, rows, projectionType, volume, price, externalQuote, dailyQuoteData?.prevClose, portfolio.initialCurrentPrice]);

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
    localStorage.setItem(`${activeKey}-projection-type`, nextType);
  };

  const setVolumeValue = (value: string) => {
    const next = Math.max(0, parseNumber(value, 0));
    setVolume(next);
    localStorage.setItem(`${activeKey}-projection-volume`, String(next));
  };

  const setPriceValue = (value: string) => {
    setPriceInput(value);
    const next = Math.max(0, Math.round(parseNumber(value, 0) * 10000) / 10000);
    lastTypedPriceRef.current = next;
    setPrice(next);
    localStorage.setItem(`${activeKey}-projection-price`, String(next));
  };

  const persistRows = (
    nextRows: Transaction[],
    targetKey: PortfolioKey = activeKey,
    targetPortfolio: Portfolio = portfolio
  ) => {
    localStorage.setItem(
      `${targetKey}-all-transactions`,
      JSON.stringify(nextRows)
    );
    if (currentUser) {
      setCloudSyncStatus("syncing");
      syncPortfolioToCloud(currentUser.uid, targetKey, {
        name: targetPortfolio.name,
        shortName: targetPortfolio.shortName,
        ticker: targetPortfolio.ticker,
        externalIsin: targetPortfolio.externalIsin,
        externalMic: targetPortfolio.externalMic,
        yahooTicker: targetPortfolio.yahooTicker,
        rows: nextRows,
        projectionType,
        projectionVolume: volume,
        projectionPrice: price,
      })
        .then(() => {
          setCloudSyncStatus("synced");
          const now = new Date();
          setLastCloudSyncTime(
            `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
          );
        })
        .catch(err => {
          console.error("Erreur sync persistRows:", err);
          setCloudSyncStatus("error");
        });
    }
  };
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
    const targetKey = activeKey;
    const targetPortfolio = portfolio;
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
    setRowsState({ key: targetKey, rows: nextRows });
    persistRows(nextRows, targetKey, targetPortfolio);
    setSuccessMessage(
      `Opération supprimée et cumuls recalculés pour ${targetPortfolio.name}.`
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
    const targetKey = activeKey;
    const targetPortfolio = portfolio;
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
    const roundedPrice = Math.round(enteredPrice * 10000) / 10000;
    const signedVolume =
      operationType === "buy" ? enteredVolume : -enteredVolume;
    const reference = editingIndex === null ? last : rows[editingIndex];
    const editedRow: Transaction = {
      ...reference,
      kind: "trade",
      instrument: targetPortfolio.name,
      isin: targetPortfolio.externalIsin || reference.isin || "",
      symbol: targetPortfolio.shortName || reference.symbol || "",
      market: targetPortfolio.externalMic || reference.market || "",
      currency: reference.currency || "EUR",
      date: operationDate,
      volume: signedVolume,
      price: roundedPrice,
      fees: -enteredFees,
      event: `${operationType === "buy" ? "Acheter" : "Vendre"} ${operationType === "buy" ? enteredVolume : -enteredVolume} @ ${formatEventPrice(roundedPrice)} EUR`,
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
    setRowsState({ key: targetKey, rows: nextRows });
    persistRows(nextRows, targetKey, targetPortfolio);
    setSuccessMessage(
      editingIndex === null
        ? `${operationType === "buy" ? "Achat" : "Vente"} ajouté pour ${targetPortfolio.name}.`
        : `Opération modifiée pour ${targetPortfolio.name}.`
    );
    clearForm();
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header-row">
          <div className="brand-mark">
            <TrendingUp size={18} strokeWidth={2.4} />
          </div>
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={() => setIsSidebarCollapsed(true)}
            title="Replier la barre latérale"
            aria-label="Replier la barre latérale"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="sidebar-copy">
          <span className="eyebrow">Portfolio studio</span>
          <strong>{portfolio.name}</strong>
          <span className="ticker">{portfolio.ticker}</span>
        </div>

        {/* Module d'authentification et de synchronisation Cloud multi-appareils */}
        {!currentUser ? (
          <div className="sidebar-cloud-sync-card">
            <div className="cloud-sync-card-header">
              <div className="cloud-sync-title-wrap">
                <Cloud size={15} className="cloud-icon text-sky-400" />
                <span className="cloud-sync-title">Synchro Cloud</span>
              </div>
              <span className="cloud-status-badge offline">Mode local</span>
            </div>
            <p className="cloud-sync-desc">
              Synchronisez vos portefeuilles et transactions en temps réel sur tous vos appareils (PC, mobile, tablette).
            </p>
            <button
              type="button"
              className="cloud-google-login-btn"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              title="Se connecter avec un compte Google"
            >
              <svg className="google-svg-icon" viewBox="0 0 24 24" width="15" height="15">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{authLoading ? "Connexion..." : "Se connecter avec Google"}</span>
            </button>
          </div>
        ) : (
          <div className="sidebar-cloud-sync-card active">
            <div className="cloud-user-header">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || "Profil"}
                  className="cloud-user-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="cloud-user-avatar fallback">
                  {(currentUser.displayName || currentUser.email || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="cloud-user-info">
                <span className="cloud-user-name" title={currentUser.displayName || currentUser.email || ""}>
                  {currentUser.displayName || currentUser.email?.split("@")[0]}
                </span>
                <div className="cloud-sync-status-indicator">
                  {cloudSyncStatus === "syncing" ? (
                    <>
                      <RefreshCw size={11} className="spin text-sky-400" />
                      <span className="text-sky-300">Synchronisation...</span>
                    </>
                  ) : cloudSyncStatus === "error" ? (
                    <>
                      <span className="cloud-status-dot error" />
                      <span className="text-rose-300">Erreur synchro</span>
                    </>
                  ) : (
                    <>
                      <span className="cloud-status-dot live" />
                      <span className="text-emerald-300">En direct sur vos appareils</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {lastCloudSyncTime && (
              <div className="cloud-sync-meta-row">
                <span className="cloud-sync-meta-time">
                  Dernière synchro : {lastCloudSyncTime}
                </span>
              </div>
            )}

            <div className="cloud-sync-actions-row">
              <button
                type="button"
                className="cloud-sync-btn"
                onClick={handleForceCloudSync}
                disabled={cloudSyncStatus === "syncing"}
                title="Forcer la synchronisation avec le cloud"
              >
                <RefreshCw size={12} className={cloudSyncStatus === "syncing" ? "spin" : ""} />
                <span>{cloudSyncStatus === "syncing" ? "En cours" : "Synchroniser"}</span>
              </button>
              <button
                type="button"
                className="cloud-logout-btn"
                onClick={handleSignOut}
                disabled={authLoading}
                title="Se déconnecter"
              >
                <LogOut size={12} />
                <span>Quitter</span>
              </button>
            </div>
          </div>
        )}

        {/* Sélecteur de titre suivi (déplacé dans la sidebar) */}
        <label className="portfolio-picker" htmlFor="sidebar-portfolio-select">
          <span>Titre suivi</span>
          <select
            id="sidebar-portfolio-select"
            aria-label="Sélectionner le titre"
            value={activeKey}
            onChange={event => {
              hasUserManuallySelectedRef.current = true;
              setSelectedKey(event.target.value as PortfolioKey);
            }}
          >
            {sortedPortfolios.map(p => (
              <option key={p.key} value={p.key}>
                {p.name} · {p.shortName}
              </option>
            ))}
          </select>
        </label>

        {/* Champ de saisie et sélection d'un titre éligible au PEA */}
        <div className="sidebar-pea-section" ref={peaSearchRef}>
          <div className="pea-badge-row">
            <span className="pea-tag">
              <Check size={11} strokeWidth={2.8} /> Éligible PEA
            </span>
            <span className="pea-count-pill">
              {isLiveSearching ? "Recherche en direct..." : `${PEA_SECURITIES.length}+ titres & direct Euronext`}
            </span>
          </div>

          <label className="pea-input-label" htmlFor="pea-title-input">
            Rechercher un titre ou code ISIN
          </label>

          <div className="pea-search-box">
            {isLiveSearching ? (
              <RefreshCw size={14} className="pea-search-icon animate-spin text-emerald-400" />
            ) : (
              <Search size={14} className="pea-search-icon" />
            )}
            <input
              id="pea-title-input"
              type="text"
              className="pea-search-input"
              placeholder="Nom ou ISIN (ex: EMEIS, FR001400NLM4...)"
              value={peaSearchQuery}
              onChange={e => {
                setPeaSearchQuery(e.target.value);
                setPeaDropdownOpen(true);
              }}
              onFocus={() => setPeaDropdownOpen(true)}
              onKeyDown={e => {
                if (e.key === "Escape") setPeaDropdownOpen(false);
              }}
              autoComplete="off"
            />
            {peaSearchQuery && (
              <button
                type="button"
                className="pea-search-clear"
                onClick={() => {
                  setPeaSearchQuery("");
                }}
                aria-label="Effacer"
                title="Effacer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {peaDropdownOpen && (
            <div className="pea-dropdown" role="listbox">
              <div className="pea-dropdown-title">
                {isLiveSearching ? (
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <RefreshCw size={11} className="animate-spin" /> Recherche en direct sur Euronext...
                  </span>
                ) : peaSearchQuery ? (
                  `Résultats pour « ${peaSearchQuery} » (${filteredPeaSecurities.length} trouvés)`
                ) : (
                  "Titres PEA suggérés (cliquez pour sélectionner)"
                )}
              </div>
              {filteredPeaSecurities.length > 0 ? (
                filteredPeaSecurities.map(sec => {
                  const isCurrent =
                    sec.key === activeKey ||
                    (sec.isin && sec.isin === portfolio.externalIsin);
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      className={`pea-dropdown-item ${isCurrent ? "selected" : ""}`}
                      onClick={() => handleSelectPeaSecurity(sec)}
                    >
                      <div className="pea-item-info">
                        <span className="pea-item-name">{sec.name}</span>
                        <span className="pea-item-meta">
                          <b>{sec.shortName}</b>
                          {sec.isin ? ` · ${sec.isin}` : ""}
                          {sec.category ? ` · ${sec.category}` : ""}
                        </span>
                      </div>
                      {isCurrent ? (
                        <span className="pea-selected-badge">
                          <Check size={11} strokeWidth={2.6} /> Actif
                        </span>
                      ) : sec.isLive ? (
                        <span className="pea-mini-tag border border-emerald-500/40 text-emerald-300 bg-emerald-950/40">
                          Direct Euronext
                        </span>
                      ) : (
                        <span className="pea-mini-tag">PEA</span>
                      )}
                    </button>
                  );
                })
              ) : isLiveSearching ? (
                <div className="pea-no-match">
                  <p>Interrogation en direct d'Euronext et des marchés européens...</p>
                </div>
              ) : (
                <div className="pea-no-match">
                  <p>Aucun titre répertorié pour « {peaSearchQuery} »</p>
                  <button
                    type="button"
                    className="pea-custom-add-btn"
                    onClick={() => handleAddCustomPea(peaSearchQuery)}
                  >
                    <Plus size={13} />
                    <span>Créer et suivre « {peaSearchQuery} » (PEA)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-divider" />
        <nav aria-label="Navigation principale">
          <a className="nav-item" href="#cotation">
            <TrendingUp size={16} /> Cotation du jour
          </a>
          <a className="nav-item active" href="#saisie">
            <Calculator size={16} /> Saisie & calcul
          </a>
          <a className="nav-item" href="#alertes">
            <BellRing size={16} /> Alertes prix
            {alerts.some(a => a.active && !a.triggered) && (
              <span className="nav-alert-count">
                {alerts.filter(a => a.active && !a.triggered).length}
              </span>
            )}
          </a>
          <a className="nav-item" href="#historique">
            <TrendingUp size={16} /> Historique
          </a>
        </nav>
        <div className="sidebar-footnote">
          <span className="status-dot" /> {portfolio.description}
        </div>

        {/* Actions ajoutées en dernier dans la sidebar */}
        <div className="sidebar-divider" />
        <div className="sidebar-bottom-actions">
          <span className="sidebar-actions-label">Gestion du titre</span>
          <div className="sidebar-actions-list">
            <button
              type="button"
              className={`sidebar-action-btn primary ${saveSuccessFeedback ? "saved" : ""}`}
              onClick={handleSaveData}
              title="Sauvegarder les données de ce titre"
            >
              {saveSuccessFeedback ? <Check size={14} /> : <Save size={14} />}
              <span>{saveSuccessFeedback ? "Sauvegardé !" : "Sauvegarder"}</span>
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Importer un fichier Excel (.xlsx, .xls) ou un fichier de sauvegarde (.json)"
            >
              <Plus size={14} />
              <span>Importer</span>
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
              className="sidebar-action-btn"
              onClick={() => exportCsv(rows, portfolio)}
              title="Exporter les transactions au format CSV"
            >
              <Download size={14} />
              <span>Exporter CSV</span>
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={exportBackupJson}
              title="Télécharger une copie de sauvegarde complète des données au format JSON"
            >
              <FileDown size={14} />
              <span>Sauvegarde JSON</span>
            </button>
            <button
              type="button"
              className="sidebar-action-btn danger"
              onClick={() => setShowDeletePortfolioModal(true)}
              title={`Supprimer le titre ${portfolio.name}`}
            >
              <Trash2 size={14} />
              <span>Supprimer le titre</span>
            </button>
          </div>
        </div>
      </aside>
      <main className={`main-content ${isSidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
        {isSidebarCollapsed && (
          <button
            type="button"
            className="sidebar-unfold-floating-btn"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Déplier la barre latérale"
            aria-label="Déplier la barre latérale"
          >
            <PanelLeftOpen size={16} />
            <span>Déplier le menu</span>
          </button>
        )}
        <DailyQuoteSection
          portfolio={portfolio}
          quoteData={dailyQuoteData}
          loading={quoteLoading}
          error={externalQuoteError}
          onRefresh={() => setQuoteRefresh(value => value + 1)}
          money={money}
          signedMoney={signedMoney}
          fmtInt={fmtInt}
        />

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
                      value={priceInput}
                      onChange={event => setPriceValue(event.target.value)}
                    />
                    <div className="input-suffix-group">
                      <div className="stepper-arrows">
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Augmenter de 0,05 €"
                          onClick={() => setPriceValue(String(Math.round((price + 0.05) * 10000) / 10000))}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="stepper-btn"
                          aria-label="Diminuer de 0,05 €"
                          onClick={() => setPriceValue(String(Math.max(0, Math.round((price - 0.05) * 10000) / 10000)))}
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
                  Au prix unitaire saisi de <b>{fmtUnitPrice.format(price)} €</b> : volume et montant requis pour ramener votre prix d’équilibre au niveau du cours marché.
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
          <div className={`market-corridor-division ${isCorridorExpanded ? "expanded" : "collapsed"}`}>
            <div
              className="market-corridor-header"
              onClick={() => setIsCorridorExpanded(v => !v)}
            >
              <div className="market-corridor-header-main">
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
              <button
                type="button"
                className={`market-corridor-toggle ${isCorridorExpanded ? "expanded" : ""}`}
                aria-expanded={isCorridorExpanded}
                aria-controls="market-corridor-content"
                aria-label={isCorridorExpanded ? "Enrouler cette section" : "Dérouler cette section"}
                title={isCorridorExpanded ? "Enrouler" : "Dérouler"}
                onClick={e => {
                  e.stopPropagation();
                  setIsCorridorExpanded(v => !v);
                }}
              >
                <span>{isCorridorExpanded ? "Enrouler" : "Dérouler"}</span>
                <ChevronDown size={16} className="market-corridor-chevron" />
              </button>
            </div>

            {isCorridorExpanded && (
              <div id="market-corridor-content" className="market-corridor-grid">
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
            )}
          </div>

        </section>

        <PriceAlertsSection
          portfolio={portfolio}
          marketPrice={calculations.marketPrice}
          equilibriumPrice={calculations.currentEquilibriumPrice}
          alerts={alerts}
          livePricesByPortfolio={livePricesByPortfolio}
          notifPermission={notifPermission}
          checkingAlerts={checkingAlerts}
          lastCheckedAt={lastCheckedAt}
          unitPriceMoney={unitPriceMoney}
          onRequestNotificationPermission={handleRequestNotificationPermission}
          onSendTestNotification={handleSendTestNotification}
          onCreateAlert={handleCreateAlert}
          onToggleAlert={handleToggleAlert}
          onRearmAlert={handleRearmAlert}
          onDeleteAlert={handleDeleteAlert}
          onCheckNow={() => void checkAllActiveAlerts()}
          onSelectPortfolio={key => {
            if (key in PORTFOLIOS) {
              hasUserManuallySelectedRef.current = true;
              setSelectedKey(key);
            }
          }}
        />

        <section className="table-section" id="historique">
          <div className="section-heading table-heading">
            <div>
              <span className="section-kicker">
                Journal de {portfolio.name}
              </span>
              <h2>Historique des opérations</h2>
            </div>
            <div className="table-heading-actions">
              {currentUser && (
                <span
                  className={`last-saved-badge cloud-badge ${cloudSyncStatus}`}
                  title={
                    lastCloudSyncTime
                      ? `Synchronisé dans le Cloud Google à ${lastCloudSyncTime}`
                      : "Synchronisation Cloud active"
                  }
                >
                  <span className={`save-badge-dot ${cloudSyncStatus === "syncing" ? "syncing" : "cloud"}`} />
                  {cloudSyncStatus === "syncing"
                    ? "Synchro Cloud..."
                    : cloudSyncStatus === "error"
                      ? "Erreur Cloud"
                      : `Cloud en direct${lastCloudSyncTime ? ` · ${lastCloudSyncTime}` : ""}`}
                </span>
              )}
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
            noValidate
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
                    min="0"
                    step="0.05"
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
                    key={`${activeKey}-${row.date}-${originalIndex}`}
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
                    <td className="number">{unitPriceMoney(row.price)}</td>
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

        <section className="bottom-closing-section" id="bilan-cloture">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                <CalendarDays size={13} /> Synthèse de clôture · {portfolio.name}
              </span>
              <h2>Situation à la clôture de la veille</h2>
            </div>
            <span className="row-count">
              {portfolio.shortName}
            </span>
          </div>

          <div className="bottom-closing-grid">
            <div className="bottom-closing-card">
              <span className="bottom-closing-label">Date du jour</span>
              <strong className="bottom-closing-value">
                {formatDateDisplay(getTodayLocalIso())}
              </strong>
              <span className="bottom-closing-sub">
                Situation arrêtée au jour
              </span>
            </div>

            <div className="bottom-closing-card">
              <span className="bottom-closing-label">Volume à ce jour</span>
              <strong className="bottom-closing-value">
                {fmtInt.format(calculations.totalVolume)} <small>parts</small>
              </strong>
              <span className="bottom-closing-sub">
                Stock cumulé détenu
              </span>
            </div>

            <div className="bottom-closing-card">
              <span className="bottom-closing-label">Valeur de clôture (veille)</span>
              <strong className="bottom-closing-value">
                {quoteLoading && !dailyQuoteData
                  ? "…"
                  : money(calculations.prevClosePrice)}
              </strong>
              <span className="bottom-closing-sub">
                Cours de clôture précédent · {portfolio.shortName}
              </span>
            </div>

            <div className="bottom-closing-card highlight-total">
              <span className="bottom-closing-label">Valeur totale (clôture veille)</span>
              <strong className="bottom-closing-value">
                {quoteLoading && !dailyQuoteData
                  ? "…"
                  : money(calculations.prevCloseTotalValue)}
              </strong>
              <span className="bottom-closing-sub">
                {fmtInt.format(calculations.totalVolume)} parts ×{" "}
                {quoteLoading && !dailyQuoteData
                  ? "…"
                  : money(calculations.prevClosePrice)}
              </span>
            </div>

            <div className="bottom-closing-card">
              <span className="bottom-closing-label">
                Plus / moins-value cumulée déjà réalisée
              </span>
              <strong
                className={`bottom-closing-value ${
                  calculations.realizedPl >= 0 ? "positive" : "negative"
                }`}
              >
                {signedMoney(calculations.realizedPl)}
              </strong>
              <span className="bottom-closing-sub">
                {calculations.closedSellCount === 0 && calculations.dividendCount === 0
                  ? "Aucune cession ni dividende réalisé"
                  : `${calculations.closedSellCount} cession${calculations.closedSellCount > 1 ? "s" : ""} · ${calculations.dividendCount} dividende${calculations.dividendCount > 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
        </section>

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
                  <strong>{unitPriceMoney(rows[deleteCandidateIndex].price)}</strong>
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

        {showDeletePortfolioModal && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-portfolio-title"
            onClick={() => setShowDeletePortfolioModal(false)}
          >
            <div
              className="modal-card"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-icon-wrap danger">
                <Trash2 size={24} />
              </div>
              <h3 id="modal-delete-portfolio-title">Supprimer ce titre ?</h3>
              <p className="modal-description">
                Voulez-vous vraiment supprimer le titre <strong>{portfolio.name}</strong> ({portfolio.shortName}) ?
              </p>
              <div className="modal-op-details">
                <div className="modal-op-row">
                  <span>Titre</span>
                  <strong>{portfolio.name}</strong>
                </div>
                <div className="modal-op-row">
                  <span>Mnémonique</span>
                  <strong>{portfolio.shortName}</strong>
                </div>
                {portfolio.externalIsin && (
                  <div className="modal-op-row">
                    <span>Code ISIN</span>
                    <strong>{portfolio.externalIsin}</strong>
                  </div>
                )}
                <div className="modal-op-row">
                  <span>Opérations enregistrées</span>
                  <strong>{rows.length} opérations</strong>
                </div>
              </div>
              <p className="modal-subnote">
                Cette action supprimera toutes les opérations et réglages sauvegardés pour ce titre dans votre navigateur.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setShowDeletePortfolioModal(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="modal-btn-danger"
                  onClick={handleDeletePortfolio}
                >
                  <Trash2 size={15} /> Supprimer définitivement
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

        {triggeredPushToasts.length > 0 && (
          <div className="alert-push-toast-stack" role="region" aria-label="Alertes push déclenchées">
            {triggeredPushToasts.map(toast => (
              <div key={toast.toastId} className="alert-push-toast">
                <div className="alert-push-toast-icon">
                  <BellRing size={18} />
                </div>
                <div className="alert-push-toast-body">
                  <div className="alert-push-toast-top">
                    <strong>
                      {toast.isTest ? "Test push" : "Alerte seuil atteinte"} · {toast.shortName}
                    </strong>
                    <span>{toast.timeLabel}</span>
                  </div>
                  <p>
                    <b>{toast.portfolioName}</b> est à{" "}
                    <b>{unitPriceMoney(toast.livePrice)}</b>{" "}
                    {!toast.isTest && (
                      <>
                        (seuil {toast.direction === "above" ? "≥" : "≤"}{" "}
                        {unitPriceMoney(toast.targetPrice)})
                      </>
                    )}
                  </p>
                  <div className="alert-push-toast-actions">
                    {toast.portfolioKey !== activeKey && (
                      <button
                        type="button"
                        className="alert-toast-link"
                        onClick={() => {
                          if (toast.portfolioKey in PORTFOLIOS) {
                            hasUserManuallySelectedRef.current = true;
                            setSelectedKey(toast.portfolioKey);
                          }
                        }}
                      >
                        Voir {toast.shortName}
                      </button>
                    )}
                    <button
                      type="button"
                      className="alert-toast-dismiss"
                      onClick={() =>
                        setTriggeredPushToasts(prev =>
                          prev.filter(t => t.toastId !== toast.toastId)
                        )
                      }
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
