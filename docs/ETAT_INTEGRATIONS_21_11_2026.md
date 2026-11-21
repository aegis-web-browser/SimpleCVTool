# État vérifié des intégrations — 21 novembre 2026

## Supabase : installé et contrôlé

Projet **SimpleCVTool**, ID `dcobmfocksjbbthsdnbh`, région `eu-west-1`.

Migration appliquée côté Supabase : `simplecvtool_initial_secure_schema` ; tables `user_documents`, `entitlements`, `ai_daily_usage`, `stripe_events` opérationnelles. RLS activée sur les quatre tables. Les fonctions SQL de quotas IA sont accessibles uniquement au rôle serveur (`service_role`). La fonction préexistante `rls_auto_enable()` a été retirée des privilèges `anon` et `authenticated` après audit.

La clé API **publique** Supabase est intégrée à `.env.example`. La clé privée (`service_role` ou `secret`) n'est pas accessible via l'extension et ne figure pas dans le dossier. Il faut la placer dans les variables secrètes de l'hébergeur avec le nom `SUPABASE_SERVICE_ROLE_KEY` ; elle ne doit jamais être exposée dans le navigateur.

## Stripe : catalogue prêt en mode test

- Pro 0,99 €/mois : `price_1UeH7zBJwgITD16gZ4QyQkgf`
- Pass 3 jours 0,59 € : `price_1UeH81BJwgITD16ge3ovQev2`
- Portail client configuré : `bpc_1UeH3oBJwgITD16gHTu9fIk6`.

Le secret Stripe `sk_test_...` ne peut pas être extrait via l'extension. **Ne le partagez pas dans une conversation.** Le créer/consulter depuis le tableau de bord Stripe, puis le déposer dans les variables secrètes de l'hébergeur sous `STRIPE_SECRET_KEY` (préférer une clé restreinte dotée des permissions adaptées, si possible).

## Webhook : code prêt, destination non créée

Le serveur possède une route `POST /api/stripe/webhook` avec vérification de signature. Elle nécessite un serveur HTTPS public. Tant que le domaine n'existe pas, créer un webhook de production avec une fausse URL donnerait une intégration cassée. Après déploiement : ajouter la destination et renseigner le secret `whsec_...` côté hébergeur. Événements actuels : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Pour un véritable lancement il faut aussi gérer événements asynchrones, remboursements, contestations et échecs de paiement (voir points de vigilance Stripe).

## Test complet d'achat : non effectué

Les 6 tests automatisés locaux valident les pages, les routes protégées et les modèles, mais **ne simulent pas un paiement bancaire, ni une livraison Stripe réelle**. Un test bout en bout exige : hébergement HTTPS opérationnel, secret Stripe, secret Supabase, webhook configuré, compte de test confirmé.

## Mise en route serveur

1. Installer/activer un hébergeur Node (Render proposé via l'extension).
2. Configurer `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, et une **nouvelle** `GROQ_API_KEY` révoquant la clé divulguée. Les valeurs publiques et identifiants de prix sont déjà dans `.env.example`.
3. Activer Auth Email et définir l'URL du site dans Supabase, une fois le domaine HTTPS obtenu.
4. Ajouter le webhook dans Stripe vers `https://DOMAINE/api/stripe/webhook` ; recopier le secret dans la configuration du serveur.
5. Tester l'achat avec une carte de test Stripe, puis vérifier dans Supabase l'attribution des droits et la résiliation.

Aucun paiement réel n'est activé. Les produits de Stripe ont été vérifiés en mode test.
