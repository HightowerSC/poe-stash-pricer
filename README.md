# PoE Stash Pricer

Aplikacja dla Windows i Linux (jeden program, instalator jednym kliknięciem), która obserwuje zakładki skrzyni w **Path of Exile 1** i wycenia każdy nowy przedmiot:

- **waluty, karty, fragmenty, unikaty, gemy, mapy, bazy** – z [poe.ninja](https://poe.ninja/docs/api) (odświeżane co 15 min, z cache),
- **przedmioty rare** – z porównywalnych ofert na oficjalnym trade site, tak jak Awakened PoE Trade: kluczowe mody z minimum 85% wartości, automatyczne luzowanie zapytania, odrzucanie price-fixingu, przedział cenowy i poziom pewności.

Liga, konto, platforma i zakładka to ustawienia profilu (kreator przy pierwszym uruchomieniu). Liga `auto` = bieżąca liga challenge, więc nowa liga nie wymaga zmian w kodzie.

## Dodatkowe funkcje

- **Historia i trend ceny** – zmiana 7-dniowa z poe.ninja oraz własna historia wycen, wykres w szczegółach przedmiotu.
- **Notka cenowa** `~b/o 50 chaos` / `~b/o 1.5 divine` – jeden klik kopiuje ją do schowka.
- **Wskazówki**: sprzedaj / zachowaj / do craftu / vendor recipe (6-link, 6 gniazd, R-G-B, GCP, Chaos/Regal recipe) / sprzedaj u NPC.
- **Discord** – webhook z powiadomieniem o drogich dropach (przycisk testu w ustawieniach).
- **Sesja** – wartość w czasie, chaos na godzinę, najlepszy drop; „Nowa sesja” zeruje licznik.
- **poeprices.info** – opcjonalna druga opinia dla rare.
- **Tiery modów** (T1, T2…) na podstawie danych z trade.
- **Minimalna wartość** – przedmioty tańsze od wpisanego progu (i bez ceny) są wyszarzone z etykietą; można je też ukryć.
- **Eksport CSV** gotowy do Excela (średniki, przecinek dziesiętny).
- **Postać** – ekwipunek, gemy i jewele wybranej postaci (jak na poe.ninja), statystyki zsumowane z przedmiotów (życie, ES, odporności z brakami do 75%, atrybuty…) i wycena całego ekwipunku jednym kliknięciem. Wymaga publicznego profilu (albo POESESSID).
- **Kategorie** – przedmioty posegregowane według zakładki w skrzyni, rodzaju (waluta, unikaty, rare, jewele, gemy, mapy, do NPC…) albo przedziału ceny, z sumą wartości i podpowiedzią, do której zakładki w grze je odłożyć.
- **Cała skrzynia** – wszystkie zakładki prosto z serwera GGG (POESESSID), opcjonalnie tylko wybrane (po przecinku). Ctrl+C w grze wycenia pojedynczy przedmiot.
- **Przeliczanie cen** – przycisk ↻ Przelicz (wszystko albo jeden przedmiot) i automatyczne przeliczanie co X godzin.
- **Widok zakładek** – siatka 12×12 / 24×24 z ceną na każdym polu (przedmiot lub stack); pozycja przedmiotu („kolumna N, rząd M”) na karcie i w szczegółach.
- **Overlay w grze** – ceny rysowane na polach skrzynki w przezroczystym oknie (opis niżej).
- **Doradca craftu** – przycisk „Sprawdź crafty” w szczegółach rare/magic: liczy wolne prefiksy/sufiksy, proponuje bench crafty (wycenione na trade z dodanym modem: cena po, koszt, zysk) oraz orby (aug/regal/exalt – losowe, sam koszt). Koszty benchu są orientacyjne dla 3.30 (`src/core/craft/benchCrafts.ts`).
- **Specjalne mody i warianty** – wartościowe corrupty (np. +1 do gemów) są szukane na trade w pierwszej kolejności i oznaczone ★. Gdy wariantu unikatu (np. z Voidborna) nie ma na poe.ninja ani w ofertach, aplikacja podaje cenę zwykłej wersji jako **cenę minimalną** (`25c+`) i pisze, co pominięto. Rare bez wyników są szukane bez części modów, a na końcu bez filtrów typu wpływ/ilvl.

## Instalacja (Windows i Linux) – bez terminala

1. Wejdź na **[Releases](https://github.com/HightowerSC/poe-stash-pricer/releases/latest)** i pobierz plik dla swojego systemu:
   - **Windows:** `PoE-Stash-Pricer-Setup-….exe` → kliknij dwa razy. Jeśli Windows pokaże „System Windows ochronił ten komputer”, kliknij **Więcej informacji → Uruchom mimo to** (program nie ma płatnego podpisu cyfrowego).
   - **Linux:** `PoE-Stash-Pricer-….AppImage` → prawy klik → **Właściwości → Uprawnienia → Zezwól na uruchamianie jako program** → kliknij dwa razy.
2. Przy pierwszym uruchomieniu kreator zapyta o nazwę konta, ligę i zakładki – krok po kroku, z podpowiedziami.
3. Gotowe. Program sam sprawdza aktualizacje i proponuje instalację nowej wersji.

To jedna aplikacja (to samo na obu systemach): okno z wyceną, ikona w zasobniku obok zegara i overlay w grze. Ustawienia i historia są zapisywane w folderze `.poe-stash-pricer` w katalogu domowym.

### Dla programistów

Wymagane: Node.js 22+ i Git. `npm install`, potem:

- `npm run app` – aplikacja desktopowa (Electron) z kodu,
- `npm start` – ten sam program w przeglądarce (http://localhost:5317), bez Electrona,
- `npm run dev` (hot reload), `npm test`, `npm run typecheck`, `npm run dist` (instalator lokalnie).

Nowa wersja: zmień `version` w `package.json` i wypchnij zmianę, potem na GitHubie **Actions → Release → Run workflow** (albo wypchnij tag `vX.Y.Z`) – GitHub Actions zbuduje instalatory i opublikuje Release, a zainstalowane programy same się zaktualizują.

## Wycena w grze: Ctrl+C

W grze najedź myszką na przedmiot i naciśnij **Ctrl+C** (funkcja samej gry). Okienko z ceną pojawi się obok kursora, a przedmiot trafi do zakładki **Sprawdź** w aplikacji. **Ctrl+Alt+C** w grze kopiuje też tiery modów – wtedy działa doradca craftu. **Ctrl+Alt+D** wycenia to, co jest w schowku (gdy automatyczna wycena jest wyłączona w zasobniku).

Linux: najlepiej działa z zainstalowanym `xclip` (Mint/Ubuntu: `sudo apt install xclip`), choć nie jest wymagany.

## Overlay w grze

Przezroczysta warstwa nad grą z cenami na polach otwartej zakładki (wymaga wczytanej skrzyni). Włączasz ją skrótem **Ctrl+Alt+P** albo z ikony w zasobniku („Ceny na skrzyni w grze”).

- Gra musi działać w trybie **Windowed Fullscreen** (borderless), nie w pełnym ekranie.
- **Ctrl+Alt+K** – kalibracja: przeciągnij złotą ramkę na pola zakładki 12×12, kółkiem w rogu zmień rozmiar (strzałki i +/− do precyzji, Enter zapisuje). Robisz to raz na rozdzielczość.
- **Ctrl+Alt+←/→** – wybór zakładki. Overlay nie wie, którą zakładkę masz otwartą w grze, bo nie czyta ekranu – wybierasz ją skrótem albo z ikony w zasobniku.
- ★ przy cenie = wartościowy corrupt, `+` = cena minimalna.
- Overlay tylko wyświetla: nie czyta ekranu, pamięci ani plików gry i nie wysyła żadnych klawiszy do gry (zgodnie z zasadami GGG dla narzędzi zewnętrznych). Kliknięcia przechodzą przez niego do gry.
- Linux: działa pod X11 (domyślnie np. w Mint Cinnamon). Pod Wayland przezroczyste okna „zawsze na wierzchu” mogą nie działać.

## Skąd program bierze Twoje przedmioty

Twoje przedmioty **nie są** pobierane z trade – trade służy tylko do porównania z ofertami innych graczy.

- **Cała skrzynia z serwera GGG (polecane):** w kreatorze albo w ⚙ Ustawieniach wklej **POESESSID** – ciasteczko z pathofexile.com (instrukcja krok po kroku jest w programie). Program wczytuje wszystkie zakładki, także prywatne, z pozycją każdego przedmiotu. POESESSID zostaje tylko na Twoim komputerze. Po wylogowaniu na stronie trzeba skopiować nowy.
- **Bez skanowania skrzyni:** tylko Ctrl+C w grze.

**Zakładka Postać:** na pathofexile.com → My Account → Privacy Settings odznacz „Hide Characters” (albo użyj POESESSID).

Jeśli coś nie działa, pasek stanu pod kafelkami podaje przyczynę (np. nieaktualny POESESSID albo inna liga). ⚙ Ustawienia → „Wyczyść przedmioty” zaczyna wczytywanie skrzyni od nowa.

## Zasady

- Aplikacja nie dotyka klienta gry ani jego plików, nie czyta ekranu ani pamięci gry i nie wysyła klawiszy do gry. Ze schowka bierze tylko tekst przedmiotu skopiowanego w grze przez Ctrl+C (resztę ignoruje); można to wyłączyć w zasobniku.
- Twoje przedmioty pochodzą z Twojej skrzyni (serwer GGG, POESESSID) albo z Ctrl+C. Trade służy wyłącznie do porównania z ofertami innych graczy.
- Szanuje limity: User-Agent z kontaktem, max 2 równoległe zapytania do poe.ninja, odczyt nagłówków `X-Rate-Limit-*` trade i pauza przed przekroczeniem.

## Plany na przyszłość: PoE HUB

Docelowo aplikacja ma urosnąć do **PoE HUB** – jednego miejsca, które pomaga w całej grze, nie tylko w wycenie. Każdy obszar będzie osobnym modułem (`src/core/<moduł>`), korzystającym ze wspólnych klientów API, profilu i ligi:

- **Doradca craftu – rozbudowa** – essence, harvest, meta-crafty i wiele kroków craftu naraz.
- **Budowa postaci** – pomoc w tworzeniu buildu: drzewko, gemy, wymagane statystyki, porównanie z popularnymi buildami ligi.
- **Ulepszanie ekwipunku** – bieżące sprawdzanie założonych przedmiotów i podpowiedzi, co wymienić i jaki przedmiot (w jakiej cenie) da największy zysk.
- **Challenge ligowe** (osobna opcja) – lista wyzwań bieżącej ligi, co przygotować wcześniej, kolejność wykonywania i postęp.

## Struktura

- `src/core` – logika aplikacji (klienci API, wycena, testy)
- `src/server` – lokalny serwer HTTP (API + zdarzenia na żywo), zapis ustawień i historii per liga
- `src/renderer` – interfejs React
- `desktop` – aplikacja desktopowa (Electron): okno, zasobnik, overlay w grze, aktualizacje
- `.github/workflows` – testy i budowanie instalatorów

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
