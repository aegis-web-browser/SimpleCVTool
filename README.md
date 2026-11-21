# SimpleCVTool — version 4.0

**Site complet** basé sur la version Premium/Smart Layout et l'identité visuelle transmise le 21 novembre 2026.

## Ce qui est inclus

- Page d'accueil responsive, galerie, connexion, inscription, compte, éditeur, page tarifs.
- **30 modèles de CV** conservés depuis la version précédente, dont **3 gratuits et 27 réservés aux offres payantes**.
- Génération d'un CV depuis des notes **ET** amélioration d'un CV existant avec **Groq** (`openai/gpt-oss-20b`).
- Comptes **Supabase Auth**, CV enregistrés dans PostgreSQL Supabase avec **RLS**.
- Quotas IA **validés transactionnellement dans la base** : 1 utilisation gratuite par compte au total, puis 20 par jour UTC en formule Pro ou Pass.
- **Stripe Checkout** et **webhooks signés** pour l'abonnement Pro et le Pass trois jours ; portail Stripe pour la résiliation.
- Export PDF par impression du navigateur (« Enregistrer au format PDF »), export/import de sauvegardes JSON.
- Serveur Node.js **sans aucune dépendance npm** ; il suffit de Node 20+.

## Démarrage rapide

1. Installer Node.js v20 ou supérieur.
2. Décompresser le projet ; ouvrir un terminal dans `SimpleCVTool-v4`.
3. Copier `.env.example` en `.env`. **Ne jamais partager ni publier ce dernier**.
4. Créer un projet Supabase et exécuter **`supabase/001_init.sql`** dans son SQL Editor.
5. Renseigner les variables Supabase, Groq et Stripe dans `.env` (voir `docs/INSTALLATION_CLIC_PAR_CLIC.md`).
6. Démarrer avec : `npm start` ou `node server/index.cjs`.
7. Ouvrir **http://localhost:5500**.
8. Lancer les tests automatiques : `npm test`.

Sans les identifiants, les pages publiques s'affichent, mais **la connexion, l'enregistrement, l'IA et les paiements ne fonctionnent pas**.

## Architecture

```text
index.html                  Accueil / identité visuelle
connexion.html              Connexion Supabase
inscription.html            Inscription Supabase
modeles.html                Galerie des 30 CV
editeur.html                Éditeur et IA Groq
premium.html                Offres et Stripe Checkout
compte.html                 Statut et gestion du compte
dashboard.html              Documents et sauvegardes
mentions.html               Mentions légales / RGPD à finaliser
assets/data.js              Données CV et format
assets/templates.js         30 modèles, 3 gratuits
assets/ai.js                Application des sorties IA au CV
assets/store.js             Supabase Auth et sauvegarde cloud
assets/account.js           Vérification des droits serveur
assets/ui.css, brand.css    Mise en forme
assets/cv.css               Mise en page des CV A4
server/index.cjs            API HTTP / Groq / Stripe
supabase/001_init.sql       Tables, RLS, fonctions de quotas
docs/                       Instructions de configuration
tests/                      Tests automatiques
```

### Sécurité

- `GROQ_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` et `STRIPE_WEBHOOK_SECRET` sont **uniquement côté serveur**.
- La clé Supabase `ANON` est publique par conception ; les règles RLS limitent l'accès aux CV de chaque utilisateur.
- La création de Checkout est réservée à une session Supabase valide.
- Le paiement est contrôlé auprès de Stripe avant toute activation de droits.
- Le serveur signe et vérifie les requêtes Stripe webhook et les événements déjà traités.
- Les quotas IA sont réservés avec un verrou SQL ; ils sont remboursés en cas d'échec de la génération.
- **Limite importante :** le HTML/CSS des 30 modèles est visible côté client pour proposer les aperçus ; ce n'est pas un dispositif de protection contre la copie du code. L'accès normal à la sélection et à l'éditeur est verrouillé par l'application.
- **Attention RGPD :** les CV sont protégés par le contrôle d'accès Supabase mais ne sont pas chiffrés de bout en bout. Les textes des requêtes IA sont envoyés à Groq. Les données de paiement sont traitées chez Stripe.

## Coûts et tarifs

Le design initial propose un Pass à 0,29 €, mais **les paiements EUR courants par carte via Stripe ont un plancher de 0,50 €**. Pour que le paiement soit possible, l'exemple opérationnel retient **0,59 €** pour 3 jours ; Pro reste **0,99 €/mois**. Les montants Stripe sont vérifiés par l'API au lancement de Checkout. Il faut adapter la politique tarifaire, la fiscalité et les textes contractuels avant commercialisation.

## Tests et statut

Les tests locaux (`npm test`) contrôlent l'accès aux pages, l'absence de fuite des clés dans l'API publique, le refus des actions sans authentification, le blocage des fichiers de configuration et le compte de 30/3 modèles. **Les parcours de paiement, la base Supabase et les réponses Groq n'ont pas été testés en direct** : une configuration réelle et des tests en mode Stripe Test sont nécessaires.

## IMPORTANT : clé Groq exposée dans la conversation

La clé donnée dans le chat doit être **révoquée** depuis [Groq API Keys](https://console.groq.com/keys). Créez une **nouvelle** clé et ne la placez que dans `.env` ou dans les variables secrètes de votre hébergeur. L'ancienne clé n'est incluse dans aucun fichier livré.

Consultez `docs/INSTALLATION_CLIC_PAR_CLIC.md` pour la mise en ligne et `docs/GROQ_QUOTAS.md` pour l'estimation du nombre de CV gratuits.

## Stripe — configuration du 21 novembre 2026

Le catalogue Stripe de test du compte **New business** a été créé depuis ChatGPT : `SimpleCVTool Pro` 0,99 €/mois (`price_1UeH7zBJwgITD16gZ4QyQkgf`) et `Pass 3 jours` à 0,59 € une fois (`price_1UeH81BJwgITD16ge3ovQev2`). Les identifiants sont préremplis dans `.env.example`. Le portail client de test est activé et les résiliations prennent effet à la fin de la période courante. Aucune clé secrète n'a été fournie ni incluse dans ce dossier. Stripe Tax n'a pas été activé (franchise en base de TVA déclarée). Voir `docs/INSTALLATION_CLIC_PAR_CLIC.md`.

## Intégrations vérifiées en direct le 21 novembre 2026

Supabase connecté : migration du schéma appliquée, quatre tables avec RLS, fonctions de quotas uniquement accessibles par le serveur. Stripe : deux produits et prix actifs en **mode test**. **Ne sont pas encore réalisés** : déploiement sur un hébergeur HTTPS, installation des secrets Stripe et Supabase sur cet hébergeur, création du webhook public et test d’achat réel en mode test. Consultez `docs/ETAT_INTEGRATIONS_21_11_2026.md`.


## Améliorations récentes
Voir [docs/AMELIORATIONS_V5.md](docs/AMELIORATIONS_V5.md) pour les nouveaux outils d’édition et l’accès Premium privé.
Le code privé se configure exclusivement via `OWNER_PREMIUM_CODE` dans l’environnement Render, jamais dans le dépôt.
