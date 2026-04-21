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

Un CV (fichier `.txt`) est déposé via une interface web, analysé par un LLM (Groq), évalué par un modèle de Machine Learning, et une décision **Inviter / Rejeter** est retournée en quelques secondes.

---

## Aperçu

![CVision Interface](docs/frontend_example.png)

---

## Architecture globale

```
Frontend (Vercel)
    │
    │  POST multipart/form-data (.txt)
    ▼
n8n (webhook orchestrateur)
    │
    │  POST /process-cv
    ▼
FastAPI (DigitalOcean)
    │
    ├── loader.py        → validation du fichier (.txt, non vide)
    ├── preprocessor.py  → extraction regex (âge, adresse, skills, langues...)
    ├── analyzer.py      → appel LLM Groq → JSON structuré (formation, expériences)
    ├── features.py      → transformation du JSON en vecteur numérique
    └── model.joblib     → prédiction ML → "Inviter" ou "Rejeter"
    │
    │  JSON de résultat
    ▼
Frontend (affichage de la décision)
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
│   ├── api.py                   # Point d'entrée FastAPI (route POST /process-cv)
│   ├── main.py                  # Script batch : traite tous les CVs bruts → cv_dataset.csv
│   ├── requirements.txt         # Dépendances Python
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
│   │   ├── features.py          # Conversion JSON → features numériques pour le ML
│   │   └── json2csv.py          # Compilation des JSON extraits → DataFrame CSV
│   │
│   ├── data/
│   │   ├── raw/                 # CVs bruts au format .txt (gitignore)
│   │   ├── extracted/           # CVs analysés au format .json (gitignore)
│   │   ├── quarantaine/         # CVs en échec de traitement (gitignore)
│   │   ├── cv_dataset.csv       # Dataset final (features + labels)
│   │   └── student_labels.csv   # Labels manuels (passed_next_stage)
│   │
│   ├── models/
│   │   ├── model_classification_cv_cool.joblib  # Modèle final sérialisé (gitignore)
│   │   └── model_classification_cv_FAIR.joblib  # Modèle équitable post-audit (gitignore)
│   │
│   ├── notebooks/
│   │   ├── exploration_donnees.ipynb           # EDA du dataset
│   │   ├── classification_cv_V1.ipynb          # Baseline : 4 modèles, SMOTE
│   │   ├── classification_cv_V2.ipynb          # LR L1 + seuil F0.5
│   │   ├── classification_cv_FINAL_500_a.ipynb # Modèle final (LR L1, 500 CVs, TF-IDF)
│   │   ├── classification_cv_FINAL_500_b.ipynb # Variante du modèle final
│   │   └── fairness_audit.ipynb                # Audit d'équité + modèle corrigé
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
│   └── frontend_example.png     # Capture d'écran de l'interface
│
└── frontend_example/            # Exemple d'interface React
```

---

## Installation & lancement

### Prérequis

