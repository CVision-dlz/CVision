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
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="cat-group">
          <div className="cat-label">{cat}</div>
          {items.map((e, i) => {
            const pct = maxAbs > 0 ? (Math.abs(e.contribution) / maxAbs) * 100 : 0
            const pos = e.direction === "favorable"
            return (
              <div key={i} className="expl-row">
                <div className="expl-name" title={e.feature}>{getLabel(e.feature)}</div>
                <div className="expl-bar-wrap">
                  <div className={`expl-bar ${pos ? "bar-pos" : "bar-neg"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className={`expl-val ${pos ? "val-pos" : "val-neg"}`}>
                  {e.contribution > 0 ? "+" : ""}{e.contribution.toFixed(3)}
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

// ─── Dropzone réutilisable ──────────────────────────────────────────────────
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
      <h1 className="headline">
        {headline}<br /><em>{headlineEm}</em>
      </h1>
      <p className="desc">{desc}</p>

      <div
        className={`dropzone ${dragging ? "active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])}
        />
        {loading ? (
          <>
            <div className="spinner" />
            <div className="dropzone-title">Analyse en cours…</div>
            <div className="dropzone-sub">{filename}</div>
          </>
        ) : (
          <>
            <span className="dropzone-icon">📄</span>
            <div className="dropzone-title">Déposez votre CV ici</div>
            <div className="dropzone-sub">ou cliquez pour sélectionner un fichier .txt</div>
          </>
        )}
      </div>
    </>
  )
}

// ─── App principale ─────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState(0)

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

        .dropzone {
          border: 1.5px dashed #d4c4b0;
          border-radius: 14px;
          padding: 44px 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fff;
        }

        .dropzone:hover, .dropzone.active {
          border-color: #8b6f47;
          background: #fdf9f4;
        }

        .dropzone-icon {
          font-size: 36px;
          margin-bottom: 14px;
          display: block;
        }

        .dropzone-title {
          font-family: 'DM Serif Display', serif;
          font-size: 17px;
          color: #1a1a1a;
          margin-bottom: 6px;
        }

        .dropzone-sub {
          font-size: 13px;
          color: #a09890;
          font-weight: 300;
        }

        .spinner {
          width: 28px;
          height: 28px;
          border: 2px solid #e2ddd8;
          border-top-color: #8b6f47;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 14px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

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
      `}</style>

      <div className="page">
        {/* Header */}
        <header className="header">
          <div className="logo">CV<span>ision</span></div>
          <div className="badge">Screening IA</div>
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
            Historique
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
            <div className="history-header">
              <div>
                <div className="history-title">Historique des décisions</div>
                <div className="history-sub">{history.length} décision{history.length !== 1 ? "s" : ""} enregistrée{history.length !== 1 ? "s" : ""}</div>
              </div>
              <button className="refresh-btn" onClick={fetchHistory} disabled={historyLoading}>
                {historyLoading ? "Chargement…" : "↻ Actualiser"}
              </button>
            </div>

            {historyLoading && history.length === 0 ? (
              <div className="history-empty">Chargement…</div>
            ) : history.length === 0 ? (
              <div className="history-empty">Aucune décision enregistrée pour l'instant.</div>
            ) : (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
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
                    {history.map((row) => {
                      const isSelected = row.decision?.includes("Sélectionné") || row.decision === "Inviter"
                      const date = new Date(row.created_at)
                      const dateStr = date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" })
                      const timeStr = date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
                      const isExpanded = expandedRow === row.id
                      return (
                        <>
                          <tr key={row.id} className={`history-row ${isExpanded ? "expanded" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                            <td className="td-date">{dateStr}<br /><span className="td-time">{timeStr}</span></td>
                            <td className="td-file">{row.filename}</td>
                            <td>
                              <span className={`model-badge ${row.model === "fair" ? "badge-fair" : "badge-std"}`}>
                                {row.model === "fair" ? "FAIR" : "Standard"}
                              </span>
                            </td>
                            <td>
                              <span className={`decision-pill-sm ${isSelected ? "invite" : "reject"}`}>
                                <span className="dot" />
                                {isSelected ? "Sélectionné" : "Refusé"}
                              </span>
                            </td>
                            <td className={`td-score ${isSelected ? "val-pos" : "val-neg"}`}>
                              {(row.score * 100).toFixed(1)}%
                            </td>
                            <td className="td-threshold">{(row.threshold * 100).toFixed(1)}%</td>
                            <td className="td-expand">{isExpanded ? "▲" : "▼"}</td>
                          </tr>
                          {isExpanded && row.top_features?.length > 0 && (
                            <tr key={row.id + "-detail"} className="history-detail-row">
                              <td colSpan={7}>
                                <div className="history-features">
                                  <div className="history-features-title">Top contributions (modèle FAIR)</div>
                                  {row.top_features.map((f, i) => (
                                    <div key={i} className="hf-row">
                                      <span className="hf-name">{getLabel(f.feature)}</span>
                                      <span className={`hf-val ${f.direction === "favorable" ? "val-pos" : "val-neg"}`}>
                                        {f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(3)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
    </>
  )
}
