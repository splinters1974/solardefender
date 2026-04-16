# Solar Defender

A simple Atari-style browser game built as a static site.

## Game loop

- You control a cleaner with a squeegee shield.
- There are 20 solar panels to protect.
- Level 1 lasts 75 seconds while a Trump-style orange-faced character throws stones.
- Level 2 lasts 75 seconds and adds an Ed Miliband-style suited character throwing heavy bundles of cash.
- You win a level by surviving with at least one panel left.
- If all panels are smashed, the game ends immediately.

## Controls

- Move: `Left / Right Arrow` or `A / D`
- Raise shield: `Space`
- Touch controls are included for mobile

## Sound

The soundtrack and effects are generated in the browser with Web Audio, so there are no audio files to manage.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the local server:

```bash
npm start
```

3. Open:

```text
http://127.0.0.1:3000
```

## Deploy to Netlify

1. Push your changes to GitHub.
2. Import the repo into Netlify, or trigger a new deploy if it is already connected.
3. Netlify will publish the static frontend from the `public` folder using the existing repo setup.

## Deploy to GitHub Pages

This repo now includes a GitHub Actions workflow that publishes the game from the `public` folder.

1. Push your changes to GitHub.
2. In GitHub, open the repo and go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Go to the `Actions` tab and wait for `Deploy to GitHub Pages` to finish.
5. Your game will then be live at:

```text
https://splinters1974.github.io/solardefender/
```

If the site does not appear straight away, wait a minute and refresh the Pages settings screen.
