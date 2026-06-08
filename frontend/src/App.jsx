import { useState, useRef, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

const WEBHOOK_URL      = "https://n8n.dlzteam.com/webhook/process-cv"
const WEBHOOK_FAIR_URL = "https://n8n.dlzteam.com/webhook/4f470f6b-2ab0-4480-8079-8572d0f4bb7f"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─── Labels lisibles pour les features ─────────────────────────────────────
const FEATURE_LABELS = {
  education_score:         "Prestige de l'école",
  total_experience_years:  "Années d'expérience",
  skills_count:            "Nombre de compétences",
  certif_count:            "Certifications",
  has_certif:              "A des certifications",
  lang_fr:                 "Niveau de français",
  lang_en:                 "Niveau d'anglais",
  lang_other_score_sum:    "Autres langues",
  gap_ratio:               "Ratio de gaps d'emploi",
  nb_gaps:                 "Nombre de gaps",
  avg_gap_duration:        "Durée moy. des gaps",
  total_gap_months:        "Gaps totaux (mois)",
  years_since_graduation:  "Années depuis le diplôme",
  graduation_year:         "Année de diplôme",
}

const FEATURE_CATEGORIES = {
  "Formation":    ["education_score", "graduation_year", "years_since_graduation", "has_certif", "certif_count"],
  "Expérience":   ["total_experience_years", "avg_gap_duration", "gap_ratio", "nb_gaps", "total_gap_months"],
  "Compétences":  ["skills_count", "skills"],
  "Langues":      ["lang_fr", "lang_en", "lang_other_score_sum"],
}

function getLabel(feature) {
  return FEATURE_LABELS[feature] || feature.replace(/_/g, " ")
}

function getCategory(feature) {
  for (const [cat, features] of Object.entries(FEATURE_CATEGORIES)) {
    if (features.some(f => feature === f || feature.startsWith(f))) return cat
  }
  return "Autre"
}

function getImpactLabel(magnitude) {
  if (magnitude > 0.5) return { label: "Décisif", dots: "●●●" }
  if (magnitude > 0.2) return { label: "Fort",    dots: "●●" }
  if (magnitude > 0.05) return { label: "Modéré", dots: "●" }
  return { label: "Faible", dots: "·" }
}

function generateSummary(explanations, decision) {
  if (!explanations?.length) return null
  const isSelected = decision?.includes("Sélectionné") || decision === "Inviter"
  const sorted = [...explanations].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  const top2pos = sorted.filter(e => e.direction === "favorable").slice(0, 2).map(e => getLabel(e.feature))
  const top2neg = sorted.filter(e => e.direction === "défavorable").slice(0, 2).map(e => getLabel(e.feature))

  if (isSelected) {
    return top2pos.length
      ? `Ce candidat est retenu, notamment grâce à : ${top2pos.join(" et ")}.${top2neg.length ? ` Point(s) de vigilance : ${top2neg.join(", ")}.` : ""}`
      : "Ce candidat est retenu par le modèle équitable."
  } else {
    return top2neg.length
      ? `Ce candidat n'est pas retenu. Principaux freins : ${top2neg.join(" et ")}.${top2pos.length ? ` Points positifs : ${top2pos.join(", ")}.` : ""}`
      : "Ce candidat n'est pas retenu par le modèle équitable."
  }
}

// ─── Jauge seuil de décision ────────────────────────────────────────────────
function ThresholdGauge({ probability, threshold }) {
  const probPct  = +(probability * 100).toFixed(1)
  const threshPct = +(threshold  * 100).toFixed(1)
  const isSelected = probability >= threshold
  const diff = (probPct - threshPct).toFixed(1)

  return (
    <div className="tg-wrap">
      <div className="tg-header">
        <span className="tg-label">Position par rapport au seuil de décision</span>
        <span className={`tg-diff ${isSelected ? "val-pos" : "val-neg"}`}>
          {diff > 0 ? "+" : ""}{diff}% vs seuil
        </span>
      </div>
      <div className="tg-bar-outer">
        <div
          className={`tg-fill ${isSelected ? "tg-fill-pos" : "tg-fill-neg"}`}
          style={{ width: `${probPct}%` }}
        />
        <div className="tg-threshold-line" style={{ left: `${threshPct}%` }}>
          <div className="tg-threshold-tick" />
          <div className="tg-threshold-label">Seuil<br />{threshPct}%</div>
        </div>
      </div>
      <div className="tg-sub">
        Score candidat : <strong>{probPct}%</strong>
      </div>
    </div>
  )
}

// ─── Barres de contribution groupées par catégorie ──────────────────────────
function CategorizedBars({ explanations }) {
  const [mathMode, setMathMode] = useState(false)
  if (!explanations?.length) return null
  const maxAbs = Math.max(...explanations.map(e => Math.abs(e.contribution)))

  const grouped = {}
  for (const e of explanations) {
    const cat = getCategory(e.feature)
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(e)
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <button className="toggle-mode-btn" onClick={() => setMathMode(m => !m)}>
          {mathMode ? "Version intuitive" : "Voir les scores"}
        </button>
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="cat-group">
          <div className="cat-label">{cat}</div>
          {items.map((e, i) => {
            const pct = maxAbs > 0 ? (Math.abs(e.contribution) / maxAbs) * 100 : 0
            const pos = e.direction === "favorable"
            const impact = getImpactLabel(Math.abs(e.contribution))
            return (
              <div key={i} className="expl-row">
                <div className="expl-name" title={e.feature}>{getLabel(e.feature)}</div>
                <div className="expl-bar-wrap">
                  <div className={`expl-bar ${pos ? "bar-pos" : "bar-neg"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className={`impact-label ${pos ? "val-pos" : "val-neg"}`}>
                  {mathMode
                    ? `${e.contribution > 0 ? "+" : ""}${e.contribution.toFixed(3)}`
                    : <>{impact.dots} <span style={{ fontSize: "10px", opacity: 0.85 }}>{impact.label}</span></>
                  }
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Panel de résultats standard ───────────────────────────────────────────
function ResultPanel({ result, filename }) {
  const isInvite = result?.decision === "Inviter"
  return (
    <div>
      <div className="result-filename">{filename}</div>
      <div className="result-name">{result.name}</div>
      <div className={`decision-pill ${isInvite ? "invite" : "reject"}`}>
        <div className="dot" />
        {result.decision}
      </div>
      <div className="grid-info">
        <div className="info-card">
          <div className="info-label">Âge</div>
          <div className="info-value">{result.age} ans</div>
        </div>
        <div className="info-card">
          <div className="info-label">Expérience</div>
          <div className="info-value">{result.total_experience_years} ans</div>
        </div>
        <div className="info-card">
          <div className="info-label">Poste visé</div>
          <div className="info-value" style={{ fontSize: "14px", paddingTop: "2px" }}>{result.target_role}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Diplôme</div>
          <div className="info-value" style={{ fontSize: "14px", paddingTop: "2px" }}>{result.education?.degree}</div>
        </div>
      </div>
      <div className="section-label">Compétences</div>
      <div className="tags">
        {result.skills?.slice(0, 10).map((s, i) => <span key={i} className="tag">{s}</span>)}
      </div>
      <div className="section-label">Langues</div>
      <div className="tags">
        {result.languages?.map((l, i) => <span key={i} className="tag">{l.language} — {l.level}</span>)}
      </div>
      <div className="divider" />
      <details>
        <summary>Voir le JSON complet</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}

// ─── Panel de résultats FAIR avec explications ─────────────────────────────
function FairResultPanel({ result, filename }) {
  const isInvite = result?.decision?.includes("Sélectionné") || result?.decision === "Inviter"
  const summary  = generateSummary(result.explanations, result.decision)

  return (
    <div>
      <div className="result-filename">{filename}</div>
      <div className="result-name">{result.name}</div>

      <div className={`decision-pill ${isInvite ? "invite" : "reject"}`}>
        <div className="dot" />
        {result.decision}
      </div>

      {/* Résumé textuel auto-généré */}
      {summary && (
        <div className={`summary-block ${isInvite ? "summary-pos" : "summary-neg"}`}>
          {summary}
        </div>
      )}

      <div className="divider" />

      {/* Jauge seuil de décision */}
      {result.probability != null && result.threshold_used != null && (
        <>
          <ThresholdGauge probability={result.probability} threshold={result.threshold_used} />
          <div className="divider" />
        </>
      )}

      {/* Métriques candidat */}
      <div className="grid-info">
        <div className="info-card">
          <div className="info-label">Âge</div>
          <div className="info-value">{result.age} ans</div>
        </div>
        <div className="info-card">
          <div className="info-label">Expérience</div>
          <div className="info-value">{result.total_experience_years} ans</div>
        </div>
        <div className="info-card">
          <div className="info-label">Poste visé</div>
          <div className="info-value" style={{ fontSize: "14px", paddingTop: "2px" }}>{result.target_role}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Diplôme</div>
          <div className="info-value" style={{ fontSize: "14px", paddingTop: "2px" }}>{result.education?.degree}</div>
        </div>
        {result.log_odds != null && (
          <div className="info-card">
            <div className="info-label">Score log-odds</div>
            <div className="info-value" style={{ fontSize: "18px" }}>
              <span className={result.log_odds >= 0 ? "val-pos" : "val-neg"}>
                {result.log_odds > 0 ? "+" : ""}{result.log_odds.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="section-label">Compétences</div>
      <div className="tags">
        {result.skills?.slice(0, 10).map((s, i) => <span key={i} className="tag">{s}</span>)}
      </div>

      <div className="section-label">Langues</div>
      <div className="tags">
        {result.languages?.map((l, i) => <span key={i} className="tag">{l.language} — {l.level}</span>)}
      </div>

      {/* Explications catégorisées */}
      {result.explanations?.length > 0 && (
        <>
          <div className="divider" />
          <div className="fair-explain-header">
            <div className="fair-explain-title">Pourquoi cette décision ?</div>
            <div className="fair-explain-sub">
              Contributions par critère — <span className="val-pos">vert = favorise</span> · <span className="val-neg">rouge = défavorise</span>
            </div>
          </div>
          <CategorizedBars explanations={result.explanations} />
          <div className="fair-note">
            Modèle équitable : âge, distance et langues d'origine exclus. Décision basée uniquement sur les compétences, l'expérience et la formation.
          </div>
        </>
      )}

      <div className="divider" />
      <details>
        <summary>Voir le JSON complet</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}

// ─── Splash screen ─────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="splash-overlay">
      <div className="splash-bg" />
      <div className="splash-glow" />
      <div className="splash-content">
        <div className="splash-logo">CV<span>ision</span></div>
        <div className="splash-line-wrap"><div className="splash-line" /></div>
        <div className="splash-sub">Screening IA · Recrutement intelligent</div>
      </div>
    </div>
  )
}

// ─── Détail features historique avec toggle ────────────────────────────────
function HistoryFeatureDetail({ features, title }) {
  const [mathMode, setMathMode] = useState(false)
  return (
    <div className="history-features">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div className="history-features-title">{title || "Top contributions (modèle FAIR)"}</div>
        <button className="toggle-mode-btn" onClick={() => setMathMode(m => !m)}>
          {mathMode ? "Version intuitive" : "Voir les scores"}
        </button>
      </div>
      {features.map((f, i) => {
        const impact = getImpactLabel(Math.abs(f.contribution))
        return (
          <div key={i} className="hf-row">
            <span className="hf-name">{getLabel(f.feature)}</span>
            <span className={`hf-val ${f.direction === "favorable" ? "val-pos" : "val-neg"}`}>
              {mathMode
                ? `${f.contribution > 0 ? "+" : ""}${f.contribution.toFixed(3)}`
                : `${impact.dots} ${impact.label}`
              }
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Modal comparaison ─────────────────────────────────────────────────────
function CompareModal({ rows, onClose }) {
  const [a, b] = rows
  const [mathMode, setMathMode] = useState(false)
  const scoreDiff = ((a.score - b.score) * 100).toFixed(1)
  const winner = a.score > b.score ? a.filename : b.filename

  function CardSide({ row }) {
    const isSelected = row.decision?.includes("Sélectionné") || row.decision === "Inviter"
    const date = new Date(row.created_at)
    const dateStr = date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })
    const timeStr = date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
    return (
      <div className={`compare-card ${isSelected ? "compare-selected" : "compare-rejected"}`}>
        <div className="compare-filename">{row.filename}</div>
        <div className="compare-date">{dateStr} à {timeStr}</div>
        <div className="compare-badges">
          <span className={`model-badge ${row.model === "fair" ? "badge-fair" : "badge-std"}`}>
            {row.model === "fair" ? "FAIR" : "Standard"}
          </span>
          <span className={`decision-pill-sm ${isSelected ? "invite" : "reject"}`}>
            <span className="dot" />
            {isSelected ? "Sélectionné" : "Refusé"}
          </span>
        </div>
        <div className="compare-score-block">
          <div className="compare-score-label">Score de confiance</div>
          <div className={`compare-score-val ${isSelected ? "val-pos" : "val-neg"}`}>
            {(row.score * 100).toFixed(1)}%
          </div>
          <div className="compare-bar-wrap">
            <div
              className={`compare-bar-fill ${isSelected ? "bar-pos" : "bar-neg"}`}
              style={{ width: `${Math.min(row.score * 100, 100).toFixed(1)}%` }}
            />
            <div
              className="compare-threshold-mark"
              style={{ left: `${Math.min(row.threshold * 100, 100).toFixed(1)}%` }}
            />
          </div>
          <div className="compare-threshold-label">Seuil de décision : {(row.threshold * 100).toFixed(1)}%</div>
        </div>
        {row.top_features?.length > 0 && (
          <div className="compare-features">
            <div className="history-features-title">Top contributions</div>
            {row.top_features.map((f, i) => {
              const impact = getImpactLabel(Math.abs(f.contribution))
              return (
                <div key={i} className="hf-row">
                  <span className="hf-name">{getLabel(f.feature)}</span>
                  <span className={`hf-val ${f.direction === "favorable" ? "val-pos" : "val-neg"}`}>
                    {mathMode
                      ? `${f.contribution > 0 ? "+" : ""}${f.contribution.toFixed(3)}`
                      : `${impact.dots} ${impact.label}`
                    }
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Comparaison de candidats</div>
            <div className="modal-sub">Cliquez en dehors pour fermer</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button className="toggle-mode-btn" onClick={() => setMathMode(m => !m)}>
              {mathMode ? "Version intuitive" : "Voir les scores"}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-grid">
          <CardSide row={a} />
          <CardSide row={b} />
          <div className="compare-diff-banner">
            <span>Écart de score :</span>
            <span className={`compare-diff-val ${Math.abs(parseFloat(scoreDiff)) > 0 ? (parseFloat(scoreDiff) > 0 ? "val-pos" : "val-neg") : ""}`}>
              {scoreDiff > 0 ? "+" : ""}{scoreDiff}%
            </span>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#a09890" }}>
              Meilleur score : <strong style={{ color: "#1a1a1a" }}>{winner}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dropzone réutilisable (style Aceternity) ──────────────────────────────
function Dropzone({ onFile, loading, filename, eyebrow, headline, headlineEm, desc }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    onFile(e.dataTransfer.files[0])
  }

  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="headline">{headline}<br /><em>{headlineEm}</em></h1>
      <p className="desc">{desc}</p>

      <div
        className={`dz-ace ${dragging ? "dz-ace-drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".txt" style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])} />
        <div className="dz-grid-bg" />
        <div className="dz-inner">
          {loading ? (
            <>
              <div className="dz-spin" />
              <div className="dz-label-title">Analyse en cours…</div>
              <div className="dz-label-sub">{filename}</div>
            </>
          ) : filename ? (
            <>
              <div className="dz-file-display">
                <div className="dz-file-card">
                  <span style={{ fontSize: "22px" }}>📄</span>
                  <div>
                    <div className="dz-file-name">{filename}</div>
                    <div className="dz-file-ok">Fichier prêt · cliquez pour changer</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`dz-float-wrap ${dragging ? "dz-floating-drag" : ""}`}>
                <div className="dz-card-back" />
                <div className="dz-card-front">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                    stroke="#8b6f47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
              </div>
              <div className="dz-label-title">Déposez votre CV ici</div>
              <div className="dz-label-sub">Glissez-déposez ou cliquez · Format .txt uniquement</div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── App principale ─────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [showSplash, setShowSplash] = useState(true)

  // État onglet Standard
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [filename, setFilename] = useState(null)

  // État onglet Fair
  const [loadingFair, setLoadingFair]   = useState(false)
  const [resultFair, setResultFair]     = useState(null)
  const [errorFair, setErrorFair]       = useState(null)
  const [filenameFair, setFilenameFair] = useState(null)

  // État onglet Historique
  const [history, setHistory]           = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedRow, setExpandedRow]   = useState(null)
  const [selectedRows, setSelectedRows] = useState([])
  const [showCompare, setShowCompare]   = useState(false)
  const [filterModel, setFilterModel]   = useState("all")
  const [filterDecision, setFilterDecision] = useState("all")
  const [searchQuery, setSearchQuery]   = useState("")

  function toggleSelect(row) {
    setSelectedRows(prev => {
      if (prev.find(r => r.id === row.id)) return prev.filter(r => r.id !== row.id)
      if (prev.length >= 2) return [prev[1], row]
      return [...prev, row]
    })
  }

  async function fetchHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from("cv_decisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
    setHistory(data || [])
    setHistoryLoading(false)
  }

  useEffect(() => { if (activeTab === 2) fetchHistory() }, [activeTab])

  async function sendFile(file) {
    if (!file || !file.name.endsWith(".txt")) { setError("Veuillez envoyer un fichier .txt"); return }
    setFilename(file.name); setLoading(true); setResult(null); setError(null)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const response = await fetch(WEBHOOK_URL, { method: "POST", body: formData })
      setResult(await response.json())
    } catch { setError("Erreur lors de l'envoi du fichier.") }
    finally { setLoading(false) }
  }

  async function sendFileFair(file) {
    if (!file || !file.name.endsWith(".txt")) { setErrorFair("Veuillez envoyer un fichier .txt"); return }
    setFilenameFair(file.name); setLoadingFair(true); setResultFair(null); setErrorFair(null)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const response = await fetch(WEBHOOK_FAIR_URL, { method: "POST", body: formData })
      setResultFair(await response.json())
    } catch { setErrorFair("Erreur lors de l'envoi du fichier.") }
    finally { setLoadingFair(false) }
  }

  const totalSelected = history.filter(r => r.decision?.includes("Sélectionné") || r.decision === "Inviter").length
  const totalFair     = history.filter(r => r.model === "fair").length
  const selectRate    = history.length > 0 ? Math.round(totalSelected / history.length * 100) : 0
  const filteredHistory = history.filter(row => {
    const sel = row.decision?.includes("Sélectionné") || row.decision === "Inviter"
    if (filterModel !== "all" && row.model !== filterModel) return false
    if (filterDecision === "selected" && !sel) return false
    if (filterDecision === "rejected" && sel) return false
    if (searchQuery && !row.filename?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #f5f3ef;
          color: #1a1a1a;
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
        }

        .page {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto auto 1fr;
        }

        .header {
          padding: 28px 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2ddd8;
          background: #faf9f7;
        }

        .logo {
          font-family: 'DM Serif Display', serif;
          font-size: 24px;
          color: #1a1a1a;
          letter-spacing: -0.5px;
        }

        .logo span { color: #8b6f47; }

        .badge {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8b6f47;
          border: 1px solid #d4c4b0;
          padding: 6px 16px;
          border-radius: 100px;
          background: #fdf9f4;
        }

        /* ── Onglets ── */
        .tabs {
          display: flex;
          background: #faf9f7;
          border-bottom: 1px solid #e2ddd8;
          padding: 0 56px;
          gap: 0;
        }

        .tab-btn {
          padding: 16px 28px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.3px;
          color: #a09890;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tab-btn:hover { color: #6b6560; }

        .tab-btn.active {
          color: #1a1a1a;
          border-bottom-color: #8b6f47;
        }

        .tab-pip {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.5;
        }

        .tab-btn.active .tab-pip {
          background: #8b6f47;
          opacity: 1;
        }

        .tab-fair-tag {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 100px;
          background: #edf7f0;
          color: #2d7a4f;
          border: 1px solid #c3e6d0;
        }

        /* ── Layout ── */
        .main {
          display: grid;
          grid-template-columns: 480px 1fr;
        }

        .left {
          padding: 72px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: #faf9f7;
          border-right: 1px solid #e2ddd8;
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #8b6f47;
          font-weight: 500;
          margin-bottom: 20px;
        }

        .headline {
          font-family: 'DM Serif Display', serif;
          font-size: 48px;
          line-height: 1.1;
          letter-spacing: -1px;
          color: #1a1a1a;
          margin-bottom: 20px;
        }

        .headline em {
          font-style: italic;
          color: #8b6f47;
        }

        .desc {
          font-size: 15px;
          font-weight: 300;
          line-height: 1.8;
          color: #6b6560;
          margin-bottom: 48px;
        }

        /* ── Dropzone Aceternity-style ── */
        .dz-ace {
          position: relative;
          border-radius: 16px;
          border: 1.5px solid #e2ddd8;
          background: #fff;
          padding: 52px 32px;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .dz-ace:hover {
          border-color: #8b6f47;
          box-shadow: 0 0 0 4px rgba(139,111,71,0.06), 0 8px 32px rgba(139,111,71,0.07);
        }
        .dz-ace-drag {
          border-color: #8b6f47 !important;
          border-style: dashed;
          background: #fdf9f4;
          box-shadow: 0 0 0 5px rgba(139,111,71,0.09) !important;
        }
        .dz-grid-bg {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, #cec0b0 1px, transparent 1px);
          background-size: 22px 22px;
          mask-image: radial-gradient(ellipse 85% 85% at center, white 15%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 85% 85% at center, white 15%, transparent 100%);
          opacity: 0.55;
          pointer-events: none;
        }
        .dz-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          text-align: center;
        }
        .dz-float-wrap {
          position: relative;
          width: 76px; height: 88px;
          margin-bottom: 6px;
          animation: dzFloat 3.5s ease-in-out infinite;
        }
        .dz-floating-drag { animation: dzBounce 0.4s ease-in-out infinite alternate !important; }
        .dz-card-front {
          position: absolute;
          inset: 0;
          background: linear-gradient(145deg, #fff, #fdf9f4);
          border: 1.5px solid #e2ddd8;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 20px rgba(0,0,0,0.07);
          z-index: 2;
          transition: box-shadow 0.3s ease;
        }
        .dz-ace:hover .dz-card-front {
          box-shadow: 0 10px 32px rgba(139,111,71,0.12);
        }
        .dz-card-back {
          position: absolute;
          top: 8px; left: -8px; right: -8px; bottom: -8px;
          background: #fdf3e8;
          border: 1.5px solid #e8d5bf;
          border-radius: 12px;
          z-index: 1;
        }
        @keyframes dzFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          33%  { transform: translateY(-10px) rotate(1.5deg); }
          66%  { transform: translateY(-5px) rotate(-1deg); }
        }
        @keyframes dzBounce {
          from { transform: translateY(0) rotate(0deg); }
          to   { transform: translateY(-16px) rotate(2deg); }
        }
        .dz-label-title {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          color: #1a1a1a;
        }
        .dz-label-sub {
          font-size: 12px;
          color: #a09890;
          font-weight: 300;
          max-width: 260px;
          line-height: 1.6;
        }
        .dz-spin {
          width: 36px; height: 36px;
          border: 2px solid #e2ddd8;
          border-top-color: #8b6f47;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 2px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dz-file-display { animation: fileIn 0.45s cubic-bezier(0.16,1,0.3,1); }
        @keyframes fileIn {
          from { opacity: 0; transform: scale(0.88) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .dz-file-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #faf9f7;
          border: 1px solid #e2ddd8;
          border-radius: 12px;
          padding: 14px 20px;
        }
        .dz-file-name { font-size: 14px; font-weight: 500; color: #1a1a1a; text-align: left; }
        .dz-file-ok { font-size: 11px; color: #2d7a4f; font-weight: 500; margin-top: 2px; }

        .error-msg {
          margin-top: 14px;
          padding: 12px 16px;
          background: #fdf0f0;
          border: 1px solid #f0d0d0;
          border-radius: 10px;
          font-size: 13px;
          color: #c0392b;
        }

        .right {
          padding: 72px 64px;
          overflow-y: auto;
          background: #f5f3ef;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 14px;
          opacity: 0.3;
          text-align: center;
        }

        .empty-icon { font-size: 56px; }

        .empty-text {
          font-family: 'DM Serif Display', serif;
          font-size: 20px;
          color: #1a1a1a;
        }

        .result-filename {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          margin-bottom: 8px;
        }

        .result-name {
          font-family: 'DM Serif Display', serif;
          font-size: 36px;
          color: #1a1a1a;
          letter-spacing: -1px;
          margin-bottom: 16px;
        }

        .decision-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 20px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.5px;
          margin-bottom: 36px;
        }

        .decision-pill.invite {
          background: #edf7f0;
          color: #2d7a4f;
          border: 1px solid #c3e6d0;
        }

        .decision-pill.reject {
          background: #fdf0f0;
          color: #c0392b;
          border: 1px solid #f0c8c8;
        }

        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }

        .divider {
          height: 1px;
          background: #e2ddd8;
          margin: 28px 0;
        }

        .grid-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 28px;
        }

        .info-card {
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 12px;
          padding: 16px 20px;
        }

        .info-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .info-value {
          font-family: 'DM Serif Display', serif;
          font-size: 20px;
          color: #1a1a1a;
        }

        .section-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
          margin-bottom: 12px;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 28px;
        }

        .tag {
          font-size: 12px;
          padding: 5px 14px;
          border-radius: 100px;
          background: #fff;
          color: #6b6560;
          border: 1px solid #e2ddd8;
        }

        details summary {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          cursor: pointer;
          margin-bottom: 12px;
        }

        pre {
          font-size: 11px;
          color: #6b6560;
          overflow: auto;
          background: #fff;
          padding: 16px;
          border-radius: 10px;
          border: 1px solid #e2ddd8;
          max-height: 200px;
        }

        /* ── Probabilité ── */
        .proba-block {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
        }

        .proba-label {
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
          white-space: nowrap;
        }

        .proba-bar-wrap {
          flex: 1;
          height: 6px;
          background: #ede9e4;
          border-radius: 3px;
          overflow: hidden;
        }

        .proba-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.6s ease;
        }

        .proba-pos { background: #2ecc71; }
        .proba-neg { background: #e74c3c; }

        .proba-value {
          font-size: 13px;
          font-weight: 500;
          color: #1a1a1a;
          min-width: 36px;
          text-align: right;
        }

        /* ── Explications log-odds ── */
        .fair-explain-header {
          margin-bottom: 20px;
        }

        .fair-explain-title {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          color: #1a1a1a;
          margin-bottom: 6px;
        }

        .fair-explain-sub {
          font-size: 12px;
          font-weight: 300;
          color: #a09890;
          line-height: 1.6;
        }

        .expl-row {
          display: grid;
          grid-template-columns: 200px 1fr 56px;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

        .expl-name {
          font-size: 12px;
          font-family: 'DM Mono', 'Fira Code', monospace;
          color: #6b6560;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .expl-bar-wrap {
          height: 8px;
          background: #ede9e4;
          border-radius: 4px;
          overflow: hidden;
        }

        .expl-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .bar-pos { background: #2ecc71; }
        .bar-neg { background: #e74c3c; }

        .expl-val {
          font-size: 11px;
          font-weight: 500;
          text-align: right;
        }

        .val-pos { color: #2d7a4f; }
        .val-neg { color: #c0392b; }

        .fair-note {
          margin-top: 20px;
          padding: 12px 16px;
          background: #f0f7f4;
          border: 1px solid #c3e6d0;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 300;
          color: #2d7a4f;
          line-height: 1.6;
        }

        /* ── Résumé textuel ── */
        .summary-block {
          padding: 14px 18px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 300;
          line-height: 1.7;
          margin-bottom: 4px;
        }
        .summary-pos {
          background: #edf7f0;
          border: 1px solid #c3e6d0;
          color: #1e5c38;
        }
        .summary-neg {
          background: #fdf0f0;
          border: 1px solid #f0c8c8;
          color: #8b2020;
        }

        /* ── Jauge seuil ── */
        .tg-wrap {
          margin-bottom: 4px;
        }
        .tg-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .tg-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
        }
        .tg-diff {
          font-size: 12px;
          font-weight: 600;
        }
        .tg-bar-outer {
          position: relative;
          height: 12px;
          background: #ede9e4;
          border-radius: 6px;
          overflow: visible;
          margin-bottom: 8px;
        }
        .tg-fill {
          height: 100%;
          border-radius: 6px;
          transition: width 0.6s ease;
        }
        .tg-fill-pos { background: linear-gradient(90deg, #a8edcc, #2ecc71); }
        .tg-fill-neg { background: linear-gradient(90deg, #f5b5b5, #e74c3c); }
        .tg-threshold-line {
          position: absolute;
          top: -4px;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .tg-threshold-tick {
          width: 2px;
          height: 20px;
          background: #1a1a1a;
          border-radius: 1px;
        }
        .tg-threshold-label {
          font-size: 9px;
          text-align: center;
          color: #6b6560;
          font-weight: 500;
          margin-top: 3px;
          white-space: nowrap;
          letter-spacing: 0.5px;
        }
        .tg-sub {
          font-size: 12px;
          color: #a09890;
          font-weight: 300;
        }

        /* ── Catégories de features ── */
        .cat-group {
          margin-bottom: 20px;
        }
        .cat-label {
          font-size: 9px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #8b6f47;
          font-weight: 600;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #ede9e4;
        }

        /* ── Historique ── */
        .history-page {
          padding: 48px 64px;
          background: #f5f3ef;
          min-height: 100%;
        }
        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }
        .history-title {
          font-family: 'DM Serif Display', serif;
          font-size: 28px;
          color: #1a1a1a;
          letter-spacing: -0.5px;
        }
        .history-sub {
          font-size: 13px;
          color: #a09890;
          font-weight: 300;
          margin-top: 4px;
        }
        .refresh-btn {
          padding: 10px 22px;
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #6b6560;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .refresh-btn:hover { background: #fdf9f4; border-color: #8b6f47; color: #8b6f47; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .history-empty {
          text-align: center;
          color: #a09890;
          font-size: 14px;
          font-weight: 300;
          padding: 80px 0;
        }
        .history-table-wrap {
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 16px;
          overflow: hidden;
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
        }
        .history-table th {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
          padding: 16px 20px;
          text-align: left;
          border-bottom: 1px solid #e2ddd8;
          background: #faf9f7;
        }
        .history-row {
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .history-row:hover { background: #faf9f7; }
        .history-row.expanded { background: #fdf9f4; }
        .history-row td {
          padding: 16px 20px;
          border-bottom: 1px solid #f0ede8;
          font-size: 13px;
          color: #1a1a1a;
        }
        .td-date { color: #6b6560; font-size: 12px; }
        .td-time { color: #a09890; font-size: 11px; }
        .td-file { font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-score { font-weight: 600; font-size: 14px; }
        .td-threshold { color: #a09890; font-size: 12px; }
        .td-expand { color: #a09890; font-size: 11px; text-align: right; }
        .model-badge {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 100px;
        }
        .badge-fair { background: #edf7f0; color: #2d7a4f; border: 1px solid #c3e6d0; }
        .badge-std  { background: #f0f0f7; color: #5a5a8b; border: 1px solid #d0d0e8; }
        .decision-pill-sm {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
        }
        .history-detail-row td {
          background: #fdf9f4;
          padding: 0 20px 16px 20px;
          border-bottom: 1px solid #e2ddd8;
        }
        .history-features { padding: 4px 0; }
        .history-features-title {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8b6f47;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .hf-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 12px;
          border-bottom: 1px solid #f0ede8;
        }
        .hf-name { color: #6b6560; }
        .hf-val { font-weight: 600; font-size: 12px; }
        /* ── KPI cards ── */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 28px;
        }
        .kpi-card {
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 14px;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .kpi-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
        }
        .kpi-value {
          font-family: 'DM Serif Display', serif;
          font-size: 32px;
          color: #1a1a1a;
          line-height: 1.1;
        }
        .kpi-sub { font-size: 12px; color: #a09890; font-weight: 300; }

        /* ── Barre de filtres ── */
        .filter-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .search-input {
          padding: 9px 16px;
          border: 1px solid #e2ddd8;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: #1a1a1a;
          background: #fff;
          outline: none;
          width: 220px;
          transition: border-color 0.2s;
        }
        .search-input::placeholder { color: #c0b8b0; }
        .search-input:focus { border-color: #8b6f47; }
        .filter-group {
          display: flex;
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 100px;
          overflow: hidden;
        }
        .filter-btn {
          padding: 8px 16px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: #a09890;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .filter-btn:hover { color: #6b6560; background: #faf9f7; }
        .filter-btn.active { background: #1a1a1a; color: #fff; border-radius: 100px; }
        .filter-results {
          margin-left: auto;
          font-size: 12px;
          color: #a09890;
          font-weight: 300;
          white-space: nowrap;
        }

        .toggle-mode-btn {
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #8b6f47;
          background: none;
          border: 1px solid #d4c4b0;
          border-radius: 100px;
          padding: 4px 12px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .toggle-mode-btn:hover { background: #fdf9f4; border-color: #8b6f47; }
        .impact-label { font-size: 11px; font-weight: 600; text-align: right; white-space: nowrap; }

        /* ── Checkbox sélection ── */
        .row-checkbox {
          width: 16px; height: 16px; cursor: pointer; accent-color: #8b6f47;
        }
        .history-row.selected-row { background: #fdf9f4; }
        .history-row.selected-row > td:first-child { border-left: 3px solid #8b6f47; }

        /* ── Bouton comparer ── */
        .compare-btn {
          padding: 10px 22px;
          background: #8b6f47;
          border: none;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          cursor: pointer;
          transition: background 0.2s ease;
          margin-left: 12px;
        }
        .compare-btn:hover { background: #7a5e38; }

        /* ── Modal ── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(26,26,26,0.55);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
        }
        .modal-panel {
          background: #faf9f7;
          border-radius: 20px;
          border: 1px solid #e2ddd8;
          width: 100%;
          max-width: 920px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 40px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.22);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }
        .modal-title {
          font-family: 'DM Serif Display', serif;
          font-size: 24px;
          color: #1a1a1a;
          letter-spacing: -0.5px;
        }
        .modal-sub { font-size: 13px; color: #a09890; font-weight: 300; margin-top: 4px; }
        .modal-close {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid #e2ddd8;
          background: #fff;
          cursor: pointer;
          font-size: 14px;
          color: #6b6560;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .modal-close:hover { background: #fdf0f0; color: #c0392b; border-color: #f0c8c8; }
        .modal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .compare-card {
          background: #fff;
          border-radius: 16px;
          padding: 28px;
          border: 1.5px solid #e2ddd8;
        }
        .compare-card.compare-selected { border-color: #c3e6d0; }
        .compare-card.compare-rejected { border-color: #f0c8c8; }
        .compare-filename {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
        }
        .compare-date { font-size: 12px; color: #a09890; margin-bottom: 14px; text-align: center; }
        .compare-badges { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; justify-content: center; }
        .compare-score-block { margin-bottom: 20px; text-align: center; }
        .compare-score-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #a09890;
          font-weight: 500;
          margin-bottom: 6px;
        }
        .compare-score-val {
          font-family: 'DM Serif Display', serif;
          font-size: 40px;
          color: #1a1a1a;
          margin-bottom: 10px;
        }
        .compare-bar-wrap {
          position: relative;
          height: 10px;
          background: #ede9e4;
          border-radius: 5px;
          overflow: visible;
          margin-bottom: 6px;
        }
        .compare-bar-fill { height: 100%; border-radius: 5px; transition: width 0.6s ease; }
        .compare-threshold-mark {
          position: absolute;
          top: -4px;
          width: 2px;
          height: 18px;
          background: #1a1a1a;
          border-radius: 1px;
          transform: translateX(-50%);
        }
        .compare-threshold-label { font-size: 11px; color: #a09890; }
        .compare-features { padding-top: 12px; border-top: 1px solid #e2ddd8; margin-top: 4px; }
        .compare-diff-banner {
          grid-column: 1 / -1;
          background: #fff;
          border: 1px solid #e2ddd8;
          border-radius: 12px;
          padding: 16px 22px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #6b6560;
        }
        .compare-diff-val { font-weight: 700; font-size: 15px; }

        /* ── Splash screen (cinematic) ── */
        .splash-overlay {
          position: fixed;
          inset: 0;
          background: #0f0e0c;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          animation: splashFadeOut 1s cubic-bezier(0.4, 0, 0.2, 1) 2.4s forwards;
        }
        .splash-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 90% 60% at 50% 50%, rgba(139,111,71,0.14) 0%, transparent 70%);
          animation: splashBgPulse 3s ease-in-out infinite;
        }
        .splash-glow {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -58%);
          width: 900px; height: 500px;
          background: radial-gradient(ellipse, rgba(196,149,106,0.07) 0%, transparent 70%);
          animation: splashGlowFloat 2.5s ease-in-out infinite alternate;
        }
        .splash-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .splash-logo {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(80px, 13vw, 160px);
          letter-spacing: -0.06em;
          line-height: 1;
          color: #fff;
          opacity: 0;
          animation: splashLogoIn 1.1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
        }
        .splash-logo span {
          font-style: italic;
          background: linear-gradient(135deg, #c4956a 0%, #f0d9b5 35%, #fff8ee 50%, #f0d9b5 65%, #c4956a 100%);
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: splashAurora 4s ease infinite 1.4s;
        }
        .splash-line-wrap { overflow: hidden; margin: 22px 0 26px; }
        .splash-line {
          width: 80px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(196,149,106,0.9), transparent);
          transform: scaleX(0);
          transform-origin: center;
          animation: splashLineIn 0.9s ease-out 1.1s forwards;
        }
        .splash-sub {
          font-size: 10px;
          letter-spacing: 5px;
          text-transform: uppercase;
          color: rgba(196,149,106,0.65);
          font-weight: 400;
          opacity: 0;
          animation: splashSubIn 0.7s ease 1.5s forwards;
        }
        @keyframes splashLogoIn {
          from { opacity: 0; transform: translateY(36px) scale(0.94); filter: blur(12px); }
          to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes splashLineIn {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes splashSubIn {
          from { opacity: 0; transform: translateY(14px); letter-spacing: 2px; }
          to   { opacity: 1; transform: translateY(0); letter-spacing: 5px; }
        }
        @keyframes splashAurora {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes splashBgPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        @keyframes splashGlowFloat {
          from { transform: translate(-50%, -62%); opacity: 0.5; }
          to   { transform: translate(-50%, -54%); opacity: 1; }
        }
        @keyframes splashFadeOut {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.04); pointer-events: none; }
        }

        /* ── Logo aurora (header) ── */
        .logo-aurora {
          display: inline-block;
          background: linear-gradient(135deg, #8b6f47 0%, #c4956a 30%, #e8c99a 50%, #c4956a 70%, #8b6f47 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: logoAurora 4s ease infinite;
        }
        @keyframes logoAurora {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* ── Badge shimmer ── */
        .badge-shimmer {
          position: relative;
          overflow: hidden;
        }
        .badge-shimmer::after {
          content: '';
          position: absolute;
          top: 0; left: -120%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent);
          animation: badgeShimmer 4s ease-in-out 2.8s infinite;
        }
        @keyframes badgeShimmer {
          0%   { left: -120%; }
          35%  { left: 160%; }
          100% { left: 160%; }
        }

        /* ── Blur fade-in sur les panels ── */
        .main, .history-page {
          animation: blurFadeIn 0.5s ease-out forwards;
        }
        @keyframes blurFadeIn {
          from { opacity: 0; filter: blur(6px); transform: translateY(10px); }
          to   { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
      `}</style>

      <div className="page">
        {/* Header */}
        <header className="header">
          <div className="logo">CV<span className="logo-aurora">ision</span></div>
          <div className="badge badge-shimmer">Screening IA</div>
        </header>

        {/* Onglets */}
        <nav className="tabs">
          <button
            className={`tab-btn ${activeTab === 0 ? "active" : ""}`}
            onClick={() => setActiveTab(0)}
          >
            <div className="tab-pip" />
            Analyse Standard
          </button>
          <button
            className={`tab-btn ${activeTab === 1 ? "active" : ""}`}
            onClick={() => setActiveTab(1)}
          >
            <div className="tab-pip" />
            Analyse Équitable
            <span className="tab-fair-tag">FAIR</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 2 ? "active" : ""}`}
            onClick={() => setActiveTab(2)}
          >
            <div className="tab-pip" />
            Dashboard RH
          </button>
        </nav>

        {/* Contenu */}
        {activeTab === 0 && (
          <div className="main">
            <div className="left">
              <Dropzone
                onFile={sendFile}
                loading={loading}
                filename={filename}
                eyebrow="Recrutement intelligent"
                headline="Analysez vos CVs en"
                headlineEm="quelques secondes"
                desc="Déposez un CV au format .txt et obtenez instantanément une analyse structurée et une recommandation d'embauche."
              />
              {error && <div className="error-msg">{error}</div>}
            </div>
            <div className="right">
              {!result ? (
                <div className="empty-state">
                  <div className="empty-icon">🎯</div>
                  <div className="empty-text">En attente d'un CV</div>
                </div>
              ) : (
                <ResultPanel result={result} filename={filename} />
              )}
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div className="history-page">
            {/* Header */}
            <div className="history-header">
              <div>
                <div className="history-title">Dashboard RH</div>
                <div className="history-sub">{history.length} analyse{history.length !== 1 ? "s" : ""} enregistrée{history.length !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {selectedRows.length > 0 && (
                  <button className="refresh-btn" onClick={() => setSelectedRows([])}>
                    ✕ {selectedRows.length} sélectionné{selectedRows.length > 1 ? "s" : ""}
                  </button>
                )}
                {selectedRows.length === 2 && (
                  <button className="compare-btn" onClick={() => setShowCompare(true)}>
                    Comparer (2)
                  </button>
                )}
                <button className="refresh-btn" onClick={fetchHistory} disabled={historyLoading}>
                  {historyLoading ? "Chargement…" : "↻ Actualiser"}
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            {history.length > 0 && (
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">CVs analysés</div>
                  <div className="kpi-value">{history.length}</div>
                  <div className="kpi-sub">au total</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Sélectionnés</div>
                  <div className="kpi-value val-pos">{totalSelected}</div>
                  <div className="kpi-sub">{selectRate}% du total</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Refusés</div>
                  <div className="kpi-value val-neg">{history.length - totalSelected}</div>
                  <div className="kpi-sub">{100 - selectRate}% du total</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Modèle FAIR</div>
                  <div className="kpi-value">{totalFair}</div>
                  <div className="kpi-sub">analyse{totalFair !== 1 ? "s" : ""} équitable{totalFair !== 1 ? "s" : ""}</div>
                </div>
              </div>
            )}

            {historyLoading && history.length === 0 ? (
              <div className="history-empty">Chargement…</div>
            ) : history.length === 0 ? (
              <div className="history-empty">Aucune analyse enregistrée pour l'instant.</div>
            ) : (
              <>
                {/* Barre de filtres */}
                <div className="filter-bar">
                  <input
                    className="search-input"
                    placeholder="Rechercher un fichier…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <div className="filter-group">
                    <button className={`filter-btn ${filterModel === "all" ? "active" : ""}`} onClick={() => setFilterModel("all")}>Tous</button>
                    <button className={`filter-btn ${filterModel === "standard" ? "active" : ""}`} onClick={() => setFilterModel("standard")}>Standard</button>
                    <button className={`filter-btn ${filterModel === "fair" ? "active" : ""}`} onClick={() => setFilterModel("fair")}>FAIR</button>
                  </div>
                  <div className="filter-group">
                    <button className={`filter-btn ${filterDecision === "all" ? "active" : ""}`} onClick={() => setFilterDecision("all")}>Toutes</button>
                    <button className={`filter-btn ${filterDecision === "selected" ? "active" : ""}`} onClick={() => setFilterDecision("selected")}>Sélectionnés</button>
                    <button className={`filter-btn ${filterDecision === "rejected" ? "active" : ""}`} onClick={() => setFilterDecision("rejected")}>Refusés</button>
                  </div>
                  <span className="filter-results">{filteredHistory.length} résultat{filteredHistory.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Tableau */}
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}></th>
                        <th>Date</th>
                        <th>Fichier</th>
                        <th>Modèle</th>
                        <th>Décision</th>
                        <th>Score</th>
                        <th>Seuil</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#a09890", fontSize: "13px" }}>
                            Aucun résultat pour ces filtres.
                          </td>
                        </tr>
                      ) : filteredHistory.map((row) => {
                        const isRowSel = row.decision?.includes("Sélectionné") || row.decision === "Inviter"
                        const date    = new Date(row.created_at)
                        const dateStr = date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })
                        const timeStr = date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
                        const isExpanded = expandedRow === row.id
                        return (
                          <>
                            <tr
                              key={row.id}
                              className={`history-row ${isExpanded ? "expanded" : ""} ${selectedRows.find(r => r.id === row.id) ? "selected-row" : ""}`}
                              onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                            >
                              <td onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  className="row-checkbox"
                                  checked={!!selectedRows.find(r => r.id === row.id)}
                                  onChange={() => toggleSelect(row)}
                                />
                              </td>
                              <td className="td-date">{dateStr}<br /><span className="td-time">{timeStr}</span></td>
                              <td className="td-file">{row.filename}</td>
                              <td>
                                <span className={`model-badge ${row.model === "fair" ? "badge-fair" : "badge-std"}`}>
                                  {row.model === "fair" ? "FAIR" : "Standard"}
                                </span>
                              </td>
                              <td>
                                <span className={`decision-pill-sm ${isRowSel ? "invite" : "reject"}`}>
                                  <span className="dot" />
                                  {isRowSel ? "Sélectionné" : "Refusé"}
                                </span>
                              </td>
                              <td className={`td-score ${isRowSel ? "val-pos" : "val-neg"}`}>
                                {(row.score * 100).toFixed(1)}%
                              </td>
                              <td className="td-threshold">{(row.threshold * 100).toFixed(1)}%</td>
                              <td className="td-expand">{isExpanded ? "▲" : "▼"}</td>
                            </tr>
                            {isExpanded && row.top_features?.length > 0 && (
                              <tr key={row.id + "-detail"} className="history-detail-row">
                                <td colSpan={8}>
                                  <HistoryFeatureDetail features={row.top_features} />
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {showCompare && selectedRows.length === 2 && (
              <CompareModal rows={selectedRows} onClose={() => setShowCompare(false)} />
            )}
          </div>
        )}

        {activeTab === 1 && (
          <div className="main">
            <div className="left">
              <Dropzone
                onFile={sendFileFair}
                loading={loadingFair}
                filename={filenameFair}
                eyebrow="Modèle équitable & transparent"
                headline="Décision juste,"
                headlineEm="explications claires"
                desc="Même analyse, modèle sans critères discriminatoires (âge, distance, origines). Chaque décision est expliquée critère par critère."
              />
              {errorFair && <div className="error-msg">{errorFair}</div>}
            </div>
            <div className="right">
              {!resultFair ? (
                <div className="empty-state">
                  <div className="empty-icon">⚖️</div>
                  <div className="empty-text">En attente d'un CV</div>
                </div>
              ) : (
                <FairResultPanel result={resultFair} filename={filenameFair} />
              )}
            </div>
          </div>
        )}
      </div>

      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
    </>
  )
}
