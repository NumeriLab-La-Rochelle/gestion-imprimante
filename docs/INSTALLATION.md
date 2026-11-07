# Installation et déploiement

Ce guide décrit le déploiement à partir des fichiers Docker fournis dans le dépôt. L’application doit être installée sur une machine autorisée à joindre les imprimantes, le service Ultimaker Connect et le serveur de fichiers du laboratoire.

## Prérequis

- Docker Engine et le plugin Docker Compose.
- Accès réseau aux imprimantes, à Ultimaker Connect, au service caméra et au serveur de fichiers configuré.
- Les paramètres et secrets nécessaires aux intégrations, renseignés de façon sûre. Ne pas publier de secrets dans Git.
- Un emplacement persistant et accessible par le conteneur pour `/srv/stl-farm`.

## Configuration avant lancement

1. Vérifier les adresses des imprimantes et les noms de clusters dans `server.js`.
2. Vérifier les sources caméra dans `go2rtc.yaml` et l’URL publique de base des vidéos dans `server.js`.
3. Remplacer les secrets exposés dans les fichiers avant tout déploiement. Consulter [Sécurité](SECURITE.md).
4. Préparer le dossier de réception des fichiers.

### Point important : dossier d’upload

Le serveur écrit les fichiers dans `/srv/stl-farm`. Le Dockerfile et le `docker-compose.yml` transmis ne créent pas ce chemin et ne le montent pas depuis l’hôte. Sans correction, l’upload peut échouer et les fichiers ne bénéficient pas d’une persistance fiable.

Exemple de configuration à adapter dans `docker-compose.yml` :

```yaml
services:
  web:
    volumes:
      - ./stl-farm:/srv/stl-farm
```

Créer le dossier côté hôte et s’assurer que l’utilisateur du processus Node dans le conteneur peut y écrire. Cette modification doit être déployée et vérifiée avant de considérer le dépôt de fichiers opérationnel. Ne pas exposer ce dossier en accès public sans contrôle d’accès.

## Lancement

À la racine du dépôt :

```bash
docker compose up -d --build
```

Vérifier l’état des services :

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f go2rtc
```

L’application web est publiée sur le port hôte **8080** (`8080:3000`). Le service go2rtc publie les ports **1984**, **8554** et **8555** selon le Compose fourni. Restreindre leur accès au réseau nécessaire; ne pas les exposer directement à Internet sans sécurisation.

Ouvrir ensuite `http://<hôte>:8080/` depuis un réseau autorisé. L’aide est disponible dans l’application via **Aide**, et directement à `/aide/index.html`.

## Installation sans Docker (développement / diagnostic)

Le serveur requiert Node.js compatible avec les dépendances du `package.json` (Node.js 20 est utilisé par le Dockerfile fourni).

```bash
npm install
node server.js
```

Le serveur écoute sur `0.0.0.0:3000`. Avant le lancement, vérifier les chemins et la disponibilité de `/srv/stl-farm`. Cette méthode n’installe ni ne démarre go2rtc automatiquement.

## Mise à jour

1. Sauvegarder la configuration et le dossier persistant des fichiers STL.
2. Examiner les changements du code et des dépendances.
3. Reconstruire et redémarrer les conteneurs :

```bash
docker compose up -d --build
```

4. Vérifier les journaux, l’accès à l’interface, l’état de chaque intégration, les caméras et un upload de test.

## Retour arrière

Conserver l’image précédente et une copie de la configuration avant une mise à jour. Pour revenir en arrière, restaurer le code/configuration connus comme fonctionnels, reconstruire l’image puis vérifier que le volume de fichiers n’a pas été supprimé. Ne jamais supprimer le dossier contenant les fichiers STL pour rétablir l’application.
