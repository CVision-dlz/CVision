# CVision

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)
![DigitalOcean](https://img.shields.io/badge/DigitalOcean-0080FF?style=for-the-badge&logo=digitalocean&logoColor=white)

Système automatisé de présélection de CVs basé sur l'IA.

Un CV (fichier `.txt`) est déposé via une interface web, analysé par un LLM (Groq), évalué par un modèle de Machine Learning, et une décision **Sélectionné / Refusé** est retournée en quelques secondes — avec ou sans explication détaillée selon le mode choisi.

---

## Aperçu

![CVision Interface](docs/frontend_example.png)

---

## Architecture globale

```
Frontend (Vercel — React)
    │
    │  POST multipart/form-data (.txt)
    ▼
n8n (webhook orchestrateur)
    │
    ├── POST /process-cv          → Modèle standard (décision seule)
    └── POST /process-cv-fair     → Modèle équitable (décision + explications)
    ▼
FastAPI (DigitalOcean — Docker)
    │
    ├── preprocessor.py   → extraction regex (âge, adresse, skills, langues...)
    ├── analyzer.py       → appel LLM Groq → JSON structuré (formation, expériences)
    ├── json2csv.py       → transformation du JSON en vecteur numérique
    ├── model_strict      → prédiction ML → "✅ Sélectionné" ou "❌ Refusé"
    └── model_FAIR        → prédiction ML équitable + explications log-odds
    │
    │  JSON de résultat
    ▼
Frontend (affichage de la décision et des explications)
```

---

## Structure du projet

```
CVision/
├── .python-version              # Version Python fixée à 3.12
├── .gitignore                   # Exclut .env, données brutes, modèles, venv
├── README.md                    # Cette documentation
│
├── backend/
│   ├── api.py                   # FastAPI — POST /process-cv et POST /process-cv-fair
│   ├── main.py                  # Script batch : traite tous les CVs bruts → cv_dataset.csv
│   ├── requirements.txt         # Dépendances Python
│   ├── .dockerignore            # Exclut notebooks, données brutes, tests du build Docker
│   │
│   ├── config/
│   │   ├── prompt_example.txt   # Exemple de prompt LLM (à copier en prompt.txt)
│   │   └── prompt.txt           # Prompt réel envoyé au LLM (gitignore)
│   │
│   ├── core/                    # Modules métier
│   │   ├── __init__.py
│   │   ├── loader.py            # Chargement et validation des fichiers .txt
│   │   ├── preprocessor.py      # Pré-traitement regex du texte brut du CV
│   │   ├── analyzer.py          # Extraction JSON via LLM (Groq)
│   │   ├── features.py          # Conversion JSON → features numériques (legacy)
│   │   └── json2csv.py          # Compilation des JSON extraits → DataFrame CSV
│   │
│   ├── data/
│   │   ├── raw/                 # CVs bruts au format .txt (gitignore)
│   │   ├── extracted/           # CVs analysés au format .json (gitignore)
│   │   ├── quarantaine/         # CVs en échec de traitement (gitignore)
│   │   ├── cv_dataset.csv       # Dataset final (features + labels)
│   │   └── student_labels.csv   # Labels manuels (passed_next_stage)
│   │
│   ├── docs/                    # Documentation technique
│   │   ├── classification_cv_doc.md       # Méthodologie du modèle de classification
│   │   ├── classification_cv_rapport.docx # Rapport au format Word
│   │   ├── ethique_synthese.md            # Synthèse éthique IA (AI4People + AI Act)
│   │   ├── fairness_audit.md              # Méthodologie de l'audit d'équité
│   │   └── consignes_WP2.md              # Cahier des charges Lot 2
│   │
│   ├── models/
│   │   ├── model_classification_cv_strict.joblib  # Modèle standard (gitignore)
│   │   └── model_classification_cv_FAIR.joblib    # Modèle équitable post-audit (gitignore)
│   │
│   ├── notebooks/
│   │   ├── classification_cv_FINAL_500_a.ipynb  # Modèle final (LR L1, 500 CVs, TF-IDF)
│   │   └── fairness_audit_comp.ipynb            # Audit d'équité complet + modèle FAIR
│   │
│   └── tests/
│       ├── test_analyser.py     # Tests unitaires : Groq, retry, parsing JSON
│       ├── test_features.py     # Tests unitaires : cv_to_features
│       ├── test_geo.py          # Tests : géocodage et calcul de distance
│       ├── test_json2csv.py     # Tests : compilation JSON → CSV
│       ├── test_loader.py       # Tests : validation des fichiers .txt
│       └── test_prepocessor.py  # Tests : extraction regex du texte
│
├── docs/
│   └── frontend_example.png    # Capture d'écran de l'interface
│
├── frontend/                   # Interface React + Vite (déployée sur Vercel)
│   ├── src/
│   │   ├── App.jsx             # Application principale (2 onglets : Standard & FAIR)
│   │   └── main.jsx            # Point d'entrée React
│   ├── package.json            # Dépendances (React 19, Vite 8)
│   └── index.html
│
└── infra/
    ├── Dockerfile              # Image Python 3.12-slim, port 8000
    └── docker-compose.yml      # Service API, volumes data/models, network
```

---

## Installation & lancement

### Prérequis

- Python 3.12
- Une clé API [Groq](https://console.groq.com) (gratuite)
- Docker (pour le déploiement)

### 1. Cloner le projet

```bash
git clone https://github.com/CVision-dlz/CVision.git
cd CVision
```

### 2. Créer l'environnement virtuel

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate
```

### 3. Installer les dépendances

```bash
pip install -r backend/requirements.txt
```

### 4. Configurer les variables d'environnement

Crée un fichier `backend/.env` :

```env
GROQ_API_KEY=ta_clé_groq_ici
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TEMPERATURE=0.0
```

Crée ensuite le fichier prompt à partir de l'exemple :

```bash
cp backend/config/prompt_example.txt backend/config/prompt.txt
# Édite backend/config/prompt.txt avec ton prompt RH
```

### 5. Lancer l'API

```bash
cd backend
uvicorn api:app --reload
```

L'API est accessible sur `http://localhost:8000`.

---

## Utilisation de l'API

### Endpoint standard — `POST /process-cv`

Analyse un CV et retourne une décision de présélection.

```bash
curl -X POST "http://localhost:8000/process-cv" \
     -F "file=@cv.txt"
```

**Réponse :**

```json
{
  "target_role": "Senior Data Analyst",
  "age": 35,
  "distance_ville_haute_km": 12.4,
  "education": {
    "degree": "Master of Science",
    "field": "Data Science",
    "school": "UCLouvain",
    "education_score": 4
  },
  "experiences": [...],
  "total_experience_years": 3.2,
  "skills": ["Python", "SQL", "Tableau"],
  "languages": [{"language": "French", "level": "C2", "score": 6}],
  "certifications": [{"name": "AWS Data Analytics", "year": 2022}],
  "decision": "✅ Sélectionné",
  "probability": 0.742,
  "threshold_used": 0.635
}
```

---

### Endpoint équitable — `POST /process-cv-fair`

Même analyse mais avec le modèle FAIR (sans features discriminatoires) et les explications détaillées de la décision.

```bash
curl -X POST "http://localhost:8000/process-cv-fair" \
     -F "file=@cv.txt"
```

**Réponse (champs supplémentaires) :**

```json
{
  "decision": "❌ Refusé",
  "probability": 0.231,
  "threshold_used": 0.635,
  "log_odds": -1.204,
  "explanations": [
    {
      "feature": "education_score",
      "contribution": -0.712,
      "direction": "défavorable"
    },
    {
      "feature": "total_experience_years",
      "contribution": 0.314,
      "direction": "favorable"
    }
  ]
}
```

Le champ `explanations` contient le **top 10 des features** triées par contribution absolue, avec leur direction (favorable / défavorable). Ces contributions sont calculées via la décomposition log-odds (`coef_i × x_i`).

---

## Interface utilisateur

L'interface React propose **deux onglets** :

### Onglet 1 — Analyse Standard

- Upload par glisser-déposer ou clic
- Affiche : décision, âge, expérience, poste visé, diplôme, compétences, langues
- Utilise le modèle `model_classification_cv_strict.joblib`

### Onglet 2 — Analyse Équitable (FAIR)

- Même interface d'upload
- Affiche en plus :
  - **Résumé textuel auto-généré** — "Ce candidat est refusé. Principaux freins : Ratio de gaps d'emploi et Prestige de l'école."
  - **Jauge de seuil** — visualise où le candidat se situe par rapport au seuil de décision
  - **Score log-odds** — score brut du modèle
  - **Barres de contribution catégorisées** — contributions groupées par Formation / Expérience / Compétences / Langues
- Utilise le modèle `model_classification_cv_FAIR.joblib`

---

## Pipeline de données (main.py)

Le script `main.py` permet de traiter un lot de CVs bruts pour constituer le dataset d'entraînement.

```bash
cd backend
python main.py
```

**Ce qu'il fait, étape par étape :**

1. Charge tous les fichiers `.txt` depuis `data/raw/`
2. Pour chaque CV :
   - `pre_process_cv()` → extraction regex (âge, adresse, skills, langues, certifications)
   - `clean_cv_text_for_llm()` → filtre le texte pour n'envoyer que l'essentiel au LLM
   - `extract_cv()` → appel Groq → JSON structuré (formation, expériences)
   - `compute_experience_metrics()` → calcul durée totale + gaps
   - Sauvegarde le JSON final dans `data/extracted/`
   - Si erreur → CV déplacé dans `data/quarantaine/`
3. `json2csv()` → compile tous les JSON en un seul DataFrame
4. Fusion avec `student_labels.csv` (labels manuels `passed_next_stage`)
5. Sauvegarde du dataset final dans `data/cv_dataset.csv`

> **Point de reprise** : la variable `RESUME_FROM` dans `main.py` permet de reprendre
> le traitement à partir d'un CV précis sans tout retraiter depuis le début.

---

## Modules core

### `loader.py`

| Fonction | Rôle |
|---|---|
| `load_cv(filepath)` | Charge un fichier `.txt`, vérifie qu'il existe, qu'il est bien au format `.txt` et non vide |
| `load_cvs_from_folder(folder_path)` | Charge tous les `.txt` d'un dossier, retourne un `dict {nom_fichier: contenu}` |

---

### `preprocessor.py`

Extraction **par regex** des informations directement lisibles dans le texte brut du CV.

| Fonction | Rôle |
|---|---|
| `pre_process_cv(cv_text)` | Point d'entrée principal — retourne un dict avec âge, distance, skills, langues, certifications |
| `compute_age(dob)` | Calcule l'âge exact à partir de la date de naissance |
| `compute_distance_km(address)` | Géocode l'adresse et calcule la distance en km jusqu'à Luxembourg |
| `extract_skills(section_text)` | Extrait la liste des compétences depuis la section `Skills` |
| `extract_languages(section_text)` | Extrait les langues et leur niveau CECRL (A1→C2), convertit en score 1-6 |
| `extract_certifications(section_text)` | Extrait les certifications et leur année |
| `score_education(degree)` | Attribue un score 1-5 au diplôme (PhD=5, Master=4, Bachelor=3, BTS=2, Bac=1) |
| `clean_cv_text_for_llm(cv_text)` | Filtre le texte pour ne garder que `Education` et `Experience` |
| `compute_experience_metrics(experiences)` | Calcule la durée totale d'expérience et identifie les gaps |

**Score de niveau de langue (CECRL) :**

| Niveau | Score |
|--------|-------|
| A1 | 1 |
| A2 | 2 |
| B1 | 3 |
| B2 | 4 |
| C1 | 5 |
| C2 | 6 |

---

### `analyzer.py`

Extraction **par LLM** (Groq) des informations complexes nécessitant de la compréhension.

| Fonction | Rôle |
|---|---|
| `extract_cv(cv_text)` | Envoie le texte au LLM Groq et retourne un dict JSON structuré |
| `_get_groq_config()` | Lit `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TEMPERATURE` depuis les variables d'environnement |

**Mécanisme de retry :**
- `MAX_RETRIES = 2` — réessaie en cas de JSON invalide ou d'erreur réseau
- `RETRY_DELAY_SEC = 3` — délai entre chaque tentative
- `SKIP_ON_FAILURE = False` — en cas d'échec, propage l'exception (CV mis en quarantaine)

**Variables d'environnement :**

| Variable | Défaut | Description |
|---|---|---|
| `GROQ_API_KEY` | — | Obligatoire. Clé API Groq |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Modèle Groq à utiliser |
| `GROQ_TEMPERATURE` | `0.0` | Température du LLM (0 = déterministe) |

---

### `json2csv.py`

Compile tous les fichiers JSON de `data/extracted/` en un seul DataFrame pandas prêt pour le ML.

**Colonnes de langues gérées :** `lang_fr`, `lang_en`, `lang_de`, `lang_es`, `lang_it`, `lang_other_score_sum`

---

### `features.py`

Convertit un CV JSON en vecteur numérique simplifié (utilisé en legacy — l'API utilise directement `json2csv.py` + feature engineering inline).

---

### `api.py`

API FastAPI exposant deux endpoints.

**`POST /process-cv`** — Modèle standard
- Charge `model_classification_cv_strict.joblib` au démarrage
- Retourne : décision, probabilité, seuil, features calculées

**`POST /process-cv-fair`** — Modèle équitable
- Charge `model_classification_cv_FAIR.joblib` au démarrage
- Retourne en plus : `log_odds`, `explanations` (top 10 contributions log-odds par feature)
- Les contributions sont calculées via `coef_i × x_i` sur les features transformées

**CORS :** `allow_origins=["*"]` — accepte toutes les origines

---

## Modèle ML

### Dataset

- **500 CVs**, 21 colonnes
- Variable cible : `passed_next_stage` (0 = Refusé, 1 = Sélectionné)
- Déséquilibre : ~80% refusés / ~20% sélectionnés → traité par `class_weight='balanced'`

### Modèle final (`classification_cv_FINAL_500_a.ipynb`)

- **Algorithme** : Logistic Regression L1 (Lasso) avec `LogisticRegressionCV`
- **Features** : âge, distance, expérience, gaps, scores de langues, TF-IDF skills/certifications, score école
- **Feature engineering** : `avg_gap_duration`, `gap_ratio`, `skills_count`, `certif_count`, `has_certif`
- **Pipeline** : `ColumnTransformer` (StandardScaler + OneHotEncoder + TfidfVectorizer) → LogisticRegression
- **Seuil** : optimisé sur métrique F0.5 (favorise la précision sur le rappel)
- **Validation** : cross-validation stratifiée 5-folds

| Métrique | Valeur |
|---|---|
| ROC-AUC | 0.706 |
| Précision (Sélectionné) | 0.41 |
| Rappel (Sélectionné) | 0.70 |
| Accuracy | 74% |

---

## Audit d'Équité (`fairness_audit_comp.ipynb`)

Audit complet réalisé avant déploiement, conformément à l'**AI Act (Annexe III — systèmes à haut risque)**.

### Attributs sensibles analysés

| Attribut | Risque identifié | Base légale |
|---|---|---|
| `age` | Discrimination directe par âge | Directive 2000/78/CE |
| `distance_ville_haute_km` | Proxy géographique / d'origine | RGPD Art. 9 |
| `lang_de`, `lang_es`, `lang_it` | Proxy de nationalité (coefficients L1 actifs) | Directive 2000/43/CE |
| `education_degree` | Discrimination socioéconomique indirecte | AI Act Annexe III |
| `education_score` | Biais de prestige des institutions | AI Act Art. 10 |

### Métriques d'équité calculées (out-of-sample)

| Métrique | Seuil d'alerte | Description |
|---|---|---|
| **Equal Opportunity Difference (EOD)** | > 0.10 | Écart de TPR entre groupes — métrique principale |
| **Demographic Parity Difference (DP)** | > 0.10 | Écart brut de taux de sélection |
| **Disparate Impact Ratio (DI)** | < 0.80 | Règle des 80% (jurisprudence EU) |

> L'EOD est retenue comme métrique principale car les base rates diffèrent légitimement entre groupes (les Juniors ont 10,5% de taux réel de qualification vs 29,1% pour les Seniors).

### Résultats — Modèle FAIR

Features supprimées : `age`, `distance_ville_haute_km`, `lang_de`, `lang_es`, `lang_it`, `lang_other_score_sum`

| Métrique | Modèle standard | Modèle FAIR |
|---|---|---|
| ROC-AUC | 0.706 | 0.687 |
| Accuracy | 74% | 75% |
| Rappel (Sélectionné) | 0.70 | 0.55 |

Le trade-off −0.02 ROC-AUC est accepté en échange de la suppression des proxies discriminatoires.

### Explicabilité individuelle

Chaque décision du modèle FAIR est accompagnée des contributions log-odds par feature, conformément à l'**Art. 14 AI Act** (supervision humaine). Le recruteur peut voir exactement quels critères ont influencé la décision.

---

## Tests

```bash
cd backend
python -m pytest tests/
```

| Fichier | Ce qui est testé |
|---|---|
| `test_analyser.py` | Appel Groq, retry sur JSON invalide, retry sur erreur réseau, strip des balises markdown |
| `test_features.py` | Conversion JSON → features numériques |
| `test_geo.py` | Géocodage et calcul de distance |
| `test_json2csv.py` | Compilation JSON → DataFrame |
| `test_loader.py` | Validation des fichiers : inexistant, mauvais format, vide |
| `test_prepocessor.py` | Extraction regex : âge, langues, certifications, gaps |

---

## Format d'un CV brut (.txt)

```
Name: Prénom Nom
Gender: Male/Female
Date of Birth: YYYY-MM-DD
Address: Rue, Ville, Pays
Email: email@exemple.com
Phone: +32 ...
Target Role: Data Scientist

Professional Summary:
...

Education:
...

Experience:
...

Skills:
Python, SQL, Docker, ...

Languages:
French — C2
English — B2

Certifications:
AWS Certified Developer — 2023
```

---

## Déploiement Docker

```bash
cd infra
docker compose up --build -d
```

L'API sera disponible sur le port `8000`.

**Volumes montés :**
- `backend/data` → `/app/data`
- `backend/models` → `/app/models`

> Les modèles `.joblib` sont dans `.gitignore` et doivent être copiés manuellement sur le serveur via `scp`.

```bash
scp backend/models/model_classification_cv_FAIR.joblib user@server:~/CVision/backend/models/
scp backend/models/model_classification_cv_strict.joblib user@server:~/CVision/backend/models/
```

---

## Équipe

Projet réalisé dans le cadre du cours : **Projet Global en Intelligence Artificielle** — HELMo Bloc 2 Q2
