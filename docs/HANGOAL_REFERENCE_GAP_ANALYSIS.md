# Hangoal referenciaalkalmazás – funkcióparitás és fölényterv

## Kiinduló helyzet és bizonyítékok

A referencia a felhasználó által átadott Windows-alkalmazásból, használati útmutatóból és 35 darab `.scl` fájlból áll. Az útmutató a 2018. októberi 1.14-es kiadást dokumentálja. Ez a dokumentum az ott leírt viselkedést tekinti funkcionális referencia-követelménynek.

**Korlát:** a Windows PE futtatható állományt ebben az elemzésben nem indítottuk el és a belső algoritmusát nem auditáltuk. Ezért a referenciaalkalmazás funkcióiról a kézikönyvben dokumentált állításokat használjuk, a mérési pontosságot vagy a belső megvalósítás fölényét nem feltételezzük. A teljesítmény fölényét azonos tesztjelekkel és valós hangszeren kell bizonyítani.

## Cél

A Hangoalnak először el kell érnie a referenciaalkalmazás kézikönyve szerinti releváns funkcionális és használhatósági szintet; ezután a saját tesztelhető architektúrájára építve jobb pontosságot, mérési visszajelzést, reprodukálhatóságot és mobilhasználatot kell kínálnia. Nem cél a referenciaalkalmazás felületének vagy kódjának másolása. A cél az ott dokumentált viselkedés és a mérési minőség legalább egyenértékű megvalósítása.

## Funkció- és hiánymátrix

Státuszmagyarázat:
- **Megvan:** a Hangoal forrásában dokumentált vagy implementált.
- **Részleges:** az alapfunkció létezik, de a referenciaalkalmazás által leírt interakció vagy viselkedés nem teljes.
- **Hiányzik / ellenőrizendő:** nincs bizonyíték arra, hogy egyenértékűen megvan; külön teszt vagy fejlesztés kell.

