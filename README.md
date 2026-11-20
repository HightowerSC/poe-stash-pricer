# PoE Stash Pricer

Aplikacja w przeglądarce (Windows/Linux/macOS), która obserwuje publiczną zakładkę w **Path of Exile 1** i wycenia każdy nowy przedmiot:

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
- **Widok zakładek** – siatka 12×12 / 24×24 z ceną na każdym polu (przedmiot lub stack); pozycja przedmiotu („kolumna N, rząd M”) na karcie i w szczegółach.
- **Overlay w grze** – ceny rysowane na polach skrzynki w przezroczystym oknie (opis niżej).
- **Doradca craftu** – przycisk „Sprawdź crafty” w szczegółach rare/magic: liczy wolne prefiksy/sufiksy, proponuje bench crafty (wycenione na trade z dodanym modem: cena po, koszt, zysk) oraz orby (aug/regal/exalt – losowe, sam koszt). Koszty benchu są orientacyjne dla 3.30 (`src/core/craft/benchCrafts.ts`).
- **Specjalne mody i warianty** – wartościowe corrupty (np. +1 do gemów) są szukane na trade w pierwszej kolejności i oznaczone ★. Gdy wariantu unikatu (np. z Voidborna) nie ma na poe.ninja ani w ofertach, aplikacja podaje cenę zwykłej wersji jako **cenę minimalną** (`25c+`) i pisze, co pominięto. Rare bez wyników są szukane bez części modów, a na końcu bez filtrów typu wpływ/ilvl.

## Uruchomienie (Windows i Linux)

Aplikacja działa w przeglądarce. Mały lokalny serwer (Node.js) pobiera ceny z poe.ninja i trade, a interfejs otwiera się pod adresem **http://localhost:5317**. Serwer nasłuchuje tylko na Twoim komputerze.

Wymagane: [Node.js LTS](https://nodejs.org/) (22 lub nowszy) i [Git](https://git-scm.com/).

Ten sam kod i te same komendy na każdym systemie. Wklej w terminal (Windows: PowerShell, Linux/macOS: terminal):

```
git clone https://github.com/HightowerSC/poe-stash-pricer
cd poe-stash-pricer
npm install
npm start
```

`npm start` buduje aplikację, uruchamia serwer i otwiera przeglądarkę. Następnym razem wystarczy `cd poe-stash-pricer` i `npm start`.

Opcjonalnie: `start.bat` (Windows, dwuklik) i `start.sh` (Linux) to tylko skróty, które robią to samo co dwie ostatnie komendy.

Aby wyłączyć – zamknij okno terminala (albo Ctrl+C).

Aktualizacja do nowej wersji: `git pull`, `npm install`, `npm start`.

Ustawienia i historia są zapisywane w folderze `.poe-stash-pricer` w katalogu domowym.

Dla programistów: `npm run dev` (hot reload), `npm test`, `npm run typecheck`.

## Overlay w grze

Przezroczyste okno nad grą, które pokazuje ceny na polach otwartej zakładki. Uruchom aplikację (`npm start`), a w **drugim** terminalu w tym samym folderze:

```
npm run overlay
```

Za pierwszym razem pobierze Electron (ok. 100 MB). Komenda jest taka sama na Windows i Linux.

- Gra musi działać w trybie **Windowed Fullscreen** (borderless), nie w pełnym ekranie.
- **Ctrl+Alt+K** – kalibracja: przeciągnij złotą ramkę na pola zakładki 12×12, kółkiem w rogu zmień rozmiar (strzałki i +/− do precyzji, Enter zapisuje). Robisz to raz na rozdzielczość.
- **Ctrl+Alt+←/→** – wybór zakładki. Overlay nie wie, którą zakładkę masz otwartą w grze, bo nie czyta ekranu – wybierasz ją skrótem albo z ikony w zasobniku.
- **Ctrl+Alt+P** – pokaż/ukryj.
- Overlay tylko wyświetla: nie czyta ekranu, pamięci ani plików gry i nie wysyła żadnych klawiszy do gry (zgodnie z zasadami GGG dla narzędzi zewnętrznych). Kliknięcia przechodzą przez niego do gry.
- Linux: działa pod X11 (domyślnie np. w Mint Cinnamon). Pod Wayland przezroczyste okna „zawsze na wierzchu” mogą nie działać.

## Jak przygotować konto

1. W grze utwórz zakładkę (np. „Inbox”) i ustaw ją jako **Public** – bez ceny.
2. W aplikacji wpisz nazwę konta z numerem (np. `Exile#1234`) i nazwę zakładki.
3. Wrzucaj nowe przedmioty do tej zakładki. Trade site pokazuje je z opóźnieniem ok. 5 minut.

Dlaczego tak: GGG obecnie nie rejestruje nowych aplikacji OAuth (`account:stashes`), a stary endpoint stash z POESESSID zwraca 403. Szczegóły w raporcie z researchu.

## Zasady

- Aplikacja nie dotyka klienta gry ani jego plików, nie czyta ekranu ani schowka w tle.
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
- `overlay` – okno overlay w grze (Electron, osobny pakiet, instalowany tylko przez `npm run overlay`)

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
