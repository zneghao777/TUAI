import type { ThemeKey } from '@deepseek-ai/dsh-client-ui-theme/src/client/locales.ts'
import type { ChatKey } from '@deepseek-ai/dsh-client-ui-chat/src/client/locale.ts'

export const italianTheme = {
  'appearance.title': 'Aspetto',
  'appearance.light': 'Chiaro',
  'appearance.dark': 'Scuro',
  'appearance.system': 'Sistema',
  'fontSize.text.title': 'Dimensione del testo',
  'fontSize.text.description': 'Si applica solo al contenuto della chat',
  'fontSize.text.increase': 'Aumenta dimensione del testo',
  'fontSize.text.decrease': 'Riduci dimensione del testo',
  'fontSize.code.title': 'Dimensione del codice',
  'fontSize.code.description': 'Per blocchi di codice, codice in linea e output degli strumenti',
  'fontSize.code.increase': 'Aumenta dimensione del codice',
  'fontSize.code.decrease': 'Riduci dimensione del codice',
  'fontSize.terminal.title': 'Dimensione del terminale',
  'fontSize.terminal.description': 'Per il terminale nella barra laterale',
  'fontSize.terminal.increase': 'Aumenta dimensione del terminale',
  'fontSize.terminal.decrease': 'Riduci dimensione del terminale',
  'fontSize.unit': 'px',
  'fontFamily.text.title': 'Carattere del testo',
  'fontFamily.text.description':
    'Per interfaccia e chat. Separa i caratteri con virgole; lascia vuoto per usare il predefinito',
  'fontFamily.code.title': 'Carattere del codice',
  'fontFamily.code.description':
    'Per blocchi di codice, codice in linea e output. Separa i caratteri con virgole; lascia vuoto per usare il predefinito',
  'fontFamily.terminal.title': 'Carattere del terminale',
  'fontFamily.terminal.description':
    'Per il terminale laterale. Separa i caratteri con virgole; lascia vuoto per usare il predefinito',
  'fontFamily.placeholder': 'Predefinito',
  'fontSize.more': 'Altre impostazioni dei caratteri',
} satisfies Record<ThemeKey, string>

export const italianChatSettings = {
  'settings.performance.title': 'Prestazioni e utilizzo',
  'settings.performance.description': 'Scegli il livello di dettaglio delle informazioni',
  'settings.performance.compact': 'Compatto',
  'settings.performance.detailed': 'Dettagliato',
  'settings.links.title': 'Apertura predefinita dei link',
  'settings.links.description': 'Dove aprire i link della chat',
  'settings.links.sidebar': 'Barra laterale',
  'settings.links.newTab': 'Browser predefinito',
  'settings.transcript.title': 'Dettagli del lavoro',
  'settings.transcript.description':
    'Scegli quanti dettagli delle chiamate agli strumenti mostrare',
  'settings.collapse.title': 'Quando comprimere i dettagli',
  'settings.collapse.description': 'Scegli quando comprimere automaticamente i dettagli del lavoro',
  'settings.collapse.completion': 'Al termine della risposta',
  'settings.collapse.nextInput': 'Al prossimo messaggio',
  'settings.foldedReplies.title': 'Risposte dopo la compressione',
  'settings.foldedReplies.description': 'Scegli quali risposte mantenere visibili',
  'settings.foldedReplies.all': 'Tutte le risposte',
  'settings.foldedReplies.final': 'Solo la risposta finale',
  'settings.transcript.compact': 'Compatto',
  'settings.transcript.standard': 'Standard',
  'settings.transcript.detailed': 'Dettagliato',
  'settings.transcript.verbose': 'Completamente espanso',
} satisfies Partial<Record<ChatKey, string>>
