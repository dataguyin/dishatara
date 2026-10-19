# DishaTara

An early static prototype for DishaTara, an astrology companion. It presents a bilingual English and Hindi landing page and calculates a sidereal birth chart in the browser.

## Run locally

Open `index.html` in a browser. No build step or dependencies are required.

## Current scope

- Bilingual interface: English and Hindi
- Browser-side chart calculations using Astronomy Engine 2.1.19 (loaded from jsDelivr; MIT license)
- Sidereal signs, approximate Lahiri ayanamsa, whole-sign houses, nakshatras and mean lunar nodes
- North Indian D1 Rāśi and D9 Navāṁśa chart diagrams, with D1 and D9 placement tables
- Print-friendly report for saving the calculated charts as a PDF from the browser
- Birthplace coordinate and time-zone lookup through Open-Meteo Geocoding, only after the user checks the consent box
- Name, birth date and birth time remain in the browser; the birthplace text is sent to Open-Meteo
- No DishaTara account, database, server-side storage or chart-grounded AI service

## Calculation notes

- Planet positions use Astronomy Engine's ephemeris calculations.
- Sidereal conversion currently uses a linear Lahiri approximation anchored to the 1956 reference value. It is not a Swiss Ephemeris implementation and should be compared against a trusted Jyotish reference before use for paid readings.
- Ascendant and whole-sign houses depend on accurate birth time and the geocoded city center. City-level coordinates are not a substitute for the exact birthplace.
- Mean Rahu/Ketu are calculated; Uranus, Neptune and Pluto are included only as reference rows.
- The location provider and script CDN receive normal network request metadata. See `privacy.html` for the prototype's data notice.

## Before a public or commercial launch

- Validate calculations against independent chart references across dates, time zones and locations; decide whether to replace the approximate ayanamsa and mean node formulas with a dedicated ephemeris implementation.
- Review the privacy notice, provider terms, hosting logs and applicable privacy requirements. Open-Meteo's free service may have usage conditions; confirm the correct plan and attribution before commercial use.
- Add a proper location picker, chart export, error reporting and a real privacy support contact.
- Build a secure API only if a chart-grounded AI service is added. Keep service credentials on the server and obtain appropriate consent before sending birth details.

## Disclaimer

Astrology content is for reflection and entertainment. It is not medical, legal, financial, or mental-health advice.