| Terület | referenciaalkalmazás kézikönyv szerinti viselkedés | Hangoal állapot | Prioritás és intézkedés |
|---|---|---|---|
| Többsávos stroboszkóp | Kezdeti 1x, 2x és 3x sáv; egyedi sávok szabad hozzáadása és törlése. | 3 függetlenül mért alaprezonancia + legfeljebb 8 egyedi sáv, sávonkénti cél, kontraszt/élesség, szünet, FPS-jelzés és érzékenység. | **Funkcionálisan megvan.** A maximális sávszám korlátozott, és a kontraszt/stabilitás vizuális leképezését valós hangszeren kell kalibrálni. |
| Sávcél megadása | Alapfrekvenciához viszonyított félhang/cent eltolás vagy tiszta hangközarány. | Egyedi sávoknál Hz, arány (pl. 3/2 vagy x1.5) és cent cél adható; arány/cent mód a kiválasztott alaphanghoz kötött. | **Megvan, közös egységtesztekkel.** Külön „félhang” szintaxis nincs; félhangtávolság 100 centtel is megadható. |
| Sáv kalibrálása | A megjelenített eltérés kinullázható a cent-offset módosításával. | Egyedi sávnál „Kalibrálás a mért hangra”; a beépített 2× oktáv és 3× összetett kvint külön, hangonkénti offsetje is egy kattintással korrigálható. A mérési frekvencia változatlan. | **Funkcionálisan megvan a 2×/3× célkorrekcióhoz.** Az alaphang célját továbbra is a skála/profil határozza meg. |
| Stroboszkóp kontrasztja | A sáv kontrasztja jelzi a jel erősségét; a bar élessége a hang stabilitását. | **Első implementáció a PR-ágon:** a mért peak dBFS skálázza a kontrasztot, a nyers centmérések 15 mintás szórása a csíkszélek élességét. Ez csak vizuális becslés, nem módosítja a mérést. | **P0 – részben megvalósítva.** A dB/élesség leképezések egységteszteltek; a küszöbök és a zajra adott viselkedés valós handpan-felvételen még kalibrálandó. |
| Hangolási visszajelzés | Sáveltérés Hz-ben vagy centben; tűrésen belül zöld. | Hz-, cent-, hangnév- és aránykijelzés; egységes érvényesség; automatikus/rögzített tolerancia. | **Megvan.** A pozitív/negatív centeltérés azonos szabályt követ; csak érvényes mérés lehet elfogadott. |
| Tűrésmód | Automatikus/rögzített tolerancia, mindig elfogadott vagy soha zöld állapot. | `auto`, `any` és `off` mód mentett beállítással, minden fő kijelzőn ugyanaz a szabály. | **Megvan és unit tesztelt.** Csak a vizuális státusz változik; a mért érték nem. |
| Roll speed / érzékenység | Állítható stroboszkóp-reakció a hangmagasság-eltérésre. | **Első verzió megvalósítva:** a fő stroboszkóp alatt 0,25×–2,5× érzékenységszabályzó található, és a módosítás az egyedi sávokra is érvényes; mentés és teljes konfigurációs biztonsági mentés támogatott. | **Részleges, valós használattal kalibrálandó.** Ellenőrizni kell, melyik érzékenységi tartomány olvasható a legjobban a mély alaphangon és a magasabb parciálisokon. |
| Referenciahang (pitch pipe) | Minden sávhoz külön folyamatos/ütés/kikapcsolt mód; több sáv is kiválasztható. | Minden alap- és egyedi sávhoz külön mentett mód; független, kimenet-only polifonikus hangforrások; több ütésjelző egy tranziensnél egyszerre szólhat. A segédhang nem kerül vissza a mérőanalizátorba. | **Funkcionálisan megvan.** Valós eszközön a lejátszási késést, hangosságot és visszacsatolást még tesztelni kell. |
| Mikrofon és hangkimenet választása | Elérhető hangbemenetek és -kimenetek választhatók. | Bemenet/kimenet listázása, mentett választás, `deviceId` a mikrofonkérésben, kimenetválasztás, eszközváltozás utáni frissítés és böngésző-fallback. | **Implementálva.** A tényleges eszközlista és `setSinkId` támogatás böngészőfüggő; iOS Safari átvételi teszt szükséges. |
| Bemeneti szint és túlvezérlés | Zöld szintjelzés, piros klippelésnél; a stroboszkóp szüneteltethető. | Bemeneti dBFS, magas szint/near-clip figyelmeztetés és analízis-FPS látható; külön strobe pause paritást ellenőrizni kell. | **P1.** Sávrajzolás befagyasztása a mikrofonleolvasás leállítása nélkül; állapot egyértelmű jelzése. |
| Teljesítmény-visszajelzés | 40 FPS alatti rajzolási sebességre figyelmeztet. | A stroboszkóp saját rajzolási FPS-e megjelenik; 40 FPS alatt figyelmeztet. Az analízis FPS és mintavételi frekvencia ettől külön diagnosztika. | **Megvan.** iPhone-on és régebbi készüléken még mérendő. |
| Spektrum | Jelentős parciálisok, zajpadló-elnyomás, kurzor Hz/relatív frekvencia/dB, sávra nagyítás. | Pontos FFT-bin csúcsjelölés, zajküszöb, legfeljebb 120 peak overlay, relatív dB/alaphangarány, érintéses hover readout, csúcslistából és strobe-sávról nagyítás, egyedi sávcél-vonalak. | **Funkcionálisan megvan.** A megjelenített frekvencia a valódi FFT-bin; nem szabad interpolált mérési pontosságként értelmezni. |
| Csúcsdetektálás és stabil mérés | Kézikönyv csúcs-spektrumot ír le; belső detektálási algoritmust nem részletez. | FFT-csúcs-interpoláció, YIN, hangjelölt-választás, tranziensvédelem, stabilitássimítás, confidence, klippelés- és alaphang-azonosíthatósági diagnosztika. | **Hangoal erős alapja.** Ezt meg kell tartani; a pontosság fölényét közös benchmarkkal bizonyítani. |
| Automatikus hangfelismerés | Egyszeri vagy folyamatos; E0–E9 tartományú hangra állítja a pitch dialt. | Folyamatos/egyszeri/kikapcsolt mód, három következetes képkocka és hangmezőszűrés. | **Megvan/részleges.** A tényleges handpan hangmező a cél; ellenőrizni kell a használható oktávatartományt és a hangváltás késleltetését. |
| Hangválasztó és oktáv | Hang/oktáv kiválasztás, transzponálás; a hangkerék húzással is navigálható. | Kromatikus hangválasztó, oktávválasztás, transzponálás; eltérő hangok a kiválasztott skálán kívül is célozhatók. | **Megvan/részleges.** A mobilbarát választó megtartható; a pontos drag-UX nem kritikus, ha a kezelhetőség legalább olyan gyors. |
| Modalitás / hangok tiltása | Kerékből hangok ki/be kapcsolása és a mód elforgatása; a tiltott hangokat az auto-detection átugorja. | Hangonkénti engedélyezés/tiltás és transzponálás; az utolsó aktív hang védett. | **Funkcionálisan megvan, UX részleges.** Az állapotnak minden automatikus felismerési útban érvényesülnie kell. |
| Skálák és temperálások | Scala fájlok; kézikönyv szerint kb. 30 gyárilag csomagolt temperamentum/skála, emellett több mint 4000 további elérhető. | A referencia ZIP 35 SCL fájlja a Hangoalban be van csomagolva; további `.scl` import lehetséges. | **Részleges.** A teljes nagy külső katalógust nem kell mind beégetni; import, kategorizálás, keresés és hiányzó handpan-skálák szükségesek. |
| Scala-specifikus bővítések | Egyedi hangnevek/előjegyzések és `!!reference` metadata. | A parser a fokcímkéket, előjegyzés-utótagokat, referenciahang nevét, oktávját és Hz értékét kezeli; az importnál a címkék megmaradnak, explicit referencia alapján A4 beállítható. | **Implementálva és unit tesztelt.** A további külső `.scl` fájlokkal történő kompatibilitást bővíteni kell. |
| Leolvasási módok | Hz, cent, hangnév vagy tiszta hangközarány. | Hz, cent, hangnév és a mért arány az alaphanghoz képest. | **Megvan/részleges.** A célarány és mért arány világos megkülönböztetése. |
| Freeze | Védi a cent-, referenciafrekvencia- és transzponálás-beállításokat a változástól. | Mentett freeze mód; az A4 referencia, részleges korrekciók, transzponálás és az egyedi sávok cél-/offset-szerkesztése blokkolva van, a mért értékek tovább frissülnek. | **Implementálva.** Az instrument profile/scale váltás a hangcél választása marad, nem a freeze által tiltott paraméter. |
| Billentyűzetes vezérlés | Front/rear panel navigáció, nyíl/enter/escape és közvetlen billentyűparancsok. | A fő hangoló billentyűparancsai és súgója megvannak; a teljes settings-panel navigáció nem igazolt. | **P2.** Mobilon alacsonyabb prioritás; asztali használatnál hozzáférhetőségi fejlesztésként kezelendő. |
| Több összekapcsolt példány | Több referenciaalkalmazás-ablak mester/szolga kapcsolatban, közös vezérléssel és külön I/O-val. | Egy Hangoal nézetben 3 alap- és max. 8 egyedi sáv áll rendelkezésre; több példány közötti szinkron nincs igazolva. | **P2.** A legtöbb hangolási helyzetre a több sáv elegendő; külön I/O-s master/slave mód későbbi haladó funkció. |
| Munkamenet, profil és napló | Az előző munkamenet beállításait megőrzi; hang- és skálaválasztás. | Verziózott profilok, teljes konfiguráció export/import, mérési napló, CSV/JSON és ismételhetőség-összegzés. | **Hangoal előnye.** Megtartani, és a mentést a relatív sávcélokra is kiterjeszteni. |
| Mobil / telepíthetőség | Windows/macOS asztali termék; kézikönyv a nagyobb CPU-terhelésre figyelmeztet. | Web/PWA, iPhone Safari célkörnyezet. | **Hangoal stratégiai előnye.** Valós iPhone/Safari mikrofon- és teljesítményteszt szükséges. |

