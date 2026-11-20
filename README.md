# PoE Stash Pricer

Desktopowa aplikacja (Windows/macOS/Linux), która obserwuje publiczną zakładkę w **Path of Exile 1** i wycenia każdy nowy przedmiot:

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

## Uruchomienie

Wymagany Node.js 22 LTS lub nowszy.

```bash
npm install
npm run dev      # tryb deweloperski (Vite + Electron)
npm start        # build i uruchomienie
npm test         # testy jednostkowe
```

Przycisk **Demo** pokazuje przykładowe przedmioty bez łączenia się z API.

## Jak przygotować konto

1. W grze utwórz zakładkę (np. „Inbox”) i ustaw ją jako **Public** – bez ceny.
2. W aplikacji wpisz nazwę konta z numerem (np. `Exile#1234`) i nazwę zakładki.
3. Wrzucaj nowe przedmioty do tej zakładki. Trade site pokazuje je z opóźnieniem ok. 5 minut.

Dlaczego tak: GGG obecnie nie rejestruje nowych aplikacji OAuth (`account:stashes`), a stary endpoint stash z POESESSID zwraca 403. Szczegóły w raporcie z researchu.

## Zasady

- Aplikacja nie dotyka klienta gry ani jego plików, nie czyta ekranu ani schowka w tle.
- Szanuje limity: User-Agent z kontaktem, max 2 równoległe zapytania do poe.ninja, odczyt nagłówków `X-Rate-Limit-*` trade i pauza przed przekroczeniem.

## Struktura

- `src/core` – logika bez Electrona (klienci API, wycena, testy)
- `src/main` – proces główny Electron, zapis ustawień i historii per liga
- `src/renderer` – interfejs React

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
