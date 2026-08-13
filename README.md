# Hubs

Una raccolta di pagine-hub statiche, autonome negli URL ma centralizzate nella gestione. Non ci sono framework o dipendenze: tutte le pagine vengono generate dal leggibile `content/hubs.json`.

## Modificare i contenuti

Avvia l'editor locale:

```bash
npm run dev
```

Apri `http://localhost:4173/admin/`. Da qui puoi creare, modificare, riordinare ed eliminare hub, sezioni e link, oltre a cercare visivamente tra le icone. Trascina un link dalla maniglia `⠿` per riordinarlo o spostarlo in un'altra sezione. Il pulsante **Salva modifiche** aggiorna `content/hubs.json` e rigenera subito l'anteprima.

Ogni hub può avere anche un logo e brevi informazioni in testata. Per immagini locali, inserisci il file in `src/public/assets/` e usa un percorso come `assets/logo.png`.

L'editor esiste solo nel server locale: non viene copiato in `docs/` e quindi non viene pubblicato.

### Modifica manuale facoltativa

Apri `content/hubs.json`. Ogni elemento dentro `hubs` genera una pagina all'indirizzo `/<slug>/`.

- Per aggiungere un link, copia un oggetto dentro `links` e modifica soltanto `label`, `url` e `icon`.
- `url` può restare vuoto: il link verrà mostrato come segnaposto non cliccabile.
- Per aggiungere una sezione, copia un oggetto con `title` e `links`.
- Per creare un hub, duplica un intero oggetto dentro `hubs` e assegna uno `slug` univoco.
- Se serve, imposta `published: false` per togliere un hub dalla directory principale senza disattivarne l'URL.
- Le icone provengono da [Tabler Icons](https://tabler.io/icons): il selettore locale permette di cercarle e vederle prima di sceglierle.

Un link essenziale è fatto così:

```json
{
  "label": "Il mio GitHub",
  "url": "https://github.com/utente",
  "icon": "brand-github"
}
```

L'anteprima pubblica locale è disponibile su `http://localhost:4173/`.

## Pubblicazione

```bash
npm run build
```

La versione pubblicabile viene generata in `docs/`.

Su GitHub vai in **Settings → Pages**, scegli **Deploy from a branch**, seleziona il branch principale e la cartella **`/docs`**. I percorsi sono relativi, quindi funzionano sia su `utente.github.io/hubs/` sia su un dominio personalizzato senza configurare un `baseUrl`.

La cartella `resources/` contiene soltanto riferimenti di progetto e non entra nella build pubblica.

### Build, commit e push in un comando

Dopo aver salvato le modifiche dall'admin, pubblicale con:

```bash
npm run publish -- "Aggiorna hub U19"
```

Il comando rigenera `docs/`, aggiunge soltanto i file del progetto, crea il commit e fa push sul branch corrente. Se ometti il messaggio viene usata automaticamente la data e l'ora:

```bash
npm run publish
```

Se non ci sono modifiche, non crea un commit vuoto ma verifica comunque il push. Eventuali errori di build, commit o rete interrompono il processo senza nasconderli.
