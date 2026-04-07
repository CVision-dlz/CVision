import json
import pandas as pd

from pathlib import Path


def json2csv(input_path_json: str, output_path_csv: str):
    input_dir = Path(input_path_json)

    files = list(input_dir.glob("*.json"))
    data = []

    for f in files:
        with open(f, 'r', encoding='utf-8') as file:
            cv = json.load(file)

            # Aplatir les données imbriquées pour qu'elles tiennent sur une ligne CSV
            row = {
                "cv_id": cv.get("meta", {}).get("cv_id"),
                "age": cv.get("age"),
                "distance_ville_haute_km": cv.get("distance_ville_haute_km"),
                "target_role": cv.get("target_role"),
                "total_experience_years": cv.get("total_experience_years"),
                "education_degree": cv.get("education", {}).get("degree"),
                "education_field": cv.get("education", {}).get("field"),
                "education_school": cv.get("education", {}).get("school"),
                "education_score": cv.get("education", {}).get("education_score"),
                "skills": ", ".join(cv.get("skills", [])),
                "languages": ", ".join([f"{l['language']} ({l['level']})" for l in cv.get("languages", [])]),
                "certifications": ", ".join([c['name'] for c in cv.get("certifications", [])]),
                "number_of_experiences": len(cv.get("experiences", []))
            }
            data.append(row)

    df = pd.DataFrame(data)
    df.to_csv(output_path_csv, index=False, encoding='utf-8')
    print(f"CSV sauvegardé : {output_path_csv} ({len(data)} entrées)")