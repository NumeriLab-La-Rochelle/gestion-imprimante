# Configuration

La configuration fonctionnelle de la version transmise se trouve principalement dans `server.js` et `go2rtc.yaml`. Les secrets ne sont pas reproduits dans cette documentation.

## Serveur et accès

- Express sert le contenu statique de `public/`.
- Socket.IO partage le serveur HTTP.
- Le serveur écoute sur le port **3000** et sur toutes les interfaces réseau (`0.0.0.0`). Le Compose fourni publie ce port sur le port hôte **8080**.
- Le dossier d’upload configuré dans la version transmise est `/srv/stl-farm`.

## Imprimantes

La liste des imprimantes est déclarée dans le tableau `printers` de `server.js`. Chaque entrée contient notamment un identifiant interne, un nom visible, un type d’intégration et des valeurs initiales. Selon le type :

- `cloud_connect` : nom de cluster Ultimaker utilisé pour l’association avec l’API.
- `octo` : adresse IP, clé API et nom de flux caméra.
- `bambu` : paramètres de connexion MQTT, identifiant de série et code d’accès configurés dans `BAMBU_CONFIG`.

Pour ajouter ou remplacer une machine, modifier l’entrée correspondante et vérifier que son type est pris en charge par les branches d’interrogation et de commande du serveur. L’interface reçoit les cartes à partir des mises à jour Socket.IO; il n’existe pas de configuration de machines depuis le navigateur.

## Ultimaker Connect

Le bloc `UM_AUTH` déclare l’identifiant client, le secret, l’URL du jeton et les scopes OAuth. Utiliser des identifiants disposant uniquement des droits nécessaires. Si un nom de cluster change dans le cloud, mettre à jour le `cloud_name` de la machine.

## Bambu Lab

Le bloc `BAMBU_CONFIG` décrit l’adresse réseau, le code d’accès et le numéro de série. La connexion utilise MQTT TLS sur le port **8883**. Le paramètre `rejectUnauthorized: false` désactive la validation habituelle du certificat TLS : il réduit la garantie d’authenticité du serveur et doit être réévalué dans un environnement de production.

## OctoPrint

Chaque imprimante OctoPrint possède une adresse, une clé API et un `streamName`. Les clés API doivent être individuelles si possible, à privilèges minimaux, et protégées comme des mots de passe.

## Caméras

`VIDEO_BASE_URL` dans `server.js` fournit la base des URL caméra. `go2rtc.yaml` associe des noms de flux (par exemple ceux utilisés par Bambu et OctoPrint) à leurs sources. Les URL, identifiants et mots de passe intégrés aux URI de flux sont des secrets : ne pas les publier. Vérifier aussi les ports go2rtc ouverts par Docker Compose.

## Paramètres actuellement codés en dur

La version transmise contient les réglages et identifiants directement dans le code ou les fichiers YAML. Modifier ces valeurs exige une mise à jour du fichier puis un redéploiement. Le code tel que transmis ne lit pas de fichier `.env` et ne démontre pas de mécanisme de secrets Docker. Ne pas supposer que les variables d’environnement sont prises en charge sans modifier et tester le code.

La migration recommandée consiste à charger les secrets depuis un gestionnaire de secrets ou des variables d’environnement non versionnées, à ajouter une validation au démarrage et à retirer les anciennes valeurs de l’historique Git après rotation.
