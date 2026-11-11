import type { ProductLanguage } from './language'

/** Known product Host messages. Unknown details stay intact for diagnosis. */
const messages: Record<string, readonly [string, string]> = {
  '当前 Host 只支持浏览器认证签名记录': [
    'This Host only supports browser authentication signing records',
    'Questo Host supporta solo i record di firma per l’autenticazione del browser',
  ],
  浏览器认证签名文件必须仅当前用户可读写: [
    'Only the current user may read or write the browser authentication signing file',
    'Solo l’utente corrente può leggere o modificare il file di firma per l’autenticazione del browser',
  ],
  浏览器认证签名记录格式不合法: [
    'Invalid browser authentication signing record',
    'Record di firma per l’autenticazione del browser non valido',
  ],
  浏览器认证只能保存签名记录: [
    'Browser authentication can only save signing records',
    'L’autenticazione del browser può salvare solo record di firma',
  ],
  '浏览器认证撤销需要通过 Host 显式维护': [
    'Browser authentication revocation must be managed explicitly through the Host',
    'La revoca dell’autenticazione del browser deve essere gestita esplicitamente dall’Host',
  ],
  模型凭据文件必须仅当前系统用户可读写: [
    'Only the current system user may read or write the model credentials file',
    'Solo l’utente di sistema corrente può leggere o modificare il file delle credenziali dei modelli',
  ],
  '模型凭据包装密钥缺失或损坏，请恢复凭据备份': [
    'The model credential wrapping key is missing or damaged. Restore a credential backup.',
    'La chiave di protezione delle credenziali dei modelli è assente o danneggiata. Ripristina una copia delle credenziali.',
  ],
  '模型凭据解密失败，请恢复凭据备份': [
    'Could not decrypt model credentials. Restore a credential backup.',
    'Impossibile decifrare le credenziali dei modelli. Ripristina una copia delle credenziali.',
  ],
  'Host 配置必须是合法 JSON': [
    'Host configuration must be valid JSON',
    'La configurazione dell’Host deve essere in formato JSON valido',
  ],
  '不支持的 Host 平台': ['Unsupported Host platform', 'Piattaforma Host non supportata'],
  '只能创建当前 Host 平台的目录': [
    'Directories can only be created for the current Host platform',
    'È possibile creare cartelle solo per la piattaforma Host corrente',
  ],
  会话已删除: ['Chat has been deleted', 'La chat è stata eliminata'],
  该会话已删除: ['This chat has been deleted', 'Questa chat è stata eliminata'],
  会话不可用: ['Chat unavailable', 'Chat non disponibile'],
  图片不存在或不属于此会话: [
    'Image does not exist or does not belong to this chat',
    'L’immagine non esiste o non appartiene a questa chat',
  ],
  图片已移除: ['Image has been removed', 'L’immagine è stata rimossa'],
  会话工作区不可用: ['Chat workspace unavailable', 'Area di lavoro della chat non disponibile'],
  文件不存在或没有可验证的会话来源: [
    'File does not exist or its chat origin cannot be verified',
    'Il file non esiste o non è possibile verificarne la chat di origine',
  ],
  文件已删除: ['File has been deleted', 'Il file è stato eliminato'],
  '原文件已删除，但删除记录保存失败；请刷新核对，不要重复删除': [
    'The original file was deleted, but the deletion record could not be saved. Refresh and check; do not delete again.',
    'Il file originale è stato eliminato, ma non è stato possibile salvare il registro. Aggiorna e verifica; non ripetere l’eliminazione.',
  ],
  '文件已变化，请刷新后重试': [
    'The file changed. Refresh and try again.',
    'Il file è cambiato. Aggiorna e riprova.',
  ],
  文件不在会话工作区内: [
    'The file is outside the chat workspace',
    'Il file non si trova nell’area di lavoro della chat',
  ],
  文件在删除时发生变化: [
    'The file changed during deletion',
    'Il file è cambiato durante l’eliminazione',
  ],
  不支持的对话偏好字段: [
    'Unsupported chat preference field',
    'Campo delle preferenze della chat non supportato',
  ],
  '当前 Host 未启用该设置域': [
    'This Host has not enabled these settings',
    'Questo Host non ha abilitato queste impostazioni',
  ],
  '当前 Web Host 不提供原生设置文件打开': [
    'This Web Host cannot open native settings files',
    'Questo Host Web non può aprire i file delle impostazioni native',
  ],
  新会话使用自动创建的独立工作区: [
    'New chats use an automatically created workspace',
    'Le nuove chat usano un’area di lavoro creata automaticamente',
  ],
  会话标识不合法: ['Invalid chat identifier', 'Identificativo della chat non valido'],
  工作区根目录不可为符号链接: [
    'The workspace root cannot be a symbolic link',
    'La cartella principale dell’area di lavoro non può essere un collegamento simbolico',
  ],
  工作区目录不合法: ['Invalid workspace directory', 'Cartella dell’area di lavoro non valida'],
  已删除的聊天不能恢复归档: [
    'A deleted chat cannot be restored from the archive',
    'Una chat eliminata non può essere ripristinata dall’archivio',
  ],
  工作区由新会话自动创建: [
    'Workspaces are created automatically for new chats',
    'Le aree di lavoro vengono create automaticamente per le nuove chat',
  ],
  需要会话和产物身份: [
    'A chat and artifact identifier are required',
    'Sono necessari gli identificativi della chat e del risultato',
  ],
  产物不存在或不属于此会话: [
    'Artifact does not exist or does not belong to this chat',
    'Il risultato non esiste o non appartiene a questa chat',
  ],
  无法读取产物: ['Cannot read the artifact', 'Impossibile leggere il risultato'],
  纯白主题目前仅支持浅色: [
    'The Pure White theme currently supports light mode only',
    'Il tema Bianco supporta attualmente solo la modalità chiara',
  ],
  晨曦主题目前仅支持浅色: [
    'The Dawn theme currently supports light mode only',
    'Il tema Alba supporta attualmente solo la modalità chiara',
  ],
  'Client Host 配置不合法': [
    'Invalid client Host configuration',
    'Configurazione Host del client non valida',
  ],
  '目录属于其他 Host': [
    'The folder belongs to another Host',
    'La cartella appartiene a un altro Host',
  ],
  '需要 Host 的绝对路径': [
    'An absolute Host path is required',
    'È richiesto un percorso assoluto sull’Host',
  ],
  'Host 目录选择服务尚未接入': [
    'Host folder selection is unavailable',
    'La selezione delle cartelle sull’Host non è disponibile',
  ],
  '远程客户端不能直接打开 Host 本地文件': [
    'Remote clients cannot open Host local files directly',
    'I client remoti non possono aprire direttamente i file locali dell’Host',
  ],
  '当前 Host 不属于本机桌面桥': [
    'This Host is not connected to the local desktop bridge',
    'Questo Host non è collegato al bridge desktop locale',
  ],
  平台连接已失效: ['Platform connection has expired', 'La connessione alla piattaforma è scaduta'],
  平台回执身份不匹配: [
    'Platform response identity does not match',
    'L’identità della risposta della piattaforma non corrisponde',
  ],
  平台回执格式错误: ['Invalid platform response', 'Risposta della piattaforma non valida'],
  目录回执格式错误: ['Invalid folder response', 'Risposta della cartella non valida'],
  未选择目录: ['No folder selected', 'Nessuna cartella selezionata'],
  桌面调用方或连接身份无效: [
    'Invalid desktop caller or connection identity',
    'Identità del client desktop o della connessione non valida',
  ],
  平台方法或参数不受支持: [
    'Unsupported platform method or arguments',
    'Metodo o parametri della piattaforma non supportati',
  ],
  请求已处理或当前连接调用上限已达到: [
    'The request was already handled or the connection limit was reached',
    'La richiesta è già stata elaborata o è stato raggiunto il limite della connessione',
  ],
  已取消目录选择: ['Folder selection cancelled', 'Selezione della cartella annullata'],
  目录未在平台授权范围内: [
    'The folder is outside the platform authorization scope',
    'La cartella non rientra nelle autorizzazioni della piattaforma',
  ],
  路径参数无效: ['Invalid path argument', 'Parametro del percorso non valido'],
  路径未在平台授权范围内: [
    'The path is outside the platform authorization scope',
    'Il percorso non rientra nelle autorizzazioni della piattaforma',
  ],
  '平台连接已失效；已发生的操作不会撤销': [
    'The platform connection expired; completed actions will not be undone',
    'La connessione alla piattaforma è scaduta; le operazioni eseguite non saranno annullate',
  ],
  平台操作未完成: [
    'Platform operation did not complete',
    'Operazione della piattaforma non completata',
  ],
  '模型配置不合法，请检查名称、地址和模型列表': [
    'Invalid model configuration. Check the name, address and model list.',
    'Configurazione del modello non valida. Controlla nome, indirizzo ed elenco dei modelli.',
  ],
  '请填写有效的 API 地址': ['Enter a valid API address', 'Inserisci un indirizzo API valido'],
  'API 地址须使用 HTTPS；本机服务可使用 HTTP，地址不能包含凭据或查询参数': [
    'The API address must use HTTPS; local services may use HTTP. Credentials and query parameters are not allowed.',
    'L’indirizzo API deve usare HTTPS; i servizi locali possono usare HTTP. Non sono consentiti credenziali o parametri di ricerca.',
  ],
  'DeepSeek 官方地址不能修改，请添加独立提供商': [
    'The official DeepSeek address cannot be changed. Add a separate provider.',
    'L’indirizzo ufficiale di DeepSeek non può essere modificato. Aggiungi un provider separato.',
  ],
  '模型配置文件无法读取，请恢复有效配置': [
    'Cannot read model configuration. Restore a valid configuration.',
    'Impossibile leggere la configurazione dei modelli. Ripristina una configurazione valida.',
  ],
  模型提供商标识冲突: [
    'Model provider identifiers conflict',
    'Gli identificativi dei provider dei modelli sono in conflitto',
  ],
  '配置已被其他窗口修改，请重新打开模型管理后再保存': [
    'Configuration was changed in another window. Reopen model settings before saving.',
    'La configurazione è stata modificata in un’altra finestra. Riapri le impostazioni dei modelli prima di salvare.',
  ],
  提供商标识已被占用: [
    'Provider identifier is already in use',
    'Identificativo del provider già in uso',
  ],
  '修改 API 地址时请重新填写密钥': [
    'Enter the key again when changing the API address',
    'Inserisci nuovamente la chiave quando modifichi l’indirizzo API',
  ],
  '请填写 API Key': ['Enter an API key', 'Inserisci una chiave API'],
  '最多添加 32 个模型提供商': [
    'You can add up to 32 model providers',
    'Puoi aggiungere al massimo 32 provider di modelli',
  ],
  提供商不存在: ['Provider does not exist', 'Il provider non esiste'],
  '此提供商仍有 Host 环境引用，请先在 Host 配置中移除引用': [
    'This provider is still referenced by the Host. Remove the reference from the Host configuration first.',
    'Questo provider è ancora usato dall’Host. Rimuovi prima il riferimento dalla configurazione dell’Host.',
  ],
  '连接失败或超时，请检查 API 地址与网络': [
    'Connection failed or timed out. Check the API address and network.',
    'Connessione non riuscita o scaduta. Controlla l’indirizzo API e la rete.',
  ],
  技能资源需要当前会话工作区: [
    'Skill resources require the current chat workspace',
    'Le risorse della competenza richiedono l’area di lavoro della chat corrente',
  ],
  技能运行目录不合法: [
    'Invalid skill execution directory',
    'Cartella di esecuzione della competenza non valida',
  ],
  技能资源读取需要当前会话: [
    'Reading skill resources requires the current chat',
    'La lettura delle risorse della competenza richiede la chat corrente',
  ],
  此技能需要用户在当前回合显式调用: [
    'This skill must be explicitly invoked in the current turn',
    'Questa competenza deve essere richiamata esplicitamente nel turno corrente',
  ],
  技能不可用: ['Skill unavailable', 'Competenza non disponibile'],
  '此资源为二进制文件，请在技能页下载查看': [
    'This resource is a binary file. Download it from the Skills page.',
    'Questa risorsa è un file binario. Scaricala dalla pagina Competenze.',
  ],
  '资源超过 128 KB，请拆分后再导入': [
    'Resource exceeds 128 KB. Split it before importing.',
    'La risorsa supera 128 KB. Suddividila prima dell’importazione.',
  ],
  只允许管理模型凭据: [
    'Only model credentials can be managed here',
    'Qui è possibile gestire solo le credenziali dei modelli',
  ],
  'API Key 格式无效，请粘贴完整密钥': [
    'Invalid API key. Paste the complete key.',
    'Chiave API non valida. Incolla la chiave completa.',
  ],
  '技能包不合法：最多 128 个文件，来源不超过 200 字': [
    'Invalid skill package: at most 128 files and 200 characters for the source.',
    'Pacchetto della competenza non valido: massimo 128 file e 200 caratteri per l’origine.',
  ],
  技能文件路径不合法: ['Invalid skill file path', 'Percorso del file della competenza non valido'],
  技能文件路径与目录冲突: [
    'A skill file path conflicts with a directory',
    'Il percorso di un file della competenza è in conflitto con una cartella',
  ],
  技能包包含重名文件: [
    'Skill package contains duplicate file names',
    'Il pacchetto della competenza contiene nomi di file duplicati',
  ],
  技能文件编码不合法: [
    'Invalid skill file encoding',
    'Codifica del file della competenza non valida',
  ],
  '技能包不能超过 2 MB': [
    'Skill package cannot exceed 2 MB',
    'Il pacchetto della competenza non può superare 2 MB',
  ],
  '技能包根目录需要 SKILL.md': [
    'The skill package root must contain SKILL.md',
    'La cartella principale del pacchetto deve contenere SKILL.md',
  ],
  'SKILL.md 需要 YAML 头部和 UTF-8 正文': [
    'SKILL.md requires a YAML header and UTF-8 body',
    'SKILL.md richiede un’intestazione YAML e un contenuto UTF-8',
  ],
  'SKILL.md 头部不是合法 YAML': [
    'SKILL.md header is not valid YAML',
    'L’intestazione di SKILL.md non è YAML valido',
  ],
  '请检查技能 name、description 和调用开关': [
    'Check the skill name, description and invocation settings',
    'Controlla nome, descrizione e impostazioni di invocazione della competenza',
  ],
  'SKILL.md 正文不能为空': [
    'SKILL.md content cannot be empty',
    'Il contenuto di SKILL.md non può essere vuoto',
  ],
  'tianzhiai.manifest.json 的 requiredTools 必须为工具名数组': [
    'requiredTools in tianzhiai.manifest.json must be an array of tool names',
    'requiredTools in tianzhiai.manifest.json deve essere un elenco di nomi di strumenti',
  ],
  'tuai.manifest.json 的 requiredTools 必须为工具名数组': [
    'requiredTools in tuai.manifest.json must be an array of tool names',
    'requiredTools in tuai.manifest.json deve essere un elenco di nomi di strumenti',
  ],
  技能包不能同时包含新旧清单: [
    'A skill package cannot contain both old and new manifests',
    'Un pacchetto di competenze non può contenere sia il manifest precedente sia quello nuovo',
  ],
  '技能数据库版本较新，请使用兼容程序': [
    'The skill database was created by a newer version. Use a compatible version.',
    'Il database delle competenze è stato creato da una versione più recente. Usa una versione compatibile.',
  ],
  技能不存在: ['Skill does not exist', 'La competenza non esiste'],
  '技能已更新，请刷新后重试': [
    'Skill was updated. Refresh and try again.',
    'La competenza è stata aggiornata. Aggiorna e riprova.',
  ],
  技能版本不存在: ['Skill version does not exist', 'La versione della competenza non esiste'],
  '同名技能已存在，请在详情中创建新版本': [
    'A skill with this name already exists. Create a new version in its details.',
    'Esiste già una competenza con questo nome. Crea una nuova versione nei dettagli.',
  ],
  '新版本必须保留技能名称；更名请导入为新技能': [
    'The new version must keep the skill name. Import it as a new skill to rename it.',
    'La nuova versione deve mantenere il nome della competenza. Per rinominarla, importala come nuova competenza.',
  ],
  此内容版本已经存在: [
    'This content version already exists',
    'Questa versione del contenuto esiste già',
  ],
  请先通过结构及依赖检查: [
    'First pass the structure and dependency checks',
    'Completa prima i controlli della struttura e delle dipendenze',
  ],
  技能文件不存在: ['Skill file does not exist', 'Il file della competenza non esiste'],
  文件登记需要会话和文件路径: [
    'A chat and file path are required to register a file',
    'Per registrare un file sono necessari una chat e il percorso del file',
  ],
  文件必须位于当前会话工作区: [
    'The file must be in the current chat workspace',
    'Il file deve trovarsi nell’area di lavoro della chat corrente',
  ],
  仅支持登记文档和图片: [
    'Only documents and images can be registered',
    'È possibile registrare solo documenti e immagini',
  ],
  文件不存在或不是普通文件: [
    'File does not exist or is not a regular file',
    'Il file non esiste o non è un file normale',
  ],
  输入不能为空: ['Input cannot be empty', 'Il messaggio non può essere vuoto'],
  '单回合已达到 32 步上限；请检查执行记录后继续': [
    'This turn reached the 32-step limit. Check the execution record before continuing.',
    'Questo turno ha raggiunto il limite di 32 passaggi. Controlla il registro prima di continuare.',
  ],
  'Host 会话服务尚未就绪，请检查认证与连接': [
    'Host chat service is not ready. Check authentication and connection.',
    'Il servizio chat dell’Host non è pronto. Controlla autenticazione e connessione.',
  ],
  'Host 连接超时': ['Host connection timed out', 'Connessione all’Host scaduta'],
  'Host 身份尚未就绪': ['Host identity is not ready', 'Identità dell’Host non ancora disponibile'],
  'Host 协议版本不兼容，请更新后重新连接': [
    'Incompatible Host protocol version. Update and reconnect.',
    'Versione del protocollo Host incompatibile. Aggiorna e riconnettiti.',
  ],
  '操作未完成，请重试': [
    'Operation did not complete. Try again.',
    'Operazione non completata. Riprova.',
  ],
}