- Python 3.12
- Une clé API [Groq](https://console.groq.com) (gratuite)
- Docker (optionnel, pour le déploiement)

### 1. Cloner le projet

```bash
git clone https://github.com/dlz-dev/CVision.git
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
GROQ_MODEL=llama3-70b-8192
GROQ_TEMPERATURE=0.0
FRONTEND_URL=http://localhost:5173
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

### Envoyer un CV

```bash
curl -X POST "http://localhost:8000/process-cv" \
     -F "file=@cv.txt"
```

### Réponse

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
  "experiences": [
    {
      "title": "Data Analyst",
      "company": "BNP Paribas",
      "start": "2021-03",
      "end": "Present",
      "duration_months": 38
    }
  ],
  "total_experience_years": 3.2,
  "experience_gaps_months": [],
  "skills": ["Python", "SQL", "Tableau"],
  "languages": [{"language": "French", "level": "C2", "score": 6}],
  "certifications": [{"name": "AWS Data Analytics", "year": 2022}],
  "decision": "Inviter"
}
```

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

Charge et valide les fichiers texte.

| Fonction | Rôle |
|---|---|
| `load_cv(filepath)` | Charge un fichier `.txt`, vérifie qu'il existe, qu'il est bien au format `.txt` et non vide |
| `load_cvs_from_folder(folder_path)` | Charge tous les `.txt` d'un dossier, retourne un `dict {nom_fichier: contenu}` |

---

### `preprocessor.py`

Extraction **par regex** des informations directement lisibles dans le texte brut du CV.
Ne fait pas appel au LLM — plus rapide et déterministe.

| Fonction | Rôle |
|---|---|
| `pre_process_cv(cv_text)` | Point d'entrée principal, retourne un dict avec âge, distance, skills, langues, certifications |
| `_split_sections(cv_text)` | Découpe le CV en sections (`Education`, `Skills`, `Languages`...) par regex |
| `compute_age(dob)` | Calcule l'âge exact à partir de la date de naissance |
| `compute_distance_km(address)` | Géocode l'adresse et calcule la distance en km jusqu'à Luxembourg (Nominatim) |
| `extract_skills(section_text)` | Extrait la liste des compétences depuis la section `Skills` |
| `extract_languages(section_text)` | Extrait les langues et leur niveau CECRL (A1→C2), convertit en score numérique 1-6 |
| `extract_certifications(section_text)` | Extrait les certifications et leur année |
| `score_education(degree)` | Attribue un score 1-5 au diplôme (PhD=5, Master=4, Bachelor=3, BTS=2, Bac=1) |
| `clean_cv_text_for_llm(cv_text)` | Filtre le texte pour ne garder que `Education` et `Experience` avant envoi au LLM |
| `compute_experience_metrics(experiences)` | Calcule la durée totale d'expérience et identifie les gaps entre postes |

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

Extraction **par LLM** (Groq) des informations complexes nécessitant de la compréhension (formation, expériences détaillées).

| Fonction | Rôle |
|---|---|
| `extract_cv(cv_text)` | Envoie le texte au LLM Groq et retourne un dict JSON structuré |
| `_get_groq_config()` | Lit `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TEMPERATURE` depuis les variables d'environnement |

**Mécanisme de retry :**
- Si le LLM renvoie un JSON invalide ou si une erreur réseau survient, le module réessaie automatiquement
- `MAX_RETRIES = 99999` — réessaie jusqu'à obtenir une réponse valide
- `RETRY_DELAY_SEC = 3` — délai entre chaque tentative
- `SKIP_ON_FAILURE = False` — en cas d'échec total, propage l'exception (le CV est mis en quarantaine par `main.py`)

**Variables d'environnement :**

| Variable | Défaut | Description |
|---|---|---|
| `GROQ_API_KEY` | — | Obligatoire. Clé API Groq |
| `GROQ_MODEL` | `llama3-70b-8192` | Modèle Groq à utiliser |
| `GROQ_TEMPERATURE` | `0.0` | Température du LLM (0 = déterministe) |

---

### `json2csv.py`

Compile tous les fichiers JSON de `data/extracted/` en un seul DataFrame pandas prêt pour le ML.

**Ce qu'il aplatit :**
- Métadonnées (`cv_id`)
- Données brutes : âge, distance, rôle, expérience totale
- Éducation : diplôme, domaine, école, score
- Gaps : total en mois, nombre de gaps
- Skills et certifications : concaténés en chaîne séparée par virgules
- Langues : colonnes `lang_fr`, `lang_en`, `lang_de`, `lang_es`, `lang_it` (score CECRL), `lang_other_score_sum`

---

### `features.py`

Convertit un CV JSON en vecteur numérique pour la prédiction en production (API).

```python
cv_to_features(cv) → {
    "age": 30,
    "total_experience_years": 5.2,
    "years_since_graduation": 6,
    "nb_skills": 10,
    "nb_languages": 2,
    "nb_certifications": 3,
    "nb_experiences": 4,
    "nb_gaps": 1,
}
```

> Note : `features.py` est utilisé par l'API en temps réel. Le dataset d'entraînement
> utilise `json2csv.py` qui produit un format plus riche (colonnes de langues détaillées,
> texte skills/certifications pour TF-IDF...).

---

### `api.py`

API FastAPI exposant un seul endpoint.

**`POST /process-cv`**

- Reçoit un fichier `.txt` (multipart/form-data)
- Appelle `pre_process_cv()` + `extract_cv()` + `compute_experience_metrics()`
- Construit le dict de features avec `cv_to_features()`
- Charge `model_classification_cv_cool.joblib` via joblib au démarrage
- Retourne la décision + toutes les données extraites

**CORS configuré pour :**
- `FRONTEND_URL` (variable d'environnement, défaut : `http://localhost:5173`)
- `http://localhost:3000`

---

## Modèle ML — Notebooks

L'entraînement du modèle se fait dans les notebooks Jupyter du dossier `backend/notebooks/`.
Chaque version améliore la précision (objectif métier : minimiser les faux positifs).

| Version | Modèle | Précision "Sélectionné" | Approche |
|---------|--------|------------------------|----------|
| V1 | LR / RF / GB / SVM + SMOTE | ~43% | Baseline, 4 modèles comparés |
| V2 | LR L1 (Lasso) + seuil F0.5 | ~57% | Feature engineering, seuil optimisé F0.5 |
| FINAL_500_a | LR L1 + features enrichies + SMOTE | ~41% précision / 70% recall | Cross-val 5-folds, has_certif, certif_count, TF-IDF skills |
| FINAL_500_b | Variante du modèle final | — | Expérimentation parallèle |

**Dataset (`cv_dataset.csv`) :**
- 500 CVs, 21 colonnes
- Variable cible : `passed_next_stage` (0 = Refusé, 1 = Sélectionné)
- Déséquilibre : ~80% refusés / ~20% sélectionnés → corrigé par SMOTE

---

## Audit d'Équité (fairness_audit.ipynb)

Le notebook `fairness_audit.ipynb` évalue si le modèle traite les candidats de manière équitable, indépendamment de caractéristiques protégées. Son exécution est requise avant tout déploiement (AI Act — systèmes à haut risque, catégorie recrutement).

### Attributs sensibles analysés

| Attribut | Risque identifié |
|---|---|
| `age` | Discrimination directe par âge — feature active dans le modèle original (Directive 2000/78/CE) |
| `distance_ville_haute_km` | Proxy géographique/socioéconomique (discrimination indirecte) |
| `lang_fr`, `lang_de`... | Proxy de nationalité — coefficients actifs en L1 |
| `education_degree` | Discrimination socioéconomique indirecte |
| `education_score` | Biais de prestige des institutions |

### Métriques d'équité calculées

| Métrique | Seuil d'alerte | Règle |
|---|---|---|
| **Disparate Impact Ratio** | < 0.80 | Règle des 80% (jurisprudence EU) |
| **Demographic Parity Difference** | > ±0.10 | Convention fairness ML |
| **Equal Opportunity Difference** | > ±0.10 | Égalité des TPR entre groupes |
| **Equalized Odds** | > ±0.10 | Égalité jointe TPR + FPR |

### Stratégies correctives appliquées

1. **Suppression des features sensibles** — `age` et `distance_ville_haute_km` retirés du modèle corrigé
2. **Calibration du seuil par groupe** — seuils différenciés pour égaliser les TPR (Equal Opportunity)
3. **Explicabilité individuelle** — décomposition log-odds par feature pour chaque décision

Le modèle corrigé est sauvegardé dans `models/model_classification_cv_FAIR.joblib`.

---

## Tests

Les tests sont dans `backend/tests/`. Ils utilisent `unittest` et `unittest.mock`.

```bash
cd backend
python -m pytest tests/
```

| Fichier | Ce qui est testé |
|---|---|
| `test_analyser.py` | Appel Groq, retry sur JSON invalide, retry sur erreur réseau, strip des balises markdown, injection du prompt |
| `test_features.py` | Conversion JSON → features numériques |
| `test_geo.py` | Géocodage et calcul de distance |
| `test_json2csv.py` | Compilation JSON → DataFrame |
| `test_loader.py` | Validation des fichiers : inexistant, mauvais format, vide |
| `test_prepocessor.py` | Extraction regex : âge, langues, certifications, gaps |

---

## Format d'un CV brut (.txt)

Les CVs doivent être au format texte structuré avec des sections fixes :

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

## Format JSON extrait (data/extracted/)

Exemple de `cv_0001.json` :

```json
{
  "meta": { "cv_id": "cv_0001.txt", "processed_at": "2026-04-09" },
  "age": 30,
  "distance_ville_haute_km": 7585.14,
  "target_role": "Software Engineer",
  "education": {
    "degree": "Bachelor of Science",
    "field": "Computer Science",
    "school": "Indian Institute of Technology Delhi",
    "education_score": 3
  },
  "experiences": [
    {
      "title": "Software Engineer",
      "company": "Core Solutions",
      "start": "2022-09",
      "end": "2024-10",
      "duration_months": 25
    }
  ],
  "total_experience_years": 2.4,
  "experience_gaps_months": [
    { "from": "2024-10", "to": "2025-12", "duration_months": 14 }
  ],
  "skills": ["Python", "SQL", "Git"],
  "languages": [{ "language": "English", "level": "C2", "score": 6 }],
  "certifications": [{ "name": "Professional Scrum Developer", "year": null }]
}
```

---

## Déploiement Docker

```bash
docker compose up -d --build
```

L'API sera disponible sur le port défini dans `docker-compose.yml`.

---

## Équipe

Projet réalisé dans le cadre du cours : **Projet Global en Intelligence Artificielle** — HELMo Bloc 2 Q2
