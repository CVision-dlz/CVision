import json
import pandas as pd
from pathlib import Path


def json2csv(input_path_json: str, output_path_csv: str):
    input_dir = Path(input_path_json)
    # On utilise un générateur d'itération plutôt qu'une liste en mémoire
    files = input_dir.glob("*.json")

    mappings = {
        "lang_fr": ["french", "français", "francais"],
        "lang_en": ["english", "anglais"],
        "lang_de": ["german", "allemand"],
        "lang_lu": ["luxembourgish", "luxembourgeois", "letzebuergesch"],
        "lang_es": ["spanish", "espagnol"],
        "lang_it": ["italian", "italien"]
    }

    # Création du dictionnaire inversé (inchangé, c'est la bonne méthode)
    reverse_mapping = {
        synonym: main_col
        for main_col, synonyms in mappings.items()
        for synonym in synonyms
    }

    # OPTIMISATION 1 : Pré-créer un template pour les langues à zéro
    lang_cols = list(mappings.keys())
    base_lang_dict = {col: 0 for col in lang_cols}
    base_lang_dict["lang_other_score_sum"] = 0

    data = []

    for f in files:
        with open(f, 'r', encoding='utf-8') as file:
            cv = json.load(file)

            # OPTIMISATION 2 : Extraire les sous-dictionnaires une seule fois
            # pour éviter les appels répétés à cv.get()
            meta = cv.get("meta", {})
            education = cv.get("education", {})

            # Construction de la ligne
            row = {
                "cv_id": meta.get("cv_id"),
                "age": cv.get("age"),
                "distance_ville_haute_km": cv.get("distance_ville_haute_km"),
                "target_role": cv.get("target_role"),
                "total_experience_years": cv.get("total_experience_years"),
                "education_degree": education.get("degree"),
                "education_field": education.get("field"),
                "education_school": education.get("school"),
                "education_score": education.get("education_score"),
                "skills": ", ".join(cv.get("skills", [])),

                # OPTIMISATION 3 : Utiliser c.get('name', '') au lieu de c['name']
                # pour éviter un KeyError si la clé est manquante.
                "certifications": ", ".join([c.get('name', '') for c in cv.get("certifications", [])]),
                "number_of_experiences": len(cv.get("experiences", []))
            }

            # On ajoute nos compteurs de langue par défaut
            row.update(base_lang_dict)

            # Traitement des langues
            for lang in cv.get("languages", []):
                lang_name = lang.get("language", "")
                if not lang_name:
                    continue

                lang_name = lang_name.strip().lower()
                score = lang.get("score")
                score = score if score is not None else 1

                # OPTIMISATION 4 : dict.get() au lieu du "in dict" suivi d'un accès
                col_name = reverse_mapping.get(lang_name)

                if col_name:
                    # Remplacer max() par un if est très légèrement plus rapide
                    # en Python car on évite un appel de fonction
                    if score > row[col_name]:
                        row[col_name] = score
                else:
                    row["lang_other_score_sum"] += score

            data.append(row)

    # Création du DataFrame
    df = pd.DataFrame(data)

    # Conversion des types en un seul appel direct
    cols_to_int = lang_cols + ["lang_other_score_sum"]
    df[cols_to_int] = df[cols_to_int].astype(int)

    df.to_csv(output_path_csv, sep=";", index=False, encoding='utf-8')
    print(f"CSV sauvegardé : {output_path_csv} ({len(data)} entrées)")