# SimpleCVTool – amélioration du 21 novembre 2026

## Éditeur

- Historique annuler / rétablir (raccourcis Alt+Z / Alt+Y).
- Duplication d'une rubrique ou d'une entrée, réorganisation et masquage.
- Export PDF via impression du navigateur, export TXT et sauvegarde JSON.
- 8 palettes prédéfinies, couleur du corps de texte et du papier, taille de photo, graisse du nom, casse des titres et espacement des lettres.
- Tableau de vérification des éléments utiles du CV (indicateur éditorial, pas une note de recrutement).
- Outils d'entretien : retirer rubriques vides, nettoyer espaces, modèle sobre en une colonne, créer une copie.
- Page d'accueil enrichie : fonctionnement, confidentialité, FAQ. Messages techniques retirés des interfaces commerciales.

## Accès Premium privé

- Variable serveur `OWNER_PREMIUM_CODE`, absente de GitHub, de la page Web et des fichiers livrés.
- Formulaire de saisie depuis « Mon compte » ; authentification obligatoire et limite des tentatives.
- Droit `promo` permanent dans Supabase, donnant 30 modèles et 20 actions IA / jour.
- Les événements Stripe ne révoquent pas ce droit ; une souscription existante continue d'être facturée tant qu'elle n'est pas résiliée manuellement.

## Paiements Stripe

- Le marchand doit définir un nom public ou commercial dans le compte Stripe. Dans l'état vérifié, Stripe refuse même la création d'une session de test avec `branding_settings.display_name` : c'est un prérequis du compte.
- En attendant, le site montre une erreur compréhensible en français et non la réponse technique en anglais.
- Aucun paiement réel n'a été effectué.

## Points avant commercialisation

- Compléter les mentions légales et le RGPD (identité de l'éditeur, suppression des comptes, durées de conservation, conditions commerciales).
- Remplacer les clés qui ont été partagées dans une conversation.
- Vérifier l'intégralité du paiement Stripe après saisie du nom public, avec un achat de test et la notification webhook.
- Effectuer des tests navigateur du nouvel éditeur ; les 20 tests Node ne remplacent pas des essais manuels de toutes les fonctionnalités d'interface.
