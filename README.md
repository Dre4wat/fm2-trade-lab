# FM2 Trade Lab

A Madden-style trade simulator for the NeonSportz **FM2** league.

## Automatic FM2 updates

The GitHub Pages workflow runs every 15 minutes. Each run:

1. Fetches the current FM2 teams from NeonSportz.
2. Fetches the complete FM2 player list with pagination.
3. Normalizes the roster, ratings, development traits, trade values, contracts, cap fields and portraits.
4. Generates `data/fm2-data.json`.
5. Deploys the site to GitHub Pages.

The website also attempts a direct NeonSportz refresh after loading the GitHub snapshot. If the browser blocks the cross-site API request, the GitHub-generated snapshot remains active.

## First-time GitHub Pages setup

Open **Settings → Pages** and make sure the source is **GitHub Actions**. The `Sync FM2 and deploy Pages` workflow will handle the rest.

You can also run it immediately from **Actions → Sync FM2 and deploy Pages → Run workflow**.

## Data source

`https://neonsportz.com/api/leagues/FM2`

This project only reads league data. It does not submit trades or modify the Madden franchise.
