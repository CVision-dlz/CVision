import json
import re
from pathlib import Path
from groq import Groq

def load_prompt():
    """Lit le fichier prompt.txt dans le dossier config et retourne son contenu"""
    return Path("config/prompt.txt").read_text(encoding="utf-8")

def extract_cv(cv_text, config):
    # Création du client Groq avec notre clé API
    client = Groq(api_key=config["api"]["api_key"])

    # Injecte le texte du CV dans le prompt (plus besoin de la date)
    prompt_content = load_prompt().replace("{cv_text}", cv_text)

    # Envoie le prompt au LLM et récupère la réponse
    response_llm = client.chat.completions.create(
        model=config["api"]["model"],
        messages=[
            {"role": "user", "content": prompt_content}
        ],
        temperature=config["api"]["temperature"],
    )

    # Extrait le texte brut de la réponse
    raw = response_llm.choices[0].message.content.strip()

    # Sécurité : supprime les balises markdown si le LLM en a généré
    raw = re.sub(r"^```json", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"^```", "", raw, flags=re.MULTILINE).strip()

    # Convertit le texte JSON en dict Python et le retourne
    return json.loads(raw)