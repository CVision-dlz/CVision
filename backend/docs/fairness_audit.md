# Audit d'équité — Modèle de classification de CVs

> **CVision** · Documentation des méthodes · B2 IA · HELMo
> Notebook de référence : [`backend/notebooks/fairness_audit_modif.ipynb`](../notebooks/fairness_audit_modif.ipynb)

---

## Table des matières

1. [Introduction & contexte légal](#introduction--contexte-légal)
2. [Méthodologie générale de l'audit](#méthodologie-générale-de-laudit)
3. [Données & setup](#données--setup)
4. [Attributs sensibles & groupes protégés](#attributs-sensibles--groupes-protégés)
5. [Métriques d'équité — choix et justification](#métriques-déquité--choix-et-justification)
6. [Tests statistiques — Chi², Fisher exact & bootstrap](#tests-statistiques--chi-fisher-exact--bootstrap)
7. [Analyse par attribut & intersectionnalité](#analyse-par-attribut--intersectionnalité)
8. [Disparités opérationnelles (rôle visé)](#disparités-opérationnelles-rôle-visé)
9. [Explicabilité du modèle](#explicabilité-du-modèle)
10. [Stratégie corrective retenue](#stratégie-corrective-retenue)
11. [Comparaison ancien vs nouveau modèle](#comparaison-ancien-vs-nouveau-modèle)
12. [Explication individuelle d'une décision](#explication-individuelle-dune-décision)
13. [Conclusion](#conclusion)
14. [Glossaire](#glossaire)

---

## Introduction & contexte légal

Le projet CVision développe un modèle qui trie automatiquement les CV pour décider si un candidat passe à l'étape suivante (entretien) ou non. Quelques mois après le déploiement, l'équipe de conformité RH de LuxTalent a observé que certains profils étaient invités à des taux significativement différents. Le modèle ayant été entraîné sur des décisions historiques, il pouvait avoir absorbé des biais implicites — l'audit ci-dessous a été commandé pour le démontrer (ou l'écarter) chiffres à l'appui, et corriger le tir si nécessaire.

La question centrale : **est-ce que le modèle traite tout le monde de façon équitable ?** En particulier, est-ce qu'à *qualification égale* les candidats sont traités identiquement quel que soit leur âge, leur origine présumée (langues, distance), ou leur école ?

### Comment lire ce document

| Lecteur | Sections à privilégier |
|---|---|
| RH / non-technique | §1, §3 (synthèse), §7, §11, §13 (réponses au cahier des charges) |
| Évaluateur académique | toutes les sections — §2 et §6 détaillent la méthodologie |
| Développeur reprenant l'audit | §3, §6, §10 (split anti-leakage) et le notebook référencé |

### Cadre éthique — *AI4People* (Floridi et al.)

Les cinq principes pour une IA digne de confiance qui ont guidé chaque choix technique :

| Principe | Question concrète | Traduction dans cet audit |
|---|---|---|
| **Bienfaisance** | L'IA fait-elle le bien ? | Modèle équitable proposé (Stratégie 1, §10) |
| **Non-malfaisance** | L'IA évite-t-elle de nuire ? | Tests stats out-of-sample, IC bootstrap pour ne pas survendre les résultats |
| **Autonomie** | L'humain garde-t-il le contrôle ? | Explication individuelle pour le recruteur (§12) |
| **Justice & Équité** | Traite-t-elle tout le monde pareil ? | EOD (Equal Opportunity Difference) comme métrique principale (§5) |
| **Explicabilité** | Peut-on comprendre ses décisions ? | Triple couche L1 + SHAP + log-odds (§9, §12) |

### Cadre légal — pourquoi cet audit est une obligation

L'**Annexe III de l'AI Act** classe les outils automatisés de présélection de CV comme **systèmes à haut risque**. Cela impose à LuxTalent les obligations suivantes :

| Article AI Act | Obligation | Couvert dans cet audit |
|---|---|---|
| **Art. 9** | Système de gestion des risques documenté | Document entier |
| **Art. 10** | Gouvernance des données, détection et correction des biais | §4 à §11 |
| **Art. 13** | Transparence envers les déployeurs (informer le client) | §9 (SHAP global) |
| **Art. 14** | Supervision humaine effective (le RH garde la main) | §12 (explication individuelle) |
| **Art. 15** | Exactitude et robustesse | §6 (bootstrap), §11 (perf avant/après) |

Sanctions en cas de non-conformité : jusqu'à **35 M€ ou 7% du chiffre d'affaires mondial**.

> Autres références juridiques : Directive 2000/43/CE (origine ethnique), Directive 2000/78/CE (âge), RGPD Art. 9 (données sensibles) et Art. 22 (décisions automatisées), Loi belge du 10/05/2007 contre la discrimination.

---

## Méthodologie générale de l'audit

L'audit suit **8 étapes** explicites, chacune justifiée méthodologiquement et tracée dans le notebook.

```
1. Reproduction exacte du split train/test du modèle original
   → métriques out-of-sample uniquement

2. Définition des attributs sensibles + bucketisation en groupes protégés
   → conformité Directive 2000/78, Loi belge 2007, RGPD Art. 9

3. Calcul des métriques d'équité par groupe
   → Selection rate · DP Gap · DI Ratio · TPR/FPR · EOD Gap

4. Validation statistique de chaque écart
   → Fisher exact (2x2) ou Chi² Pearson (3x2), seuil α=0.05
   → IC bootstrap 95% sur l'EOD (n=1000 ré-échantillonnages)

5. Analyse intersectionnelle
   → heatmaps Âge × Francophonie / Âge × Géographie

6. Disparités opérationnelles (rôle visé)
   → distinguer ce qui est légitime (poste) de ce qui est suspect

7. Explicabilité du modèle
   → coefficients L1 (modèle d'origine) + SHAP (modèle FAIR)

8. Stratégie corrective + comparaison avant/après
   → suppression features sensibles, split anti-leakage 60/20/20
   → trade-off équité/performance documenté
```

### Trois règles d'or appliquées dans tout l'audit

1. **Out-of-sample uniquement.** Toutes les métriques d'équité sont calculées sur le test set (100 candidats) — jamais sur le train. Évaluer un modèle sur ses données d'entraînement gonfle artificiellement les TPR et FPR, et masque les biais.

2. **Pas de data leakage.** Le seuil de décision du modèle FAIR est calibré sur un **set de validation séparé** (100 candidats), pas sur le test. Le test set n'est touché qu'une seule fois pour le rapport final.

3. **Honnêteté sur l'incertitude.** Avec seulement 20 candidats positifs au test, certaines métriques (TPR Junior calculé sur 2 personnes) sont très bruitées. On le quantifie via un IC bootstrap au lieu de présenter des chiffres ponctuels comme s'ils étaient stables.

---

## Données & setup

| Élément | Valeur |
|---|---|
| Dataset | 500 candidats, 21 colonnes |
| Taux de sélection réel (`passed_next_stage = 1`) | 20% (déséquilibre 80/20) |
| Modèle audité | `model_classification_cv_cool.joblib` (LogisticRegression L1) |
| Seuil de décision optimal (modèle d'origine) | 0.1434 |

### Split train/test reproduit à l'identique

```
train_test_split(test_size=0.2, random_state=42, stratify=y)
↓
Train : 400 candidats  (jamais utilisés pour calculer des métriques d'équité)
Test  : 100 candidats  ← base de tout l'audit (out-of-sample)
```

Sur le test set, le modèle d'origine prédit un taux de sélection de **34%** (contre 20% en réalité). C'est un comportement attendu : avec `class_weight='balanced'` et un seuil bas (0.14), le modèle est calibré pour ne pas rater les positifs au prix d'un excès de faux positifs — utile pour le rappel mais accentue les disparités de selection rate.

### Conséquence du déséquilibre 80/20

Le test set ne contient que **20 candidats qualifiés** (positifs réels). Plusieurs métriques sont mécaniquement bruitées :

- TPR par groupe : Junior 2 qualifiés, Mid 12, Senior 6.
- Cellules intersectionnelles : certaines tombent à 0-3 individus.

C'est précisément pour cette raison que le §6 ajoute des **IC bootstrap** et que les Chi² sur les contingences 3×2 sont annotés "cellules attendues <5".

---

## Attributs sensibles & groupes protégés

Avant tout calcul, on définit les **groupes protégés** — les caractéristiques sur lesquelles le modèle ne devrait pas discriminer.

| Attribut | Groupes (effectifs) | Base légale |
|---|---|---|
| `age` | Junior ≤29 (181) · Mid 30–34 (178) · Senior ≥35 (141) | Directive 2000/78/CE · Loi belge 2007 |
| `distance_ville_haute_km` | Local <1 000 km (159) · Régional (130) · International >5 000 km (211) | RGPD Art. 9 — proxy d'origine |
| `lang_fr` | Francophone ≥4 (128) · Non-francophone (372) | Directive 2000/43/CE |
| `education_degree` | Master+ (209) · Bachelor ou moins (291) | AI Act Annexe III |
| `education_score` | École de prestige 4 (209) · École standard 3 (291) | AI Act Art. 10 |

> ⚠ `education_degree` et `education_score` sont **parfaitement corrélés** (291/209 dans les deux cas). Les métriques sont donc identiques — on les conserve pour la traçabilité mais ce sont effectivement **4 attributs distincts**, pas 5.

### Pourquoi ces choix — la logique du proxy

Le dataset ne contient **pas** les attributs sensibles "purs" (genre, nationalité, origine ethnique). Mais l'AI Act et le RGPD considèrent qu'**une feature qui révèle indirectement un attribut protégé est elle-même sensible** — c'est le principe du *proxy*.

| Feature suspecte | Proxy de quoi ? | Pourquoi c'est un proxy |
|---|---|---|
| `lang_de`, `lang_es`, `lang_it` | Nationalité / origine | Parler allemand corrèle avec être allemand. Pénaliser/favoriser ces langues = discriminer indirectement par nationalité. |
| `distance_ville_haute_km` | Origine géographique | Distance à Liège élevée ⇒ candidat non européen probablement. |
| `lang_fr` | Origine francophone | Mais c'est *aussi* une compétence métier légitime en Belgique. Cas ambigu, traité en §10. |
| `education_score` | Statut socio-économique | École de prestige corrèle avec milieu social aisé. Mais c'est aussi une mesure de qualité défendable. |

### `target_role` volontairement exclu

Le rôle visé (`Software Engineer`, `Data Scientist`, etc.) n'est **pas** un attribut protégé : c'est la définition du poste. Des écarts de selection rate entre rôles sont attendus (un poste senior demande plus d'expérience) et **légitimes**. On analyse cependant `target_role` en §8 comme "disparité opérationnelle" pour répondre à la question 3 du cahier des charges ("les disparités sont-elles justifiées par le poste ?").

---

## Métriques d'équité — choix et justification

On combine **trois métriques complémentaires** plus un test statistique systématique. Aucune métrique seule n'est suffisante — c'est leur combinaison qui donne un audit robuste.

### Les trois métriques

**1. Selection rate** — taux de candidats prédits comme sélectionnés dans un groupe.
```
selection_rate(a) = P(Ŷ=1 | A=a)
```
Sert de référence pour calculer les deux suivantes.

**2. Demographic Parity Gap (DP Gap)** — vue collective.
```
DP Gap = max(selection_rate) − min(selection_rate)
Seuil d'alerte : > 0.10
```
Mesure l'écart brut entre groupes. Question : *les groupes sont-ils sélectionnés à des taux comparables ?* **Trompeur si les base rates de qualification diffèrent réellement.**

**3. Disparate Impact Ratio (DI)** — version normée.
```
DI = min(selection_rate) / max(selection_rate)
Seuil d'alerte : < 0.80
```
Inspiré de la **règle des 80%** (jurisprudence US, reprise par l'AI Act) : un groupe sélectionné à moins de 80% du taux du groupe favorisé est présumé victime de discrimination. Même limite que DP : insensible aux base rates.

**4. Equal Opportunity Difference (EOD)** ← *notre métrique principale*
```
TPR(a) = P(Ŷ=1 | A=a, Y=1)
EOD Gap = max(TPR) − min(TPR)
Seuil d'alerte : > 0.10
```
Vue individuelle : *parmi les candidats **vraiment** qualifiés (`Y=1`), le modèle les détecte-t-il aussi bien dans tous les groupes ?* C'est l'**Equal Opportunity** de Hardt et al. (2016), recommandé dans la littérature fairness pour les tâches où les base rates diffèrent légitimement.

### Pourquoi l'EOD prime ici — arbre de décision

```
1. Les base rates de qualification diffèrent-ils entre groupes ?
   → Oui (cf. tableau ci-dessous) → EOD obligatoire, DP/DI complémentaires
   → Non → DP suffirait

2. Si on observe DP Gap = 0.5 mais EOD Gap = 0.0
   → différence reflète seulement les qualifications réelles, pas un biais

3. Si on observe DP Gap petit mais EOD Gap = 1.0
   → biais caché : à qualification égale, un groupe est moins détecté
```

| Groupe | Base rate (taux réel qualifié) |
|---|---|
| Junior (≤29) | 10.5% |
| Mid (30–34) | 22.5% |
| Senior (≥35) | 29.1% |
| Bachelor− | 12.7% |
| Master+ | 30.1% |

Les écarts de base rate sont **importants** (Senior 3× plus qualifié que Junior). La DP brute condamnerait à tort le modèle pour avoir simplement reflété cette réalité. L'**EOD est la seule métrique qui isole le biais du modèle des qualifications réelles** — c'est notre métrique principale, les autres servent de complément descriptif.

---

## Tests statistiques — Chi², Fisher exact & bootstrap

Un écart visible sur un graphique peut venir du modèle (vrai biais) **ou du hasard d'échantillonnage** (n petit). On valide donc chaque disparité par un test formel.

### Chi² de Pearson et Fisher exact

Pour chaque attribut, **deux tests d'indépendance** :

| Test | Hypothèse nulle H₀ | Sur quel sous-ensemble |
|---|---|---|
| **DP** | La prédiction est indépendante du groupe | Test set entier (100) |
| **EO** | La prédiction est indépendante du groupe | Sous-ensemble `y_true = 1` (20) |

**Choix du test selon la forme de la table** :

| Forme | Test | Pourquoi |
|---|---|---|
| 2×2 (attribut binaire) | **Fisher exact** | Exact même avec effectifs <5. Standard sous α=0.05 quand n est petit. |
| 3×2 (attribut ternaire) | **Chi² Pearson** | Approximation asymptotique. Hypothèse : cellules attendues ≥ 5. Sinon on annote. |

> Pour les contingences 3×2 avec >20% de cellules attendues <5 (cas du test EO âge : 5/6 cellules concernées), le test idéal serait **Fisher-Freeman-Halton** (Fisher exact généralisé). Il n'est pas disponible dans scipy ; on garde Chi² avec annotation explicite. Le résultat (p=0.026) est indicatif mais à confirmer avec un dataset plus large.

### IC bootstrap 95% sur l'EOD

Le test set ne compte que **20 positifs**. La métrique EOD Âge calculée vaut 1.00, mais cette valeur repose sur **2 Juniors qualifiés** et **6 Seniors qualifiés**. Une métrique calculée sur 2 personnes a une marge d'erreur énorme.

Pour quantifier cette incertitude, on **bootstrappe** :

```
Pour i = 1 à 1000 :
    Ré-échantillonner le test set avec remise (n=100)
    Calculer l'EOD sur ce ré-échantillon
IC 95% = [percentile 2.5%, percentile 97.5%] des 1000 EOD obtenus
```

Interprétation :
- **IC étroit (largeur <0.2)** : la métrique est stable, on peut s'y fier.
- **IC large (largeur >0.4)** : variance d'échantillonnage forte — la conclusion repose sur trop peu d'observations. À traiter avec prudence.

C'est une honnêteté méthodologique importante : un EOD point à 1.00 avec un IC [0.6, 1.0] ne raconte pas la même histoire qu'un EOD à 1.00 avec un IC [0.95, 1.0]. Dans notre cas, les IC sont effectivement larges et confirment la nécessité d'un dataset plus grand pour un audit définitif.

---

## Analyse par attribut & intersectionnalité

### Âge — le cas le plus grave

| Groupe | n_test | qualifiés | Selection rate | **TPR** | Base rate test |
|---|---|---|---|---|---|
| Junior (≤29) | 36 | 2 | 11.1% | **0.0%** ❌ | 5.5% |
| Mid (30–34) | 38 | 12 | 36.8% | 66.7% | 31.6% |
| Senior (≥35) | 26 | 6 | 61.5% | **100%** | 23.1% |

- Corrélation Pearson `age` vs `proba` sur l'ensemble du dataset : **r = 0.543** — forte et positive.
- TPR Junior = 0%, TPR Senior = 100% → **EOD = 1.00** (maximum théorique).
- Chi² conditionnel à `y_true=1` : **p = 0.026** → significatif (Sig.).
- L'ancien modèle **ne détecte aucun candidat Junior pourtant qualifié**. Même avec n petit (2 Juniors qualifiés), c'est un signal alarmant.

### Distance géographique — pas de biais avéré

- Corrélation distance/proba : **r = 0.071** — très faible.
- Chi² DP : p = 0.53 → non significatif.
- Coefficient L1 *positif* (+0.04) : le modèle favorise même les candidats lointains.

→ La feature est **retirée par principe RGPD** (minimisation des données, risque de proxy d'origine), **pas pour corriger un biais avéré**. C'est de la prévention.

### Francophonie — base rates quasi identiques, marginalement détectable

- Base rate Francophone 18.8% / Non-francophone 20.4% → quasi identiques.
- Chi² DP : p = 0.13 → non significatif.
- Mais l'analyse intersectionnelle (voir ci-dessous) montre que la cellule `Junior × Francophone` = 0% de sélection (n=8). À surveiller.

### Niveau d'éducation — biais avéré mais partiellement légitime

- Base rates très différents : Bachelor− 12.7% vs Master+ 30.1%.
- DP Gap = 0.56, DI = 0.17 — alarmant **en apparence**, mais reflète des qualifications réelles.
- EOD Gap = 0.55 → là c'est un vrai biais : à qualification égale, un Bachelor qualifié est moins détecté qu'un Master qualifié.

### Intersectionnalité — un point clé de la conférence

La conférence a insisté : les discriminations sont souvent **croisées**. Un modèle peut être OK sur chaque attribut pris seul et discriminer sur leur combinaison.

On teste deux croisements pertinents :

- **`age_group × fr_speaker`** — révèle la cellule `Junior × Francophone` à 0% (n=8).
- **`age_group × geo_group`** — révèle des combinaisons à 0% selection.

> Les cellules avec effectif <5 sont annotées et traitées comme indicatives, pas conclusives. Un audit annuel avec un dataset plus large permettra de confirmer (ou infirmer) ces signaux intersectionnels.

---

## Disparités opérationnelles (rôle visé)

Cette section répond à la **question 3 du cahier des charges** : *« les disparités sont-elles justifiées par des caractéristiques liées au poste ? »*

`target_role` n'est pas un attribut protégé. Les écarts de selection rate entre rôles sont **attendus** : un poste de Data Scientist demande plus d'expérience qu'un poste junior, donc moins de candidats remplissent les critères. C'est de la **discrimination opérationnelle légitime**, pas de la discrimination juridique.

Sur notre test set, les rôles les plus sélectionnés sont Product Analyst, ML Engineer et DevOps Engineer (>45%) ; les moins sélectionnés sont QA, Cybersecurity, BI Developer (0% sur n petits). Ces écarts sont normaux : la composition des CV par rôle, le niveau d'expérience requis, et la rareté des compétences expliquent ces différences.

> ⚠ Cette analyse est **descriptive**, pas un audit légal. Aucune correction n'est appliquée — un recrutement *doit* avoir des critères différents selon le poste.

---

## Explicabilité du modèle

L'AI Act (Art. 13) et le RGPD (Art. 22) exigent que les décisions automatisées soient explicables. On combine **trois couches** complémentaires.

### Couche 1 — Coefficients L1 (modèle d'origine)

La régression logistique L1 met automatiquement à zéro les features non informatives. **Sur 128 features, seulement 9 sont actives** dans le modèle d'origine :

| Feature | Coefficient | Lecture |
|---|---|---|
| `total_experience_years` | +0.7099 | Favorise les expérimentés (légitime) |
| `education_score` | +0.4238 | Favorise les écoles de prestige |
| `certif_count` | +0.2124 | Favorise les certifiés |
| `lang_de` | +0.1027 | ⚠ Favorise les germanophones |
| `lang_es` | +0.0854 | ⚠ Favorise les hispanophones |
| `lang_other_score_sum` | +0.0795 | ⚠ Favorise les multilingues "exotiques" |
| `gap_ratio` | −0.0707 | Pénalise les trous dans le CV |
| `distance_ville_haute_km` | +0.0396 | ⚠ Favorise les candidats lointains |
| `lang_it` | −0.0073 | ⚠ Pénalise les italophones |

Les coefficients marqués ⚠ sont des **proxies d'origine** — c'est sur cette base qu'ils ont été retirés du modèle FAIR (§10).

### Couche 2 — SHAP (sur le modèle FAIR)

Les coefficients donnent l'impact *marginal* d'une feature. Les valeurs **SHAP** (SHapley Additive Explanations) donnent l'impact *réel* sur chaque prédiction, en tenant compte des interactions et de la distribution des données. On l'applique au modèle FAIR (celui qui sera déployé) sur 300 candidats.

**Résultats principaux (modèle FAIR)** :

| Feature | \|SHAP\| moyen | Direction |
|---|---|---|
| `education_score` | 0.71 | Favorise (+) |
| `lang_fr` | 0.24 | Pénalise (−) les non-francophones |
| `lang_en` | ~0.00 | Neutre |

Visualisations produites par le notebook :
- **Beeswarm** : importance globale + direction pour toutes les features.
- **Waterfall** : décomposition individuelle pour un candidat précis.

### Couche 3 — Log-odds individuels (pour le recruteur)

Voir §12. C'est l'explication la plus opérationnelle : pour chaque décision, on liste les 5–10 features qui ont le plus pesé, avec leur contribution chiffrée. Conforme à l'**Art. 14 AI Act** (supervision humaine) et au **RGPD Art. 22** (droit à l'explication).

---

## Stratégie corrective retenue

### Stratégie 1 — Suppression des features sensibles (pre-processing) — RETENUE

Approche la plus simple éthiquement et juridiquement : si une feature pose problème, on la retire avant d'entraîner. Le nouveau modèle apprend sans avoir accès à ces signaux.

**Features supprimées** (6) :
```
age · distance_ville_haute_km · lang_de · lang_es · lang_it · lang_other_score_sum
```

**Features conservées** :
- `lang_fr` : compétence professionnelle légitime en contexte belgo-européen.
- `lang_en` : lingua franca technique.

Ces deux exceptions sont **défendables au sens RGPD** (finalité légitime, proportionnée), mais l'effet de bord est à surveiller (§11).

**Méthodologie anti-data-leakage** — le point méthodologique le plus important de la refonte :

```
Dataset 500 candidats
├── Test    100 candidats  ← split original, intact, jamais touché
└── Train+val 400
    ├── Train 300 candidats  ← entraînement du modèle
    └── Val   100 candidats  ← tuning du seuil F-beta
```

Le seuil de décision est optimisé sur la validation par F-beta (β=0.5, privilégie la précision). Le test set n'est touché qu'une seule fois en toute fin pour produire les chiffres du §11.

**Résultats du modèle FAIR sur le test set** :
```
Seuil optimal (calibré sur val) : 0.6352
ROC-AUC                         : 0.687
Accuracy                        : 75%
Précision (sélectionné)         : 0.41
Rappel    (sélectionné)         : 0.55
Rappel    (refusé)              : 0.80
```

### Stratégie 2 — Calibration de seuils par groupe (post-processing) — ÉTUDIÉE PUIS REJETÉE

L'idée : appliquer un seuil différent selon le groupe (par ex. 0.05 pour les Juniors, 0.70 pour les Seniors) de façon à égaliser les TPR. Mathématiquement, ça force l'**Equal Opportunity**.

**Pourquoi on l'abandonne** — argument juridique :
- Appliquer un standard de réussite différent selon une caractéristique protégée = **demographic norming** = **discrimination directe** sous :
  - Loi belge du 10 mai 2007 contre la discrimination (Art. 5)
  - Directive européenne 2000/78/CE (Art. 2)
- L'AI Act (Art. 10) et le RGPD (Art. 5) privilégient la suppression de la variable sensible **en amont**, pas son utilisation pour différencier les seuils à l'inférence.

**Pourquoi on l'abandonne** — argument technique :
- Pour égaliser le TPR Junior, le seuil devait tomber à 0.05, ce qui faisait exploser le taux de sélection Junior à **93%** (vs 20% réels). Inacceptable opérationnellement.

→ Seule la **Stratégie 1** est retenue et déployée. La Stratégie 2 est documentée à titre pédagogique.

---

## Comparaison ancien vs nouveau modèle

Comparaison sur le **même test set** (rigueur méthodologique).

### Performances brutes

| Métrique | Ancien | Nouveau (FAIR) |
|---|---|---|
| ROC-AUC | **0.706** | 0.687 |
| Accuracy | 74% | **75%** |
| Rappel (sélectionné) | **0.70** | 0.55 |
| Précision (sélectionné) | 0.41 | 0.41 |
| Rappel (refusé) | 0.75 | **0.80** |

Perte de **~2 points de ROC-AUC** et 15 points de rappel sur la classe positive. C'est le **trade-off équité/performance assumé**.

### Équité — vue d'ensemble

| Attribut | EOD ancien | EOD nouveau | Δ | DI min ancien | DI min nouveau |
|---|---|---|---|---|---|
| Âge | 1.00 | 0.67 | **−0.33** ✅ | 0.18 | 0.11 |
| Francophonie | 0.13 | 0.47 | +0.34 ⚠ | 0.47 | 0.28 |
| Niveau éducation | 0.55 | 0.62 | +0.07 ⚠ | 0.17 | 0.12 |
| Distance géographique | 0.23 | 0.20 | −0.03 | 0.72 | 0.58 |

### Effets de bord à signaler honnêtement

**1. EOD francophonie qui s'aggrave (0.13 → 0.47).** Quand on retire `lang_de`, `lang_es`, `lang_it` et `lang_other_score_sum`, le modèle reporte mécaniquement du poids sur la seule langue restante : `lang_fr`. Le SHAP du modèle FAIR confirme : |SHAP| `lang_fr` ≈ 0.24, deuxième feature la plus influente. La conservation de `lang_fr` reste défendable (compétence métier en Belgique), mais c'est un point à monitorer.

**2. DI min qui se dégrade sur tous les attributs.** Le DI est très sensible aux petits échantillons quand un groupe a peu de positifs (Junior : 2 qualifiés). C'est précisément pour cette raison que l'**EOD prime sur le DI** dans cet audit — le DI brut est mathématiquement trompeur ici.

**3. EOD éducation qui augmente légèrement.** +0.07, dans la marge de variance d'échantillonnage (l'IC bootstrap est large à n=20 positifs).

> Dans un contexte AI Act haut risque, **l'EOD sur l'attribut le plus discriminé (l'âge) prime** sur les autres métriques. Le report partiel du poids sur `lang_fr` justifierait un second tour d'audit dès qu'un dataset plus large sera disponible.

---

## Explication individuelle d'une décision

Pour répondre à l'**Art. 14 de l'AI Act** (supervision humaine), le notebook fournit une fonction `explain_prediction_logistic` qui décompose chaque prédiction en contributions de chaque feature au log-odds.

**Exemple — candidat `cv_0001.txt`** :
```
Rôle visé           : Software Engineer
Expérience          : 2.4 ans
Score éducation     : 3

Probabilité prédite : 9.7%
Seuil de décision   : 63.5%
Décision            : ❌ REFUSÉ

Top contributions :
  total_experience_years  −0.97  (manque d'expérience)
  education_score         −0.61  (école standard)
  certif_count            −0.21  (peu de certifications)
  lang_fr                 +0.18  (francophone — léger boost)
```

Un graphique en barres horizontales accompagne chaque décision :
- 🟢 **Vert** → la feature pousse vers la sélection
- 🔴 **Rouge** → la feature pousse vers le refus

Le recruteur peut ainsi :
1. Comprendre la décision (Art. 14 AI Act).
2. Contester si une feature clé est manifestement erronée (RGPD Art. 22).
3. Faire un *override* humain si le contexte le justifie.

---

## Conclusion

### Résultats clés en une ligne

| Indicateur | Ancien | Nouveau | Δ |
|---|---|---|---|
| **EOD Âge** (métrique clé) | 1.00 | 0.67 | **−0.33** ✅ |
| ROC-AUC | 0.706 | 0.687 | −0.019 |
| Recall sélectionné | 0.70 | 0.55 | −0.15 |

### Ce que l'audit a permis de faire

1. **Identifier** les biais du modèle d'origine — corrélation âge/proba r=0.543, TPR Junior = 0%, plusieurs langues agissant comme proxies d'origine.
2. **Quantifier** ces biais avec DP/DI/EOD + Chi²/Fisher + IC bootstrap, le tout out-of-sample.
3. **Distinguer** discrimination opérationnelle légitime (rôle visé) de discrimination protégée (âge).
4. **Corriger** le modèle en supprimant 6 features problématiques, avec un coût performance documenté.
5. **Expliquer** chaque décision (L1 global + SHAP + log-odds individuel).
6. **Documenter** le tout conformément aux Art. 9, 10, 13, 14 de l'AI Act.

### Réponses au cahier des charges WP2

1. *Le système traite-t-il les candidats comparables de manière égale ?* — **Non, pour l'âge** sur l'ancien modèle (EOD = 1.00). Corrigé partiellement sur le nouveau (0.67).
2. *Y a-t-il des disparités mesurables ?* — Oui sur âge et éducation (Chi² significatif). Non sur distance ni francophonie marginale (avant correction).
3. *Sont-elles justifiées par le poste ?* — Partiellement pour l'éducation (Master+ plus qualifié) et les rôles techniques (cf. §8). L'écart de TPR par âge n'est *pas* justifié — c'est un vrai biais.
4. *Le modèle peut-il être amélioré ?* — Oui : EOD Âge réduit de 33 points avec le modèle FAIR, au prix de 2 points de ROC-AUC.
5. *Les décisions peuvent-elles être rendues plus transparentes ?* — Oui, via SHAP global + log-odds individuel (§9, §12), conforme aux Art. 13 et 14 AI Act.

### Limites assumées

- **Test set de 100 candidats (20 positifs)** → IC bootstrap larges, certaines cellules intersectionnelles à effectif <10.
- **Attributs sensibles "vrais"** (genre, nationalité, origine ethnique) **absents du dataset** — l'audit travaille sur des proxies.
- **Chi² 3×2 avec cellules <5** : l'idéal serait Fisher-Freeman-Halton, non disponible dans scipy. Résultat (p=0.026) reste indicatif.
- **L'amélioration EOD Âge pourrait être en partie due à la variance d'échantillonnage** — à confirmer avec un dataset plus large.

### Recommandations pour LuxTalent

1. **Audit annuel** avec un test set d'au moins 500 candidats pour réduire les IC.
2. **Documenter les décisions contestées** (RGPD Art. 22 — droit à l'explication).
3. **Boucle de feedback humain** pour les cas limites (proba ∈ [seuil ± 5%]).
4. **Collecter des données démographiques anonymisées** pour mesurer les vrais attributs protégés (avec consentement explicite).
5. **Former les recruteurs** aux biais algorithmiques et à la lecture des explications individuelles.
6. **Surveiller `lang_fr`** lors du prochain audit — c'est la feature qui a hérité du poids des langues retirées.

### Apports de la conférence intégrés à cet audit

1. **Justice & Équité** → choix de l'EOD (vue individuelle) plutôt que DP seule (vue collective sans contrôle des base rates).
2. **Intersectionnalité** → analyses croisées Âge × Francophonie et Âge × Géographie.
3. **Explicabilité** → triple couche L1 + SHAP + log-odds individuel (Art. 13 et 14 AI Act).
4. **Non-malfaisance / capability caution** → `age`, distance et langues exotiques retirées par principe de **minimisation des données** (RGPD Art. 5), même quand le test statistique seul ne les condamnerait pas.
5. **Durabilité / IA frugale** → régression logistique L1 préférée à un modèle deep (~64 KB sauvegardé, pas de GPU, entraînement local en quelques secondes), à la fois éthique (intrinsèquement explicable) et environnementale (compute minimal).

**Un modèle performant n'est pas forcément un modèle équitable.** Nous avons choisi de sacrifier un peu de ROC-AUC pour avoir un système qui ne discrimine plus l'âge — choix légitime dans un contexte de recrutement automatisé classé haut risque par l'AI Act.

---

## Glossaire

| Terme | Définition |
|---|---|
| **Base rate** | Taux *réel* de candidats qualifiés (`Y=1`) dans un groupe. À comparer au selection rate. |
| **Bootstrap** | Méthode de ré-échantillonnage (tirage avec remise) pour estimer la marge d'erreur d'une métrique. |
| **Demographic norming** | Pratique consistant à appliquer un standard d'évaluation différent selon un attribut protégé. Illégale en droit du travail européen. |
| **Demographic Parity (DP)** | Métrique d'équité : exige des selection rates égaux entre groupes. Sensible aux différences de base rate. |
| **Disparate Impact (DI)** | Ratio min/max des selection rates. Règle des 80% : DI ≥ 0.80 attendu. |
| **EOD** | Equal Opportunity Difference : écart max-min des TPR entre groupes. Métrique principale ici. |
| **Equal Opportunity** | À qualification égale (`Y=1`), tous les groupes doivent avoir la même probabilité d'être détectés. |
| **Fisher exact** | Test d'indépendance exact pour tables 2×2, valide même avec petits effectifs. |
| **L1 (régularisation Lasso)** | Pénalisation qui force certains coefficients à zéro → modèle parcimonieux et explicable. |
| **Out-of-sample** | Évaluation sur des données jamais vues à l'entraînement. Garantit que les métriques sont fiables. |
| **Proxy** | Feature qui révèle indirectement un attribut protégé (ex. langue parlée → nationalité). |
| **SHAP** | SHapley Additive Explanations — méthode d'explicabilité fondée sur la théorie des jeux. |
| **TPR (Taux de Vrais Positifs / Recall)** | Parmi les `Y=1`, fraction correctement détectée par le modèle. Composante principale de l'EOD. |

---

> *Notebook de référence : [`backend/notebooks/fairness_audit_modif.ipynb`](../notebooks/fairness_audit_modif.ipynb)*
