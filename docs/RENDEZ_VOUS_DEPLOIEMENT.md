# Suite de déploiement — SimpleCVTool

## Vérification du 21 novembre 2026

- Espace Render confirmé : My Workspace (`tea-dc0sfm49v7es739qmnng`).
- Aucun service Render présent lors de la vérification.
- Compte GitHub connecté : seul dépôt visible `Aegis-Web-Browser` ; NE PAS y téléverser ce projet.
- `render.yaml` vérifié par rapport à la documentation Render ; le service cible `simplecvtool-test`, Node.js, plan gratuit, région Francfort.
- `npm test` : sept tests locaux réussis ; aucun paiement réel testé.
- Les secrets `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GROQ_API_KEY` sont demandés lors de l'initialisation Render Blueprint (`sync: false`).
- Le secret `STRIPE_WEBHOOK_SECRET` ne peut être obtenu qu'après enregistrement de l'adresse HTTPS du webhook Stripe.

## Une seule action bloquante

1. Sur GitHub, créer un dépôt privé `SimpleCVTool` : https://github.com/new — sans initialisation README, licence ou .gitignore.
2. Depuis le dossier extrait `SimpleCVTool-v4`, envoyer tous les fichiers dans ce dépôt sur sa branche `main`. Le fichier `render.yaml` doit être à la RACINE du dépôt.
3. Autoriser Render et le connecteur GitHub de ChatGPT à accéder à ce dépôt privé.
4. Revenir dans ChatGPT avec le lien du dépôt (`https://github.com/<compte>/SimpleCVTool`).

## Ensuite, depuis ChatGPT

1. Créer le service Render depuis le dépôt privé dans l'espace confirmé, en mode test.
2. Entrer les secrets uniquement dans l'interface sécurisée Render et vérifier le statut de `/api/health`.
3. Créer dans Stripe (mode test) l'endpoint `https://<adresse-du-service>/api/stripe/webhook`, configurer les événements Checkout et les événements de cycle de vie d'abonnement, et récupérer le secret de signature dans Render.
4. Déclencher un achat avec des identifiants de carte de test de Stripe ; vérifier le statut de Checkout, la signature webhook et la mise à jour des accès premium dans Supabase.
5. Vérifier les résiliations et les tentatives de paiement échouées. Ne pas activer le mode réel tant que ces vérifications ne sont pas terminées.

## Sécurité

Ne jamais ajouter `.env`, une clé `sk_test_...`, `whsec_...`, une clé Supabase service_role ni une clé Groq à GitHub. Renouveler la clé Groq autrefois partagée dans la conversation.
