# SimpleCVTool — Cloudflare Pages + Supabase Edge Functions

## Configuration Cloudflare (depuis le dépôt GitHub)

- Dépôt : `aegis-web-browser/SimpleCVTool`, branche `main`.
- Framework : **Aucun**.
- Commande de construction : `npm run build:cloudflare`.
- Répertoire de sortie : `dist`.
- Répertoire racine : vide.
- Aucune clé secrète dans Cloudflare Pages : le routage `/api/*` transfère les appels à la fonction Supabase.
- À la première installation, les scripts PDF.js sont installés via `pdfjs-dist` et copiés dans `dist/assets` ; le navigateur dispose d'une alternative CDN en cas d'indisponibilité de ces fichiers.

## Fonction Supabase

Fonction `simplecv-api`, projet `dcobmfocksjbbthsdnbh`, chemin :
`https://dcobmfocksjbbthsdnbh.supabase.co/functions/v1/simplecv-api/api/health`

La fonction doit être déployée avec `verify_jwt=false` **uniquement parce qu'elle contient des routes publiques** (CAPTCHA, configuration publique et webhook). Toutes les routes privées vérifient elles-mêmes le JWT utilisateur.

## Secrets à configurer depuis Supabase > Edge Functions > Secrets

- `GROQ_API_KEY` : clé secrète Groq ; après toute divulgation, générer une nouvelle clé.
- `STRIPE_SECRET_KEY` : clé Stripe mode **test** correspondant au même compte que les prix.
- `STRIPE_WEBHOOK_SECRET` : signature du **nouveau** webhook Stripe pointant vers l'URL Cloudflare Pages finale (`https://<projet>.pages.dev/api/stripe/webhook`).
- `OWNER_PREMIUM_CODE` : code d'accès privé ; n'utiliser ni GitHub ni le JavaScript public.
- `PUBLIC_SITE_URL` : adresse Cloudflare Pages réelle ; obligatoire pour les redirections de paiement.
- `STRIPE_PRICE_ID_PRO` et `STRIPE_PRICE_ID_PASS` : optionnels avec les tarifs test intégrés.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` : généralement fournis automatiquement à la fonction par Supabase. Vérifier avant d'ajouter quoi que ce soit.

Ne publiez aucune clé dans GitHub, Cloudflare Pages, ou le chat.

## Nouveautés v11

- Compte gratuit : **3 utilisations IA à vie**, conservant les usages précédents.
- Premium : importation d'un CV PDF externe dans le **modèle choisi dans la galerie**, avec extraction locale du texte. Les PDF scannés sont traités via l'IA multimodale Groq (jusqu'à 3 pages scannées). Un PDF chiffré ou scanné trop long sera refusé explicitement, sans fausse promesse de réussite.
- Impression : choisir **une page A4** ou **plusieurs pages A4** dans l'éditeur.
- Le PDF original n'est pas automatiquement sauvegardé. Il est traité sur l'appareil ; seuls les textes extraits, et les images en cas de scan, sont transférés à l'IA avec confirmation préalable.

## Avant d'abandonner Render

Tester : inscription/CAPTCHA, connexion, sauvegarde d'un CV, 3 utilisations IA gratuites, contrôle Premium PDF, PDF texte, PDF scanné, export A4 multipage, paiement Stripe test, activation Premium et webhook. Conserver Render tant que ces étapes ne sont pas validées.