export function localizeHostError(message: string, language: ProductLanguage): string {
  if (language === 'zh') return message
  const index = language === 'en' ? 0 : 1
  const direct = messages[message]?.[index]
  if (direct) return direct
  const hostPath =
    /^(Home|TUAI_HOME|TIANZHIAI_HOME|APPDATA|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_STATE_HOME|XDG_CACHE_HOME) 必须是 Host 的绝对路径$/.exec(
      message,
    )
  if (hostPath)
    return language === 'en'
      ? `${hostPath[1]} must be an absolute path on the Host`
      : `${hostPath[1]} deve essere un percorso assoluto sull’Host`
  // unwrap() preserves the remote error code alongside its message.
  const prefixed = /^([^：:\n]+)(?:：|: )(.+)$/.exec(message)
  if (prefixed) {
    const translated = localizeHostError(prefixed[2]!, language)
    if (translated !== prefixed[2]) {
      const prefix =
        prefixed[1] === 'session create failed'
          ? language === 'en'
            ? 'Chat creation failed'
            : 'Creazione della chat non riuscita'
          : prefixed[1]
      return `${prefix}: ${translated}`
    }
  }
  const recovery = /^文件删除未完成；文件保留在 ([\s\S]+)，请手动恢复$/.exec(message)
  if (recovery)
    return language === 'en'
      ? `Deletion did not complete; the file remains at ${recovery[1]}. Restore it manually.`
      : `Eliminazione non completata; il file si trova in ${recovery[1]}. Ripristinalo manualmente.`
  return message
}
