# API HTTP et événements temps réel

Cette page décrit les interfaces visibles dans `server.js` et l’interface fournie. Elles sont destinées au fonctionnement interne du site; le serveur transmis ne met pas en place d’authentification applicative.

## Routes HTTP

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/` et fichiers statiques | Sert l’interface située dans `public/`. |
| `GET` | `/aide/...` | Sert les fichiers d’aide. |
| `POST` | `/upload` | Reçoit un formulaire `multipart/form-data` avec `firstname`, `lastname` et `file`; stocke le fichier sous `/srv/stl-farm`. |

### Réponse d’upload

En cas de succès, la réponse JSON comprend `status: "success"` et le nom du fichier. En cas d’erreur côté serveur, l’endpoint renvoie le statut HTTP 500 et un message d’erreur. Le code transmis ne précise pas de limite de taille ou de filtrage strict sur l’extension/MIME : ne pas considérer l’acceptation STL de l’interface comme une validation serveur.

## Socket.IO

### Événement serveur `printer_update`

Émis aux clients lorsqu’un état d’imprimante est reçu ou actualisé. Le message est un objet comprenant selon la machine des champs tels que :

- `id`, `name`, `type`, `status`
- `progress`, `filename`, `endTime`
- `tempNozzle`, `tempBed`
- `pla`, et éventuellement `camUrl`

Les champs peuvent être absents, initiaux ou dépendants du type d’imprimante. À la connexion, un événement est émis pour chaque imprimante configurée.

### Événement client `set_pla`

Charge utile attendue : `{ "id": "identifiant-imprimante", "value": "quantité" }`. Met à jour la valeur PLA associée dans la mémoire du serveur et la diffuse aux clients. Dans le code fourni, cette valeur n’est pas persistée dans une base de données.

### Événement client `toggle_pause`

Charge utile attendue : `{ "id": "identifiant-imprimante" }`. Demande une pause ou une reprise suivant le type et l’état connu de l’imprimante. L’événement ne constitue pas un contrôle d’accès : toute personne pouvant se connecter à Socket.IO peut potentiellement émettre des commandes.

## Compatibilité et disponibilité

Les champs d’état reflètent les données reçues des API ou du broker, et les noms d’état peuvent différer selon les fabricants. Les intégrations réseau dépendent des droits et de la disponibilité des équipements. Les erreurs ne sont pas toutes retournées au navigateur; consulter les journaux du service web.
