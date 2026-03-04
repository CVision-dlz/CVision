import json
from datetime import date
from pathlib import Path
from groq import Groq

def load_prompt():
    """lit le fichier prompt.txt dans le dossier config et retourne son contenu"""
    return Path("config/prompt.txt").read_text(encoding="utf-8")


def extract_cv(cv_text, config):

    # création du client Groq avec notre clé API
    client = Groq(api_key=config["api"]["api_key"])

    # injecte la date du jour et le texte du CV dans le prompt
    prompt_date_cv = load_prompt().format(
        today = date.today().isoformat(),       # la date du jour
        cv_text = cv_text                       # le contenu brut du cv
    )

    # envoie le prompt au LLM et récupère la réponse
    response_llm = client.chat.completions.create(
        model = config["api"]["model"],
        messages=[
            {"role": "user", "content": prompt_date_cv}  # notre message au LLM
        ],
        temperature=config["api"]["temperature"],
    )

    # extrait le texte brut de la réponse et supprime les espaces inutiles
    raw = response_llm.choices[0].message.content.strip()

    # convertit le texte JSON en dict Python et le retourne
    return json.loads(raw)