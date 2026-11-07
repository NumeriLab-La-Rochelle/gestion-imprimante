# Gestion des imprimantes 3D

Application web interne de supervision d’un parc d’imprimantes 3D. L’interface affiche l’état des machines, les caméras, la progression, les températures et les états de pause. Elle permet aussi de déposer des fichiers STL et de les déplacer vers le bureau de travail dédié.

## Documentation

- [Guide d’installation et de déploiement](docs/INSTALLATION.md)
- [Architecture et fonctionnement](docs/ARCHITECTURE.md)
- [Configuration des imprimantes et des flux vidéo](docs/CONFIGURATION.md)
- [API HTTP et événements Socket.IO](docs/API.md)
- [Exploitation et dépannage](docs/EXPLOITATION.md)
- [Sécurité et limites connues](docs/SECURITE.md)
- [Guide utilisateur](public/aide/index.html)

## Démarrage rapide

1. Copier le fichier `.env.example` en `.env` et renseigner les variables nécessaires.
2. Créer le dossier local `./stl-farm` pour le dépôt de fichiers.
3. Lancer le projet :

```bash
docker compose up -d --build
```

4. Vérifier la page d’accueil sur `http://localhost:8080/`.

## Variables d’environnement

Le projet est maintenant préparé pour utiliser des variables d’environnement plutôt que des secrets codés en dur dans `server.js`.

Exemple de fichier `.env` :

```env
VIDEO_BASE_URL=https://numerilab-cam.cesilarochelle.fr
FTP_HOST=10.0.50.55
FTP_USER=gestion-impression
FTP_PASSWORD=xxxxxxxx
FTP_REMOTE_PATH=

BAMBU_IP=10.0.0.1
BAMBU_ACCESS_CODE=xxxxx
BAMBU_SERIAL=xxxxx

ULTIMAKER_CLIENT_ID=xxxxx
ULTIMAKER_CLIENT_SECRET=xxxxx

ARMINA_KEY=xxxxx
GLAUCUS_KEY=xxxxx
BERGHIA_KEY=xxxxx
```

Les valeurs exactes doivent être renseignées dans votre environnement local ou votre orchestrateur. Ne jamais committer un `.env` réel.

## Structure du dépôt

```text
.
├── server.js
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── go2rtc.yaml
├── public/
│   ├── index.html
│   └── aide/index.html
├── docs/
│   ├── INSTALLATION.md
│   ├── ARCHITECTURE.md
│   ├── CONFIGURATION.md
│   ├── API.md
│   ├── EXPLOITATION.md
│   ├── SECURITE.md
│   └── README.md
└── stl-farm/  # créé localement, pas versionné
```

## Fonctionnalités

- Supervision temps réel d’un parc d’imprimantes
- Intégration Ultimaker Connect, OctoPrint et Bambu Lab
- Flux caméra via go2rtc
- Upload de fichiers STL + dépôt local
- Pause/reprise depuis l’interface
- Visualisation des températures et de la progression

## Sécurité

- Les secrets ne doivent plus être en dur dans le code.
- L’upload est écrit dans un dossier dédié et localisé.
- Le fichier `.env` est exclu du dépôt (`.gitignore`).
- Les ports exposés doivent rester limités au réseau de confiance du laboratoire.

## Déploiement

Le `docker-compose.yml` monte désormais le dossier `./stl-farm` dans le conteneur afin de garantir une persistance minimale des fichiers uploadés.

Le `Dockerfile` prévoit aussi la création du dossier `/srv/stl-farm` au démarrage.
