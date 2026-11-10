import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// 1. Initialisation de l'application Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without passing firebaseConfig.firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configuration du provider Google
googleProvider.setCustomParameters({
  prompt: "select_account",
});

// 2. Gestion standardisée des erreurs Firestore exigée par la spécification
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 3. Validation de connexion requise au démarrage
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Connexion Firestore hors-ligne ou configuration indisponible.");
      return false;
    }
    return true;
  }
}
testConnection();

// 4. Authentification Google (Popup recommandée pour environnement web / iframe)
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Enregistrer ou mettre à jour le profil utilisateur
    if (user) {
      const userRef = doc(db, "users", user.uid);
      await setDoc(
        userRef,
        {
          userId: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return user;
  } catch (error) {
    console.error("Erreur d'authentification Google:", error);
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

// 5. Fonctions de synchronisation Cloud Firestore pour les portefeuilles
export interface CloudPortfolioData {
  id: string;
  userId: string;
  key: string;
  name: string;
  shortName: string;
  ticker: string;
  externalIsin?: string;
  externalMic?: string;
  yahooTicker?: string;
  rows: any[];
  projectionType?: "buy" | "sell";
  projectionVolume?: number;
  projectionPrice?: number;
  updatedAt: string;
  createdAt?: string;
}

export async function syncPortfolioToCloud(
  userId: string,
  portfolioKey: string,
  data: Partial<CloudPortfolioData>
): Promise<void> {
  if (!userId || !portfolioKey) return;
  const path = `users/${userId}/portfolios/${portfolioKey}`;
  const now = new Date().toISOString();

  try {
    const docRef = doc(db, "users", userId, "portfolios", portfolioKey);
    const payload: CloudPortfolioData = {
      id: portfolioKey,
      userId,
      key: portfolioKey,
      name: data.name || portfolioKey,
      shortName: data.shortName || portfolioKey.slice(0, 5).toUpperCase(),
      ticker: data.ticker || `${portfolioKey} · Euronext`,
      externalIsin: data.externalIsin || "",
      externalMic: data.externalMic || "XPAR",
      yahooTicker: data.yahooTicker || "",
      rows: data.rows || [],
      projectionType: data.projectionType || "buy",
      projectionVolume: data.projectionVolume ?? 0,
      projectionPrice: data.projectionPrice ?? 0,
      updatedAt: now,
      createdAt: data.createdAt || now,
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePortfolioFromCloud(
  userId: string,
  portfolioKey: string
): Promise<void> {
  if (!userId || !portfolioKey) return;
  const path = `users/${userId}/portfolios/${portfolioKey}`;
  try {
    const docRef = doc(db, "users", userId, "portfolios", portfolioKey);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeToUserPortfolios(
  userId: string,
  onData: (portfolios: Record<string, CloudPortfolioData>) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const colPath = `users/${userId}/portfolios`;
  const colRef = collection(db, "users", userId, "portfolios");

  return onSnapshot(
    colRef,
    snapshot => {
      const result: Record<string, CloudPortfolioData> = {};
      snapshot.forEach(docSnap => {
        const d = docSnap.data() as CloudPortfolioData;
        if (d && d.key) {
          result[d.key] = d;
        }
      });
      onData(result);
    },
    error => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  );
}

// 6. Synchronisation des réglages / préférences utilisateur (dernier portefeuille sélectionné, sidebar, etc.)
export interface UserPreferences {
  userId: string;
  selectedKey?: string;
  isSidebarCollapsed?: boolean;
  updatedAt: string;
}

export async function syncPreferencesToCloud(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  if (!userId) return;
  const path = `users/${userId}/settings/preferences`;
  try {
    const docRef = doc(db, "users", userId, "settings", "preferences");
    await setDoc(
      docRef,
      {
        userId,
        selectedKey: prefs.selectedKey || "",
        isSidebarCollapsed: Boolean(prefs.isSidebarCollapsed),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeToUserPreferences(
  userId: string,
  onData: (prefs: UserPreferences | null) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const path = `users/${userId}/settings/preferences`;
  const docRef = doc(db, "users", userId, "settings", "preferences");

  return onSnapshot(
    docRef,
    docSnap => {
      if (docSnap.exists()) {
        onData(docSnap.data() as UserPreferences);
      } else {
        onData(null);
      }
    },
    error => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// 7. Fonction pour téléverser / synchroniser tous les titres locaux vers le cloud
export async function uploadAllLocalPortfoliosToCloud(
  userId: string,
  portfolios: Record<string, any>,
  selectedKey: string,
  projectionType: "buy" | "sell",
  volume: number,
  price: number
): Promise<void> {
  if (!userId) return;
  const entries = Object.values(portfolios);
  for (const p of entries) {
    if (!p || !p.key) continue;
    const cleanKey = String(p.key).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const isSelected = cleanKey === selectedKey;
    const storedRows = (() => {
      try {
        const saved = localStorage.getItem(`${p.key}-all-transactions`);
        if (saved) return JSON.parse(saved);
        const added = localStorage.getItem(`${p.key}-added-transactions`);
        if (added) return [...(p.data?.rows || []), ...JSON.parse(added)];
        return p.data?.rows || [];
      } catch {
        return p.data?.rows || [];
      }
    })();

    const pType = isSelected
      ? projectionType
      : ((localStorage.getItem(`${p.key}-projection-type`) as "buy" | "sell") || "buy");
    const pVol = isSelected
      ? volume
      : Number(localStorage.getItem(`${p.key}-projection-volume`) || 1);
    const pPrice = isSelected
      ? price
      : Number(localStorage.getItem(`${p.key}-projection-price`) || p.initialPrice || 10);

    await syncPortfolioToCloud(userId, cleanKey, {
      name: p.name || cleanKey,
      shortName: p.shortName || cleanKey.slice(0, 5).toUpperCase(),
      ticker: p.ticker || `${p.name} · Euronext`,
      externalIsin: p.externalIsin || "",
      externalMic: p.externalMic || "XPAR",
      yahooTicker: p.yahooTicker || "",
      rows: storedRows,
      projectionType: pType,
      projectionVolume: pVol,
      projectionPrice: pPrice,
    });
  }
}
