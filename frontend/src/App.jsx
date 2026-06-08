import { useState, useRef, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

const WEBHOOK_URL      = "https://n8n.dlzteam.com/webhook/process-cv"
const WEBHOOK_FAIR_URL = "https://n8n.dlzteam.com/webhook/4f470f6b-2ab0-4480-8079-8572d0f4bb7f"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

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

const ANALYSIS_STEPS = [
  "Lecture du fichier…",
  "Extraction des données…",
  "Analyse des compétences…",
  "Calcul du score de confiance…",
  "Génération de la synthèse RH…",
]

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

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) { setValue(0); return }
    let cancelled = false
    let start = null
    function step(ts) {
      if (cancelled) return
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setValue(Math.round(p * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return () => { cancelled = true }
  }, [target, duration])
  return value
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
          style={{ "--tg-width": `${probPct}%` }}
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

// ─── Barres de contribution groupées ────────────────────────────────────────
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

  let globalIdx = 0
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
            const idx = globalIdx++
            const isDecisive = Math.abs(e.contribution) > 0.5
            return (
              <div key={i} className={`expl-row${isDecisive ? " expl-decisive" : ""}`}>
                <div className="expl-name" title={e.feature}>{getLabel(e.feature)}</div>
                <div className="expl-bar-wrap">
                  <div
                    className={`expl-bar ${pos ? "bar-pos" : "bar-neg"}`}
                    style={{ "--bar-width": `${pct}%`, animationDelay: `${idx * 70}ms` }}
                  />
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

// ─── Panel résultats standard ───────────────────────────────────────────────
function ResultPanel({ result, filename }) {
  const isInvite = result?.decision === "Inviter"
  return (
    <div>
      <div className="result-filename result-reveal" style={{ animationDelay: "0ms" }}>{filename}</div>
      <div className="result-name result-reveal" style={{ animationDelay: "60ms" }}>{result.name}</div>
      <div className={`decision-pill ${isInvite ? "invite" : "reject"} result-reveal`} style={{ animationDelay: "120ms" }}>
        <div className="dot" />
        {result.decision}
      </div>
      <div className="grid-info result-reveal" style={{ animationDelay: "200ms" }}>
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
      <div className="section-label result-reveal" style={{ animationDelay: "280ms" }}>Compétences</div>
      <div className="tags result-reveal" style={{ animationDelay: "320ms" }}>
        {result.skills?.slice(0, 10).map((s, i) => (
          <span key={i} className="tag tag-reveal" style={{ animationDelay: `${320 + i * 40}ms` }}>{s}</span>
        ))}
      </div>
      <div className="section-label result-reveal" style={{ animationDelay: "560ms" }}>Langues</div>
      <div className="tags result-reveal" style={{ animationDelay: "600ms" }}>
        {result.languages?.map((l, i) => (
          <span key={i} className="tag tag-reveal" style={{ animationDelay: `${600 + i * 40}ms` }}>{l.language} — {l.level}</span>
        ))}
      </div>
      <div className="divider result-reveal" style={{ animationDelay: "680ms" }} />
      <details className="result-reveal" style={{ animationDelay: "720ms" }}>
        <summary>Voir le JSON complet</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}

// ─── Panel résultats FAIR ───────────────────────────────────────────────────
function FairResultPanel({ result, filename }) {
  const isInvite = result?.decision?.includes("Sélectionné") || result?.decision === "Inviter"
  const summary  = generateSummary(result.explanations, result.decision)

  return (
    <div>
      <div className="result-filename result-reveal" style={{ animationDelay: "0ms" }}>{filename}</div>
      <div className="result-name result-reveal" style={{ animationDelay: "60ms" }}>{result.name}</div>

      <div className={`decision-pill ${isInvite ? "invite" : "reject"} result-reveal`} style={{ animationDelay: "120ms" }}>
        <div className="dot" />
        {result.decision}
      </div>

      {summary && (
        <div className={`summary-block ${isInvite ? "summary-pos" : "summary-neg"} result-reveal`} style={{ animationDelay: "200ms" }}>
          {summary}
        </div>
      )}

      <div className="divider result-reveal" style={{ animationDelay: "260ms" }} />

      {result.probability != null && result.threshold_used != null && (
        <div className="result-reveal" style={{ animationDelay: "320ms" }}>
          <ThresholdGauge probability={result.probability} threshold={result.threshold_used} />
          <div className="divider" />
        </div>
      )}

      <div className="grid-info result-reveal" style={{ animationDelay: "400ms" }}>
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

      <div className="section-label result-reveal" style={{ animationDelay: "480ms" }}>Compétences</div>
      <div className="tags result-reveal" style={{ animationDelay: "520ms" }}>
        {result.skills?.slice(0, 10).map((s, i) => (
          <span key={i} className="tag tag-reveal" style={{ animationDelay: `${520 + i * 40}ms` }}>{s}</span>
        ))}
      </div>

      <div className="section-label result-reveal" style={{ animationDelay: "760ms" }}>Langues</div>
      <div className="tags result-reveal" style={{ animationDelay: "800ms" }}>
        {result.languages?.map((l, i) => (
          <span key={i} className="tag tag-reveal" style={{ animationDelay: `${800 + i * 40}ms` }}>{l.language} — {l.level}</span>
        ))}
      </div>

      {result.explanations?.length > 0 && (
        <div className="result-reveal" style={{ animationDelay: "880ms" }}>
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
        </div>
      )}

      <div className="divider result-reveal" style={{ animationDelay: "960ms" }} />
      <details className="result-reveal" style={{ animationDelay: "1000ms" }}>
        <summary>Voir le JSON complet</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}

// ─── Splash screen ──────────────────────────────────────────────────────────
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

// ─── Détail features historique ─────────────────────────────────────────────
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

// ─── Modal comparaison ──────────────────────────────────────────────────────
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
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#94a3b8" }}>
              Meilleur score : <strong style={{ color: "#0f172a" }}>{winner}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dropzone (Aceternity style + loading steps) ─────────────────────────────
function Dropzone({ onFile, loading, filename, eyebrow, headline, headlineEm, desc }) {
  const [dragging, setDragging] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [stepDone, setStepDone] = useState([])
  const inputRef = useRef()

  useEffect(() => {
    if (!loading) { setStepIdx(0); setStepDone([]); return }
    const t = setInterval(() => {
      setStepIdx(i => {
        const next = Math.min(i + 1, ANALYSIS_STEPS.length - 1)
        setStepDone(d => [...d, i])
        return next
      })
    }, 620)
    return () => clearInterval(t)
  }, [loading])

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
        onClick={() => !loading && inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".txt" style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])} />
        <div className="dz-grid-bg" />
        <div className="dz-inner">
          {loading ? (
            <div className="dz-steps-wrap">
              <div className="dz-spin" style={{ marginBottom: "20px" }} />
              {ANALYSIS_STEPS.map((step, i) => (
                <div
                  key={i}
                  className={`dz-step ${i < stepIdx || stepDone.includes(i) ? "dz-step-done" : i === stepIdx ? "dz-step-active" : "dz-step-pending"}`}
                >
                  <span className="dz-step-icon">
                    {stepDone.includes(i) ? "✓" : i === stepIdx ? "→" : "·"}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          ) : filename ? (
            <div className="dz-file-display">
              <div className="dz-file-card">
                <span style={{ fontSize: "22px" }}>📄</span>
                <div>
                  <div className="dz-file-name">{filename}</div>
                  <div className="dz-file-ok">Fichier prêt · cliquez pour changer</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={`dz-float-wrap ${dragging ? "dz-floating-drag" : ""}`}>
                <div className="dz-card-back" />
                <div className="dz-card-front">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                    stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [filename, setFilename] = useState(null)

  const [loadingFair, setLoadingFair]   = useState(false)
  const [resultFair, setResultFair]     = useState(null)
  const [errorFair, setErrorFair]       = useState(null)
  const [filenameFair, setFilenameFair] = useState(null)

  const [history, setHistory]           = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedRow, setExpandedRow]   = useState(null)
  const [selectedRows, setSelectedRows] = useState([])
  const [showCompare, setShowCompare]   = useState(false)
  const [filterModel, setFilterModel]   = useState("all")
  const [filterDecision, setFilterDecision] = useState("all")
  const [searchQuery, setSearchQuery]   = useState("")

  // Tab indicator
  const tabRef0 = useRef()
  const tabRef1 = useRef()
  const tabRef2 = useRef()
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const refs = [tabRef0, tabRef1, tabRef2]
    const btn = refs[activeTab]?.current
    if (!btn) return
    const nav = btn.closest(".tabs")
    if (!nav) return
    const navRect = nav.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setTabIndicator({ left: btnRect.left - navRect.left, width: btnRect.width })
  }, [activeTab, showSplash])

  // Mouse halo
  useEffect(() => {
    const handleMove = (e) => {
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`)
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`)
    }
    window.addEventListener("mousemove", handleMove)
    return () => window.removeEventListener("mousemove", handleMove)
  }, [])

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
  const avgScoreSelected = totalSelected > 0
    ? history.filter(r => r.decision?.includes("Sélectionné") || r.decision === "Inviter")
             .reduce((s, r) => s + (r.score || 0), 0) / totalSelected
    : 0

  const insightText = history.length > 0
    ? `Sur les ${history.length} CV analysé${history.length > 1 ? "s" : ""}, ${selectRate}% sont sélectionnés. Les analyses FAIR représentent ${Math.round(totalFair / history.length * 100)}% des décisions.${totalSelected > 0 ? ` Score moyen des candidats retenus : ${(avgScoreSelected * 100).toFixed(0)}%.` : ""}`
    : null

  const filteredHistory = history.filter(row => {
    const sel = row.decision?.includes("Sélectionné") || row.decision === "Inviter"
    if (filterModel !== "all" && row.model !== filterModel) return false
    if (filterDecision === "selected" && !sel) return false
    if (filterDecision === "rejected" && sel) return false
    if (searchQuery && !row.filename?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Count-up KPI (hooks must be unconditional)
  const kpiTotal    = useCountUp(history.length)
  const kpiSelected = useCountUp(totalSelected)
  const kpiRejected = useCountUp(history.length - totalSelected)
  const kpiFair     = useCountUp(totalFair)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --mouse-x: 50vw;
          --mouse-y: 50vh;
        }

        body {
          background: #f1f5f9;
          color: #0f172a;
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
        }

        .page {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto auto 1fr;
          position: relative;
        }

        /* Mouse halo */
        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(
            700px circle at var(--mouse-x) var(--mouse-y),
            rgba(59,130,246,0.06),
            transparent 42%
          );
        }

        .header {
          padding: 28px 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          background: rgba(250,249,247,0.92);
          backdrop-filter: blur(12px);
          position: relative;
          z-index: 10;
        }

        .logo {
          font-family: 'DM Serif Display', serif;
          font-size: 24px;
          color: #0f172a;
          letter-spacing: -0.5px;
        }

        .logo span { color: #3b82f6; }

        .badge {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
          padding: 6px 16px;
          border-radius: 100px;
          background: #eff6ff;
        }

        /* ── Onglets ── */
        .tabs {
          display: flex;
          background: rgba(250,249,247,0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #e2e8f0;
          padding: 0 56px;
          gap: 0;
          position: relative;
          z-index: 10;
        }

        .tab-indicator-line {
          position: absolute;
          bottom: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, #3b82f6 30%, #60a5fa 50%, #3b82f6 70%, transparent 100%);
          transition: left 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
          border-radius: 2px;
          box-shadow: 0 0 8px rgba(59,130,246,0.4);
        }

        .tab-btn {
          padding: 16px 28px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.3px;
          color: #94a3b8;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tab-btn:hover { color: #64748b; }

        .tab-btn.active {
          color: #0f172a;
        }

        .tab-pip {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.5;
          transition: all 0.2s ease;
        }

        .tab-btn.active .tab-pip {
          background: #3b82f6;
          opacity: 1;
          box-shadow: 0 0 6px rgba(59,130,246,0.5);
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
          position: relative;
          z-index: 1;
        }

        .left {
          padding: 72px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
        }

        .tab-bg-0 .left {
          background: linear-gradient(155deg, rgba(59,130,246,0.07) 0%, #ffffff 38%);
        }
        .tab-bg-1 .left {
          background: linear-gradient(155deg, rgba(45,122,79,0.07) 0%, #ffffff 38%);
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #3b82f6;
          font-weight: 500;
          margin-bottom: 20px;
          display: inline-flex;
          align-items: center;
        }

        .eyebrow::after {
          content: '';
          display: inline-block;
          width: 28px;
          height: 1px;
          background: #3b82f6;
          margin-left: 10px;
          flex-shrink: 0;
          transform-origin: left;
          animation: eyebrowLine 0.9s ease 0.4s both;
        }

        @keyframes eyebrowLine {
          from { transform: scaleX(0); opacity: 0; }
          to   { transform: scaleX(1); opacity: 1; }
        }

        .headline {
          font-family: 'DM Serif Display', serif;
          font-size: 48px;
          line-height: 1.1;
          letter-spacing: -1px;
          color: #0f172a;
          margin-bottom: 20px;
        }

        .headline em {
          font-style: italic;
          color: #3b82f6;
        }

        .desc {
          font-size: 15px;
          font-weight: 300;
          line-height: 1.8;
          color: #64748b;
          margin-bottom: 48px;
        }

        /* ── Dropzone Aceternity-style ── */
        .dz-ace {
          position: relative;
          border-radius: 16px;
          border: 1.5px solid #e2e8f0;
          background: #fff;
          padding: 52px 32px;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .dz-ace:hover {
          border-color: #3b82f6;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.06), 0 8px 32px rgba(59,130,246,0.07);
        }
        .dz-ace-drag {
          border-color: #3b82f6 !important;
          border-style: dashed;
          background: #eff6ff;
          box-shadow: 0 0 0 5px rgba(59,130,246,0.09) !important;
        }

        /* Scan line on drag */
        .dz-ace-drag::after {
          content: '';
          position: absolute;
          left: 10%;
          right: 10%;
          height: 2px;
          top: 0;
          background: linear-gradient(90deg, transparent, rgba(59,130,246,0.9), transparent);
          box-shadow: 0 0 14px rgba(59,130,246,0.4);
          animation: scanLine 1.1s ease-in-out infinite;
          border-radius: 1px;
          pointer-events: none;
        }
        @keyframes scanLine {
          0%   { transform: translateY(0);    opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(280px); opacity: 0; }
        }

        .dz-grid-bg {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
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
          background: linear-gradient(145deg, #fff, #eff6ff);
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 20px rgba(0,0,0,0.07);
          z-index: 2;
          transition: box-shadow 0.3s ease;
        }
        .dz-ace:hover .dz-card-front {
          box-shadow: 0 10px 32px rgba(59,130,246,0.12);
        }
        .dz-card-back {
          position: absolute;
          top: 8px; left: -8px; right: -8px; bottom: -8px;
          background: #eff6ff;
          border: 1.5px solid #dbeafe;
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
          color: #0f172a;
        }
        .dz-label-sub {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 300;
          max-width: 260px;
          line-height: 1.6;
        }
        .dz-spin {
          width: 36px; height: 36px;
          border: 2px solid #e2e8f0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Loading steps */
        .dz-steps-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          width: 100%;
          max-width: 260px;
        }
        .dz-step {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          transition: all 0.3s ease;
          font-weight: 400;
        }
        .dz-step-done {
          color: #2d7a4f;
          opacity: 0.7;
        }
        .dz-step-active {
          color: #0f172a;
          font-weight: 500;
        }
        .dz-step-pending {
          color: #94a3b8;
        }
        .dz-step-icon {
          font-size: 11px;
          width: 14px;
          text-align: center;
          font-weight: 700;
          color: inherit;
        }
        .dz-step-done .dz-step-icon { color: #2d7a4f; }
        .dz-step-active .dz-step-icon { color: #3b82f6; }

        .dz-file-display { animation: fileIn 0.45s cubic-bezier(0.16,1,0.3,1); }
        @keyframes fileIn {
          from { opacity: 0; transform: scale(0.88) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .dz-file-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 20px;
        }
        .dz-file-name { font-size: 14px; font-weight: 500; color: #0f172a; text-align: left; }
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
          background: #f1f5f9;
          position: relative;
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
          color: #0f172a;
        }

        /* ── Cascade reveal ── */
        .result-reveal {
          opacity: 0;
          transform: translateY(12px);
          animation: revealUp 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes revealUp {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Tag stagger ── */
        .tag-reveal {
          opacity: 0;
          animation: tagReveal 0.38s ease forwards;
        }
        @keyframes tagReveal {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .result-filename {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .result-name {
          font-family: 'DM Serif Display', serif;
          font-size: 36px;
          color: #0f172a;
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
          animation: pillPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes pillPop {
          from { transform: scale(0.82); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
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
          background: #e2e8f0;
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
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 20px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .info-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(26,26,26,0.06);
        }

        .info-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .info-value {
          font-family: 'DM Serif Display', serif;
          font-size: 20px;
          color: #0f172a;
        }

        .section-label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
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
          color: #64748b;
          border: 1px solid #e2e8f0;
          transition: all 0.2s ease;
        }
        .tag:hover {
          border-color: #3b82f6;
          color: #3b82f6;
          background: #eff6ff;
        }

        details summary {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
          cursor: pointer;
          margin-bottom: 12px;
        }

        pre {
          font-size: 11px;
          color: #64748b;
          overflow: auto;
          background: #fff;
          padding: 16px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          max-height: 200px;
        }

        /* ── Probabilité ── */
        .proba-block { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
        .proba-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; font-weight: 500; white-space: nowrap; }
        .proba-bar-wrap { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
        .proba-bar { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
        .proba-pos { background: #2ecc71; }
        .proba-neg { background: #e74c3c; }
        .proba-value { font-size: 13px; font-weight: 500; color: #0f172a; min-width: 36px; text-align: right; }

        /* ── Explications ── */
        .fair-explain-header { margin-bottom: 20px; }
        .fair-explain-title {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .fair-explain-sub { font-size: 12px; font-weight: 300; color: #94a3b8; line-height: 1.6; }

        .expl-row {
          display: grid;
          grid-template-columns: 200px 1fr 56px;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
          border-radius: 6px;
          padding: 4px 0;
          transition: background 0.2s ease;
        }
        .expl-row:hover { background: rgba(59,130,246,0.04); }

        .expl-decisive {
          animation: decisiveGlow 1.4s ease 0.5s;
        }
        @keyframes decisiveGlow {
          0%   { background: rgba(59,130,246,0); }
          30%  { background: rgba(59,130,246,0.10); }
          100% { background: rgba(59,130,246,0); }
        }

        .expl-name {
          font-size: 12px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .expl-bar-wrap {
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        /* Bar fill animation via CSS variable */
        .expl-bar {
          height: 100%;
          border-radius: 4px;
          width: 0;
          animation: barFill 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes barFill {
          from { width: 0; }
          to   { width: var(--bar-width, 0); }
        }

        .bar-pos { background: linear-gradient(90deg, #a8edcc, #2ecc71); }
        .bar-neg { background: linear-gradient(90deg, #f5b5b5, #e74c3c); }

        .expl-val { font-size: 11px; font-weight: 500; text-align: right; }

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
        .summary-pos { background: #edf7f0; border: 1px solid #c3e6d0; color: #1e5c38; }
        .summary-neg { background: #fdf0f0; border: 1px solid #f0c8c8; color: #8b2020; }

        /* ── Jauge seuil ── */
        .tg-wrap { margin-bottom: 4px; }
        .tg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .tg-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; font-weight: 500; }
        .tg-diff { font-size: 12px; font-weight: 600; }
        .tg-bar-outer {
          position: relative;
          height: 12px;
          background: #e2e8f0;
          border-radius: 6px;
          overflow: visible;
          margin-bottom: 8px;
        }

        /* Animated fill via CSS variable */
        .tg-fill {
          height: 100%;
          border-radius: 6px;
          width: 0;
          animation: tgFill 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s forwards;
        }
        @keyframes tgFill {
          from { width: 0; }
          to   { width: var(--tg-width, 0); }
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
        .tg-threshold-tick { width: 2px; height: 20px; background: #0f172a; border-radius: 1px; }
        .tg-threshold-label { font-size: 9px; text-align: center; color: #64748b; font-weight: 500; margin-top: 3px; white-space: nowrap; letter-spacing: 0.5px; }
        .tg-sub { font-size: 12px; color: #94a3b8; font-weight: 300; }

        /* ── Catégories de features ── */
        .cat-group { margin-bottom: 20px; }
        .cat-label {
          font-size: 9px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #3b82f6;
          font-weight: 600;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #e2e8f0;
        }

        /* ── Dashboard ── */
        .history-page {
          padding: 48px 64px;
          min-height: 100%;
          position: relative;
          z-index: 1;
          background:
            linear-gradient(rgba(26,26,26,0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26,26,26,0.022) 1px, transparent 1px),
            #f1f5f9;
          background-size: 44px 44px;
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
          color: #0f172a;
          letter-spacing: -0.5px;
        }
        .history-sub { font-size: 13px; color: #94a3b8; font-weight: 300; margin-top: 4px; }

        .refresh-btn {
          padding: 10px 22px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .refresh-btn:hover { background: #eff6ff; border-color: #3b82f6; color: #3b82f6; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Insight RH ── */
        .insight-rh {
          background: linear-gradient(135deg, rgba(59,130,246,0.07), rgba(59,130,246,0.03));
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: 14px;
          padding: 16px 22px;
          margin-bottom: 28px;
          font-size: 13px;
          font-weight: 300;
          color: #1e40af;
          line-height: 1.7;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: revealUp 0.6s ease 0.3s both;
        }
        .insight-icon {
          font-size: 18px;
          flex-shrink: 0;
          opacity: 0.8;
        }

        /* ── KPI cards ── */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 28px;
        }
        .kpi-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: relative;
          overflow: hidden;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          cursor: default;
        }
        .kpi-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 40px rgba(26,26,26,0.09);
          border-color: rgba(59,130,246,0.3);
        }
        .kpi-card::before {
          content: '';
          position: absolute;
          top: 0; left: -120%;
          width: 70%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          transform: skewX(-18deg);
          pointer-events: none;
        }
        .kpi-card:hover::before {
          animation: kpiSweep 0.7s ease;
        }
        @keyframes kpiSweep {
          to { left: 130%; }
        }

        .kpi-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; font-weight: 500; }
        .kpi-value {
          font-family: 'DM Serif Display', serif;
          font-size: 32px;
          color: #0f172a;
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .kpi-sub { font-size: 12px; color: #94a3b8; font-weight: 300; }

        /* Donut */
        .kpi-donut {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: conic-gradient(
            #2d7a4f 0 var(--donut-sel, 0%),
            #e74c3c var(--donut-sel, 0%) 100%
          );
          opacity: 0.85;
        }
        .kpi-donut::after {
          content: '';
          position: absolute;
          inset: 7px;
          background: #fff;
          border-radius: 50%;
        }

        /* ── Barre de filtres ── */
        .filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .search-input {
          padding: 9px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: #0f172a;
          background: #fff;
          outline: none;
          width: 220px;
          transition: border-color 0.2s;
        }
        .search-input::placeholder { color: #94a3b8; }
        .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.08); }
        .filter-group { display: flex; background: #fff; border: 1px solid #e2e8f0; border-radius: 100px; overflow: hidden; }
        .filter-btn {
          padding: 8px 16px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .filter-btn:hover { color: #64748b; background: #ffffff; }
        .filter-btn.active { background: #0f172a; color: #fff; border-radius: 100px; }
        .filter-results { margin-left: auto; font-size: 12px; color: #94a3b8; font-weight: 300; white-space: nowrap; }

        .toggle-mode-btn {
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #3b82f6;
          background: none;
          border: 1px solid #bfdbfe;
          border-radius: 100px;
          padding: 4px 12px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .toggle-mode-btn:hover { background: #eff6ff; border-color: #3b82f6; }
        .impact-label { font-size: 11px; font-weight: 600; text-align: right; white-space: nowrap; }

        /* ── Table ── */
        .history-empty { text-align: center; color: #94a3b8; font-size: 14px; font-weight: 300; padding: 80px 0; }
        .history-table-wrap {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(26,26,26,0.04);
        }
        .history-table { width: 100%; border-collapse: collapse; }
        .history-table th {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
          font-weight: 500;
          padding: 16px 20px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }

        /* Table row with left accent */
        .history-row {
          cursor: pointer;
          transition: background 0.15s ease;
          position: relative;
        }
        .history-row:hover { background: rgba(59,130,246,0.04); }
        .history-row.expanded { background: #eff6ff; }
        .history-row td {
          padding: 16px 20px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          color: #0f172a;
          position: relative;
        }
        /* Left accent bar via first-child ::before */
        .history-row:hover td:first-child::before,
        .history-row.selected-row td:first-child::before {
          content: '';
          position: absolute;
          left: 0; top: 15%; bottom: 15%;
          width: 3px;
          background: #3b82f6;
          border-radius: 0 2px 2px 0;
          opacity: 1;
        }
        .history-row td:first-child::before {
          content: '';
          position: absolute;
          left: 0; top: 15%; bottom: 15%;
          width: 3px;
          background: #3b82f6;
          border-radius: 0 2px 2px 0;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .td-date { color: #64748b; font-size: 12px; }
        .td-time { color: #94a3b8; font-size: 11px; }
        .td-file { font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-score { font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; }
        .td-threshold { color: #94a3b8; font-size: 12px; }
        .td-expand { color: #94a3b8; font-size: 11px; text-align: right; }

        /* Score sparkline */
        .score-cell { display: flex; align-items: center; gap: 8px; }
        .score-spark-wrap {
          position: relative;
          width: 52px;
          height: 5px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: visible;
          flex-shrink: 0;
        }
        .score-spark-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.5s ease;
        }
        .score-spark-threshold {
          position: absolute;
          top: -3px;
          width: 1.5px;
          height: 11px;
          background: #0f172a;
          border-radius: 1px;
          transform: translateX(-50%);
        }

        .model-badge {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 100px;
        }
        .badge-fair { background: #edf7f0; color: #2d7a4f; border: 1px solid #c3e6d0; }
        .badge-std  { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }

        .decision-pill-sm {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
        }

        /* ── Checkbox ── */
        .row-checkbox {
          appearance: none;
          width: 17px; height: 17px;
          border: 1.5px solid #bfdbfe;
          border-radius: 5px;
          background: white;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: all 0.18s ease;
          flex-shrink: 0;
        }
        .row-checkbox:checked {
          background: #3b82f6;
          border-color: #3b82f6;
        }
        .row-checkbox:checked::after {
          content: "✓";
          color: white;
          font-size: 11px;
          line-height: 1;
        }
        .row-checkbox:hover { border-color: #3b82f6; }

        .history-row.selected-row { background: rgba(59,130,246,0.04); }

        /* ── Bouton comparer ── */
        .compare-btn {
          padding: 10px 22px;
          background: #3b82f6;
          border: none;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
          margin-left: 12px;
        }
        .compare-btn:hover {
          background: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(59,130,246,0.3);
        }

        /* ── Detail row ── */
        .history-detail-row td {
          background: #eff6ff;
          padding: 0 20px 16px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .history-features { padding: 4px 0; }
        .history-features-title {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #3b82f6;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .hf-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .hf-name { color: #64748b; }
        .hf-val { font-weight: 600; font-size: 12px; }

        /* ── Modal ── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(26,26,26,0.55);
          backdrop-filter: blur(6px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          animation: overlayIn 0.25s ease;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .modal-panel {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          width: 100%;
          max-width: 920px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 40px;
          box-shadow: 0 40px 100px rgba(0,0,0,0.25);
          animation: modalIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
        .modal-title { font-family: 'DM Serif Display', serif; font-size: 24px; color: #0f172a; letter-spacing: -0.5px; }
        .modal-sub { font-size: 13px; color: #94a3b8; font-weight: 300; margin-top: 4px; }
        .modal-close {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid #e2e8f0;
          background: #fff;
          cursor: pointer;
          font-size: 14px;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .modal-close:hover { background: #fdf0f0; color: #c0392b; border-color: #f0c8c8; }
        .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .compare-card {
          background: #fff;
          border-radius: 16px;
          padding: 28px;
          border: 1.5px solid #e2e8f0;
          transition: box-shadow 0.2s ease;
        }
        .compare-card:hover { box-shadow: 0 8px 32px rgba(26,26,26,0.07); }
        .compare-card.compare-selected { border-color: #c3e6d0; }
        .compare-card.compare-rejected { border-color: #f0c8c8; }
        .compare-filename { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
        .compare-date { font-size: 12px; color: #94a3b8; margin-bottom: 14px; text-align: center; }
        .compare-badges { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; justify-content: center; }
        .compare-score-block { margin-bottom: 20px; text-align: center; }
        .compare-score-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; font-weight: 500; margin-bottom: 6px; }
        .compare-score-val { font-family: 'DM Serif Display', serif; font-size: 40px; color: #0f172a; margin-bottom: 10px; }
        .compare-bar-wrap { position: relative; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: visible; margin-bottom: 6px; }
        .compare-bar-fill { height: 100%; border-radius: 5px; transition: width 0.6s ease; }
        .compare-threshold-mark { position: absolute; top: -4px; width: 2px; height: 18px; background: #0f172a; border-radius: 1px; transform: translateX(-50%); }
        .compare-threshold-label { font-size: 11px; color: #94a3b8; }
        .compare-features { padding-top: 12px; border-top: 1px solid #e2e8f0; margin-top: 4px; }
        .compare-diff-banner {
          grid-column: 1 / -1;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 22px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #64748b;
        }
        .compare-diff-val { font-weight: 700; font-size: 15px; }

        /* ── Splash screen ── */
        .splash-overlay {
          position: fixed;
          inset: 0;
          background: #050b1a;
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
          background: radial-gradient(ellipse 90% 60% at 50% 50%, rgba(59,130,246,0.14) 0%, transparent 70%);
          animation: splashBgPulse 3s ease-in-out infinite;
        }
        .splash-glow {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -58%);
          width: 900px; height: 500px;
          background: radial-gradient(ellipse, rgba(96,165,250,0.07) 0%, transparent 70%);
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
          background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 35%, #93c5fd 50%, #3b82f6 65%, #1d4ed8 100%);
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: splashAurora 4s ease infinite 1.4s;
        }
        .splash-line-wrap { overflow: hidden; margin: 22px 0 26px; }
        .splash-line {
          width: 80px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(96,165,250,0.9), transparent);
          transform: scaleX(0);
          transform-origin: center;
          animation: splashLineIn 0.9s ease-out 1.1s forwards;
        }
        .splash-sub {
          font-size: 10px;
          letter-spacing: 5px;
          text-transform: uppercase;
          color: rgba(96,165,250,0.65);
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

        /* ── Logo aurora ── */
        .logo-aurora {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 30%, #93c5fd 50%, #60a5fa 70%, #3b82f6 100%);
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
        .badge-shimmer { position: relative; overflow: hidden; }
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
          from { opacity: 0; filter: blur(6px); transform: translateY(8px); }
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
          <div
            className="tab-indicator-line"
            style={{ left: tabIndicator.left, width: tabIndicator.width }}
          />
          <button
            ref={tabRef0}
            className={`tab-btn ${activeTab === 0 ? "active" : ""}`}
            onClick={() => setActiveTab(0)}
          >
            <div className="tab-pip" />
            Analyse Standard
          </button>
          <button
            ref={tabRef1}
            className={`tab-btn ${activeTab === 1 ? "active" : ""}`}
            onClick={() => setActiveTab(1)}
          >
            <div className="tab-pip" />
            Analyse Équitable
            <span className="tab-fair-tag">FAIR</span>
          </button>
          <button
            ref={tabRef2}
            className={`tab-btn ${activeTab === 2 ? "active" : ""}`}
            onClick={() => setActiveTab(2)}
          >
            <div className="tab-pip" />
            Dashboard RH
          </button>
        </nav>

        {/* Contenu */}
        {activeTab === 0 && (
          <div className="main tab-bg-0">
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
            <div className="right" key={filename}>
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

        {activeTab === 1 && (
          <div className="main tab-bg-1">
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
            <div className="right" key={filenameFair}>
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
              <>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-label">CVs analysés</div>
                    <div className="kpi-value">{kpiTotal}</div>
                    <div className="kpi-sub">au total</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Sélectionnés</div>
                    <div className="kpi-value val-pos">{kpiSelected}</div>
                    <div className="kpi-sub">{selectRate}% du total</div>
                    <div className="kpi-donut" style={{ "--donut-sel": `${selectRate}%` }} />
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Refusés</div>
                    <div className="kpi-value val-neg">{kpiRejected}</div>
                    <div className="kpi-sub">{100 - selectRate}% du total</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Modèle FAIR</div>
                    <div className="kpi-value">{kpiFair}</div>
                    <div className="kpi-sub">analyse{totalFair !== 1 ? "s" : ""} équitable{totalFair !== 1 ? "s" : ""}</div>
                  </div>
                </div>

                {/* Insight RH */}
                {insightText && (
                  <div className="insight-rh">
                    <span className="insight-icon">💡</span>
                    {insightText}
                  </div>
                )}
              </>
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
                          <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#94a3b8", fontSize: "13px" }}>
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
                              <td>
                                <div className="score-cell">
                                  <span className={`td-score ${isRowSel ? "val-pos" : "val-neg"}`}>
                                    {(row.score * 100).toFixed(1)}%
                                  </span>
                                  <div className="score-spark-wrap">
                                    <div
                                      className={`score-spark-fill ${isRowSel ? "bar-pos" : "bar-neg"}`}
                                      style={{ width: `${Math.min(row.score * 100, 100)}%` }}
                                    />
                                    <div
                                      className="score-spark-threshold"
                                      style={{ left: `${Math.min(row.threshold * 100, 100)}%` }}
                                    />
                                  </div>
                                </div>
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
      </div>

      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
    </>
  )
}
