# Sécurité, données et limites connues

## Action immédiate : secrets exposés

Les fichiers transmis dans la conversation incluent des secrets en clair (identifiants cloud, clés API OctoPrint, codes d’accès, mots de passe de flux vidéo et accès réseau). Considérer ces valeurs comme compromises : **les révoquer ou les renouveler avant le prochain déploiement**. Ne pas les recopier dans la documentation, les tickets, les captures d’écran ou des commits.

Les secrets figurant déjà dans un dépôt Git peuvent rester accessibles dans l’historique même après une modification du dernier commit. Après rotation, retirer les valeurs du code, configurer un mécanisme de secrets adapté et traiter l’historique selon les règles de l’organisation. Ne pas publier de clés ou d’adresses internes dans un dépôt public.

## Limites de sécurité du code transmis

- Le serveur écoute sur `0.0.0.0`; le Compose publie le site sur le réseau de l’hôte.
- Aucune authentification ni autorisation applicative n’est visible pour l’interface, `/upload` ou les événements Socket.IO. Une personne pouvant atteindre ces interfaces peut voir les informations ou tenter d’envoyer des commandes.
- L’upload ne montre pas de validation serveur stricte de taille, extension ou type de contenu. L’extension acceptée par l’interface n’est pas une protection serveur.
- Le nom de fichier est dérivé des champs utilisateur et du nom d’origine. Il faut valider et normaliser ces valeurs côté serveur, limiter leur longueur et éviter toute collision ou écrasement.
- Les erreurs réseau de plusieurs intégrations sont ignorées ou peu détaillées.
- La connexion MQTT Bambu est configurée avec `rejectUnauthorized: false`, ce qui désactive la validation du certificat du serveur MQTT.
- go2rtc peut publier plusieurs ports sur l’hôte; ses interfaces et flux doivent être restreints au réseau nécessaire.
- Le serveur ne montre pas de protection CSRF, de limitation de débit, de journal d’audit des commandes ou de limite d’upload.
- Le répertoire d’upload doit être isolé, non exécutable et persistant; le Compose transmis ne le monte pas par défaut.

Ces points doivent être évalués avant toute exposition hors du réseau local de confiance. La documentation ne rend pas le logiciel plus sûr à elle seule.

## Recommandations de mise en sécurité

1. Faire tourner immédiatement tous les secrets transmis et vérifier les journaux d’accès associés.
2. Déplacer secrets et identifiants hors du code versionné, par exemple vers un gestionnaire de secrets ou des variables injectées au déploiement; adapter le code et tester cette configuration.
3. Protéger l’application derrière un mécanisme d’authentification et d’autorisation adapté. Restreindre aussi l’accès réseau au site, aux routes Socket.IO et à go2rtc.
4. Ajouter validation de fichier côté serveur (format réellement inspecté, taille maximale, nom généré par le serveur, champs filtrés), ainsi que quotas et limitation de débit.
5. Activer la validation des certificats TLS lorsque la configuration de l’équipement le permet.
6. Utiliser des clés dédiées à privilèges minimaux et les renouveler régulièrement.
7. Éviter d’envoyer aux clients des secrets, adresses ou détails internes non nécessaires.
8. Ajouter des journaux utiles sans enregistrer de jetons, secrets ou données personnelles inutiles.
9. Mettre à jour et auditer les dépendances; ajouter des tests et un contrôle de démarrage pour les répertoires requis.

## Données personnelles

Le dépôt de fichiers associe un nom de fichier aux champs prénom et nom. Définir une durée de conservation des fichiers, informer les utilisateurs de leur traitement et limiter l’accès conformément aux règles du laboratoire.
