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
- [ ] A mikrofon leállítása után a mérési állapot visszatér várakozó módba.
- [ ] A saját D-felvétel lejátszható, a hangerő és a pozíció csúszkával állítható.
- [ ] A Loop beállítás újratöltés után is megmarad.
- [ ] A mikrofonmérés indításakor a saját felvétel leáll, így a hangszóró nem zavarja a mérést.

## 2. Valós hangolás

- [ ] A handpantól és a háttérzajtól függő, érvényes mérési ablakot használjuk; ütés után megvárjuk a tranziensvédelmi jelzés végét.
- [ ] A kiválasztott hang alaphangja, oktávja (2×) és harmadik parciálisa (3×) külön-külön követhető.
- [ ] A stroboszkóp Szünet módja befagyasztja a képet, de a mikrofonbemenet, az FFT-elemzés, a Hz/cent-leolvasás és a mérési napló tovább frissül.
- [ ] Szünet alatt a megjelenített stroboszkóp-kép és a legutóbbi egyedi sávértékek változatlanok maradnak; a Folytatás újraindítja az animációt.
- [ ] Új hang/alapfrekvencia cél kiválasztásakor a fagyasztott kép automatikusan élő módba tér vissza.
- [ ] A frekvencia (Hz), a céltól való eltérés (cent), a spektrum és a stabilitási grafikon konzisztens.
- [ ] Az egyedi sáv „Cél nullázása a mért frekvenciához” gombja csak érvényes csúcs esetén aktív, és a cél eltérését 0 cent közelébe állítja.
- [ ] Kalibráláskor csak az egyedi sáv centkorrekciója változik; a mért frekvencia, a mért centérték és a korábbi mérési napló változatlan marad.
- [ ] Az abszolút Hz-, arány- és cent-alapú célkifejezés kalibrálás után is megmarad, a cél a kiválasztott alaphanggal együtt mozog, ha relatív módban van.
- [ ] Túl nagy bemeneti szintnél figyelmeztetés jelenik meg; a túlvezérelt mérés nem tekintendő elfogadhatónak.
- [ ] Folyamatos módban a referenciahang a kiválasztott csatorna célfrekvenciáján szól, és csak a mikrofon leállított állapotában indítható.
- [ ] Ütésmódnál az egyszeri, 120 ms-os hang a tranziensvédelmi ablak elején szól; össze kell vetni a mért eredményt a hang nélkül kapott értékkel.
- [ ] Minden egyedi stroboszkópsáv saját Ki/Folyamatos/Ütés módja egymástól függetlenül menthető és újratöltés után megmarad.
- [ ] Folyamatos egyedi referenciahang a sáv aktuális Hz/arány/cent céljából számított frekvencián szól; cél vagy profil váltásakor biztonságosan leáll.
- [ ] Folyamatos egyedi referenciahang mikrofonmérés közben nem indítható; mikrofonindításkor az esetlegesen futó kézi hang leáll.
- [ ] Több ütésmódra állított egyedi sáv ugyanazon ütésnél egyszerre, 120 ms-ig szól; a hangstack összszintje gain-korlátozott, és nem írja át a mért mikrofonadatot.
- [ ] Régi, referenciahang-mód nélküli egyedi sávmentés és teljes konfigurációs backup a biztonságos Kikapcsolva módra migrál.
- [ ] Kikapcsolt módban sem a referenciahang-gomb, sem a hangmezőtérkép nem generál referenciahangot.

## 3. Scala-import és referenciahorgony

