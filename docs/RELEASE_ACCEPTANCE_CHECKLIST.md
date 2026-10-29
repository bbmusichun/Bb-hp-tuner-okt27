# BB Tuner — kiadás előtti átvételi ellenőrzőlista

Ez a lista a szoftver működését ellenőrzi a ténylegesen átadandó telefonon/böngészőben. A GitHub CI sikeres buildet és automatizált teszteket jelent; nem helyettesíti a valós mikrofonos átvételi mérést.

## 1. Telepítés és mikrofon

- [ ] HTTPS-en nyílik meg a végleges URL.
- [ ] iPhone/Safari és a célként megadott másik böngésző megnyitja az appot.
- [ ] A mikrofonengedély elfogadása után a mikrofon állapota aktív, a mintavételi frekvencia megjelenik.
- [ ] Elutasított mikrofonengedélynél érthető hibaüzenet jelenik meg, az app nem fagy le.
- [ ] A mikrofon leállítása után a mérési állapot visszatér várakozó módba.

## 2. Valós hangolás

- [ ] A handpantól és a háttérzajtól függő, érvényes mérési ablakot használjuk; ütés után megvárjuk a tranziensvédelmi jelzés végét.
- [ ] A kiválasztott hang alaphangja, oktávja (2×) és harmadik parciálisa (3×) külön-külön követhető.
- [ ] A frekvencia (Hz), a céltól való eltérés (cent), a spektrum és a stabilitási grafikon konzisztens.
- [ ] Túl nagy bemeneti szintnél figyelmeztetés jelenik meg; a túlvezérelt mérés nem tekintendő elfogadhatónak.
- [ ] Folyamatos módban a referenciahang a kiválasztott csatorna célfrekvenciáján szól, és csak a mikrofon leállított állapotában indítható.
- [ ] Ütésmódnál az egyszeri, 120 ms-os hang a tranziensvédelmi ablak elején szól; össze kell vetni a mért eredményt a hang nélkül kapott értékkel.
- [ ] Kikapcsolt módban sem a referenciahang-gomb, sem a hangmezőtérkép nem generál referenciahangot.

## 3. Hangszerprofilok és célértékek

- [ ] Két fizikai handpanhez külön profil hozható létre, kiválasztható és átnevezhető.
- [ ] Az egyes profilok A4-referenciája és parciális-célértékei nem keverednek.
- [ ] Az egyedi hangmező 2–24 sort fogad el a hangnév, frekvencia Hz formátumban.
- [ ] Egy ismert egyedi cél — például D3, 146.900 — pontosan megmarad; az alkalmazás nem kerekíti vissza egyenletes temperálásra.
- [ ] Hibás vagy duplikált hangnév, illetve 20–2000 Hz tartományon kívüli érték esetén hibajelzés jelenik meg.

## 4. Tűrés és mérési napló

- [ ] Az Auto, ±1, ±2, ±5 és ±10 cent beállítások a fő kijelzésben, a mérési kártyákon, a stroboszkópon és a spektrumon ugyanazt a pontos küszöböt használják.
- [ ] A tűrés módosítása nem változtatja meg a mért Hz-értéket vagy a centeltérést.
- [ ] Érvényes mérés mentésekor megjelenik a dátum, hang, céltól való eltérés, hangszerprofil, mintavételi frekvencia és dBFS bemeneti szint.
- [ ] CSV- és JSON-export megnyitható, és a fejléc/oszlopok a mentett adatokkal egyeznek.
- [ ] Az ismételhetőségi összegzés legalább három érvényes, ugyanahhoz a fizikai hangszerhez, hangolási profilhoz és hanghoz tartozó mintát igényel.

## 5. Adatmentés és hibakezelés

- [ ] A profilok JSON-biztonsági mentése letölthető.
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