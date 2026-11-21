# Validation — SimpleCVTool v4

Dernière vérification locale : 21 novembre 2026.

`npm test` : 6 tests automatisés réussis.

Couverture :
- Route HTTP et 10 pages publiques.
- Configuration publique sans clés secrètes.
- Refus des routes IA et paiement sans configuration/authentification.
- Blocage des routes exposant les fichiers de serveur ou de secrets.
- 30 modèles disponibles, dont 3 gratuits.
- Absence de clé Groq fournie dans la conversation, de backdoor et d'ancien moteur local.

Tests **non effectués** faute d'identifiants réels et de projet de déploiement :
- Inscription et enregistrement sur un projet Supabase réel.
- Génération et amélioration réelles sur Groq.
- Abonnement et pass Stripe, webhook signé en production.
- Parcours visuel automatique Chromium (bloqué par la politique d'exécution du navigateur dans l'environnement d'essai).

Étapes obligatoires avant publication : exécuter la migration SQL sur Supabase, configurer les secrets du serveur, tester les achats et annulations Stripe en mode Test, revoir les CGV/RGPD et la fiscalité applicable.
