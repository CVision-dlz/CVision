import yaml
from fastapi import FastAPI, File, UploadFile
from core.analyzer import extract_cv

# ATTENTION CECI EST UN TEST AVEC FAST API -> TRANSFORMER LE CODE PYTHON EN UN SERV WEB POUR COMMUNIQUER AVEC N8N

# création de l'app FastAPI
app = FastAPI()

# chargement de la config comme d'habitude
with open("config/config.yaml", "r", encoding="utf-8") as file:
    config = yaml.safe_load(file)

# endpoint qui reçoit le fichier .txt et retourne un json extrait
@app.post("/process-cv")
async def process_cv(file: UploadFile = File(...)):

    # lit le contenu du fichier reçu
    cv_text = (await file.read()).decode("utf-8")

    # extrait les infos du CV via le LLM
    result = extract_cv(cv_text, config)

    # retourne le JSON
    return result