- [ ] `!!reference` nélküli SCL-import továbbra is a kiválasztott hangot használja skálagyökérként.
- [ ] Explicit `!!reference 4 442.5` esetén a megjelölt skálafok 442.5 Hz-re kerül, a gyökérfrekvencia az adott fok intervalumából számolódik ki.
- [ ] Hz nélküli, szabványos hangcímkéjű jelölő (A4, F#4, Bb4) az aktuális A4-kalibrációval oldódik fel.
- [ ] Solfège címke (pl. Mi) explicit Hz nélkül nem aktiválható referenciahorgonyként; a felület egyértelmű magyarázatot ad.
- [ ] A horgony alkalmazása külön, alapból kikapcsolt választás; bekapcsoláskor a preview a tényleges gyökérhangot és centeltérést mutatja.
- [ ] A Scala-horgony alkalmazása nem módosítja a globális A4-kalibrációt; a profil újratöltése után a pontos frekvencialista változatlan.
- [ ] Periodus-soron elhelyezett `!!reference` marker is helyesen számolódik.

## 4. Hangszerprofilok és célértékek

- [ ] Két fizikai handpanhez külön profil hozható létre, kiválasztható és átnevezhető.
- [ ] Az egyes profilok A4-referenciája és parciális-célértékei nem keverednek.
- [ ] Az egyedi hangmező 2–24 sort fogad el a hangnév, frekvencia Hz formátumban.
- [ ] Egy ismert egyedi cél — például D3, 146.900 — pontosan megmarad; az alkalmazás nem kerekíti vissza egyenletes temperálásra.
- [ ] Hibás vagy duplikált hangnév, illetve 20–2000 Hz tartományon kívüli érték esetén hibajelzés jelenik meg.

## 5. Tűrés és mérési napló

- [ ] Az Auto, ±1, ±2, ±5 és ±10 cent, „Mindig elfogadott” és „Soha ne legyen zöld” beállítás a fő kijelzésben, a mérési kártyákon, mindkét stroboszkópon, a spektrumon és a stabilitási grafikonon ugyanazt az elfogadási szabályt használja.
- [ ] „Mindig elfogadott” módban minden érvényes mérés elfogadott jelzést kap, de a tényleges Hz- és centérték változatlan marad.
- [ ] „Soha ne legyen zöld” módban egyetlen érvényes mérés sem kap zöld státuszt; a mért Hz- és centérték változatlan marad.
- [ ] Hiányzó, NaN vagy érvénytelen mérés egyik szélső módban sem kaphat elfogadott/zöld állapotot.
- [ ] A mérési napló, CSV/JSON export és teljes konfigurációs mentés megőrzi a kiválasztott toleranciamódot.
- [ ] A tűrés módosítása nem változtatja meg a mért Hz-értéket vagy a centeltérést.
- [ ] Érvényes mérés mentésekor megjelenik a dátum, hang, céltól való eltérés, hangszerprofil, mintavételi frekvencia és dBFS bemeneti szint.
- [ ] CSV- és JSON-export megnyitható, és a fejléc/oszlopok a mentett adatokkal egyeznek.
- [ ] Az ismételhetőségi összegzés legalább három érvényes, ugyanahhoz a fizikai hangszerhez, hangolási profilhoz és hanghoz tartozó mintát igényel.

## 6. Adatmentés és hibakezelés

- [ ] A teljes konfiguráció JSON-biztonsági mentése letölthető; ellenőrizd, hogy tartalmazza a profilokat, hangolási beállításokat, hangmező-aktiválást, egyedi stroboszkópsávokat és mérési naplót.
- [ ] A teljes konfiguráció visszaállítása újratöltés után is megőrzi a célprofilt, A4-referenciát, transzponálást, módokat, hangmezőket és egyedi sávokat.
- [ ] Hibás/támogatottlan teljes konfiguráció importja nem változtatja meg a jelenlegi állapotot.
- [ ] Egy régi, csak hangszerprofilokat tartalmazó JSON-mentés továbbra is importálható.
- [ ] Egy érvényes profilmentés importja frissíti az azonos ID-jú profilokat és megtartja a többi meglévő profilt.
- [ ] Hibás JSON vagy hibás profil importja nem törli a meglévő beállításokat.
- [ ] Újratöltés után a profil, az egyedi hangmező és a tűrésbeállítás megmarad.

## 7. Szintetikus referenciajel-benchmark

- [ ] A WAV-laborban a 14 determinisztikus szintetikus teszteset lefut, és az összefoglaló a teljes esetszámot mutatja.
- [ ] A tiszta és centeltolt D3/A3/D4 tesztjelek 1×/2×/3× maradékhibája a megadott teszttűrésen belül marad.
- [ ] A külön megadott 2×/3× inharmonicitás a céltól való centeltérésben jelenik meg, nem keveredik össze az analyser maradékhibájával.
- [ ] A szándékosan egy oktávval feljebb állított cél esetén a valódi gyökér és a kiválasztott cél különbsége 1200 cent, és az azonosíthatósági diagnosztika nem jelölheti alaphangként a felső részfelhangot.
- [ ] A determinisztikus zajteszt ismételt futásai azonos eredményt adnak; a csend és alacsony jelszint nem gyárt érvényes csúcsot.
- [ ] A túlvezérelt eset külön tesztjelként szerepel; nem használjuk arra, hogy a tiszta jel pontosságáról következtessünk.
- [ ] A szoftveres benchmark eredményét nem tekintjük fizikai/abszolút akusztikai pontosság igazolásának.

## 8. Akusztikai átvétel

- [ ] Ugyanazt a hangot többször megütve ellenőrizzük az eredmények stabilitását, azonos mikrofonelhelyezéssel.
- [ ] Az eredményt egy dokumentált, külső frekvencia-referenciával vetjük össze a tényleges célkészüléken.
- [ ] Feljegyezzük a készüléket, böngészőt/OS-t, mikrofonforrást, távolságot, helyiséget, bemeneti szintet és az összehasonlítás eredményét.
- [ ] Csak ezután állítunk abszolút pontosságot vagy professzionális referenciaeszközzel egyenértékű mérési teljesítményt.

## Kiadhatósági döntés

A kiadás akkor fogadható el, ha a fenti használati tesztek sikeresek a tényleges eszközön, és a külső referencia-próba dokumentálva van. Ha a fizikai referencia-próba még nem történt meg, a termék funkcionálisan ellenőrzött kiadásra jelölt verzió, de abszolút akusztikai pontossága még nincs hitelesítve.