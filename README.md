# BB Tuner — Handpan Hangoló és Akusztikai Labor

Mobilra optimalizált, böngészőben futó handpan-hangoló valós idejű spektrummal, három rezonancia-csatornával, hangszerprofilokkal és mérési naplóval.

## Funkciók

- Valós idejű mikrofonbemenet és spektrális csúcsinterpoláció.
- Alaphang (1×), oktáv (2×) és harmadik parciális (3×) egyidejű követése.
- Célfrekvencia-referenciahang az aktív alaphang/parciális lejátszásához. A hanggenerátor mikrofonmérés közben automatikusan leáll, hogy ne szennyezze a mérést.
- Spektrum- és stabilitásnézet, tranziensvédelem és külön YIN-alapú diagnosztika.
- Több fizikai hangszer helyi profilja, egymástól független A4-referenciával, hangolási skálával és hangonkénti parciális-célértékekkel.
- Hangszerprofilok JSON-os biztonsági mentése és visszatöltése. Az importált profilok validálása után az azonosítók alapján frissülnek a meglévő profilok, a többi profil megmarad.
- Egyedi hangmező megadása pontos Hz-célértékekkel. Soronként egy hang, például:
  ```text
  D3, 146.900
  A3, 220.500
  Bb3, 233.300
  ```
  2–24 sor támogatott; egyedi hangnevek és 20–2000 Hz közötti frekvenciák szükségesek.
- Exportálható CSV- és JSON-mérési napló, amely tárolja a mért és célfrekvenciákat, a hangszerazonosítót, a mintavételezési frekvenciát és a digitális bemeneti szintet.
- Ismételhetőségi összegzés mediánnal, MAD-dal és tartománnyal az aktív hangszer, skála és hang kiválasztására szűrve.
- Telepíthető PWA, amennyiben a hoszt támogatja a HTTPS-t és a webapp-manifesztet.

## Fejlesztés és build

Node.js 22 ajánlott.

```bash
npm install
npm run lint
npm test
npm run build
npm run preview
```

A CI ugyanazt a TypeScript-ellenőrzést, tesztcsomagot és production buildet futtatja.

## Hangolási használat

1. Nyisd meg HTTPS-en a webappot, és engedélyezd a mikrofont.
2. A Beállításokban válaszd ki a fizikai handpan profilját.
3. Válassz preset hangolást, vagy add meg az egyedi hangmezőt a tényleges célfrekvenciákkal.
4. Üss egy hangot, és várd meg a tranziensvédelmi jelzés végét, majd csak az érvényes mérési eredményeket értékeld.
5. Mérés mentéséhez mindhárom rezonancia-csatornának érvényes eredményt kell adnia.
6. A Mérések nézetben exportáld CSV-be vagy JSON-ba az eredményt.

## Diagnosztikai nézetek

A normál alkalmazás különálló URL-paraméterekkel indítható diagnosztikái:

- \`?benchmark=sine\` — digitális szinusz-referencia teszt.
- \`?benchmark=wav\` — WAV-alapú spektrális diagnosztika.
- \`?benchmark=mic\` — élő mikrofonút diagnosztikája.
- \`?benchmark=1\` — pitch-benchmark nézet.

Ezek fejlesztői/ellenőrzési funkciók; nem helyettesítik a valódi hangszerrel, a célkészüléken végzett átvételi tesztet.

## Fontos mérési korlátok

- A hangolási eltérés centben a kiválasztott célfrekvenciához képest értendő. A handpan valós felhangjai eltérhetnek az ideális 2× és 3× arányoktól; emiatt profilhoz kötött parciális-célértékek használhatók.
- A digitális referenciajel tesztje az algoritmust ellenőrzi, nem a mikrofon, az operációs rendszer, a környezet vagy a teljes akusztikai út pontosságát.
- A dBFS digitális jelszint, nem dB SPL hangnyomásszint.
- A medián/MAD/tartomány az ismételhetőséget írja le, nem hitelesített mérési bizonytalanságot.
- Professzionális, abszolút pontosságra vonatkozó állítás előtt szükséges egy ellenőrizhető külső frekvencia-referenciával végzett, dokumentált mérés a tényleges telefonon/mikrofonnal, helyiséggel, távolsággal és jelszinttel.

## Adattárolás

A felhasználói beállítások, hangszerprofilok és mérési napló a böngésző \`localStorage\`-ában tárolódnak. Töröld vagy exportáld a mérési naplót készülékváltás vagy böngészőadat-törlés előtt. Jelen verzió nem szinkronizálja ezeket a profilokat a felhőbe.
