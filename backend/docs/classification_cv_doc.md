Il faut expliquer :
- faire attention car dataset déséquilibré
- features engineering
- On a trouvé un bon jeu de donnée après en avoir tester plein
- Expliquer l'utilisation de : stratify, StandardScaler, OneHotEncoder, TfidfVectorizer (et max_features dedans)
- Choix de la LogisticRegressionCV car les autres n'étaient pas bon (voir notebook V1)
- Expliquer pourquoi StratifiedKFold et l'utilisation de l1 (elastic net et l2 sont moins performant)
- L'utilisation F0.5 (pourquoi mieux que f1 dans notre cas)
- Expliquer le choix du seuil
- 