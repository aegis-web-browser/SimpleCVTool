# Installation clic par clic — Supabase, Groq et Stripe

Guide pour SimpleCVTool v4, établi le **21 novembre 2026**. L'intitulé exact des menus d'administration peut évoluer.

## 0 — Préparation

1. Installez **Node.js 20 ou supérieur** : https://nodejs.org/.
2. Décompressez le ZIP du site, par exemple dans `C:\SimpleCVTool-v4`.
3. Ouvrez le dossier avec l'Explorateur Windows, cliquez la barre d'adresse, saisissez `cmd`, puis Entrée.
4. Tapez `copy .env.example .env` et validez. Vous le modifierez avec le Bloc-notes : `notepad .env`.
5. **Ne publiez jamais** le fichier `.env`. Ne placez pas une clé Groq, Stripe ou Supabase secret dans une page HTML ni sur GitHub.

## 1 — Configurer Supabase

1. Ouvrez **https://supabase.com/dashboard** et connectez-vous.
2. Cliquez **New project** (Nouveau projet), choisissez l'organisation, un nom et un mot de passe de base de données fort.
3. Choisissez une région proche de vos utilisateurs (une région européenne si possible) puis cliquez **Create new project**.
4. Attendez que le projet soit prêt. Dans la barre latérale, ouvrez **SQL Editor**.
5. Cliquez **New query**. Dans le ZIP, ouvrez `supabase/001_init.sql` avec un éditeur de texte, **copiez tout**, collez dans l'éditeur SQL puis cliquez **Run**.
6. Les tables `user_documents`, `entitlements`, `ai_daily_usage` et `stripe_events` sont créées ; les règles **RLS** et fonctions de contrôle du quota aussi.
7. Ouvrez **Project Settings > API Keys** ou **Connect / Data API** selon la présentation du tableau de bord.
8. Copiez **Project URL** dans `SUPABASE_URL=...` et la **publishable/anon key** dans `SUPABASE_ANON_KEY=...`.
9. Copiez **service_role** (ancienne clé secrète JWT), ou une clé secrète compatible avec l'API de votre projet, dans `SUPABASE_SERVICE_ROLE_KEY=...`. **Elle reste exclusivement côté serveur**.
10. Ouvrez **Authentication > Providers > Email**. Activez la connexion par e-mail ; laissez **Confirm Email** activé pour un service public.
11. Ouvrez **Authentication > URL Configuration** : saisissez l'adresse finale de votre site dans **Site URL**, par exemple `https://simplecvtool.fr/`. Autorisez aussi cette URL dans les redirections, si nécessaire.
12. **Pour les e-mails** : vérifiez les limitations de l'expéditeur par défaut. En production, configurez un fournisseur SMTP fiable dans les paramètres d'authentification. Sinon, les nouveaux comptes peuvent ne pas recevoir tous les e-mails de confirmation.
13. Faites un test d'inscription, ouvrez l'e-mail de confirmation, puis connectez-vous par le formulaire du site.

Documentation : https://supabase.com/docs/guides/auth et https://supabase.com/docs/guides/database/postgres/row-level-security

### Que stocke Supabase ?

- `auth.users` : comptes, e-mails et authentification.
- `user_documents.content` : CV au format JSON (y compris photos éventuellement intégrées au CV).
- `entitlements` : droits gratuit / Pro / Pass et les identifiants Stripe nécessaires.
- `ai_daily_usage` : compteurs journaliers d'utilisation de l'IA.
- `stripe_events` : identifiants des événements reçus pour l'idempotence.

Stripe conserve ses propres données de paiement ; les demandes Groq sont traitées chez Groq et non dans Supabase.

## 2 — Configurer Groq

