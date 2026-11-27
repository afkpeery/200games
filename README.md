# 200 Games

low budget nasties

The site is served by GitHub Pages from the root of `main`: https://afkpeery.github.io/200games/

Open `index.html` to preview the site with the prerendered controller animation. To preview the interactive 3D controller locally, run `python3 -m http.server 8000` in this directory and open `http://localhost:8000`.

## Sponsorship and aggregate measurement

The game directory and BLINKER each have one clearly labeled placement. Both start open. Their in-page links describe the inventory and offer an analytics opt-out. The other five entry points only send a page counter. BLINKER also sends one first-round start per navigation.

Once the operator has approved hosting, payment, creative, and dates, add the entry for `directory` or `blinker` to `bookings` in `sponsor.mjs`. Fields are `name`, `cta`, `destination` (approved HTTPS URL), `campaign` (lowercase slug), and `start` and `end` (UTC YYYY-MM-DD, end exclusive). Each placement supports one booking at a time. The client sets campaign parameters on the destination and uses the fixed placement name for reporting. Empty and expired placements show availability.

QA uses `?nvos_qa=1` on the first game page and stays marked in that tab. To exclude this browser across sessions, follow the opt-out on `sponsorship.html`. Local previews send no events. Production sends credential-free aggregate counters to the operator's shared receiver, without referrers. One qualifying placement view requires at least 50% visibility in a foreground tab for a continuous second. Reports cannot establish unique people or advertiser conversions. Package-free checks run with `node --test tests/sponsor.test.mjs`.
