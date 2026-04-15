# Bid / No Bid Assessment App

A configurable web app based on the Excel bid / no bid process.

## What it does

- Lets users complete a bid / no bid assessment in the browser
- Scores attractiveness and feasibility live
- Flags key criteria that hit warning values
- Produces a clear recommendation such as `Bid`, `Bid with High Priority`, or `No Bid`
- Saves completed assessments
- Generates a downloadable PDF report
- Includes an admin area to edit questions, weights, options, and decision thresholds

## Deployment model

The frontend is published from [`public/index.html`](/Users/martynsheridan/Documents/New%20project/public/index.html).

The live app is designed to run on Netlify using serverless functions and Netlify Blobs:

- `GET/POST /api/config`
- `POST /api/config/reset`
- `GET/POST /api/assessments`
- `GET /api/reports/:id`

## Local files

- Seeded workbook-based config: [`data/default-config.json`](/Users/martynsheridan/Documents/New%20project/data/default-config.json)
- Local fallback server: [`server.js`](/Users/martynsheridan/Documents/New%20project/server.js)
- Netlify functions: [`netlify/functions`](/Users/martynsheridan/Documents/New%20project/netlify/functions)

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Run the local fallback server:

```bash
npm start
```

3. For Netlify-style local development, use:

```bash
npx netlify dev
```

## Deploy to Netlify

1. Push this repo to GitHub.
2. Import the GitHub repo into Netlify.
3. Netlify will use [`netlify.toml`](/Users/martynsheridan/Documents/New%20project/netlify.toml) automatically.
4. The app will then persist admin config, saved assessments, and generated PDFs using Netlify Blobs.
