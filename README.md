# AETERNA OS

Gestionale centrale di AETERNA, costruito con Next.js, TypeScript, Prisma e PostgreSQL.

## Prerequisiti

- Node.js 20.9+
- npm 11+
- PostgreSQL 15+

## Configurazione locale

Crea `.env` partendo da `.env.example` e imposta una connessione PostgreSQL locale:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/aeterna_os?schema=public"
```

Le credenziali reali devono rimanere esclusivamente nel file `.env`, che è ignorato da Git.

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate dev
```

## Avvio

```bash
npm run dev
```

La dashboard è disponibile su `http://localhost:3000`.

## Installazione su PC e smartphone (PWA)

L'app espone un manifest installabile, icone AETERNA dedicate e si avvia in modalità app sui browser compatibili. Su Android e desktop usare il comando `Installa app` nella barra del browser. Su iPhone aprire l'app in Safari, toccare `Condividi` e scegliere `Aggiungi alla schermata Home`.

La PWA è online-first: non viene registrata una cache offline dei dati aziendali e non vengono memorizzati token Shopify o altri secret nel browser. Quando manca la connessione l'interfaccia lo segnala e le operazioni che richiedono il server non devono essere considerate completate.

## Pubblicazione sicura

Prima di pubblicare configurare `AETERNA_AUTH_USERNAME` e `AETERNA_AUTH_PASSWORD`. Il proxy protegge pagine e API con HTTP Basic Auth e in produzione rifiuta l'avvio logico se le credenziali non sono configurate. È un gate sicuro solo se il servizio è esposto esclusivamente tramite HTTPS; per più utenti, ruoli, revoca e audit è necessario sostituirlo con un identity provider/sessioni applicative prima dell'uso aziendale esterno.

Il provider di hosting deve supportare Node.js/Next.js e variabili ambiente server-side, collegarsi a PostgreSQL tramite rete privata o allowlist, e non esporre mai PostgreSQL direttamente su Internet. `DATABASE_URL`, le credenziali Basic Auth e `SHOPIFY_ACCESS_TOKEN` devono restare variabili server-side.

## Verifica database

```bash
npm run db:validate
npm run db:status
```

Il controllo `GET /api/health` indica se PostgreSQL è `connected`, `unavailable` o `not_configured` senza esporre la stringa di connessione.

## Shopify

La sincronizzazione Shopify usa la GraphQL Admin API `2026-10`. Per abilitarla configura solo localmente nel file `.env`:

```env
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
SHOPIFY_ACCESS_TOKEN=""
SHOPIFY_API_VERSION="2026-10"
```

Il token non viene salvato nel database, mostrato nella UI o scritto nei log. Senza queste variabili l'endpoint Shopify resta esplicitamente `NOT_CONFIGURED` e non vengono creati dati fittizi.

Da Settings è possibile controllare lo stato e avviare manualmente il primo sync. Il sync importa ordini, righe ordine, prodotti, clienti e inventario disponibili nell'API Shopify, usando paginazione a cursore e upsert idempotenti.

## Controlli qualità

```bash
npm run db:format
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run build
```

## Architettura

- `src/app`: pagine App Router e API interne
- `src/components`: UI riutilizzabile e layout
- `src/server/domain`: regole di business testabili senza database
- `src/server/services`: persistenza e transazioni Prisma
- `src/server/validation`: validazione server-side
- `src/integrations`: adapter isolati per servizi esterni
- `prisma`: schema PostgreSQL e migration

Meta Ads, analytics e Astra reale non sono ancora configurati. Non esiste alcun seed automatico di dati aziendali e la modalità demo è opt-in tramite `AETERNA_DEMO_MODE`.
