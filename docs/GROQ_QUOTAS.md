# Groq — combien de CV sont possibles gratuitement ?

Données consultées le 21 novembre 2026 sur les pages officielles Groq :

- https://console.groq.com/docs/models
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/deprecations

## Modèle retenu

`openai/gpt-oss-20b` : modèle conversationnel en production à **0,075 $ / million de tokens en entrée** et **0,30 $ / million en sortie** sur la grille Developer, moins coûteux que GPT-OSS 120B. L'ancien `llama-3.1-8b-instant` est retiré de l'offre standard depuis le 16 août 2026.

## Limites affichées pour le plan Groq Free (GPT-OSS 20B)

- **30 requêtes/minute** (RPM)
- **1 000 requêtes/jour** (RPD)
- **8 000 tokens/minute** (TPM)
- **200 000 tokens/jour** (TPD)

Ce sont des limites **pour l'organisation Groq entière**, et non par utilisateur de votre site. L'écran `https://console.groq.com/settings/limits` de votre compte fait foi ; Groq peut faire évoluer les règles.

## Calcul de capacité

Chaque génération de CV demande en principe **1 appel API**. Le nombre effectif de CV possibles avec le plan gratuit Groq est :

`min(1 000 ; plancher(200 000 / nombre_total_de_tokens_par_CV))`

Exemples illustratifs :

| Tokens consommés (entrée + sortie) pour un CV | CV/jour théoriques |
|---:|---:|
| 750 | 266 |
| 1 000 | 200 |
| 1 500 | 133 |
| 2 000 | 100 |
| 3 000 | 66 |
| 4 000 | 50 |

**Maximum théorique selon le plafond de requêtes : 1 000 CV/jour**, uniquement si les CV sont suffisamment courts pour ne jamais dépasser 200 000 tokens/jour ni les limites/minute. Cela **n'est pas** une capacité garantie. Un CV plus détaillé consomme davantage de tokens ; la sortie du modèle et le prompt système comptent aussi.

En pratique, sur l'hypothèse de **1 500 à 2 000 tokens par CV**, prévoir environ **100 à 133 générations/jour** pour l'ensemble de la plateforme, sous réserve de limites/minute et de la consommation réelle. Ce sont des estimations, pas un test de charge.

### Quotas proposés dans SimpleCVTool

- Offre gratuite du site : **1 appel IA au total par compte** (génération **ou** amélioration).
- Offre Pro : **20 appels IA par jour et par compte** (compteur UTC).
- Pass 3 jours : **20 appels IA par jour et par compte** pendant la validité du pass.

Ces quotas commerciaux **ne créent pas de capacité Groq supplémentaire**. Avec 20 abonnés demandant chacun 20 CV de 1 500 tokens, la demande serait de 600 000 tokens et dépasserait la limite Free journalière Groq. Pour exploiter commercialement le site à grande échelle, il faudra passer sur une offre Groq payante ou ajuster les limites du site.

### Conseil de pilotage

Monitorer le nombre quotidien de requêtes, les tokens entrants/sortants (Groq `usage`), les erreurs HTTP 429 et les utilisateurs actifs, avant de promettre une génération immédiate à tous les abonnés.