## Mérési fölény: kötelező bizonyítás

A „jobb” nem jelenthet pusztán simább animációt vagy több funkciót. Minden hangmagasság- és fáziskövető változatot ugyanazon bemeneteken kell vizsgálni.

A következő automatikus referenciajel-készletet kell használni:
1. Tiszta szinusz: D3, A3, D4 és a handpan célként használt alacsony/magas frekvenciák.
2. Ismert, pozitív és negatív centeltolás: legalább ±1, ±2, ±5, ±10 és ±25 cent.
3. Handpan-szerű összetett jel: 1x, 2x és 3x rezonancia, kontrollált részleges inharmonicitással.
4. Gyenge alaphang és erős 2x/3x felhang az oktáv- vagy kvinttévesztés méréséhez.
5. Tranziens + lecsengés, háttérzaj, 50/60 Hz-es zavar, alacsony jelszint, klippelés, csend és közeli kettős csúcsok.
6. Több mintavételi frekvencia és különböző FFT-ablakok.

Minden esetben rögzíteni kell:
- centhiba ismert célhoz viszonyítva;
- idő az első érvényes és a stabil mérésig;
- hibás alaphang/oktáv/kvint választások aránya;
- téves érvényes mérés zajban;
- a mérésből kieső ablakok aránya;
- CPU-terhelés, UI FPS és analízis FPS;
- iPhone/Safari esetén a viselkedés azonos fizikai eszközön és mikrofonelhelyezéssel.

