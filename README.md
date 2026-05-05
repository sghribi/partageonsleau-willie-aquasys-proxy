# Willie Aquasys Proxy

Serverless Function Node.js/TypeScript pour exposer à Aquasys une API intermédiaire vers Willie, avec :

- authentification Aquasys par clé API ;
- authentification Willie configurable ;
- allowlist stricte des endpoints Willie appelables ;
- allowlist des compteurs autorisés ;
- filtrage des paramètres entrants et des réponses JSON ;
- timeouts, rate limiting best-effort, limites de taille, en-têtes de sécurité ;
- configuration par variables d'environnement.

## Contexte

Willie expose les données de télérelève de l'ensemble des compteurs connectés du territoire via une API unique. Ce projet ajoute une couche d'intermédiation pour permettre à Aquasys d'accéder uniquement à un sous-ensemble prédéfini de compteurs, sans partager une clé Willie donnant accès à tout le parc.

## Ressources utiles

- Documentation API Willie : https://docs.meetwillie.com/
- Token modes Willie : https://docs.meetwillie.com/#description/token-modes
- Support Willie : https://intercom-help.eu/willieeu/

## Principe

Aquasys appelle cette fonction avec sa propre clé API. La fonction appelle Willie avec la clé Willie complète, puis ne relaie que les données correspondant aux compteurs autorisés.

Quand Willie proposera des clés restreintes natives, Aquasys pourra remplacer :

1. l'URL d'endpoint de cette fonction par l'URL Willie ;
2. la clé API Aquasys par la clé restreinte Willie.

Sous réserve que les endpoints, paramètres et formats de réponse restent équivalents, l'intégration pourra continuer à fonctionner de la même manière.

## Structure

```text
.
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── scripts/
│   └── local-server.mjs
├── src/
│   ├── auth.ts
│   ├── config.ts
│   ├── filter.ts
│   ├── globals.d.ts
│   ├── http.ts
│   ├── index.ts
│   ├── logger.ts
│   ├── rateLimit.ts
│   ├── requestGuards.ts
│   ├── types.ts
│   └── willieClient.ts
└── test/
    ├── filter.test.ts
    └── node-test-shims.d.ts
```

## Configuration minimale

Copier `.env.example` puis régler au minimum :

```bash
AQUASYS_API_KEYS="..."
WILLIE_API_BASE_URL="https://..."
WILLIE_API_TOKEN="..."
WILLIE_TOKEN_MODE="bearer"
ALLOWED_METER_IDS="meter-001,meter-002"
ALLOWED_UPSTREAM_PATHS="^/v1/readings/?$,^/v1/meters/[^/]+/readings/?$"
UPSTREAM_PATH_METER_ID_REGEXES="^/v1/meters/([^/]+)/readings/?$"
```

### Modes de token Willie

La variable `WILLIE_TOKEN_MODE` supporte :

- `bearer` : `Authorization: Bearer <token>` ;
- `x-api-key` : `<WILLIE_TOKEN_HEADER>: <token>`, par défaut `X-API-Key` ;
- `header` : header custom, avec `WILLIE_TOKEN_HEADER_VALUE_TEMPLATE` ;
- `query` : ajout du token dans la query string ;
- `none` : aucun token ajouté.

À régler selon la section `Token modes` de la documentation Willie.

### Filtrage côté Willie

Si Willie supporte un filtre de compteurs en query, renseigner `UPSTREAM_METER_QUERY_PARAM`, par exemple :

```bash
UPSTREAM_METER_QUERY_PARAM="meter_ids"
UPSTREAM_METER_QUERY_STYLE="csv"
```

La fonction injectera automatiquement les compteurs autorisés quand Aquasys ne fournit pas de filtre. Si Aquasys fournit un filtre, il doit être inclus dans `ALLOWED_METER_IDS`.

## Lancer localement

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm run start:local
```

Test :

```bash
curl -H "X-API-Key: change-me-client-key-1" \
  "http://localhost:8080/v1/readings?from=2026-01-01&to=2026-01-02"
```

## Tests

```bash
npm test
```

## Déploiement Scaleway Serverless Functions

Compiler :

```bash
npm install
npm run build
```

Créer une archive :

```bash
zip -r function.zip package.json dist README.md .env.example
```

Paramètres conseillés côté Scaleway :

- runtime : `node20` ou `node22` ;
- handler : `dist/src/index.handle` ;
- variables sensibles : utiliser les secrets Scaleway pour `AQUASYS_API_KEYS`, `AQUASYS_API_KEY_SHA256_HASHES` et `WILLIE_API_TOKEN` ;
- méthodes autorisées : idéalement `GET`, `HEAD`, `OPTIONS` uniquement.

## Points d'attention sécurité

1. Ne pas mettre `ALLOWED_UPSTREAM_PATHS=.*` en production.
2. Ne pas activer `ALLOW_NON_JSON_RESPONSES=true` sauf besoin maîtrisé, car ces réponses ne sont pas filtrables.
3. Garder `FILTER_ON_MISSING_METER_ID=fail` tant que les réponses Willie contiennent bien un identifiant compteur exploitable.
4. Adapter `METER_ID_KEYS` et `METER_ID_JSON_PATHS` aux vrais schémas Willie utilisés.
5. Préférer `AQUASYS_API_KEY_SHA256_HASHES` aux clés en clair si possible.
6. Faire tourner cette fonction dans une zone réseau et un namespace séparés des autres traitements.

## Exemple d'appel

```bash
curl \
  -H "X-API-Key: $AQUASYS_API_KEY" \
  "https://<function-url>/v1/readings?meter_ids=meter-001,meter-002&from=2026-01-01&to=2026-01-31"
```

Si `meter_ids` contient un compteur non autorisé, la fonction renvoie `403 Forbidden`.
