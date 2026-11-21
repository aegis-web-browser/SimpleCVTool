# Déploiement SimpleCVTool sur Render

## Préparé

La base Supabase `dcobmfocksjbbthsdnbh` est créée et auditée. Les deux tarifs de test Stripe sont créés. Le site s'exécute sous Node 20+. Le fichier `render.yaml` crée un service Web Render **gratuit pour les essais**, en région de Francfort, sans créer de nouvelle base. L'URL du site utilise automatiquement `RENDER_EXTERNAL_URL` lorsqu'`APP_URL` n'est pas défini.

## Dépendances bloquantes

Render ne peut déployer le code à partir du ZIP : il faut un dépôt GitHub, GitLab ou Bitbucket contenant le dossier. Le seul dépôt GitHub actuellement accessible est Aegis Web, qui ne doit pas être modifié pour SimpleCVTool. Il faut donc créer un dépôt dédié, idéalement **privé** et autorisé pour Render.

Dans le Dashboard Render, dans le service > **Environment**, ajouter les variables **privées** ci-dessous :

- `SUPABASE_SERVICE_ROLE_KEY` : la clé secrète Supabase du projet (jamais dans une page Web ou un dépôt).
- `STRIPE_SECRET_KEY` : une clé Stripe **test** avec permissions adaptées.
- `STRIPE_WEBHOOK_SECRET` : le secret de la destination d'événements `whsec_...`, obtenu après création de la destination.
- `GROQ_API_KEY` : nouvelle clé Groq ; l'ancienne clé partagée dans le chat doit être révoquée.

Le reste est prérempli dans `render.yaml` pour le test. Les deux montants de Stripe sont en centimes : 99 et 59.

## Mise en place (après création du dépôt)

1. Mettre le contenu du dossier SimpleCVTool à la racine d'un dépôt GitHub privé. Ne jamais ajouter `.env`.
2. Ouvrir **Render > New > Blueprint** et sélectionner ce dépôt. Le Blueprint créera un service Node dans la région Frankfurt. Le service peut être en erreur de configuration avant l'ajout des secrets privés.
3. Ajouter les secrets dans **Render > service > Environment** puis enregistrer avec redéploiement.
4. Ouvrir `https://NOM.onrender.com/api/health` et vérifier les indicateurs `supabaseConfigured`, `groqConfigured`, `stripeConfigured`. Pour l'instant, ce diagnostic n'indique pas si une clé est valide, seulement si elle est présente.
5. Dans Supabase > Authentication > URL Configuration, renseigner l'URL HTTPS du site.
6. Dans Stripe **Test > Developers > Event destinations**, ajouter `https://NOM.onrender.com/api/stripe/webhook`, écouter `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` en vérifiant que votre handler sait traiter chaque événement. Pour les événements non pris en charge, ne pas les abonner simplement pour les ignorer.
7. Copier uniquement `whsec_...` dans les variables Render puis redéployer.
8. Créer un utilisateur Supabase de test, faire un achat Stripe avec la carte de test 4242 4242 4242 4242, contrôler l'enregistrement de l'achat et les droits dans `entitlements`. Test complémentaire nécessaire : renouvellement, annulation, expiration de pass, échec de paiement, achat asynchrone.

## Rappel

Ne pas activer de vrais paiements tant que les CGV, politique de confidentialité et conformité fiscale ne sont pas vérifiées. La franchise en base française ne règle pas à elle seule la taxation des ventes transfrontalières. En production, envisager un plan Render payant pour limiter les risques liés au sommeil des instances gratuites.