1. Ouvrez https://console.groq.com/keys et connectez-vous.
2. **Révoquez la clé fournie dans le chat : elle ne doit plus être considérée comme privée.**
3. Créez une **nouvelle clé**, et copiez-la uniquement dans la valeur `GROQ_API_KEY` du fichier `.env`.
4. Laissez `GROQ_MODEL=openai/gpt-oss-20b` (modèle conversationnel actif de production le moins cher actuellement listé).
5. Vérifiez les quotas actuels de votre organisation sur https://console.groq.com/settings/limits.
6. N'essayez pas d'insérer la clé directement dans `assets/app.js` ou `index.html`. L'API du site appellera Groq **depuis le serveur**.

## 3 — Créer votre compte Stripe

1. Ouvrez https://dashboard.stripe.com et créez ou connectez votre compte.
2. Activez le **mode test** (interrupteur Test mode) pour toutes les premières étapes. Ne commencez pas en mode réel.
3. Depuis le menu **Products / Catalogue de produits**, cliquez **Add product / Ajouter un produit**.
4. Nommez le premier produit **SimpleCVTool Pro**.
5. Ajoutez un tarif **EUR 0,99 €**, sélectionnez **Recurring / Récurrent**, périodicité **Monthly / Mensuelle**, puis **Save product**.
6. Ouvrez le produit créé, cliquez sur son prix, et copiez l'identifiant **`price_...`**. Collez-le dans `.env` à `STRIPE_PRICE_ID_PRO=`.
7. Revenez au catalogue, cliquez **Add product** une seconde fois.
8. Nommez-le **SimpleCVTool Pass 3 jours**.
9. Choisissez **One-time / Paiement unique**, devise **EUR**, prix **0,59 €**, puis enregistrez.
10. Copiez le nouvel identifiant **`price_...`** dans `.env` à `STRIPE_PRICE_ID_PASS=`.

**Pourquoi 0,59 € et non 0,29 € ?** Stripe documente un minimum de **0,50 € en EUR** pour les paiements par carte usuels. Un prix de 0,29 € échouera dans ce scénario. Les frais standard Stripe en France sont **1,5 % + 0,25 €** sur une carte standard de l'EEE, hors options et particularités fiscales. Cette tarification mérite un examen économique sérieux.

## 4 — Récupérer la clé Stripe secrète

1. Dans le tableau de bord Stripe, ouvrez **Developers / Développeurs > API keys / Clés API**.
2. Repérez **Secret key** (clé `sk_test_...`). Cliquez **Reveal test key / Révéler la clé de test**.
3. Copiez-la dans votre fichier `.env` à `STRIPE_SECRET_KEY=sk_test_...`.
4. Ne copiez pas une clé `pk_test_...` à cet endroit : c'est la clé publique, pas la clé secrète.
5. En mode réel, vous remplacerez cette clé par la `sk_live_...` et les deux prix par leurs **IDs réels**, différents du mode test.

## 5 — Configurer les webhooks Stripe

Le webhook permet au serveur d'apprendre qu'un abonnement a été activé, renouvelé, annulé ou modifié.

