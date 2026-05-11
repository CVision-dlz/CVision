# Audit d'équité — Modèle de classification de CVs

> **CVision** · Documentation des méthodes · B2 IA · HELMo
> Notebook de référence : [`backend/notebooks/fairness_audit_modif.ipynb`](../notebooks/fairness_audit_modif.ipynb)

---

## Table des matières

1. [Introduction & contexte légal](#introduction--contexte-légal)
2. [Données & setup](#données--setup)
3. [Attributs sensibles & groupes protégés](#attributs-sensibles--groupes-protégés)
4. [Métriques d'équité](#métriques-déquité)
5. [Tests statistiques Chi²](#tests-statistiques-chi)
6. [Analyse par attribut & intersectionnalité](#analyse-par-attribut--intersectionnalité)
7. [Explicabilité du modèle](#explicabilité-du-modèle)
8. [Stratégie corrective retenue](#stratégie-corrective-retenue)
9. [Comparaison ancien vs nouveau modèle](#comparaison-ancien-vs-nouveau-modèle)
10. [Explication individuelle d'une décision](#explication-individuelle-dune-décision)
11. [Conclusion](#conclusion)

---

## Introduction & contexte légal

Le projet CVision développe un modèle qui trie automatiquement les CV pour décider si un candidat passe à l'étape suivante (entretien) ou non. La question centrale de cet audit : **est-ce que le modèle traite tout le monde de façon équitable ?**

L'audit s'appuie sur le cadre **AI4People** (Floridi et al.) et sur le **Règlement européen sur l'IA (AI Act)**, qui classe les outils de présélection automatique de candidats comme des **systèmes à haut risque** (Annexe III).

### Correspondance principes éthiques → choix techniques

| Principe éthique | Traduction dans notre audit |
|---|---|
| **Justice & Équité** | Equal Opportunity Difference (EOD) comme métrique principale |
| **Non-malfaisance** | Tests Chi² + audit *out-of-sample* par attribut |
| **Explicabilité** | Coefficients L1, SHAP global/local, log-odds individuels |
| **Autonomie** | Explication individuelle destinée au recruteur (Art. 14 AI Act) |
| **Bienfaisance** | Comparaison équité avant/après suppression des features sensibles |

### Obligations légales applicables

L'**Annexe III de l'AI Act** classe notre outil comme **système à haut risque**. Articles directement mobilisés :

- **Art. 9** — système de gestion des risques documenté → *cet audit*
- **Art. 10** — gouvernance des données et correction des biais → *sections 3–8*
- **Art. 13** — transparence envers les déployeurs → *SHAP global*
- **Art. 14** — supervision humaine effective → *explications individuelles*

> Autres références : Directive 2000/43/CE · Directive 2000/78/CE · RGPD Art. 9 & 22 · Loi belge du 10/05/2007 contre la discrimination.

---

## Données & setup

- **Dataset** : 500 candidats, 21 colonnes
- **Taux de sélection réel** : 20%
- **Modèle audité** : `model_classification_cv_cool.joblib` (Régression Logistique L1)
- **Seuil optimal** : 0.1434 (calculé lors de l'entraînement)

### Split train/test

Nous reproduisons exactement le split utilisé lors de l'entraînement (`random_state=42`, `stratify=y`, `test_size=0.2`) pour ne travailler que sur des données **out-of-sample** :

```
Train : 400 candidats
Test  : 100 candidats  ← base de tout l'audit
```

> Règle d'or : on ne touche au test set qu'une seule fois. Évaluer sur les données d'entraînement gonflerait artificiellement les TPR/FPR.

Sur le test set, le modèle prédit un taux de sélection de **34%** — plus généreux que la réalité (20%), comportement attendu vu le déséquilibre des classes 80/20.

---

## Attributs sensibles & groupes protégés

Avant tout calcul, nous définissons les **groupes protégés** — les caractéristiques sur lesquelles le modèle ne devrait pas discriminer.

| Attribut | Groupes | Base légale |
|---|---|---|
| `age` | Junior ≤29 (181) · Mid 30–34 (178) · Senior ≥35 (141) | Directive 2000/78/CE · Loi belge 2007 |
| `distance_ville_haute_km` | Local <1 000 km (159) · Régional (130) · International >5 000 km (211) | RGPD Art. 9 — proxy d'origine |
| `lang_fr` | Francophone (≥4) (128) · Non-francophone (372) | Directive 2000/43/CE |
| `education_degree` | Master+ (209) · Bachelor ou moins (291) | AI Act Annexe III |
| `education_score` | École de prestige (4) (209) · École standard (3) (291) | AI Act Art. 10 |

> Le dataset ne contient ni genre ni nationalité explicite, mais ces variables peuvent être présentes **indirectement via des proxies** (langues, distance, école). C'est exactement ce que nous cherchons à détecter.

> `target_role` est volontairement absent — le rôle visé est la définition du poste, pas un attribut protégé.

---

## Métriques d'équité

Trois métriques complémentaires, calculées sur le test set out-of-sample.

**Demographic Parity Gap (DP Gap)** — écart brut entre les taux de sélection.
```
DP Gap = max(selection_rate) − min(selection_rate)
Seuil d'alerte : > 0.10
```

**Disparate Impact Ratio (DI)** — ratio min/max. La **règle des 80%** indique qu'un groupe sélectionné à moins de 80% du taux du groupe favorisé est présumé victime de discrimination.
```
DI = min(selection_rate) / max(selection_rate)
Seuil d'alerte : < 0.80
```

**Equal Opportunity Difference (EOD)** ← *notre métrique principale*
```
EOD = max(TPR) − min(TPR)
Seuil d'alerte : > 0.10
```

### Pourquoi l'EOD prime ici

Les base rates de qualification diffèrent légitimement entre groupes :

| Groupe | Taux réel de qualification |
|---|---|
| Junior (≤29) | 10.5% |
| Mid (30–34) | 22.5% |
| Senior (≥35) | 29.1% |
| Bachelor− | 12.7% |
| Master+ | 30.1% |

Si le modèle sélectionne plus de Seniors, c'est peut-être juste qu'ils sont objectivement plus qualifiés. **La DP seule serait trompeuse.** L'EOD conditionne sur les candidats vraiment qualifiés (`Y=1`) : si le modèle les rate davantage dans un groupe donné, là c'est un vrai problème indépendant des qualifications.

---

## Tests statistiques Chi²

Pour ne pas se contenter d'observer des écarts, nous validons statistiquement chaque disparité avec un **test Chi² de Pearson** sur le test set. Deux tests par attribut :

| Test | Hypothèse nulle H₀ |
|---|---|
| **Test DP** | La prédiction est indépendante du groupe |
| **Test EO** | La prédiction est indépendante du groupe, parmi les candidats réellement qualifiés |

> Seuil α = 0.05. Une p-value non significative peut signifier "pas de biais" **ou** "effectif trop faible pour conclure" — on signale systématiquement les cellules attendues < 5.

---

## Analyse par attribut & intersectionnalité

### Âge

Corrélation de Pearson entre l'âge et la probabilité prédite : **r = 0.543**. Corrélation positive et forte — les candidats plus âgés reçoivent systématiquement des probabilités plus élevées. Les boxplots par groupe d'âge confirment ce décalage.

Cela s'explique partiellement par les qualifications (les Seniors ont plus d'expérience), mais la force de la corrélation a motivé une analyse plus poussée — qui révèle un cas extrême (cf. Conclusion).

### Distance géographique

Corrélation distance/probabilité prédite **r = 0.071** — très faible. Résultat surprenant : le modèle tend même à favoriser les candidats lointains plutôt qu'à les pénaliser, probablement à cause de corrélations cachées dans les données d'entraînement. La feature est néanmoins **retirée du modèle final** par **principe RGPD** (minimisation des données) + risque de proxy d'origine, et non pour corriger un biais avéré.

### Analyse intersectionnelle

La conférence a insisté sur le fait que les discriminations sont souvent *croisées* : un modèle peut discriminer une **combinaison** de caractéristiques même si chaque attribut pris seul semble OK. Nous analysons deux croisements :

- `age_group × fr_speaker`
- `age_group × geo_group`

Les heatmaps visualisent ces interactions. Les cellules avec moins de 5 individus sont interprétées avec prudence vu le faible effectif.

---

## Explicabilité du modèle

### Coefficients L1

La régression logistique L1 met à zéro les features non informatives. **Sur 128 features au total, seulement 9 sont actives** dans le modèle original. Plusieurs sont sensibles ou proxies :

| Feature | Coefficient | Interprétation |
|---|---|---|
| `lang_de` | +0.1027 | Favorise les germanophones |
| `lang_es` | +0.0854 | Favorise les hispanophones |
| `lang_other_score_sum` | +0.0795 | Favorise les multilingues « exotiques » |
| `distance_ville_haute_km` | +0.0396 | Favorise les candidats lointains |
| `lang_it` | −0.0073 | Pénalise les italophones |

Ces langues peuvent agir comme des **proxies de nationalité ou d'origine** — leur utilisation directe posait un problème éthique et légal.

### SHAP — Shapley Additive Explanations

Les coefficients L1 donnent l'impact marginal d'une feature, mais pas son impact réel sur chaque prédiction individuelle. Pour aller plus loin, nous calculons les **valeurs SHAP** sur 300 candidats.

**Résultats principaux :**

| Feature | \|SHAP\| moyen | Direction |
|---|---|---|
| `education_score` | 0.71 | Favorise (+) |
| `lang_fr` | 0.24 | Pénalise (−) les non-francophones |
| `lang_en` | ~0.00 | Neutre |

**Visualisations générées :** un **beeswarm** (importance globale et direction) et un **waterfall** (explication individuelle).

> Ces visualisations répondent à l'**Art. 13 de l'AI Act** (transparence envers les déployeurs) et à la question concrète : *« Pourquoi ce candidat a-t-il été refusé ? »*

---

## Stratégie corrective retenue

### Stratégie 1 — Suppression des features sensibles (pre-processing)

C'est la stratégie principale, la plus propre éthiquement. Le nouveau modèle est réentraîné en supprimant les features discriminatoires.

**Features supprimées :**
```
age · distance_ville_haute_km · lang_de · lang_es · lang_it · lang_other_score_sum
```

**Features conservées :** `lang_fr` et `lang_en` — justifiées dans le contexte belgo-européen (francophonie = compétence professionnelle pertinente, anglais = lingua franca technique).

**Méthodologie anti-data-leakage :** split **300 train / 100 validation / 100 test**. Le seuil optimal est calibré sur la **validation**, le test set n'est touché qu'une seule fois pour l'évaluation finale.

**Résultats sur le test set :**
```
Seuil optimal calibré        : 0.6352
ROC-AUC                      : 0.687
Accuracy                     : 75%
Précision (sélectionné)      : 0.41
Rappel    (sélectionné)      : 0.55
Rappel    (refusé)           : 0.80
```

### Stratégie 2 — Calibration de seuils par groupe (étudiée puis abandonnée)

Nous avons aussi étudié une approche post-processing : calibrer des seuils différents selon le groupe d'âge pour égaliser les TPR (par ex. seuil ~0.05 pour Juniors, ~0.70 pour Mids/Seniors).

**Cette stratégie a finalement été abandonnée** car elle constitue du *demographic norming* — c'est-à-dire appliquer un standard de réussite différent selon une caractéristique protégée, ce qui correspond à une **discrimination directe** au sens juridique :

- **Loi belge du 10 mai 2007** et **Directive 2000/78/CE** — interdiction d'appliquer des standards différenciés selon l'âge.
- **AI Act Art. 10** et **RGPD** — privilégient la suppression de la variable sensible en amont, pas son utilisation pour différencier les seuils à l'inférence.

Pratiquement, la calibration ne fonctionnait pas non plus comme attendu : pour égaliser le TPR du groupe Junior, le seuil devait tomber si bas que le taux de sélection global de ce groupe explosait (~93%), preuve concrète que l'approche n'est pas déployable. Seule la stratégie 1 est donc retenue.

---

## Comparaison ancien vs nouveau modèle

Comparaison sur **le même test set** pour rester honnête.

| Métrique | Ancien modèle | Nouveau modèle (équitable) |
|---|---|---|
| **ROC-AUC** | **0.706** | 0.687 |
| **Accuracy** | 74% | **75%** |
| **Rappel** (sélectionné) | **0.70** | 0.55 |
| **Précision** (sélectionné) | 0.41 | 0.41 |
| **Rappel** (refusé) | 0.75 | **0.80** |
| **EOD Âge** (métrique clé) | 1.00 | **0.67** |

Nous perdons environ **2 points de ROC-AUC** et du rappel sur les positifs. C'est le **trade-off équité/performance** que nous assumons. Le modèle est légèrement moins performant globalement, mais il ne discrimine plus via des proxies d'origine ou d'âge.

> Dans un contexte de recrutement automatisé classé à haut risque par l'AI Act, **l'équité prime sur la performance brute**.

---

## Explication individuelle d'une décision

La dernière section du notebook montre comment expliquer à un recruteur (ou au candidat) pourquoi une décision a été prise. La fonction `explain_prediction_logistic` décompose la prédiction via les **log-odds** de chaque feature.

**Exemple — candidat `cv_0001.txt` :**

```
Rôle visé            : Software Engineer
Expérience           : 2.4 ans
Score éducation      : 3

Probabilité prédite  : 9.7%
Seuil de décision    : 63.5%
Décision             : ❌ REFUSÉ
```

Un graphique en barres horizontales est généré pour chaque décision :
- 🟢 **Vert** → la feature contribue à la sélection
- 🔴 **Rouge** → la feature contribue au refus

> Cette fonctionnalité répond directement à l'**Art. 14 de l'AI Act** sur la supervision humaine — le recruteur ne se contente pas de « faire confiance » au modèle, il peut comprendre et contester la décision.

---

## Conclusion

### Résultats clés

| Indicateur | Ancien | Nouveau | Δ |
|---|---|---|---|
| **EOD Âge** | 1.00 | 0.67 | **−0.33** ✅ |
| ROC-AUC | 0.706 | 0.687 | −0.019 |
| Recall sélectionné | 0.70 | 0.55 | −0.15 |

L'audit a permis de :

1. **Identifier les biais** du modèle original — forte corrélation avec l'âge (r = 0.543), TPR Junior = 0% sur le test set, langues exotiques agissant comme proxies d'origine.
2. **Quantifier ces biais** avec des métriques standard (DP, DI, EOD) et des tests Chi² (p = 0.026 pour EO sur l'âge), toujours out-of-sample.
3. **Corriger le modèle** en supprimant 6 features problématiques. Coût en performance accepté et documenté (−0.02 ROC-AUC).
4. **Expliquer les décisions** de façon individuelle via SHAP et log-odds pour permettre une supervision humaine conforme à l'AI Act.
5. **Documenter l'ensemble** du processus pour répondre aux obligations légales (Art. 9, 10, 13, 14).

### Réponses au cahier des charges (consignes WP2)

1. *Le système traite-t-il les candidats comparables de manière égale ?* — **Non, pour l'âge** sur l'ancien modèle (EOD = 1.00). Corrigé sur le nouveau (0.67).
2. *Y a-t-il des disparités mesurables ?* — Oui sur âge et éducation (Chi² significatif). Non sur distance ni francophonie marginale.
3. *Sont-elles justifiées par le poste ?* — Partiellement pour l'éducation (Master+ a vraiment plus de qualifiés), mais l'écart de TPR reste anormal.
4. *Le modèle peut-il être amélioré ?* — Oui : EOD Âge réduit de 33 points avec le modèle FAIR.
5. *Les décisions peuvent-elles être rendues plus transparentes ?* — Oui, via SHAP global + log-odds individuel.

### Limites

- Test set de **100 candidats** (20 positifs) → métriques bruitées, certaines cellules intersectionnelles ont un effectif < 10.
- Les attributs sensibles « vrais » (genre, nationalité, origine ethnique) **ne sont pas dans le dataset** — nous travaillons sur des proxies.

### Recommandations

- Effectuer un audit **annuel** avec un test set d'au moins 500 candidats.
- Documenter les décisions contestées (RGPD Art. 22 — droit à l'explication).
- Boucle de feedback humain pour les cas limites (proba ∈ [seuil ± 5%]).
- Collecter des **données démographiques anonymisées** pour mesurer les vrais attributs protégés.
- Former les recruteurs aux biais algorithmiques.

### Apports de la conférence intégrés à l'audit

1. **Justice & Équité** → choix de l'EOD (vue individuelle) plutôt que de la DP seule (vue collective sans contrôle des base rates).
2. **Intersectionnalité** → analyses croisées Âge × Francophonie et Âge × Géographie.
3. **Explicabilité** → triple couche L1 + SHAP + log-odds individuel (Art. 13 et 14 AI Act).
4. **Non-malfaisance / capability caution** → `age`, `distance` et langues exotiques retirées par principe de minimisation des données (RGPD Art. 5), même quand le test statistique seul ne les condamnerait pas.
5. **Durabilité / IA frugale** → régression logistique L1 préférée à un modèle deep (~64 KB sauvegardé, pas de GPU, entraînement en quelques secondes), à la fois éthique (intrinsèquement explicable) et environnemental (compute minimal).

**Un modèle performant n'est pas forcément un modèle équitable.** Nous avons choisi de sacrifier un peu de ROC-AUC pour avoir un système qui ne discrimine plus — choix légitime dans un contexte de recrutement automatisé à haut risque.

---

> *Notebook de référence : [`backend/notebooks/fairness_audit_modif.ipynb`](../notebooks/fairness_audit_modif.ipynb)*