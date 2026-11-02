const liste = (s: string) => s.trim().split(/\s+/).map(w => w.toLowerCase());
export const NOMEN = new Set(liste(`
  dienst dienste diensten dienstes frühdienst frühdienste frühdiensten frühdienstes spätdienst spätdienste
  spätdiensten spätdienstes nachtdienst nachtdienste nachtdiensten nachtdienstes tagdienst tagdienste
  zwischendienst zwischendienste bereitschaftsdienst bereitschaftsdienste rufbereitschaft bereitschaft
  frühschicht frühschichten spätschicht spätschichten nachtschicht nachtschichten schicht schichten
  doppelschicht doppelschichten wochenenddienst wochenenddienste feiertagsdienst feiertagsdienste
  dienstplan dienstpläne dienstplans dienstplanung plan pläne plans planung besetzung besetzungen
  mindestbesetzung unterbesetzung überbesetzung sollbesetzung soll ist lücke lücken engpass engpässe
  ausfall ausfälle ausfällen ausfalls ersatz vertretung vertretungen springer springerin springerinnen
  springerpool pool tausch schichttausch übernahme einsatz einsätze einspringen
  station stationen wohnbereich wohnbereiche bereich bereiche abteilung abteilungen team teams
  einrichtung einrichtungen klinik krankenhaus pflegeheim praxis ambulanz notaufnahme
  intensivstation intensiv op normalstation
  praxen arztpraxis hausarztpraxis facharztpraxis kinderarztpraxis zahnarztpraxis gemeinschaftspraxis
  praxisgemeinschaft mvz hausarzt hausärzte facharzt fachärzte praxisinhaber praxisinhaberin praxisleitung
  mfa mfas zfa zfas tfa empfang anmeldung rezeption tresen telefondienst labor labors assistenz
  assistenzkraft assistenzkräfte assistenzkräften mitarbeitende mitarbeitenden vorbereitung nachbereitung
  wochenplan wochenpläne sonntagsdienst samstagsdienst sonntagsvormittag samstagsvormittag beschreibung
  text texte pdf foto fotos
  behandlung behandlungen behandlungsraum sprechstunde sprechstunden sprechzeit sprechzeiten
  akutsprechstunde terminsprechstunde öffnungszeit öffnungszeiten hausbesuch hausbesuche
  blutabnahme blutabnahmen impfung impfungen ekg ultraschall röntgen abrechnung quartalsende
  mittags mittagspause vormittags nachmittags abends morgens
  mo di mi do fr sa so
  spät kw kalenderwoche berufsschule prophylaxe notdienst notdienste summe gesamt legende std
  montagvormittag dienstagvormittag mittwochvormittag donnerstagvormittag freitagvormittag samstagvormittag
  montagnachmittag dienstagnachmittag mittwochnachmittag donnerstagnachmittag freitagnachmittag
  montagnachmittags dienstagnachmittags mittwochnachmittags donnerstagnachmittags freitagnachmittags
  samstagvormittags mittwochvormittags freitagvormittags
  person personen mitarbeiter mitarbeiterin mitarbeiterinnen mitarbeitern mitarbeiters kräfte
  kräften fachkraft fachkräfte fachkräften pflegefachkraft pflegefachkräfte pflegekraft pflegekräfte
  hilfskraft hilfskräfte pflegehilfskraft pflegehilfskräfte pflegehelfer pflegehelferin pflegehelferinnen
  helfer helferin azubi azubis auszubildende auszubildender auszubildenden praktikant praktikantin
  schülerin praxisanleiter praxisanleiterin leitung leitungen stationsleitung pdl
  wohnbereichsleitung teamleitung kollege kollegin kollegen kolleginnen arzt ärztin ärzte
  ärztinnen ärzten arztes dr praxisärztin praxisarzt praxisärzte praxisärztinnen weiterbildungsassistent
  weiterbildungsassistentin weiterbildungsassistenz assistent assistentin assistenten assistentinnen
  arzthelfer arzthelferin arzthelferinnen praxisteam teammitglied teammitglieder leute
  startwoche startwochen wechsel woche wochen
  zeitarbeit leasing leasingkraft leasingkräfte aushilfe aushilfen
  herr frau herrn familie patient patientin patienten patientinnen bewohner bewohnerin bewohnern
  qualifikation qualifikationen examen examinierte examinierter examinierten
  urlaub urlaubs urlaubstag urlaubstage krankheit krankmeldung krankmeldungen krankschreibung
  arbeitsunfähigkeit au elternzeit kinder kinderbetreuung kita schule
  notfall notfälle notlage ausnahme ausnahmelage lage situation
  fortbildung fortbildungen schulung schulungen weiterbildung termin termine besprechung
  überstunden überstunde stunden stunde std minute minuten pause pausen ruhezeit ruhezeiten
  arbeitszeit arbeitszeiten wochenstunden vertragszeit vertrag teilzeit vollzeit minijob
  zeitkonto stundenkonto plus minus freizeit ausgleich freizeitausgleich
  wünsche wünschen dienstwunsch dienstwünsche
  tag tage tagen tages heute morgen übermorgen gestern vorgestern woche wochen wochenende wochenenden
  monat monate monats jahr jahre quartal anfang mitte ende beginn uhr uhrzeit zeit zeitraum
  feiertag feiertage feiertagen brückentag brückentage
  montag dienstag mittwoch donnerstag freitag samstag sonnabend sonntag
  montags dienstags mittwochs donnerstags freitags samstags sonntags
  früh frühe vormittag nachmittag abend nacht nächte
  wetter sturm sturmwarnung unwetter glatteis schnee hitze streik bahnstreik stau
  blitzeis eisglätte glätte schneefall schneesturm schneechaos unwetterwarnung wetterwarnung orkan
  hochwasser überschwemmung starkregen hitzewelle kältewelle stromausfall netzausfall systemausfall
  serverausfall cyberangriff hackerangriff feueralarm großbrand evakuierung räumung wasserschaden
  heizungsausfall warnstreik verkehrschaos sperrung straßensperrung vollsperrung notlage ausnahmelage
  reaktion reaktionen maßnahme maßnahmen vorlage vorlagen notfallplan notfallpläne vorplan vorpläne
  anfahrt anreise arbeitsweg verspätung verspätungen
  veranstaltung großauftrag auftrag belegung betten bett aufnahme aufnahmen entlassung entlassungen
  bedarf mehrbedarf personal personalbedarf ausfallzeit regel regeln vorgabe vorgaben
  frage fragen vorschlag vorschläge lösung lösungen grund gründe ordnung problem probleme
  bitte danke hinweis info telefon handy nachricht anruf
  nummer nr prozent euro
`));
export const WOERTER = new Set(liste(`
  regulär reguläre regulären regulärer gleichzeitig bisherige bisheriger bisherigen bereits gelesen
  vorsichtig fahren reagieren erschwert gesperrt glatt sicher verspätet
  der die das den dem des ein eine einer einem einen eines kein keine keiner keinem keinen keines
  ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen
  mein meine meinem meinen meiner dein deine sein seine seinem seinen seiner ihre ihrem ihren ihrer
  unser unsere unserem unseren unserer euer eure
  dieser diese dieses diesem diesen jener jene welche welcher welches welchem welchen
  jemand niemand jeder jede jedes jedem jeden alle allen aller alles beide beiden einige mehrere
  manche viele wenige andere anderen anderer anderes anderem etwas nichts man selbst selber
  und oder aber sondern denn doch jedoch sowie bzw sowohl als auch weder noch entweder
  dass ob wenn falls weil da damit obwohl bevor nachdem während sobald solange bis seit seitdem
  wie was wer wen wem wessen wo wohin woher wann warum weshalb wozu womit wofür
  in im ins an am ans auf aufs aus bei beim mit nach von vom vor vors zu zum zur durch für fürs
  gegen ohne um über unter zwischen hinter neben ab außer statt anstatt trotz wegen laut je pro per
  bis gegenüber innerhalb außerhalb
  nicht nie niemals immer oft manchmal selten wieder noch schon erst nur auch sehr ganz gar
  so dann danach davor dabei dafür dagegen damit daran darauf daraus darüber davon dazu
  hier dort da jetzt gleich sofort bald später früher vorher nachher zuerst zuletzt zunächst
  ja nein vielleicht eventuell bitte gern gerne leider dringend unbedingt möglichst eher lieber
  heute morgen morgens abends nachts mittags vormittags nachmittags tagsüber
  heutigen morgigen nächste nächsten nächster nächstes letzte letzten letzter vergangene vergangenen
  kommende kommenden kommender diese folgende folgenden gesamte gesamten ganze ganzen
  erste ersten zweite zweiten dritte dritten vierte fünfte sechste siebte
  eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf zwanzig dreißig
  einmal zweimal dreimal mal halbe halben halb viertel doppelt
  mehr weniger meisten wenigsten genug zusätzlich zusätzliche zusätzlichen extra weitere weiteren
  insgesamt mindestens höchstens maximal minimal etwa ungefähr circa ca knapp rund genau
  sein bin bist ist sind seid war warst waren wart gewesen wäre wären
  haben habe hast hat habt hatte hatten gehabt hätte hätten
  werden werde wirst wird werdet wurde wurden worden würde würden
  können kann kannst könnt konnte konnten könnte könnten
  müssen muss musst müsst musste mussten müsste müssten
  sollen soll sollst sollt sollte sollten
  wollen will willst wollt wollte wollten
  dürfen darf darfst dürft durfte durften dürfte dürften
  möchte möchten möchtest mag
  fehlen fehlt fehle fehlst fehlte fehlten gefehlt fehlend fehlende fehlenden
  fallen fällt fiel fielen ausfallen ausgefallen fällt ausfällt fallen
  krank kranke kranken krankgemeldet krankgeschrieben arbeitsunfähig
  brauchen brauche brauchst braucht brauchte brauchten gebraucht benötigen benötigt benötigte
  suchen suche suchst sucht suchte gesucht finden finde findest findet fand gefunden
  planen plane planst plant plante geplant einplanen eingeplant verplant umplanen umgeplant
  besetzen besetze besetzt besetzte besetzten unbesetzt nachbesetzen
  übernehmen übernehme übernimmt übernahm übernommen einspringen springt springen eingesprungen
  tauschen tausche tauscht tauschte getauscht vertreten vertritt vertrat
  arbeiten arbeite arbeitest arbeitet arbeitete gearbeitet kommen komme kommst kommt kam kamen gekommen
  gehen gehe gehst geht ging gingen gegangen bleiben bleibe bleibt blieb geblieben
  machen mache machst macht machte gemacht tun tue tut tat getan
  geben gebe gibt gab gegeben nehmen nehme nimmt nahm genommen
  sagen sage sagt sagte gesagt melden meldet meldete gemeldet abgemeldet
  absagen absagt abgesagt verschieben verschiebt verschoben
  zählen zählt gilt gelten bekommen bekommt bekam
  wissen weiß wusste sehen sieht sah gesehen prüfen prüft geprüft
  helfen hilft half geholfen fragen fragt fragte gefragt
  erreichen erreicht erreichbar verfügbar verfügbare verfügbaren
  dürfte frei freie freien freier belegt voll volle vollen leer
  zugeteilt zuteilen einteilen eingeteilt
  ausgleichen ausgeglichen reduzieren reduziert erhöhen erhöht verlängern verlängert verkürzen verkürzt
  anfangen fängt begonnen beginnt enden endet geendet dauern dauert
  allein alleine zusammen gemeinsam zusätzlich
  kurzfristig kurzfristige kurzfristigen langfristig spontan dringend dringende dringenden
  wichtig wichtige wichtigen möglich mögliche möglichen unmöglich nötig nötige nötigen notwendig
  zulässig zulässige erlaubt verboten
  gut gute guten besser beste schlecht schlechter
  lang lange langen länger kurz kurze kurzen kürzer
  groß große großen größer klein kleine kleinen kleiner neu neue neuen neuer alt alte alten
  hoch hohe hohen höher niedrig niedrige niedrigen
  gleich gleiche gleichen gleicher anders
  examiniert examinierte examinierten ungelernt ausgebildet
  wöchentlich täglich monatlich stündlich regelmäßig
  offen geöffnet geschlossen zu auf reicht reichen genügt genügen ausreichend schaffen schafft
  durchgehend abwechselnd früher später öffnen öffnet öffnete schließen schließt schloss
  ganztags halbtags
  vorne hinten oben unten links rechts drinnen draußen
  okay ok
  bevorzugt bevorzugen vermeiden möchte wochentag wochentage verfügbarkeit
`));
export const NAMENSGLEICH = new Set(liste(`
  lange lang klein groß jung kurz neu alt gut hoch frei voll gleich früh ganz weiß
`));
export const ANREDEN = new Set(liste(`
  herr herrn frau fr hr dr prof schwester bruder pfleger pflegerin patient patientin
  bewohner bewohnerin familie kollege kollegin oberarzt oberärztin chefarzt chefärztin
`));
export const MONATE = new Set(liste(`
  januar jänner februar märz maerz april mai juni juli august september oktober november dezember
  jan feb mär apr jun jul aug sep sept okt nov dez
`));
export const MONAT_DAVOR = new Set(liste(`
  im anfang mitte ende bis ab seit vom zum am den dem nächsten letzten kommenden diesen
`));
