# SimpleCVTool v6 — corrections de navigation et IA
- Les pages de connexion et d'inscription redirigent un utilisateur déjà connecté vers ses CV.
- Les menus affichent « Mon espace » et adaptent les liens d'inscription selon l'état du compte.
- Les liens de retour après connexion sont limités aux pages internes et les changements de session sont synchronisés.
- Les offres Premium déjà actives ne sont pas proposées une deuxième fois.
- L'assistant IA propose trois niveaux de développement : synthétique, équilibré (par défaut) et détaillé.
- Le modèle reformule les informations vérifiées, enrichit les responsabilités mentionnées et ne doit pas inventer de faits.
- Le CV envoyé à Groq ne comprend plus les photos ni les couleurs / paramètres d'apparence.
- Tests automatisés : `npm test`.
