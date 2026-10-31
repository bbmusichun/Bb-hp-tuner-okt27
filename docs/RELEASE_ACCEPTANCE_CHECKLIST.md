# Hangoal — kiadás előtti átvételi ellenőrzőlista

Ez a lista a szoftver működését ellenőrzi a ténylegesen átadandó telefonon/böngészőben. A GitHub CI sikeres buildet és automatizált teszteket jelent; nem helyettesíti a valós mikrofonos átvételi mérést.

## 1. Telepítés, mikrofon és saját referenciafelvétel

- [ ] HTTPS-en nyílik meg a végleges URL.
- [ ] iPhone/Safari és a célként megadott másik böngésző megnyitja az appot.
- [ ] A mikrofonengedély elfogadása után a mikrofon állapota aktív, a mintavételi frekvencia megjelenik.
- [ ] A Beállításokban az eszközlista megjelenik; mikrofonengedély előtt a név nélküli eszközök olvasható sorszámozott címkét kapnak, engedély után a böngésző neveit használjuk.
- [ ] Kiválasztott mikrofon esetén a mérőmotor valóban az exact `deviceId`-t kéri; a mérés leállított állapotban engedi a bemenetváltást.
- [ ] A kiválasztott mikrofon eltávolítása vagy elérhetetlenné válása után a mérés az alapértelmezett bemenetre esik vissza; engedélymegtagadás vagy foglalt mikrofon nem vált ki csendes fallbacket.
- [ ] Azokon a böngészőkön, amelyek támogatják az `AudioContext.setSinkId` API-t, a hangkimenet-választás ténylegesen átirányítja a referenciahangot.
- [ ] Nem támogatott böngészőn (különösen iOS Safari) egyértelmű jelzés jelenik meg, és az operációs rendszer hangútvonalát kell használni.
- [ ] Bemeneti/kimeneti eszközbeállítás újratöltés és teljes konfigurációs export/import után megmarad; eltávolított eszköz visszaállításakor biztonságos alapértelmezett útvonal használatos.
- [ ] Elutasított mikrofonengedélynél érthető hibaüzenet jelenik meg, az app nem fagy le.
- [ ] A mikrofonkérés az echo cancellation, noise suppression és auto gain control kikapcsolását kéri; a kiválasztott mikrofonon és az alapértelmezett fallback bemeneten is.
- [ ] A mikrofonengedély után a tényleges track-beállításból ellenőrizzük az AGC állapotát; ha aktív, figyelmeztetés jelenik meg, ha nem lekérdezhető, az állapot ismeretlen marad.
- [ ] A valós handpan-lecsengés mikrofonos összehasonlításánál feljegyezzük az eszköz/böngésző által esetlegesen alkalmazott további DSP-feldolgozást.

- [ ] A mikrofon leállítása után a mérési állapot visszatér várakozó módba.
- [ ] A saját D-felvétel lejátszható, a hangerő és a pozíció csúszkával állítható.
- [ ] A Loop beállítás újratöltés után is megmarad.
- [ ] A mikrofonmérés indításakor a saját felvétel leáll, így a hangszóró nem zavarja a mérést.

## 2. Valós hangolás

- [ ] A handpantól és a háttérzajtól függő, érvényes mérési ablakot használjuk; ütés után megvárjuk a tranziensvédelmi jelzés végét.
- [ ] A kiválasztott hang alaphangja, oktávja (2×) és harmadik parciálisa (3×) külön-külön követhető.
- [ ] Auto módban a tűrés legfeljebb ±3 cent; a stroboszkóp csak érvényes, folyamatosan tűrésen belüli mérés legalább 1 másodperce után válik zölddé. A kézzel választott tűrésmód a felhasználó által megadott küszöböt követi.
- [ ] A frekvencia (Hz), a céltól való eltérés (cent), a spektrum és a stabilitási grafikon konzisztens.
- [ ] A spektrumkurzor a mutatott pontnál helyes Hz, alaphanghoz viszonyított arány/cent és dBFS értéket ad.
- [ ] A Teljes, 1×, 2× és 3× spektrum-nézetben a frekvenciatengely, a csúcsjelölők és a kurzor-leolvasás ugyanahhoz a célfrekvenciához igazodik; a zoom nem változtat mérési célt.
- [ ] Az egyedi sáv „Cél nullázása a mért frekvenciához” gombja csak érvényes csúcs esetén aktív, és a cél eltérését 0 cent közelébe állítja.
- [ ] A fő alaphang (1×), oktáv (2×) és harmadik parciális (3×) külön-külön, érvényes stabil élő mérésből nullára kalibrálható.
- [ ] A fő rezonanciák kalibrálása csak az adott hang adott parciálisának centkorrekcióját módosítja; a másik két parciális célja és a korábbi mérési napló változatlan marad.
- [ ] A fő rezonanciák új kalibrációja újratöltés és hangszerprofil-váltás után is megmarad.
- [ ] A fő rezonanciák kalibrálása hiányzó, instabil vagy ±50 cent profillimiten túli mérésből nem végezhető el.
- [ ] Kalibráláskor csak az egyedi sáv centkorrekciója változik; a mért frekvencia, a mért centérték és a korábbi mérési napló változatlan marad.
- [ ] Az abszolút Hz-, arány- és cent-alapú célkifejezés kalibrálás után is megmarad, a cél a kiválasztott alaphanggal együtt mozog, ha relatív módban van.
- [ ] Túl nagy bemeneti szintnél figyelmeztetés jelenik meg; a túlvezérelt mérés nem tekintendő elfogadhatónak.
- [ ] Folyamatos módban a referenciahang a kiválasztott csatorna célfrekvenciáján szól, és csak a mikrofon leállított állapotában indítható.
- [ ] Az alaphang, a 3. parciális és az oktáv referenciahang-módja egymástól függetlenül módosítható, újranyitás után megmarad, és a teljes konfigurációs export/import is megőrzi őket.
- [ ] Korábbi, csak globális referenciahang-módot tartalmazó beállítások és schema-v2 mentések mindhárom sávon ugyanazzal a móddal töltődnek be.
- [ ] Ütésmódnál az egyszeri, 120 ms-os hang a tranziensvédelmi ablak elején szól; össze kell vetni a mért eredményt a hang nélkül kapott értékkel.
- [ ] Kikapcsolt módban sem a referenciahang-gomb, sem a hangmezőtérkép nem generál referenciahangot.

