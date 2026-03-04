from pathlib import Path


def load_cv(filepath: str):
    """
    pour n8n, qui envoie, un CV à la fois, un mail -> un CV
    """
    path = Path(filepath)

    if not path.exists():
        raise FileNotFoundError(f"Fichier non trouvé : {filepath}")

    if path.suffix != ".txt":
        raise ValueError(f"Mauvais format : {path.suffix}")

    content = path.read_text(encoding="utf-8").strip()

    if not content:
        raise ValueError(f"Fichier vide : {filepath}")

    return content


def load_cvs_from_folder(folder_path: str) -> dict[str, str]:
    """
    pour l'entrainement du modèle ML, quand on aura 50 + CVs à entrainer
    """
    folder = Path(folder_path)

    if not folder.exists():
        raise FileNotFoundError(f"Dossier non trouvé : {folder_path}")

    cvs = {}
    for txt_file in folder.glob("*.txt"):
        cvs[txt_file.name] = load_cv(str(txt_file))

    if not cvs:
        raise ValueError(f"Aucun fichier .txt trouvé dans : {folder_path}")

    return cvs