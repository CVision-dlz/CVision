import yaml
import json
from pathlib import Path
from core.loader import load_cvs_from_folder
from core.analyzer import extract_cv

# charge la config depuis le config.yaml
with open("config/config.yaml", "r", encoding="utf-8") as file:
    config = yaml.safe_load(file)

# chargement de tous les CVs du dossier
all_cvs = load_cvs_from_folder("data/raw")

# traitement de chaque cv 1 par 1
for filename, cv_text in all_cvs.items():

    print(f"Traitement de {filename}...")

    # extrait des infos du CV via le LLM
    result_llm = extract_cv(cv_text, config)

    # sauvegarde du résultat dans data/processed/ avec le même nom mais en format .json
    output_path = Path("data/processed/") / filename.replace(".txt", ".json")
    output_path.write_text(json.dumps(result_llm, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Fichier {output_path} sauvegardé !")

print(f"\nTous les CVs ont été traités !")