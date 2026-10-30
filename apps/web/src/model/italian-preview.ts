export const italianDocumentPreview = {
  loading: 'Preparazione del documento…',
  loadMore: 'Carica altro',
  changed: 'Il file è cambiato; viene mostrato il contenuto precedente.',
  reloadNow: 'Ricarica',
  reload: 'Leggi di nuovo il file',
  autoRefresh: 'Aggiornamento automatico',
  'autoRefresh.enable': 'Attiva aggiornamento automatico',
  'autoRefresh.disable': 'Disattiva aggiornamento automatico',
  'wrap.enable': 'Attiva ritorno a capo',
  'wrap.disable': 'Disattiva ritorno a capo',
  'wrap.aria': 'Ritorno a capo',
  openWith: 'Apri con',
  'viewer.text': 'Testo semplice',
  resourceUnavailable: 'Servizio dei file non disponibile.',
  rendererUnavailable: 'Anteprima {name} non disponibile.',
  unsupportedFile: 'L’anteprima per questo tipo di file non è ancora disponibile.',
  'error.notFound': 'File non trovato. Potrebbe essere stato spostato o eliminato.',
  'error.tooLarge': 'La pagina supera il limite di {limit} e non può essere letta.',
  'error.notText': 'L’anteprima per questo tipo di file non è ancora disponibile.',
  'error.notRegularFile': 'Non è un file normale; nulla da mostrare.',
  'error.unavailable': 'Lettura non riuscita: {message}',
  retry: 'Riprova',
}
export const italianCodePreview = { title: 'Codice', copy: 'Copia', copied: 'Copiato' }
export const italianExcel = {
  title: 'Foglio di calcolo',
  // The embedded workbook viewer only provides Chinese and English resources.
  language: 'en',
  loading: 'Preparazione del documento…',
  invalid:
    'Impossibile aprire questo foglio di calcolo. Controlla formato, contenuto o protezione con password.',
  tooLarge: 'La cartella di lavoro supera il limite di dimensione per l’anteprima.',
  timeout: 'Apertura scaduta. Prova con un file più piccolo.',
  encoding:
    'Impossibile leggere la codifica del testo. Salva il file come UTF-8 o UTF-16 con BOM e riprova.',
  formulaWarning:
    'La cartella di lavoro contiene formule. I risultati mostrati potrebbero essere assenti o imprecisi.',
  unsupportedNotice:
    'L’anteprima non supporta {features} in questa cartella di lavoro. Aprila in un’applicazione di sistema per tutte le funzioni.',
  charts: 'grafici',
  images: 'immagini',
  shapes: 'forme',
  conditionalFormatting: 'formattazione condizionale',
  featureSeparator: ', ',
  retry: 'Riprova',
}
export const italianHtml = {
  title: 'HTML',
  frame: 'Anteprima documento HTML',
  loading: 'Preparazione del documento…',
  failed: 'Impossibile visualizzare l’anteprima del documento HTML.',
}
export const italianImage = {
  zoomControls: 'Controlli zoom',
  zoomMenu: 'Scegli zoom',
  zoomOut: 'Riduci zoom',
  zoomIn: 'Aumenta zoom',
  zoomFitWidth: 'Adatta alla larghezza',
  zoomValue: '{percent}%',
  title: 'Immagine',
  preview: 'Anteprima immagine: {name}',
  loading: 'Preparazione del documento…',
  failed: 'Impossibile visualizzare questa immagine.',
  unsupported: 'L’anteprima dell’immagine richiede il contenuto completo del file.',
}
export const italianMarkdown = {
  'viewer.label': 'Markdown',
  'code.copy': 'Copia',
  'code.copied': 'Copiato',
  footnotes: 'Note',
}
export const italianOffice = {
  title: 'Documento Office',
  loading: 'Preparazione del documento…',
  retry: 'Riprova',
  viewMissingFonts: 'Caratteri mancanti: {count}. Seleziona per visualizzarli.',
  missingFontsTitle: 'Caratteri mancanti',
  missingFontsDescription:
    'Questi caratteri non sono disponibili per l’anteprima. Il testo e la disposizione possono differire dal documento originale.',
  missingFontsCount: 'Caratteri: {count}',
  closeDetails: 'Chiudi dettagli dei caratteri',
  unavailable:
    'Anteprime Office non disponibili. Attiva il servizio di anteprima sul computer che esegue DeepSeek Harness.',
  invalid:
    'Impossibile visualizzare questo file Office. Potrebbe essere danneggiato, protetto da password o avere un’estensione errata.',
  tooLarge:
    'Il file Office o il PDF convertito supera il limite di dimensione per l’anteprima. Riduci il file o modifica la configurazione dell’anteprima.',
  failed: 'La conversione Office non ha prodotto un PDF utilizzabile. Controlla il file e riprova.',
  timeout: 'Conversione Office scaduta. Riprova.',
  busy: 'Il servizio di anteprima Office è occupato. Riprova tra poco.',
  changed: 'Il file è cambiato durante la lettura. Riapri l’anteprima.',
}
export const italianPdf = {
  zoomControls: 'Controlli zoom',
  zoomMenu: 'Scegli zoom',
  zoomOut: 'Riduci zoom',
  zoomIn: 'Aumenta zoom',
  zoomFitWidth: 'Adatta alla larghezza',
  zoomValue: '{percent}%',
  title: 'PDF',
  pageImage: 'Pagina PDF {page}',
  loading: 'Preparazione del documento…',
  rendering: 'Preparazione della pagina…',
  failed: 'Impossibile visualizzare il PDF: {message}',
  password:
    'Questo PDF richiede una password; le anteprime protette da password non sono supportate.',
  workerFailed: 'Il processo di visualizzazione del PDF si è interrotto. Riprova.',
  unsupported: 'L’anteprima PDF richiede il contenuto completo del file.',
  retry: 'Riprova',
}
export const italianQuotes = { 'quote.add': 'Cita testo' }
export const italianExport = {
  'header.more': 'Altre azioni',
  'menu.copyMarkdown': 'Copia sessione come Markdown',
  'menu.download': 'Scarica registro della sessione',
  'menu.feedback': 'Feedback',
  'toast.copied': 'Sessione copiata come Markdown.',
  'toast.preparationFailed': 'Impossibile leggere la sessione per copiarla. Riprova.',
  'toast.clipboardFailed':
    'Impossibile scrivere negli appunti. Controlla le autorizzazioni e riprova.',
  'dialog.preparingTitle': 'Esportazione sessione',
  'dialog.preparingDescription':
    'Preparazione di uno ZIP con questa sessione, le sessioni secondarie e gli allegati.',
  'dialog.successTitle': 'Download della sessione avviato',
  'dialog.successDescription': 'Il browser sta scaricando lo ZIP della sessione.',
  'dialog.errorTitle': 'Esportazione della sessione non riuscita',
  'dialog.close': 'Chiudi',
  'dialog.commandFailed': 'Impossibile avviare l’esportazione della sessione.',
}
export const italianLayoutShortcuts = { toggle: 'Mostra o nascondi la barra laterale sinistra' }
