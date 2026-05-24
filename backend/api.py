import os
from pathlib import Path
from typing import Any, Dict, List

import httpx
import joblib
import numpy as np
import pandas as pd
import scipy.sparse as sp
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from core.analyzer import extract_cv
from core.json2csv import (
    MAPPINGS,
    process_single_cv,
    REVERSE_MAPPING,
    BASE_LANG_DICT
)
from core.preprocessor import (
    clean_cv_text_for_llm,
    compute_experience_metrics,
    pre_process_cv,
    score_education,
)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Constantes et chemins
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "model_classification_cv_strict.joblib"
FAIR_MODEL_PATH = BASE_DIR / "models" / "model_classification_cv_FAIR.joblib"

# Initialisation de l'application
app = FastAPI(title="CVision API", version="1.0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chargement du modèle standard au démarrage
try:
    model_data = joblib.load(MODEL_PATH)
    MODEL_PIPELINE = model_data["pipeline"]
    BEST_THRESHOLD = model_data["optimal_threshold"]
except FileNotFoundError:
    raise RuntimeError(f"Le fichier modèle est introuvable au chemin : {MODEL_PATH}")
except KeyError as e:
    raise RuntimeError(f"Structure du dictionnaire modèle invalide. Clé manquante : {e}")

# Chargement du modèle FAIR au démarrage
try:
    fair_model_data = joblib.load(FAIR_MODEL_PATH)
    FAIR_PIPELINE = fair_model_data["pipeline"]
    FAIR_THRESHOLD = fair_model_data["optimal_threshold"]
except FileNotFoundError:
    raise RuntimeError(f"Le fichier modèle FAIR est introuvable au chemin : {FAIR_MODEL_PATH}")
except KeyError as e:
    raise RuntimeError(f"Structure du dictionnaire modèle FAIR invalide. Clé manquante : {e}")


async def _log_decision(filename: str, model: str, decision: str, score: float, threshold: float, top_features=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/cv_decisions",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json={
                    "filename": filename,
                    "model": model,
                    "decision": decision,
                    "score": round(score, 4),
                    "threshold": round(threshold, 4),
                    "top_features": top_features,
                },
                timeout=5.0,
            )
            print(f"[Supabase log] status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        print(f"[Supabase log] ERREUR: {e}")


def apply_feature_engineering(cv_data: Dict[str, Any]) -> pd.DataFrame:
    """
    Transforme le dictionnaire brut du CV en un DataFrame et
    calcule les variables dérivées nécessaires au modèle.
    """
    flat_row_dict = process_single_cv(
        cv_data,
        REVERSE_MAPPING,
        BASE_LANG_DICT
    )
    df = pd.DataFrame([flat_row_dict])

    # Typage des colonnes entières
    cols_to_int = list(MAPPINGS.keys()) + ["lang_other_score_sum", "total_gap_months", "nb_gaps"]
    df[cols_to_int] = df[cols_to_int].fillna(0).astype(int)

    # Variables dérivées (ratios et comptages)
    df["avg_gap_duration"] = df["total_gap_months"] / (df["nb_gaps"] + 1)
    df["gap_ratio"] = df["total_gap_months"] / (
            df["total_experience_years"] * 12 + df["total_gap_months"] + 1
    )

    df["skills_count"] = df["skills"].fillna("").apply(
        lambda x: sum(1 for s in x.split(",") if s.strip())
    )
    df["certif_count"] = df["certifications"].fillna("").apply(
        lambda x: sum(1 for c in x.split(",") if c.strip())
    )
    df["has_certif"] = (df["certif_count"] > 0).astype(int)

    # Normalisation du texte (minuscules, suppression de la ponctuation sauf virgules)
    for col in ["skills", "certifications"]:
        if col in df.columns:
            df[col] = df[col].fillna("").str.lower().str.replace(r"[^\w\s,]", "", regex=True)

    return df


def predict(df_features: pd.DataFrame) -> Dict[str, Any]:
    """
    Évalue les features via le modèle et renvoie la décision finale
    en appliquant le seuil optimisé.
    """
    proba = MODEL_PIPELINE.predict_proba(df_features)[:, 1][0]
    prediction_label = "✅ Sélectionné" if proba >= BEST_THRESHOLD else "❌ Refusé"

    return {
        "decision": prediction_label,
        "probability": float(proba),
        "threshold_used": float(BEST_THRESHOLD),
    }


def _clean_feature_name(name: str) -> str:
    """Retire les préfixes du ColumnTransformer (ex: 'standardscaler__age' → 'age')."""
    parts = name.split("__")
    return parts[-1] if len(parts) > 1 else name


def predict_fair_with_explanation(df_features: pd.DataFrame) -> Dict[str, Any]:
    """
    Évalue via le modèle FAIR et retourne la décision + les contributions log-odds
    de chaque feature (explication transparente de la décision).
    """
    proba = FAIR_PIPELINE.predict_proba(df_features)[:, 1][0]
    prediction_label = "✅ Sélectionné" if proba >= FAIR_THRESHOLD else "❌ Refusé"

    # Transformation des données à travers tous les steps sauf le classifieur
    X = df_features
    last_transformer = None
    for _, step in FAIR_PIPELINE.steps[:-1]:
        X = step.transform(X)
        last_transformer = step

    # Coefficients du classifieur logistique
    clf = FAIR_PIPELINE.steps[-1][1]
    coefs = clf.coef_[0]

    # Conversion en tableau dense si la matrice est sparse
    if sp.issparse(X):
        X_arr = X.toarray()[0]
    else:
        X_arr = np.asarray(X).flatten()

    # Contributions log-odds : coef_i × x_i
    contributions = (X_arr * coefs).astype(float)

    # Récupération et nettoyage des noms de features
    try:
        raw_names = last_transformer.get_feature_names_out()
        feature_names = [_clean_feature_name(str(n)) for n in raw_names]
    except Exception:
        feature_names = [f"feature_{i}" for i in range(len(coefs))]

    # Top 10 features par contribution absolue (en excluant les contributions nulles)
    nonzero_idx = np.where(np.abs(contributions) > 1e-4)[0]
    top_idx = nonzero_idx[np.argsort(np.abs(contributions[nonzero_idx]))[::-1]][:10]

    explanations: List[Dict[str, Any]] = [
        {
            "feature": feature_names[i],
            "contribution": round(float(contributions[i]), 4),
            "direction": "favorable" if contributions[i] > 0 else "défavorable",
        }
        for i in top_idx
    ]

    log_odds = float(np.log(proba / (1 - proba))) if 0 < proba < 1 else 0.0

    return {
        "decision": prediction_label,
        "probability": float(proba),
        "threshold_used": float(FAIR_THRESHOLD),
        "log_odds": round(log_odds, 4),
        "explanations": explanations,
    }


@app.post("/process-cv")
async def process_cv(file: UploadFile = File(...)):
    """
    Endpoint principal pour traiter un fichier CV.
    Lit le fichier, extrait le texte, génère les features et renvoie la prédiction.
    """
    try:
        cv_text = (await file.read()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Impossible de lire le fichier. Assurez-vous qu'il est encodé en UTF-8."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 1. Extraction et structuration (LLM + Pre-processing)
    pre_data = pre_process_cv(cv_text)
    optimized_cv_text = clean_cv_text_for_llm(cv_text)
    llm_data = extract_cv(optimized_cv_text)

    # 2. Nettoyage et complétion des métriques
    exp_metrics = compute_experience_metrics(llm_data.get("experiences", []))
    education_data = llm_data.get("education", {})

    if education_data:
        education_data.update({
            "graduation_year": pre_data.get("graduation_year"),
            "years_since_graduation": pre_data.get("years_since_graduation"),
            "education_score": score_education(education_data.get("degree")),
        })

    # 3. Assemblage du dictionnaire complet
    cv_id = "api_input"

    result = {
        "meta": {
            "cv_id": cv_id,
        },
        "age": pre_data.get("age"),
        "distance_ville_haute_km": pre_data.get("distance_ville_haute_km"),
        "target_role": pre_data.get("target_role"),
        "education": education_data,
        "experiences": exp_metrics["experiences"],
        "total_experience_years": exp_metrics["total_experience_years"],
        "experience_gaps_months": exp_metrics["experience_gaps_months"],
        "skills": pre_data.get("skills"),
        "languages": pre_data.get("languages"),
        "certifications": pre_data.get("certifications"),
    }

    # 4. Feature Engineering et Prédiction
    df_features = apply_feature_engineering(result)
    prediction_results = predict(df_features)

    # 5. Log Supabase
    await _log_decision(
        filename=file.filename or "inconnu",
        model="standard",
        decision=prediction_results["decision"],
        score=prediction_results["probability"],
        threshold=prediction_results["threshold_used"],
    )

    # 6. Enrichissement de la réponse JSON
    result.update(prediction_results)
    result["computed_features"] = df_features.to_dict(orient="records")[0]

    return result


@app.post("/process-cv-fair")
async def process_cv_fair(file: UploadFile = File(...)):
    """
    Endpoint Fair Model : utilise le modèle équitable (sans features discriminatoires)
    et retourne les explications détaillées de chaque décision.
    """
    try:
        cv_text = (await file.read()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Impossible de lire le fichier. Assurez-vous qu'il est encodé en UTF-8."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 1. Extraction et structuration (LLM + Pre-processing)
    pre_data = pre_process_cv(cv_text)
    optimized_cv_text = clean_cv_text_for_llm(cv_text)
    llm_data = extract_cv(optimized_cv_text)

    # 2. Nettoyage et complétion des métriques
    exp_metrics = compute_experience_metrics(llm_data.get("experiences", []))
    education_data = llm_data.get("education", {})

    if education_data:
        education_data.update({
            "graduation_year": pre_data.get("graduation_year"),
            "years_since_graduation": pre_data.get("years_since_graduation"),
            "education_score": score_education(education_data.get("degree")),
        })

    # 3. Assemblage du dictionnaire complet
    result = {
        "meta": {"cv_id": "api_input"},
        "age": pre_data.get("age"),
        "distance_ville_haute_km": pre_data.get("distance_ville_haute_km"),
        "target_role": pre_data.get("target_role"),
        "education": education_data,
        "experiences": exp_metrics["experiences"],
        "total_experience_years": exp_metrics["total_experience_years"],
        "experience_gaps_months": exp_metrics["experience_gaps_months"],
        "skills": pre_data.get("skills"),
        "languages": pre_data.get("languages"),
        "certifications": pre_data.get("certifications"),
    }

    # 4. Feature Engineering et Prédiction avec explications
    df_features = apply_feature_engineering(result)
    prediction_results = predict_fair_with_explanation(df_features)

    # 5. Log Supabase
    await _log_decision(
        filename=file.filename or "inconnu",
        model="fair",
        decision=prediction_results["decision"],
        score=prediction_results["probability"],
        threshold=prediction_results["threshold_used"],
        top_features=prediction_results.get("explanations", [])[:5],
    )

    # 6. Enrichissement de la réponse JSON
    result.update(prediction_results)
    result["computed_features"] = df_features.to_dict(orient="records")[0]

    return result
