# AGENTS

## Contexte

Ce depot contient une Serverless Function Node.js/TypeScript qui joue le role de proxy filtre entre Aquasys et l'API Willie.

Le besoin metier est simple :

- Partageons l'Eau dispose d'un acces API Willie avec visibilite large sur les compteurs du territoire.
- Aquasys ne doit voir qu'un sous-ensemble explicitement autorise de compteurs.
- La fonction expose donc une API dediee, authentifiee avec une cle propre a Aquasys, puis relaie uniquement les donnees Willie correspondant aux compteurs autorises.

L'objectif produit est de garder une integration stable cote Aquasys. Le jour ou Willie proposera des cles API restreintes nativement, le basculement vise doit se limiter au remplacement de l'URL d'endpoint et de la cle API, sans changement majeur du contrat expose.

## Liens utiles

- Documentation API Willie : https://docs.meetwillie.com/
- Token modes Willie : https://docs.meetwillie.com/#description/token-modes
- Support Willie : https://intercom-help.eu/willieeu/

## Fichiers a connaitre

- `src/index.ts` : point d'entree du handler Scaleway.
- `src/config.ts` : chargement et validation stricte des variables d'environnement.
- `src/requestGuards.ts` : validation des routes, methodes, query params et IDs compteurs.
- `src/willieClient.ts` : appel a Willie puis filtrage de la reponse.
- `.env.example` : reference de configuration a garder a jour.
- `README.md` : vue d'ensemble, deploiement et garde-fous d'exploitation.

## Regles de travail

- Ne jamais transformer ce projet en proxy pass-through generique.
- Garder `ALLOWED_UPSTREAM_PATHS` explicite et ancre.
- Garder `FILTER_ON_MISSING_METER_ID=fail` par defaut sauf cas documente.
- Ne jamais committer de secrets, de vraies cles API ou de listes de compteurs sensibles.
- Considerer `dist/` comme un artefact de build ; les modifications doivent partir de `src/`.
- Si le contrat expose a Aquasys change, documenter l'impact de migration dans `README.md`.

## Attentes de securite

- Toute evolution doit preserver l'allowlist des compteurs et des endpoints.
- Les headers, query params et logs ne doivent pas exposer les secrets Willie ou Aquasys.
- Les changements de configuration doivent rester pilotables via variables d'environnement, compatibles avec un deploiement Scaleway.
