import type {
  PermissionAccessKey,
  PermissionSettingsKey,
} from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'

export const permissionSettingsIt = {
  title: 'Autorizzazioni',
  description: 'Scegli la modalità predefinita per le nuove sessioni',
  loading: 'Caricamento',
  unavailable: 'Non disponibile',
  'preset.readOnly': 'Sola lettura',
  'preset.workspaceWrite': 'Modifica nell’area di lavoro',
  'preset.fullAccess': 'Accesso completo',
  'confirm.title': 'Attivare l’accesso completo?',
  'confirm.description':
    'Con l’accesso completo le nuove sessioni richiedono meno conferme e possono eseguire direttamente più operazioni, incluse operazioni sensibili, modifiche ai file e comandi esterni. Usalo solo se ti fidi delle attività successive.',
  'confirm.acknowledge': 'Comprendo i rischi e desidero continuare',
  'confirm.cancel': 'Annulla',
  'confirm.enable': 'Attiva accesso completo',
} satisfies Record<PermissionSettingsKey, string>

export const permissionAccessIt = {
  mode: 'Modalità di accesso, attuale: {name}',
  close: 'Chiudi',
  'preset.readOnly': 'Sola lettura',
  'preset.workspaceWrite': 'Modifica nell’area di lavoro',
  'preset.fullAccess': 'Accesso completo',
  'confirm.title': 'Attivare l’accesso completo?',
  'confirm.description':
    'L’accesso completo riduce le conferme e permette all’agente di eseguire direttamente più operazioni, incluse operazioni sensibili, modifiche ai file e comandi esterni. Usalo solo se ti fidi dell’attività corrente.',
  'confirm.acknowledge': 'Comprendo i rischi e desidero continuare',
  'confirm.cancel': 'Annulla',
  'confirm.enable': 'Attiva accesso completo',
  'auto.label': 'Revisione automatica',
  'auto.badge': 'EXP',
  'auto.description':
    'Esegue senza sandbox dopo una revisione sperimentale dello stesso modello per ogni chiamata a strumenti nativi e ogni chiamata interna PTC.',
  'auto.confirm.title': 'Attivare la revisione automatica (sperimentale)?',
  'auto.confirm.description':
    'La revisione automatica funziona senza sandbox. Prima di ogni chiamata a strumenti nativi o interna PTC, lo stesso modello dell’agente corrente decide se consentirla; le chiamate rifiutate richiedono la tua approvazione o il tuo rifiuto. La funzione è sperimentale, può consentire o negare operazioni per errore e consuma token aggiuntivi.',
  'auto.confirm.acknowledge': 'Comprendo questi rischi e desidero continuare',
  'auto.confirm.enable': 'Attiva revisione automatica',
} satisfies Record<PermissionAccessKey, string>
