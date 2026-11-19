# 🪐 Tiny Planets

A cozy papercraft sandbox in the browser. Everyone gets their own tiny 3D paper planet, and all planets float together in one shared universe. Build, zoom out to see everyone's worlds, and fly over to visit friends.

- **Instant play**: no sign-up. Your planet is tied to your device (a private key in `localStorage`).
- **Papercraft world**: 32 hand-built low-poly paper items: trees, homes, a temple, chai stall, auto rickshaw, rangoli, diyas, animals, roads and more.
- **Paper people** wander around and occasionally react to what you build.
- **Real-time day and night** in each owner's local time zone, with a "peek at daytime" toggle. Optional real local weather (paper-strip rain, paper-confetti snow) via Open-Meteo.
- **Sharing**: `/?p=<planet id>` links fly visitors straight to a planet, plus postcard screenshots.
- **Lo-fi music** generated live with WebAudio (no audio files, nothing to license).

## Tech

- Plain static site: `index.html`, `style.css`, `src/*.js` (ES modules), Three.js r170 vendored in `vendor/`. No build step.
- Backend: Supabase (free tier). Table `planets` is publicly readable; writes go through the `save_planet` RPC, which checks a hashed per-device secret kept in `planet_keys` (not readable by clients).
- Hosting: Netlify (`netlify.toml`).

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```
