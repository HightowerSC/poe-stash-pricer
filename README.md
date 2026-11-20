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
- **Eksport CSV** gotowy do Excela (średniki, przecinek dziesiętny).

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

## Jak przygotować konto

1. W grze utwórz zakładkę (np. „Inbox”) i ustaw ją jako **Public** – bez ceny.
2. W aplikacji wpisz nazwę konta z numerem (np. `Exile#1234`) i nazwę zakładki.
3. Wrzucaj nowe przedmioty do tej zakładki. Trade site pokazuje je z opóźnieniem ok. 5 minut.

Dlaczego tak: GGG obecnie nie rejestruje nowych aplikacji OAuth (`account:stashes`), a stary endpoint stash z POESESSID zwraca 403. Szczegóły w raporcie z researchu.

## Zasady

- Aplikacja nie dotyka klienta gry ani jego plików, nie czyta ekranu ani schowka w tle.
- Szanuje limity: User-Agent z kontaktem, max 2 równoległe zapytania do poe.ninja, odczyt nagłówków `X-Rate-Limit-*` trade i pauza przed przekroczeniem.

## Struktura

- `src/core` – logika aplikacji (klienci API, wycena, testy)
- `src/server` – lokalny serwer HTTP (API + zdarzenia na żywo), zapis ustawień i historii per liga
- `src/renderer` – interfejs React

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
