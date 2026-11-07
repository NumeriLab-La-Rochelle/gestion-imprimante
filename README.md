# Gestion des imprimantes 3D

Application web interne de supervision d’un parc d’imprimantes 3D. L’interface affiche l’état des machines, les caméras, la progression et les températures, permet de mettre en pause/reprendre certains travaux, de modifier les estimations de filament et de déposer des fichiers STL.

> Cette documentation est rédigée à partir des fichiers de version finale transmis dans la conversation. Les identifiants, mots de passe, clés API et codes d’accès ne sont volontairement pas recopiés ici. Ils sont actuellement présents en clair dans certains fichiers de configuration transmis : voir [Sécurité](docs/SECURITE.md).

## Documentation

- [Guide d’installation et de déploiement](docs/INSTALLATION.md)
- [Architecture et fonctionnement](docs/ARCHITECTURE.md)
- [Configuration des imprimantes et des flux vidéo](docs/CONFIGURATION.md)
- [API HTTP et événements Socket.IO](docs/API.md)
- [Exploitation et dépannage](docs/EXPLOITATION.md)
- [Sécurité et limites connues](docs/SECURITE.md)
- [Guide utilisateur](public/aide/index.html) — accessible depuis le bouton **Aide** de l’application

## Démarrage rapide avec Docker Compose

Depuis la racine du dépôt, après avoir vérifié la configuration réseau et les secrets :

```bash
docker compose up -d --build
docker compose logs -f web
```

L’interface web est publiée sur le port **8080** de l’hôte selon le `docker-compose.yml` fourni. go2rtc est lancé séparément pour les flux vidéo. L’application Node écoute sur le port **3000** dans son conteneur.

**À vérifier avant le premier démarrage :** le serveur reçoit les fichiers dans `/srv/stl-farm`. Le Dockerfile et le Compose fournis ne créent pas ce répertoire ni ne le montent sur un volume. Il faut donc corriger le déploiement pour créer et persister ce dossier avant d’utiliser le dépôt de fichiers; les détails et un exemple sont dans [Installation](docs/INSTALLATION.md).

## Technologies

- Node.js 20 et Express
- Socket.IO pour les mises à jour temps réel et les commandes de l’interface
- MQTT pour la Bambu Lab
- API OctoPrint pour les imprimantes locales
- API Ultimaker Connect pour les machines cloud
- Multer pour recevoir les fichiers
- go2rtc et FFmpeg pour les flux vidéo

## Structure du dépôt

```text
.
├── server.js                 # Serveur HTTP, intégrations imprimantes et upload
├── package.json              # Dépendances Node.js
├── Dockerfile                # Image du serveur web
├── docker-compose.yml        # Services web et go2rtc
├── go2rtc.yaml               # Sources des flux caméra
├── public/
│   ├── index.html            # Supervision et dépôt de fichiers
│   └── aide/index.html       # Guide utilisateur servi par l’application
└── docs/                     # Documentation technique
```

## Fonctionnalités

- Cartes de supervision pour Ultimaker Connect, OctoPrint et Bambu Lab.
- État, fichier en cours, progression, températures et heure de fin estimée lorsque la source les fournit.
- Flux vidéo accessibles depuis les cartes et en plein écran.
- Actions pause/reprise et saisie de la quantité de PLA restante.
- Dépôt d’un fichier avec identification par prénom et nom.

Les informations affichées dépendent de la disponibilité des imprimantes, des services distants et du réseau du laboratoire. Le dépôt de fichiers n’est pas un système de tranchage : le fichier doit ensuite être récupéré sur le poste de contrôle et préparé dans Cura ou Bambu Studio.

## Tests

Le `package.json` fourni ne définit pas de suite de tests automatisés : sa commande `npm test` est un placeholder qui échoue volontairement. Valider le déploiement sur un environnement de test et vérifier les flux avant toute utilisation réelle. Voir [Exploitation et dépannage](docs/EXPLOITATION.md).
