import re
import time
from datetime import datetime
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import json

geolocator = Nominatim(user_agent="cv_distance_calculator_luxembourg")
LUXEMBOURG_COORDS = (49.6116, 6.1319)


def parse_date(date_str: str) -> datetime | None:
    for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y-%m', '%m/%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def extract_section(text: str, section_name: str) -> str:
    """Extrait une section entière jusqu'au prochain bloc majuscule ou fin de fichier."""
    pattern = rf"{section_name}:\s*(.*?)(?=\n\n[A-Z]|\Z)"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def extract_field(text: str, field_name: str) -> str | None:
    """Extrait une valeur sur une seule ligne (ex: 'Name: John Doe')."""
    match = re.search(rf"{field_name}:\s*(.+)", text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def compute_age(dob: datetime) -> int:
    now = datetime.now()
    return now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))


def compute_distance_km(address: str) -> float | None:
    """Géocode une adresse et retourne la distance en km depuis Luxembourg Ville."""
    search_address = address

    # Simplification pour les adresses US (ville + pays suffit pour géocoder)
    if "USA" in address.upper():
        parts = [p.strip() for p in address.split(',')]
        if len(parts) >= 2:
            search_address = f"{parts[-2]}, USA"

    try:
        location = geolocator.geocode(search_address, timeout=10)
        if location:
            coords = (location.latitude, location.longitude)
            return round(geodesic(coords, LUXEMBOURG_COORDS).kilometers, 2)
    except Exception as e:
        print(f"Géolocalisation échouée pour '{search_address}': {e}")

    return None


def extract_skills(cv_text: str) -> list[str]:
    """Extrait les compétences depuis la section Skills (ignore les labels 'Technical:', etc.)."""
    skills_text = extract_section(cv_text, "Skills")
    skills = []

    for line in skills_text.split('\n'):
        line = line.strip()
        if not line:
            continue
        # Supprime le label de catégorie s'il y en a un (ex: "Technical: Python, SQL")
        content = re.sub(r'^[^:]+:', '', line).strip()
        for skill in content.split(','):
            skill = skill.strip()
            if skill:
                skills.append(skill)

    return skills


def extract_languages(cv_text: str) -> list[dict]:
    """Extrait les langues et leur niveau (ex: 'English — C2')."""
    lang_text = extract_section(cv_text, "Languages")
    languages = []

    for match in re.finditer(r'^(.+?)\s*[—\-]\s*(.+)$', lang_text, re.MULTILINE):
        languages.append({
            "language": match.group(1).strip(),
            "level":    match.group(2).strip()
        })

    return languages


def extract_certifications(cv_text: str) -> list[dict]:
    """Extrait les certifications avec leur année si présente (ex: 'AWS Certified — 2021').
    Chaque ligne = une certification. On tente d'y trouver une année, sinon year=None.
    """
    cert_text = extract_section(cv_text, "Certifications")
    certifications = []

    for line in cert_text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Tente de trouver une année en fin de ligne (après — ou -)
        match_with_year = re.match(r'^(.+?)\s*[—\-]\s*(\d{4})$', line)
        if match_with_year:
            certifications.append({
                "name": match_with_year.group(1).strip(),
                "year": int(match_with_year.group(2))
            })
        else:
            certifications.append({
                "name": line,
                "year": None
            })

    return certifications


def extract_graduation_year(cv_text: str) -> int | None:
    """Extrait l'année de diplôme depuis la section Education.
    Format attendu : '... — YYYY' en fin de ligne (ex: 'BSc Statistics — Univ — 2012').
    """
    edu_text = extract_section(cv_text, "Education")

    # Cherche la dernière occurrence d'une année à 4 chiffres dans la section
    years = re.findall(r'\b(20\d{2}|19\d{2})\b', edu_text)
    if years:
        return int(years[-1])  # Prend la dernière année trouvée (la plus récente)

    return None

