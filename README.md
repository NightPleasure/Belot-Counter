# Belot Auto Tracker (Chrome Extension, Manifest V3)

Extensie Chrome pentru a ține evidența cărților **văzute** într-un joc de belot (32 de cărți). Datele se salvează **local** în `chrome.storage.local`. Extensia poate citi automat cărțile de pe masă din **tab-ul activ** (fără host permissions; folosește `activeTab` + `scripting`).

## Instalare (Load unpacked)

1. Creează un folder (ex: `belot-auto-tracker/`) și pune în el fișierele:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `style.css`
   - `background.js`
2. Deschide Chrome și mergi la `chrome://extensions`.
3. Activează **Developer mode** (dreapta sus).
4. Apasă **Load unpacked** și selectează folderul extensiei.
5. (Opțional) Pin-uiește extensia în toolbar.

## Cum se folosește

- Click pe iconița extensiei deschide **Side Panel** (rămâne deschis în timpul jocului).
- UI este **compact**: afișează doar grila de 32 cărți (Adaugă cărți văzute). Cărțile detectate sunt marcate în grilă.
- Grila este pe **verticală** (4 coloane de suituri). Suiturile sunt mari și colorate.
- Poți seta **Coz** manual din rândul de sus; coloana de atu se evidențiază.
- Auto‑citire rulează automat și scanează la fiecare ~1s după selectorul fix:
  - `#js__gameplay-page .table__cards`
- Dacă site-ul afișează cărțile doar ca imagini (ex: `.../deck_5/12.png`), recomandat este să faci o calibrare o singură dată:
  1. Deschide jocul și așteaptă să apară cel puțin o carte pe masă.
  2. În extensie apasă **Calibrare**.
  3. Pentru fiecare imagine afișată, apasă cartea corectă în grilă (extensia salvează maparea și trece automat la următoarea).
  4. După ce sunt mapate toate cele 32, bifarea automată devine stabilă.
- Extensia încearcă să afișeze **imaginile** cărților și fără calibrare (folosind ordinea implicită a deck‑ului); calibrarea îți permite să corectezi exact ordinea.
- Ca fallback (dacă nu vrei calibrare completă), poți mapa doar ce apare în joc din **Depanare → Token-uri nemapate** (apasă token → apoi cartea corectă în grilă).
- Când sunt văzute toate cele 32 de cărți, extensia face **reset automat** și așteaptă să se golească masa înainte să înceapă următoarea rundă.
- Dacă jocul se termină / pagina de gameplay dispare, extensia face **reset automat**.

## Note

- Extensia folosește doar `chrome.storage.local` pentru persistență.
- Maparea token → carte este salvată în `chrome.storage.local` sub cheia `autoReadMap`.
- Nu cere `host_permissions` (nu e legată de un site anume). Pentru auto-read folosește `activeTab` + `scripting` doar pe tab-ul curent.
- Proiect realizat în scopuri educaționale și de test.