A szoftveres jelek a matematikai hibákat tesztelik; a fizikai handpan, mikrofon és külső referencia szükséges az akusztikai elfogadáshoz. A referenciaalkalmazás belső pontossága a rendelkezésre álló kézikönyvből nem állapítható meg, ezért az összehasonlító mérést ugyanazzal a bemenettel kell elvégezni mindkét alkalmazáson.

## Prioritási sorrend

1. **P0 – Szoftveres mérés és célértékek:** a három független rezonanciacsatorna, egyedi sávcélok, kalibráció, toleranciamódok, pontos-bin spektrum és Scala metadata implementálva; marad a szintetikus benchmarkok bővítése, illetve a valós handpanon mérésminőségi összehasonlítás.
2. **P0 – Hangútvonal és munkafolyamat:** sávonkénti referenciahang, egyidejű hangok, spektrumra nagyítás, szünet/freeze és I/O-választás implementálva; a célböngészők tényleges hangkimenetét és késését tesztelni kell.
3. **P1 – Valós eszköz átvétel:** iPhone/Safari és legalább egy másik böngésző valós handpannel, külső referenciafrekvenciával, zajos környezetben, gyenge alaphang és erős 2×/3× felhang mellett.
4. **P1 – Hangolási mérőszámok:** dokumentálni kell a centhibát, stabilizálódási időt, oktáv-/kvinttévesztési arányt, és a hangolási pontosság ismételhetőségét ugyanazon bemenettel a referenciához képest.
5. **P2 – Haladó paritás:** teljes billentyűzet-navigáció, több külön Hangoal-ablak mester/szolga szinkronja; ezek nem szükségesek az alapvető 1×/2×/3× egyidejű méréshez.

## Kiadási kapu

A Hangoal csak akkor tekinthető a referencia szintjét elérőnek, ha a P0 viselkedésbeli hiányok mind kezelve vannak, a releváns automatikus tesztek zöldek, és a fizikai átvételi eredmények dokumentáltak. A referencia túlszárnyalásához ezen felül legalább egy mérhető mérési minőségi mutatóban (centhiba, stabilizálódási idő, téves detektálás vagy ismételhetőség) javulást kell igazolni úgy, hogy más kritikus mutató ne romoljon.