def clean_cv_text_for_llm(cv_text: str) -> str:
    """
    Caviarde les sections déjà extraites par Python (Skills, Languages, Certifications)
    pour éviter d'envoyer des tokens inutiles au LLM.
    """
    cleaned_text = cv_text
    sections_to_remove = ["Skills", "Languages", "Certifications"]

    for section in sections_to_remove:
        # Supprime la section jusqu'au prochain double saut de ligne suivi d'une majuscule
        pattern = rf"{section}:\s*(.*?)(?=\n\n[A-Z]|\Z)"
        cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.DOTALL | re.IGNORECASE)

    # On peut aussi enlever la section Address si elle prend de la place
    cleaned_text = re.sub(r"Address:\s*(.*?)\n", "", cleaned_text, flags=re.IGNORECASE)

    return cleaned_text.strip()


def compute_experience_metrics(experiences: list) -> dict:
    """
    Prend la liste brute des expériences du LLM et calcule:
    - La durée de chaque poste
    - Les trous de plus de 1 mois
    - L'expérience totale en années
    """
    if not experiences:
        return {"experiences": [], "total_experience_years": 0.0, "experience_gaps_months": []}

    total_months = 0
    gaps = []
    enriched_exps = []
    parsed_exps = []

    # 1. Convertir les dates en objets datetime pour le tri
    for exp in experiences:
        start_date = parse_date(exp.get("start", ""))
        end_str = exp.get("end", "").lower()
        end_date = datetime.now() if end_str == "present" else parse_date(end_str)

        if start_date:
            parsed_exps.append({"raw": exp, "start": start_date, "end": end_date or start_date})
        else:
            exp["duration_months"] = None
            enriched_exps.append(exp)  # Expérience invalide gardée telle quelle

    # Trier chronologiquement
    parsed_exps.sort(key=lambda x: x["start"])

    # 2. Calculer les durées et les gaps
    for i, exp in enumerate(parsed_exps):
        # Durée du poste
        diff = exp["end"] - exp["start"]
        duration_months = round(diff.days / 30.44)
        total_months += duration_months

        exp_dict = exp["raw"].copy()
        exp_dict["duration_months"] = duration_months
        enriched_exps.append(exp_dict)

        # Gap avec le poste suivant
        if i < len(parsed_exps) - 1:
            next_start = parsed_exps[i + 1]["start"]
            gap_diff = next_start - exp["end"]
            gap_months = round(gap_diff.days / 30.44)

            if gap_months > 1:
                gaps.append({
                    "from": exp["end"].strftime("%Y-%m"),
                    "to": next_start.strftime("%Y-%m"),
                    "duration_months": gap_months
                })

    return {
        "experiences": enriched_exps,
        "total_experience_years": round(total_months / 12, 1),
        "experience_gaps_months": gaps
    }


def pre_process_cv(cv_text: str) -> dict:
    pre_data = {
        "name":                    extract_field(cv_text, "Name"),
        "target_role":             extract_field(cv_text, "Target Role"),
        "age":                     None,
        "distance_ville_haute_km": None,
        "graduation_year":         extract_graduation_year(cv_text),
        "years_since_graduation":  None,
        "skills":                  extract_skills(cv_text),
        "languages":               extract_languages(cv_text),
        "certifications":          extract_certifications(cv_text),
    }

    # Âge calculé depuis la date de naissance
    dob_str = extract_field(cv_text, "Date of Birth")
    if dob_str:
        dob = parse_date(dob_str)
        if dob:
            pre_data['age'] = compute_age(dob)

    # Âge du diplome depuis la de délivrance
    pre_data['years_since_graduation'] = datetime.now().year - pre_data['graduation_year']

    # Distance depuis Luxembourg Ville Haute
    address = extract_field(cv_text, "Address")
    if address:
        pre_data['distance_ville_haute_km'] = compute_distance_km(address)
        time.sleep(1)  # Respect du rate limit Nominatim

    print(json.dumps(pre_data))
    return pre_data


