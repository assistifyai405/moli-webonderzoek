# Moli Webonderzoek — Nederlandse startgids

Versie **0.2.0-beta.1** maakt de plugin geschikt voor een eerste openbare proef. De browser is [Moli van Lexmount](https://github.com/lexmount/moli); onze plugin voegt lokale bronopnamen, vergelijkingen en begrensde uitvoering toe.

Gebruik een vaste map op x64 Windows of Linux/WSL. Node.js 22+ en Python 3.11+ zijn nodig; Linux gebruikt daarnaast bubblewrap met werkende namespaces. macOS en ARM zijn niet getest.

Bronpakket:

```sh
npm run setup
```

Runtime-ZIP met dependencies:

```sh
node scripts/setup.mjs --skip-dependencies --skip-engine
```

Het programma vindt jouw eigen Node-/Pythonpaden. Het downloadt alleen projectdependencies en past geen globale Codex-instellingen aan tijdens setup. Controleer met `npm run doctor`.

Websites kiezen:

```sh
npm run origins -- list
npm run origins -- add https://docs.python.org
npm run origins -- add https://docs.python.org --apply
```

Zonder `--apply` zie je eerst het voorstel. Een toegepaste wijziging bewaart een backup. Alleen exacte publieke origins zijn toegestaan; redirects en benodigde assetdomeinen moeten ook geselecteerd zijn. Herstart de server na een wijziging.

Aansluiten op lokale Codex-chats:

```sh
npm run connect
npm run connect -- --apply
```

Dit voegt alleen de Moli-server en de bijbehorende persoonlijke skill toe, bewaart andere instellingen en weigert conflicten. Open daarna een nieuwe/opnieuw aangesloten chat en laat `moli_status` echt uitvoeren. Een configuratiebestand alleen bewijst niet dat de tools in een chat geladen zijn.

De skill kan automatisch gekozen worden bij webonderzoek. Een browser starten bij ieder bericht is niet nodig. Windows en WSL worden apart aangesloten; web, mobiel en cloud zijn niet bewezen. Publicatie op GitHub installeert niets vanzelf bij anderen.

Probeer: “Lees https://nodejs.org/en met Moli. Leg de belangrijkste mogelijkheden uit, citeer de bron en vermeld onvolledige inhoud.” Met `npm run demo` kun je de tools ook zonder AI-provider proberen.

Edge-fallback blijft uit. Windows heeft geen bewezen bestandsisolatie; gebruik geselecteerde vertrouwde publieke bronnen. Er is geen algemene zoekmachine, login, formulierautomatisering of terugkerende monitor. Zie de [Engelse handleiding](README.md), [testbewijs](TESTBEWIJS.md) en [grenzen](docs/LIMITS.md) voor details.
