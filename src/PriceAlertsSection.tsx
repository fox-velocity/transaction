import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export interface PriceAlert {
  id: string;
  userId?: string;
  portfolioKey: string;
  portfolioName: string;
  shortName: string;
  externalIsin?: string;
  externalMic?: string;
  yahooTicker?: string;
  targetPrice: number;
  direction: "above" | "below";
  active: boolean;
  triggered: boolean;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotifPermissionState = "default" | "granted" | "denied" | "unsupported";

interface PriceAlertsSectionProps {
  portfolio: {
    key: string;
    name: string;
    shortName: string;
    externalIsin?: string;
    externalMic?: string;
    yahooTicker?: string;
    initialPrice: number;
    initialCurrentPrice: number;
  };
  marketPrice: number;
  equilibriumPrice: number;
  alerts: PriceAlert[];
  livePricesByPortfolio: Record<string, number>;
  notifPermission: NotifPermissionState;
  checkingAlerts: boolean;
  lastCheckedAt: string | null;
  unitPriceMoney: (value: number) => string;
  onRequestNotificationPermission: () => Promise<void>;
  onSendTestNotification: () => Promise<void>;
  onCreateAlert: (input: {
    targetPrice: number;
    direction: "above" | "below";
    note: string;
  }) => void;
  onToggleAlert: (alertId: string) => void;
  onRearmAlert: (alertId: string) => void;
  onDeleteAlert: (alertId: string) => void;
  onCheckNow: () => void;
  onSelectPortfolio: (portfolioKey: string) => void;
}

function parseAlertNumber(value: string): number {
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTriggerTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PriceAlertsSection: React.FC<PriceAlertsSectionProps> = ({
  portfolio,
  marketPrice,
  equilibriumPrice,
  alerts,
  livePricesByPortfolio,
  notifPermission,
  checkingAlerts,
  lastCheckedAt,
  unitPriceMoney,
  onRequestNotificationPermission,
  onSendTestNotification,
  onCreateAlert,
  onToggleAlert,
  onRearmAlert,
  onDeleteAlert,
  onCheckNow,
  onSelectPortfolio,
}) => {
  const basePrice =
    marketPrice > 0
      ? marketPrice
      : portfolio.initialCurrentPrice || portfolio.initialPrice || 10;

  const [thresholdInput, setThresholdInput] = useState<string>(() =>
    String(Math.round(basePrice * 1.05 * 100) / 100)
  );
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [noteInput, setNoteInput] = useState("");
  const [formError, setFormError] = useState("");
  const [filterScope, setFilterScope] = useState<"current" | "all">("current");

  // Réinitialiser le seuil proposé quand on change de titre sélectionné
  useEffect(() => {
    const ref =
      marketPrice > 0
        ? marketPrice
        : portfolio.initialCurrentPrice || portfolio.initialPrice || 10;
    const suggested = Math.round(ref * 1.05 * 100) / 100;
    setThresholdInput(String(suggested));
    setDirection("above");
    setFormError("");
  }, [portfolio.key]);

  const currentTitleAlerts = useMemo(
    () => alerts.filter(a => a.portfolioKey === portfolio.key),
    [alerts, portfolio.key]
  );

  const displayedAlerts =
    filterScope === "current" ? currentTitleAlerts : alerts;

  const activeCount = useMemo(
    () => alerts.filter(a => a.active && !a.triggered).length,
    [alerts]
  );

  const applyPreset = (target: number, suggestedDir?: "above" | "below") => {
    if (!Number.isFinite(target) || target <= 0) return;
    const rounded = Math.round(target * 10000) / 10000;
    setThresholdInput(String(rounded));
    if (suggestedDir) {
      setDirection(suggestedDir);
    } else {
      setDirection(rounded >= basePrice ? "above" : "below");
    }
    setFormError("");
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    const parsed = parseAlertNumber(thresholdInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError("Veuillez saisir un prix seuil strictement positif.");
      return;
    }
    const roundedPrice = Math.round(parsed * 10000) / 10000;
    onCreateAlert({
      targetPrice: roundedPrice,
      direction,
      note: noteInput.trim(),
    });
    setNoteInput("");
  };

  return (
    <section className="alerts-section" id="alertes">
      <div className="alerts-header">
        <div className="alerts-title-group">
          <div className="alerts-icon-wrap">
            <BellRing size={19} />
          </div>
          <div>
            <span className="section-kicker">
              Surveillance seuil · {portfolio.shortName}
            </span>
            <h2>Alertes de prix par notification push</h2>
          </div>
        </div>

        <div className="alerts-header-controls">
          {notifPermission === "granted" ? (
            <div className="alerts-push-status-group">
              <span className="alerts-push-badge granted">
                <Check size={12} strokeWidth={2.8} /> Push navigateur actif
              </span>
              <button
                type="button"
                className="alerts-secondary-btn"
                onClick={() => void onSendTestNotification()}
                title="Envoyer une notification push de test"
              >
                <Send size={13} /> Tester
              </button>
            </div>
          ) : notifPermission === "default" ? (
            <button
              type="button"
              className="alerts-enable-push-btn"
              onClick={() => void onRequestNotificationPermission()}
            >
              <Bell size={14} /> Activer les notifications push
            </button>
          ) : notifPermission === "denied" ? (
            <span
              className="alerts-push-badge denied"
              title="Autorisez les notifications dans les réglages du navigateur pour recevoir des alertes OS. Les alertes visuelles dans l’application restent actives."
            >
              <BellOff size={12} /> Push navigateur bloqué (bannière active)
            </span>
          ) : (
            <span className="alerts-push-badge denied">
              <Bell size={12} /> Alertes visuelles dans l’app
            </span>
          )}

          <button
            type="button"
            className="alerts-secondary-btn"
            onClick={onCheckNow}
            disabled={checkingAlerts || activeCount === 0}
            title={
              activeCount === 0
                ? "Aucune alerte active à vérifier"
                : "Vérifier immédiatement tous les titres ayant une alerte active"
            }
          >
            <RefreshCw size={13} className={checkingAlerts ? "spin" : ""} />
            <span>
              {checkingAlerts
                ? "Vérification..."
                : `Vérifier (${activeCount})`}
            </span>
          </button>
        </div>
      </div>

      <form
        className="alerts-create-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="alerts-create-top">
          <div className="alerts-selected-info">
            <span className="alerts-target-title">
              Nouvelle alerte pour <strong>{portfolio.name}</strong> ({portfolio.shortName})
            </span>
            <span className="alerts-live-ref">
              Cours actuel : <b>{marketPrice > 0 ? unitPriceMoney(marketPrice) : "—"}</b>
              {lastCheckedAt ? ` · Dernier contrôle ${lastCheckedAt}` : ""}
            </span>
          </div>
          <div className="alerts-presets">
            <button
              type="button"
              className="alerts-preset-btn"
              onClick={() => applyPreset(basePrice * 0.95, "below")}
            >
              −5 % ({unitPriceMoney(basePrice * 0.95)})
            </button>
            <button
              type="button"
              className="alerts-preset-btn"
              onClick={() => applyPreset(basePrice, "above")}
            >
              Cours ({unitPriceMoney(basePrice)})
            </button>
            <button
              type="button"
              className="alerts-preset-btn"
              onClick={() => applyPreset(basePrice * 1.05, "above")}
            >
              +5 % ({unitPriceMoney(basePrice * 1.05)})
            </button>
            {equilibriumPrice > 0 && (
              <button
                type="button"
                className="alerts-preset-btn"
                onClick={() =>
                  applyPreset(
                    equilibriumPrice,
                    equilibriumPrice >= basePrice ? "above" : "below"
                  )
                }
              >
                Équilibre ({unitPriceMoney(equilibriumPrice)})
              </button>
            )}
          </div>
        </div>

        <div className="alerts-form-fields">
          <label>
            <span>Condition</span>
            <select
              value={direction}
              onChange={e =>
                setDirection(e.target.value as "above" | "below")
              }
            >
              <option value="above">Hausse : cours ≥ seuil</option>
              <option value="below">Baisse : cours ≤ seuil</option>
            </select>
          </label>

          <label>
            <span>Prix seuil</span>
            <div className="field-suffix">
              <input
                type="number"
                min="0"
                step="0.05"
                value={thresholdInput}
                onChange={e => {
                  setThresholdInput(e.target.value);
                  setFormError("");
                }}
                aria-label="Prix seuil de l'alerte"
              />
              <em>€</em>
            </div>
          </label>

          <label>
            <span>Note (optionnel)</span>
            <input
              type="text"
              maxLength={120}
              placeholder="Ex. : Sécuriser +10 % ou Renforcer"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
            />
          </label>

          <button type="submit" className="alerts-submit-btn">
            <Plus size={15} /> Créer l’alerte
          </button>
        </div>

        {formError && <p className="alerts-form-error">{formError}</p>}
      </form>

      <div className="alerts-list-header">
        <div className="alerts-filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filterScope === "current"}
            className={`alerts-filter-tab ${filterScope === "current" ? "active" : ""}`}
            onClick={() => setFilterScope("current")}
          >
            {portfolio.shortName} ({currentTitleAlerts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterScope === "all"}
            className={`alerts-filter-tab ${filterScope === "all" ? "active" : ""}`}
            onClick={() => setFilterScope("all")}
          >
            Toutes les alertes ({alerts.length})
          </button>
        </div>

        <span className="alerts-poll-caption">
          Contrôle automatique toutes les 60 s et à chaque actualisation du cours
        </span>
      </div>

      {displayedAlerts.length === 0 ? (
        <div className="alerts-empty-state">
          <Bell size={20} />
          <p>
            {filterScope === "current"
              ? `Aucune alerte définie pour ${portfolio.name}. Saisissez un prix seuil ci-dessus pour être notifié dès qu’il est atteint.`
              : "Aucune alerte configurée pour le moment."}
          </p>
        </div>
      ) : (
        <div className="alerts-grid">
          {displayedAlerts.map(alert => {
            const refPrice =
              alert.portfolioKey === portfolio.key && marketPrice > 0
                ? marketPrice
                : livePricesByPortfolio[alert.portfolioKey];
            const diffPct =
              refPrice && refPrice > 0
                ? ((alert.targetPrice - refPrice) / refPrice) * 100
                : null;

            return (
              <div
                key={alert.id}
                className={`alert-card ${
                  alert.triggered
                    ? "is-triggered"
                    : alert.active
                      ? "is-active"
                      : "is-paused"
                }`}
              >
                <div className="alert-card-top">
                  <button
                    type="button"
                    className="alert-title-link"
                    onClick={() => onSelectPortfolio(alert.portfolioKey)}
                    title={`Afficher ${alert.portfolioName}`}
                  >
                    <span className="alert-symbol-tag">{alert.shortName}</span>
                    <span className="alert-name">{alert.portfolioName}</span>
                  </button>

                  <span
                    className={`alert-status-label ${
                      alert.triggered
                        ? "triggered"
                        : alert.active
                          ? "active"
                          : "paused"
                    }`}
                  >
                    {alert.triggered
                      ? "Déclenchée"
                      : alert.active
                        ? "Active"
                        : "En pause"}
                  </span>
                </div>

                <div className="alert-card-main">
                  <div className="alert-condition-row">
                    <span
                      className={`alert-dir-badge ${
                        alert.direction === "above" ? "above" : "below"
                      }`}
                    >
                      {alert.direction === "above" ? (
                        <>
                          <TrendingUp size={13} /> Cours ≥
                        </>
                      ) : (
                        <>
                          <TrendingDown size={13} /> Cours ≤
                        </>
                      )}
                    </span>
                    <strong className="alert-target-price">
                      {unitPriceMoney(alert.targetPrice)}
                    </strong>
                  </div>

                  {refPrice !== undefined && refPrice > 0 && (
                    <div className="alert-ref-row">
                      <span>Cours suivi : {unitPriceMoney(refPrice)}</span>
                      {diffPct !== null && !alert.triggered && (
                        <span>
                          Écart : {diffPct >= 0 ? "+" : ""}
                          {diffPct.toFixed(2)} %
                        </span>
                      )}
                    </div>
                  )}

                  {alert.note && (
                    <p className="alert-note-text">{alert.note}</p>
                  )}

                  {alert.triggered && (
                    <p className="alert-triggered-meta">
                      Atteint{" "}
                      {alert.triggeredPrice !== null
                        ? `à ${unitPriceMoney(alert.triggeredPrice)} `
                        : ""}
                      le {formatTriggerTime(alert.triggeredAt)}
                    </p>
                  )}
                </div>

                <div className="alert-card-actions">
                  {alert.triggered ? (
                    <button
                      type="button"
                      className="alert-action-btn rearm"
                      onClick={() => onRearmAlert(alert.id)}
                      title="Réactiver cette alerte"
                    >
                      <RotateCcw size={13} /> Réarmer
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="alert-action-btn"
                      onClick={() => onToggleAlert(alert.id)}
                      title={alert.active ? "Mettre en pause" : "Activer"}
                    >
                      {alert.active ? (
                        <>
                          <Pause size={13} /> Pause
                        </>
                      ) : (
                        <>
                          <Play size={13} /> Activer
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="alert-action-btn danger"
                    onClick={() => onDeleteAlert(alert.id)}
                    title="Supprimer cette alerte"
                    aria-label={`Supprimer l'alerte ${alert.shortName}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
