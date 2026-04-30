# LOT DE TRAVAIL 2  
## Cahier des Charges  
### Audit d'équité, Réflexion éthique et Refonte du modèle  

---

## PARTIE I - Contexte et Situation du Projet  

### 1. Évolution du contexte du projet  

Plusieurs mois après le déploiement du système automatisé de présélection de CV (développé dans le Lot de Travail 1), LuxTalent Advisory Group S.A. a commencé à utiliser l'outil de manière opérationnelle pour des campagnes de recrutement à fort volume.  

Le système traite automatiquement les CV entrants, extrait des informations structurées, applique un modèle prédictif formé sur des décisions historiques et produit des recommandations indiquant si les candidats doivent passer à l'étape de l'entretien.  

À première vue, le système semble fonctionner de manière fiable, réduisant la charge de travail manuelle et standardisant la phase de présélection. Les consultants RH apprécient les gains d'efficacité. Cependant, lors d'une révision interne, des inquiétudes émergent.  

L'équipe de conformité RH observe que certaines catégories de candidats semblent être invitées à des entretiens à des taux significativement différents par rapport à d'autres. Des modèles statistiques suggèrent de possibles déséquilibres entre des groupes spécifiques.  

Le modèle ayant été formé sur des décisions de recrutement historiques, il est possible que ces décisions passées aient intégré des biais implicites. Si l'algorithme a appris de ces modèles historiques, il pourrait reproduire et amplifier des inégalités structurelles.  

Le conseil d'administration de LuxTalent décide de lancer un audit interne et contacte votre équipe pour évaluer en profondeur le comportement du modèle.  

L'entreprise demande explicitement :  
- Le système traite-t-il les candidats comparables de manière égale ?  
- Y a-t-il des disparités mesurables à travers des groupes spécifiques ?  
- Si des disparités existent, sont-elles justifiées par des caractéristiques liées au poste ?  
- Le modèle peut-il être amélioré pour réduire les différences injustifiées ?  
- Les décisions peuvent-elles être rendues plus transparentes et explicables ?  

En parallèle, LuxTalent organise une conférence animée par un expert externe en systèmes de décision algorithmiques, éthique numérique et droit de la discrimination.  

Votre équipe doit assister à cette session, et les informations tirées de cette présentation doivent guider votre méthodologie d'audit et votre stratégie de refonte.  

L'entreprise vous commissionne désormais pour :  
1. Auditer l'équité du modèle de sélection existant.  
2. Identifier et mesurer les schémas potentiels de discrimination.  
3. Proposer et mettre en œuvre des stratégies correctives.  
4. Améliorer le système avec des mécanismes de transparence et d'explication.  
5. Livrer une version révisée de l'application reflétant ces améliorations.  

---

## PARTIE II - Livrables Attendus  

Le client attend trois résultats principaux :  
- Un audit d'équité structuré  
- Un modèle de sélection révisé  
- Une application améliorée intégrant des mécanismes de transparence  

Les étudiants conservent une liberté méthodologique mais doivent aborder les éléments suivants :  

### A. Intégration de la conférence d'experts (Composante Obligatoire)  
- La présence à la présentation de l'expert est requise.  
- Il faut extraire les principes conceptuels clés, identifier les considérations éthiques ou légales, et les intégrer dans le cadre de l'audit.  
- Il faut référencer explicitement la manière dont la conférence a influencé les choix techniques.  
- Un court document de réflexion doit relier les concepts de l'expert à la refonte du système.  

### B. Audit d'équité  
- Identifier les attributs potentiellement sensibles.  
- Faire une analyse statistique des disparités de décision.  
- Sélectionner et justifier les métriques d'équité.  
- Visualiser clairement les modèles observés.  
- Identifier les caractéristiques qui peuvent agir comme des indicateurs directs ou indirects (proxies).  

### C. Refonte du modèle et stratégie d'atténuation  
- Implémenter au moins une approche corrective (rééquilibrage des données, ajustement des caractéristiques, modification des seuils, approches de modélisation alternatives).  
- Comparer les modèles d'origine et révisés (métriques de performance avant/après).  
- Discuter des compromis entre les performances prédictives et les objectifs d'équité.  

### D. Explicabilité et transparence  
- Fournir des explications interprétables pour les décisions de sélection.  
- Identifier les caractéristiques influentes dans les prédictions individuelles.  
- Présenter les résultats sous une forme compréhensible pour le personnel RH.  

### E. Application mise à jour (Version 2)  
- L'application révisée doit intégrer le modèle amélioré.  
- Elle doit afficher les indicateurs liés à l'équité.  
- Elle doit maintenir l'automatisation de bout en bout ainsi que la traçabilité.  

### F. Documentation  
- Inclure la méthodologie d'audit.  
- Justifier les métriques choisies.  
- Expliquer la logique de refonte.  
- Intégrer les concepts de la conférence.  
- Fournir les diagrammes mis à jour.  
- Présenter une analyse comparative entre la Version 1 et la Version 2.  

---

## Base d'évaluation  

L'évaluation portera sur :  
- La profondeur de l'audit  
- La qualité de l'analyse  
- La cohérence avec la conférence  
- La mise en œuvre des corrections  
- L'intégration de la transparence  
- La qualité professionnelle du rendu  

À terme, le système doit passer d'un simple outil fonctionnel à un système d'aide à la décision évalué de manière critique, amélioré et plus transparent.  

---

# Résumé des actions à entreprendre : Que devez-vous faire concrètement ?  

En termes simples, votre mission consiste à corriger l'Intelligence Artificielle de recrutement que vous avez créée lors de la phase précédente. Celle-ci s'avère potentiellement discriminatoire envers certains candidats parce qu'elle reproduit les préjugés humains du passé.  

## Étapes clés  

### 1. Vous inspirer de l'expert  
Vous devez assister à une conférence sur l'éthique de l'IA. Prenez des notes, car vous devrez rédiger un petit document expliquant comment les propos de cet expert ont guidé vos choix techniques pour corriger votre IA.  

### 2. Prouver le problème (L'Audit)  
Plongez dans votre algorithme actuel et réalisez des statistiques. Vous devez prouver avec des graphiques et des chiffres qu'il existe un traitement inéquitable entre les candidats (par exemple, selon leur âge, leur genre, leur origine, bien que ces variables soient parfois cachées indirectement dans d'autres données).  

### 3. Réparer l'algorithme (La Refonte)  
Appliquez une solution technique pour réduire ces biais. Cela peut consister à modifier la pondération des données, à ajuster les critères de sélection ou à changer de modèle mathématique. Vous devrez montrer clairement la différence de performance et de justice entre l'ancien modèle et le nouveau modèle.  

### 4. Rendre l'IA compréhensible (L'Explicabilité)  
Les ressources humaines doivent comprendre pourquoi la machine a pris une décision. Votre nouvelle application doit afficher clairement quelles compétences, expériences ou mots-clés ont conduit à accepter ou rejeter un CV.  

### 5. Livrer le nouveau produit complet  
Mettez à jour le logiciel pour qu'il intègre le nouvel algorithme et les tableaux de bord explicatifs. Accompagnez cela d'un rapport professionnel documentant et justifiant toute votre démarche, vos choix mathématiques, et l'impact de vos corrections.  