## 3. Hangszerprofilok és célértékek

- [ ] Két fizikai handpanhez külön profil hozható létre, kiválasztható és átnevezhető.
- [ ] Az egyes profilok A4-referenciája és parciális-célértékei nem keverednek.
- [ ] Az egyedi hangmező 2–24 sort fogad el a hangnév, frekvencia Hz formátumban.
- [ ] Egy ismert egyedi cél — például D3, 146.900 — pontosan megmarad; az alkalmazás nem kerekíti vissza egyenletes temperálásra.
- [ ] Hibás vagy duplikált hangnév, illetve 20–2000 Hz tartományon kívüli érték esetén hibajelzés jelenik meg.

## 4. Tűrés és mérési napló

- [ ] Az Auto, ±1, ±2, ±5 és ±10 cent, „Mindig elfogadott” és „Soha ne legyen zöld” beállítás a fő kijelzésben, a mérési kártyákon, mindkét stroboszkópon, a spektrumon és a stabilitási grafikonon ugyanazt az elfogadási szabályt használja.
- [ ] „Mindig elfogadott” módban minden érvényes mérés elfogadott jelzést kap, de a tényleges Hz- és centérték változatlan marad.
- [ ] „Soha ne legyen zöld” módban egyetlen érvényes mérés sem kap zöld státuszt; a mért Hz- és centérték változatlan marad.
- [ ] Hiányzó, NaN vagy érvénytelen mérés egyik szélső módban sem kaphat elfogadott/zöld állapotot.
- [ ] A mérési napló, CSV/JSON export és teljes konfigurációs mentés megőrzi a kiválasztott toleranciamódot.
- [ ] A tűrés módosítása nem változtatja meg a mért Hz-értéket vagy a centeltérést.
- [ ] Érvényes mérés mentésekor megjelenik a dátum, hang, céltól való eltérés, hangszerprofil, mintavételi frekvencia és dBFS bemeneti szint.
- [ ] CSV- és JSON-export megnyitható, és a fejléc/oszlopok a mentett adatokkal egyeznek.
- [ ] Az ismételhetőségi összegzés legalább három érvényes, ugyanahhoz a fizikai hangszerhez, hangolási profilhoz és hanghoz tartozó mintát igényel.

## 5. Adatmentés és hibakezelés

- [ ] A teljes konfiguráció JSON-biztonsági mentése letölthető; ellenőrizd, hogy tartalmazza a profilokat, hangolási beállításokat, hangmező-aktiválást, egyedi stroboszkópsávokat és mérési naplót.
- [ ] A teljes konfiguráció visszaállítása újratöltés után is megőrzi a célprofilt, A4-referenciát, transzponálást, módokat, hangmezőket és egyedi sávokat.
- [ ] Hibás/támogatottlan teljes konfiguráció importja nem változtatja meg a jelenlegi állapotot.
- [ ] Egy régi, csak hangszerprofilokat tartalmazó JSON-mentés továbbra is importálható.
- [ ] Egy érvényes profilmentés importja frissíti az azonos ID-jú profilokat és megtartja a többi meglévő profilt.
- [ ] Hibás JSON vagy hibás profil importja nem törli a meglévő beállításokat.
- [ ] Újratöltés után a profil, az egyedi hangmező és a tűrésbeállítás megmarad.

## 6. Akusztikai átvétel

- [ ] Ugyanazt a hangot többször megütve ellenőrizzük az eredmények stabilitását, azonos mikrofonelhelyezéssel.
- [ ] Az eredményt egy dokumentált, külső frekvencia-referenciával vetjük össze a tényleges célkészüléken.
- [ ] Feljegyezzük a készüléket, böngészőt/OS-t, mikrofonforrást, távolságot, helyiséget, bemeneti szintet és az összehasonlítás eredményét.
- [ ] Csak ezután állítunk abszolút pontosságot vagy professzionális referenciaeszközzel egyenértékű mérési teljesítményt.

## Kiadhatósági döntés

A kiadás akkor fogadható el, ha a fenti használati tesztek sikeresek a tényleges eszközön, és a külső referencia-próba dokumentálva van. Ha a fizikai referencia-próba még nem történt meg, a termék funkcionálisan ellenőrzött kiadásra jelölt verzió, de abszolút akusztikai pontossága még nincs hitelesítve.
- [ ] Scala `!!reference` metadata with note label, octave and explicit Hz computes the matching A4 reference frequency.
- [ ] Applying Scala reference frequency requires an explicit user action; importing a scale does not silently change A4.
- [ ] Missing, malformed, unlabelled or out-of-range Scala reference metadata cannot change A4.
- [ ] The calculated A4 reference remains within Hangoal's 420–450 Hz supported range and persists through instrument-profile settings.