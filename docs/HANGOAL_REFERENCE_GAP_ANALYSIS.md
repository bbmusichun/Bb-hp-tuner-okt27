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
| Többsávos stroboszkóp | Kezdeti 1x, 2x és 3x sáv; egyedi sávok szabad hozzáadása és törlése. | 3 alaprezonancia + legfeljebb 8 egyedi sáv. | **P0 – részleges.** Már elég rugalmas, de a 8 egyedi sáv korlátja és a célok dinamikus viselkedése dokumentálandó. |
| Sávcél megadása | Alapfrekvenciához viszonyított félhang/cent eltolás vagy tiszta hangközarány. | Hz-cél és cent-kalibráció; most kerül be a sávcél Hz/arány/cent formájú megadása. | **P0.** Az arány és cent cél a kiválasztott alaphanghoz képest maradjon relatív hangváltáskor; ne csak egyszer számolódjon abszolút Hz-re. |
| Sáv kalibrálása | A megjelenített eltérésre kattintva az eltérés kinullázható a cent-offset módosításával. | **Az egyedi stroboszkópsávokon megvan:** érvényes, megbízható csúcs esetén egy művelet a mért frekvenciára állítja a célt a cent-offset módosításával. A sáv abszolút Hz/arány/cent kifejezése megmarad; a mérés és a korábbi napló nem változik. | **P1 – az egyedi sávokon implementálva; kézi valós hangszeren végzett átvétel hátravan.** A fő alaphang/2×/3× csatornák egy kattintásos nullázása külön következő lépés lehet. |
| Stroboszkóp kontrasztja | A sáv kontrasztja jelzi a jel erősségét; a bar élessége a hang stabilitását. | **Első implementáció a PR-ágon:** a mért peak dBFS skálázza a kontrasztot, a nyers centmérések 15 mintás szórása a csíkszélek élességét. Ez csak vizuális becslés, nem módosítja a mérést. | **P0 – részben megvalósítva.** A dB/élesség leképezések egységteszteltek; a küszöbök és a zajra adott viselkedés valós handpan-felvételen még kalibrálandó. |
| Hangolási visszajelzés | Sáveltérés Hz-ben vagy centben; tűrésen belül zöld. | Hz-, cent-, hangnév- és arány-kijelzés; automatikus vagy rögzített tűrés, diagnosztika. | **Megvan/részleges.** Egyetlen konzisztens tűrés- és érvényességi szabályt kell használni minden nézetben. |
| Tűrésmód | referenciaalkalmazás: bármilyen eltérés elfogadása vagy a zöld állapot tiltása is választható. | **Funkcionálisan megvan:** Auto, fix centküszöb, „Mindig elfogadott” és „Soha ne legyen zöld” mód. Mindegyik a fő kijelzésben, kártyákon, mindkét stroboszkópon, spektrumon, stabilitási grafikonon és naplóban ugyanazt a szabályt használja. A hiányzó/nem véges mérés egyik szélső módban sem válik érvényessé. | **P1 – implementálva, kézi átvétel hátravan.** Ellenőrizni kell, hogy a módváltás nem írja át a Hz/cent adatot, a mérési napló és export az alkalmazott módot rögzíti, újratöltés és teljes backup-visszaállítás megőrzi azt. |
| Roll speed / érzékenység | Állítható stroboszkóp-reakció a hangmagasság-eltérésre. | **Első verzió megvalósítva:** a fő stroboszkóp alatt 0,25×–2,5× érzékenységszabályzó található, és a módosítás az egyedi sávokra is érvényes; mentés és teljes konfigurációs biztonsági mentés támogatott. | **Részleges, valós használattal kalibrálandó.** Ellenőrizni kell, melyik érzékenységi tartomány olvasható a legjobban a mély alaphangon és a magasabb parciálisokon. |
| Referenciahang (pitch pipe) | Minden sáv külön: folyamatos hang, hangütésre rövid hang, kikapcsolva. | A referenciahang globálisan folyamatos/ütés/kikapcsolt módot kezel a kiválasztott rezonanciára. | **P0.** A módot sávonként tárolni, és a sáv célfrekvenciájából generálni; cél- vagy profilváltáskor biztonságosan leállítani. |
| Mikrofon és hangkimenet választása | Elérhető hangbemenetek és -kimenetek választhatók. | **A szoftveres eszközválasztás implementálva:** `enumerateDevices` listázza a bemeneteket és kimeneteket; a kiválasztott mikrofon `deviceId: exact` korláttal indul, eltűnt/nem elérhető eszköznél az alapértelmezett bemenet következik. A közös Web Audio kimenet `AudioContext.setSinkId`-val irányítható, ahol a böngésző támogatja. Az eszköz-ID-k helyi preferenciában és teljes konfigurációs backupban mentődnek; régi backupok üres/alapértelmezett eszközzel töltődnek be. | **P1 – szoftveres rész megvan; kézi átvétel hátravan.** A `setSinkId` nem minden böngészőben érhető el; iPhone/iOS Safari esetén a rendszer hangútvonala marad. Ellenőrizni kell engedélyezett és megtagadott állapotot, eszköz kihúzását, Bluetooth-eszközváltást és teljes reload/backup visszaállítást. |
| Bemeneti szint és túlvezérlés | Zöld szintjelzés, piros klippelésnél; a stroboszkóp szüneteltethető. | Bemeneti dBFS, magas szint/near-clip figyelmeztetés és analízis-FPS látható; külön strobe pause paritást ellenőrizni kell. | **P1.** Sávrajzolás befagyasztása a mikrofonleolvasás leállítása nélkül; állapot egyértelmű jelzése. |
| Teljesítmény-visszajelzés | 40 FPS alatti rajzolási sebességre figyelmeztet. | Analízisciklus-FPS és mintavételi frekvencia kijelzése van. | **Megvan/részleges.** Külön kezelni a UI frame rate-et és az audioanalízis frekvenciáját. |
| Spektrum | Jelentős parciálisok spektruma a stroboszkópra vetítve; zajpadló-elnyomás; kurzor Hz/relatív frekvencia/dB; sávra nagyítás. | Spektrum, waterfall/spektrogram és diagnosztika van; a teljes referenciaalkalmazás-szerű kurzor- és sávra zoom-interakció paritását kézzel ellenőrizni kell. | **P0.** Mérési diagnosztika fontosabb, mint a puszta vizuális hasonlóság: pontos frekvencia, relatív arány, amplitúdó és közeli/dublázott csúcsok megjelenítése. |
| Csúcsdetektálás és stabil mérés | Kézikönyv csúcs-spektrumot ír le; belső detektálási algoritmust nem részletez. | FFT-csúcs-interpoláció, YIN, hangjelölt-választás, tranziensvédelem, stabilitássimítás, confidence, klippelés- és alaphang-azonosíthatósági diagnosztika. | **Hangoal erős alapja.** Ezt meg kell tartani; a pontosság fölényét közös benchmarkkal bizonyítani. |
| Automatikus hangfelismerés | Egyszeri vagy folyamatos; E0–E9 tartományú hangra állítja a pitch dialt. | Folyamatos/egyszeri/kikapcsolt mód, három következetes képkocka és hangmezőszűrés. | **Megvan/részleges.** A tényleges handpan hangmező a cél; ellenőrizni kell a használható oktávatartományt és a hangváltás késleltetését. |
| Hangválasztó és oktáv | Hang/oktáv kiválasztás, transzponálás; a hangkerék húzással is navigálható. | Kromatikus hangválasztó, oktávválasztás, transzponálás; eltérő hangok a kiválasztott skálán kívül is célozhatók. | **Megvan/részleges.** A mobilbarát választó megtartható; a pontos drag-UX nem kritikus, ha a kezelhetőség legalább olyan gyors. |
| Modalitás / hangok tiltása | Kerékből hangok ki/be kapcsolása és a mód elforgatása; a tiltott hangokat az auto-detection átugorja. | Hangonkénti engedélyezés/tiltás és transzponálás; az utolsó aktív hang védett. | **Funkcionálisan megvan, UX részleges.** Az állapotnak minden automatikus felismerési útban érvényesülnie kell. |
| Skálák és temperálások | Scala fájlok; kézikönyv szerint kb. 30 gyárilag csomagolt temperamentum/skála, emellett több mint 4000 további elérhető. | A referencia ZIP 35 SCL fájlja a Hangoalban be van csomagolva; további `.scl` import lehetséges. | **Részleges.** A teljes nagy külső katalógust nem kell mind beégetni; import, kategorizálás, keresés és hiányzó handpan-skálák szükségesek. |
| Scala-specifikus bővítések | Egyedi hangnevek/előjegyzések; `!!reference` metadatával nem alaphang is kijelölhető referenciahangként, oktávval és opcionális Hz értékkel. | **A horgonyfeloldás implementálva:** a jelölt skálafok intervalumából kiszámítja a skála gyökérfrekvenciáját. Explicit Hz esetén azt használja; Hz nélkül a szabványos hangcímkét (pl. A4, F#4, Bb4) az aktuális A4-referenciával oldja fel. Solfège címke (pl. Mi) csak explicit Hz mellett használható. Az importban külön, alapból kikapcsolt kapcsoló engedi a horgony alkalmazását; a preview root hangnevét és centeltérését is helyesen címkézi. A globális A4 beállítás nem módosul; a konvertált pontos frekvenciák a profil egyedi hangmezőjébe mentődnek. | **P0 – szoftveres szemantika és automatizált tesztek megvannak; kézi import/valós hangszeres ellenőrzés hátravan.** Tesztelendő explicit Hz, implicit standard hangnév, period-sor, szolmizációs címke és nem érvényes horgony. |
| Leolvasási módok | Hz, cent, hangnév vagy tiszta hangközarány. | Hz, cent, hangnév és a mért arány az alaphanghoz képest. | **Megvan/részleges.** A célarány és mért arány világos megkülönböztetése. |
| Freeze | Védi a cent-, referenciafrekvencia- és transzponálás-beállításokat a változástól. | Teljes konfigurációval és profilokkal rendelkezik; külön freeze funkció nem igazolt. | **P2.** Hasznos „mérés rögzítése” mód, amely lezárja a célbeállítások akaratlan változtatását. |
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

1. **P0 - Mérés és célértékek:** relatív arány/cent cél a kiválasztott alaphanghoz kötve; Scala névcímkék és opt-in `!!reference` horgonyfeloldás automatizált tesztekkel elkészült; strobe-kontraszt és stabilitás valós hanggal kalibrálandó; az automatikus referenciajel-benchmark továbbra is nyitott.
2. **P0 - Referenciaeszköz paritás:** sávonkénti referenciahang, spektrum-interakció és tűrésmódok.
3. **P1 - Munkafolyamat:** a stroboszkóp érzékenységszabályzója, az egyedi sávok egy kattintásos kalibrálása és a bemeneti/kimeneti eszközválasztás szoftveresen elkészült; valós mikrofonon, kimeneti útvonalon és handpanen végzett átvétel szükséges.
4. **P1 - Valós eszköz átvétel:** iPhone/Safari és legalább egy másik célböngésző, valódi handpannal és külső referenciával.
5. **P2 - Haladó kezelőfelület:** freeze, teljes billentyűzet-navigáció, több példány közötti vezérlés, ha valós felhasználási igény indokolja.

## Kiadási kapu

A Hangoal csak akkor tekinthető a referencia szintjét elérőnek, ha a P0 viselkedésbeli hiányok mind kezelve vannak, a releváns automatikus tesztek zöldek, és a fizikai átvételi eredmények dokumentáltak. A referencia túlszárnyalásához ezen felül legalább egy mérhető mérési minőségi mutatóban (centhiba, stabilizálódási idő, téves detektálás vagy ismételhetőség) javulást kell igazolni úgy, hogy más kritikus mutató ne romoljon.