1. Votre site doit d'abord disposer d'une **URL HTTPS publique** (voir section 7). Pour les essais locaux, utilisez Stripe CLI ou un tunnel HTTPS.
2. Dans Stripe, allez dans **Developers > Webhooks / Event destinations (Destinations d'événements)**, puis cliquez **Add destination / Add endpoint**. Selon la version du tableau de bord, le menu peut varier.
3. Entrez l'URL **`https://VOTRE-DOMAINE/api/stripe/webhook`**.
4. Sélectionnez les événements suivants :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Enregistrez cette destination.
6. Ouvrez-la et affichez son **Signing secret**, qui commence par `whsec_...`.
7. Copiez cette valeur dans `.env` à `STRIPE_WEBHOOK_SECRET=...`.
8. Testez les événements en **mode test** ; dans le journal des livraisons, vérifiez le statut HTTP **200**.

Pour un test local, Stripe CLI peut transférer les événements : `stripe listen --forward-to localhost:5500/api/stripe/webhook`. Copiez alors le secret `whsec_...` fourni par la CLI à la place du secret de la destination distante pour ce test.

Documentation : https://docs.stripe.com/webhooks et https://docs.stripe.com/payments/checkout

## 6 — Activer le portail client Stripe

1. Dans Stripe, ouvrez **Settings / Paramètres > Billing / Facturation > Customer portal / Portail client** (les libellés peuvent différer).
2. Activez la **gestion des abonnements** et **la résiliation**.
3. Autorisez la mise à jour des moyens de paiement si vous le souhaitez.
4. Enregistrez les réglages.
5. Dans SimpleCVTool, le bouton **« Gérer ou résilier sur Stripe »** de `compte.html` redirige vers un portail Stripe authentifié créé par le serveur. Ce bouton est destiné à l'abonnement Pro ; le Pass 3 jours expire sans action.

Documentation : https://docs.stripe.com/customer-management

## 7 — Démarrer le site et le publier

### Sur votre ordinateur (Windows)

1. Dans `.env`, gardez `APP_URL=http://localhost:5500` et `PORT=5500`.
2. Ouvrez `cmd` à la racine du projet et tapez : `npm start`.
3. Ouvrez `http://localhost:5500/` dans votre navigateur.
4. Testez l'inscription, la connexion, l'ajout d'un CV et la sauvegarde sur Supabase.
5. En mode Stripe Test, utilisez la carte de test `4242 4242 4242 4242`, une date future et un CVC quelconque.
6. Dans Supabase > Table Editor, vérifiez la création de vos documents et l'évolution des droits.

### Sur un hébergeur Node (Render, Railway, VPS…)

1. Importez le dépôt du projet sur un hébergeur **capable d'exécuter un serveur Node.js permanent**.
2. Indiquez la commande de démarrage `npm start`.
3. Configurez toutes les variables de `.env` dans le panneau **Environment / Variables secrètes** de l'hébergeur. N'envoyez pas votre fichier `.env` sur GitHub.
4. Remplacez `APP_URL` par votre URL publique **HTTPS**, sans barre finale.
5. Déployez ; vérifiez `https://votre-domaine/api/health`.
6. Dans Supabase > Authentication > URL Configuration, changez **Site URL** vers votre domaine.
7. Dans Stripe, utilisez ce même domaine dans le webhook et recréez la destination et son secret si nécessaire.
8. Réalisez un parcours complet en **mode test** : achat Pro, activation, renouvellement simulé, annulation, achat du pass.
9. Complétez `mentions.html`, vos CGV, la politique de confidentialité, les factures et la fiscalité applicable avant d'activer les paiements réels.
10. Lorsque tout est validé, créez des **produits/prix réels** et configurez les clés `sk_live`, `price_...` et le webhook en mode réel.

## 8 — Que faire en cas de problème ?

- **Impossible de se connecter** : vérifier les clés publiques Supabase, le domaine, l'e-mail de confirmation et les journaux d'authentification.
- **Erreur SQL** : vérifier que la migration a été exécutée intégralement et que le projet utilise PostgreSQL Supabase.
- **Le PDF ne se télécharge pas** : le bouton ouvre l'impression ; dans Chrome/Edge, choisir **Enregistrer au format PDF**.
- **Erreur Groq 429** : les limites de l'organisation, et non celles du site, ont été atteintes ; consulter les limites Groq.
- **Stripe indique que le prix est incorrect** : contrôler les IDs `price_...`, les montants en centimes, la devise EUR, et la périodicité mensuelle du Pro.
- **Paiement réussi sans premium** : vérifier que le webhook est en HTTP 200, que ses événements sont sélectionnés et que la table `entitlements` est accessible côté serveur.
- **La clé Supabase `service_role` est refusée** : vérifier la compatibilité de la clé API du projet ; ne jamais utiliser la clé publique à la place du secret serveur.
