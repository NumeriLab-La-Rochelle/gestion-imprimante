# Architecture et fonctionnement

## Vue d’ensemble

Le projet est composé d’un serveur Node.js/Express, d’une interface web statique et d’un service go2rtc. Le serveur collecte les informations auprès des imprimantes et services distants, puis les diffuse à l’interface via Socket.IO.

```text
Navigateur
   ├── HTTP : interface, aide et POST /upload ──> Express (port 3000)
   └── Socket.IO : état/commandes ──────────────> Express
                                                   ├── MQTT TLS ──> Bambu Lab
                                                   ├── HTTP API ──> OctoPrint
                                                   └── HTTPS API ─> Ultimaker Connect

Caméras ──> go2rtc ──> URL de flux affichée par l’interface

Upload ──> Multer ──> /srv/stl-farm
```

## Fichiers principaux

- `server.js` : Express, Socket.IO, configuration des machines, collecte périodique des états, commandes et upload.
- `public/index.html` : interface de supervision et dépôt de fichiers.
- `public/aide/index.html` : procédure destinée aux utilisateurs.
- `go2rtc.yaml` : association des noms de flux aux sources vidéo.
- `Dockerfile` et `docker-compose.yml` : conteneur web et service go2rtc.
- `package.json` : dépendances Node.js.

## Intégrations imprimantes

### Ultimaker Connect

Le serveur obtient un jeton OAuth en flux `client_credentials`, met le jeton en cache jusqu’à son expiration, puis interroge périodiquement les clusters. Les machines sont rapprochées par leur nom cloud configuré. Si un travail actif est rapporté, le serveur transmet son état, sa progression et son estimation de fin. Les actions pause/reprise sont envoyées à l’API Connect lorsque les identifiants du cluster et du travail sont disponibles.

### OctoPrint

Pour chaque imprimante de type `octo`, le serveur interroge les routes d’état de travail et d’état imprimante, avec une clé API et un délai d’expiration court. Il lit l’état, le nom du fichier, la progression et les températures. Les commandes de pause/reprise sont transmises à l’API OctoPrint.

### Bambu Lab

Le serveur se connecte au broker MQTT TLS de l’imprimante et s’abonne aux rapports de l’appareil. Les messages fournissent notamment l’état, la progression, les températures, le nom de tâche et certaines informations AMS. Le serveur publie une commande de pause ou de reprise via MQTT.

## Cycle de mise à jour

Une boucle périodique dans `server.js` interroge les sources cloud et OctoPrint environ toutes les trois secondes et émet `printer_update` aux clients Socket.IO. Les rapports MQTT Bambu peuvent aussi provoquer une mise à jour. À la connexion, le serveur envoie au client les données courantes de chaque imprimante.

Les échecs de connexion à certaines sources sont actuellement absorbés ou peu détaillés. Une carte peut donc conserver un état précédent; contrôler les journaux et la connectivité avant de conclure que l’imprimante est réellement dans cet état.

## Flux vidéo

Les noms de flux déclarés dans `go2rtc.yaml` sont utilisés dans les URL construites par l’application. go2rtc relaie les flux des caméras; le navigateur charge ensuite ces URL. L’accès aux flux et aux ports go2rtc doit rester limité au réseau prévu.

## Dépôt de fichiers

L’interface envoie un formulaire multipart contenant `firstname`, `lastname` et `file` à `POST /upload`. Multer écrit temporairement le fichier dans `/srv/stl-farm`; la réponse indique le nom de fichier ou l’erreur d’upload. L’application n’effectue pas de tranchage. Le fichier est récupéré sur le poste de contrôle conformément au guide utilisateur.

> Le code fourni ne montre pas de validation stricte du format, de taille maximale, d’authentification ou de contrôle d’accès sur l’upload. Voir [Sécurité](SECURITE.md) avant exposition à un réseau autre que celui de confiance.
