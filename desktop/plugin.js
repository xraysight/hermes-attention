import * as sdk from '@hermes/plugin-sdk'
import { useEffect, useState, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

/** Hermes Attention. No approval RPCs, no transcript or credential access. */
export const TRANSLATIONS = {
  en: {
    languageCode:'en',defaultPhrase:'Hermes is waiting for your decision. Please return to your computer.',
    pageTitle:'Hermes Attention — decision alarm',intro:'Repeating alerts for pending approvals and questions. Never approves actions on your behalf.',
    enabled:'Enable sound alerts',approval:'Action approvals',clarify:'Questions and choices',modeLabel:'Alert mode',modeTone:'Sound signal',modeFile:'Custom audio file',modeTTS:'Spoken message (TTS)',modeBoth:'Sound signal + TTS',
    presetLabel:'Sound preset',presetCall:'Call',presetDing:'Ding',presetUrgent:'Urgent',volume:n=>`Volume: ${n}%`,volumeHelp:'System and device volume settings still apply.',repeatSeconds:'Repeat every (seconds)',maxMinutes:'Maximum alert duration (minutes)',
    fileLabel:'Custom recording',chooseFile:'Choose MP3 / WAV',noFile:'No file selected',fileHelp:'Up to 16 MiB. A local copy is retained by the plugin, including after restart.',
    textLabel:'TTS message',textHelp:'Only the text entered here is sent to the TTS provider. Generating speech may require internet access or incur a charge. Changing the interface language never translates or replaces your text.',
    generating:'Generating…',generate:'Generate TTS',recordingReady:'Recording ready — local playback.',recordingMissing:'No recording for the current text and TTS language.',test:'Test',stop:'Stop sound',
    pending:n=>`Pending decisions: ${n}`,none:'No pending requests detected by the plugin.',kindApproval:'Approval',kindClarify:'Question',muted:'muted',muteRequest:'Mute this request',muteAll:'Mute all current requests',
    behaviorHelp:'Alerts stop after a response, cancellation or confirmed expiry. Opening Hermes does not mute them. A closed app, sleeping computer or muted speakers cannot play alerts. A fallback signal is attempted if file/TTS playback fails.',version:v=>`Hermes Attention ${v}`,
    bellHint:(state,count)=>`Alarm: ${state} · Pending decisions: ${count}
Left click: on/off · Right click: settings`,statusLabel:'Alarm',statusOn:'on',statusOff:'off',
    ttsLanguage:'TTS language',langAuto:'Automatic — Hermes provider settings',languageHelp:'Automatic keeps your configured Hermes TTS provider. Selecting a language uses a dedicated Edge TTS voice for that language, without changing global settings. It needs internet access and does not translate the text.',
    missingRecording:'No recording. Choose a file or generate TTS, then click Test.',unplayable:'Cannot play this audio file.',blockedAudio:detail=>`Playback was blocked. Click Test in the alarm settings. ${detail || ''}`,missingWebAudio:'Web Audio is unavailable.',unlockAudio:'Click Test to allow alarm playback.',storageInterrupted:'Audio storage was interrupted.',noRoute:'No active route for this session.',changedSpeech:'The text or TTS language has changed. Generate a new recording.',missingLocks:'This build does not provide cross-window Web Locks. Sound alerts require navigator.locks.',
    testing:'Playing test…',testComplete:'Test finished. If you heard the sound, the alarm is ready.',stopped:'Sound stopped.',invalidFile:'Choose MP3, WAV, OGG or M4A.',fileTooLarge:'The file must not exceed 16 MiB.',fileSaved:'Audio saved locally. Click Test.',textRequired:'Enter a message first.',generatingNote:'Generating a recording using the selected TTS settings…',emptySynthesis:'TTS did not return an audio recording.',generated:'Recording saved. Repeating alerts will not call the TTS service again.',
    generateFailed:detail=>`Could not generate TTS: ${detail}. Check the hermes-attention backend and your TTS configuration.`,pollFailed:detail=>`Cannot check pending decisions: ${detail}`,unexpectedError:detail=>String(detail || 'Unknown error'),needsLanguageBackend:'The running backend does not support TTS language selection yet. Restart Hermes/gateway after your current tasks finish, then try again.',speechName:'TTS recording',defaultSpeechName:'Default TTS recording'
  },
  pl: {
    languageCode:'pl',defaultPhrase:'Hermes czeka na Twoją decyzję. Wróć do komputera.',
    pageTitle:'Hermes Attention — alarm decyzji',intro:'Powtarzany alarm przy oczekującej zgodzie lub pytaniu. Nigdy nie zatwierdza działań za Ciebie.',
    enabled:'Włącz alarm dźwiękowy',approval:'Zgody na działania',clarify:'Pytania i wybór opcji',modeLabel:'Rodzaj alarmu',modeTone:'Sygnał dźwiękowy',modeFile:'Własny plik audio',modeTTS:'Komunikat TTS',modeBoth:'Sygnał + komunikat TTS',
    presetLabel:'Predefiniowany sygnał',presetCall:'Przywołanie',presetDing:'Ding',presetUrgent:'Pilny',volume:n=>`Głośność: ${n}%`,volumeHelp:'Głośność jest ograniczona także ustawieniami systemu i urządzenia.',repeatSeconds:'Powtarzaj co (sekundy)',maxMinutes:'Maks. czas alarmowania (minuty)',
    fileLabel:'Własne nagranie',chooseFile:'Wybierz MP3 / WAV',noFile:'Nie wybrano pliku',fileHelp:'Do 16 MiB. Kopia pliku pozostaje lokalnie w pamięci wtyczki, także po restarcie.',
    textLabel:'Tekst komunikatu TTS',textHelp:'Do dostawcy TTS wysyłany jest tylko wpisany tutaj tekst. Generowanie może wymagać internetu lub opłaty. Zmiana języka interfejsu nigdy nie tłumaczy ani nie zastępuje Twojego tekstu.',
    generating:'Generowanie…',generate:'Wygeneruj TTS',recordingReady:'Nagranie gotowe — odtwarzanie lokalne.',recordingMissing:'Brak nagrania dla aktualnego tekstu i języka TTS.',test:'Testuj',stop:'Zatrzymaj dźwięk',
    pending:n=>`Oczekujące decyzje: ${n}`,none:'Brak oczekujących próśb wykrytych przez wtyczkę.',kindApproval:'Zgoda',kindClarify:'Pytanie',muted:'wyciszone',muteRequest:'Wycisz tę prośbę',muteAll:'Wycisz wszystkie obecne prośby',
    behaviorHelp:'Alarm zatrzymuje się po odpowiedzi, anulowaniu lub potwierdzonym wygaśnięciu prośby. Otwarcie okna samo go nie wycisza. Zamknięta aplikacja, uśpiony komputer lub wyciszone głośniki nie odtworzą alarmu. Jeśli plik/TTS zawiedzie, alarm próbuje użyć sygnału zastępczego.',version:v=>`Hermes Attention ${v}`,
    bellHint:(state,count)=>`Alarm: ${state} · Oczekujące decyzje: ${count}
Lewy klik: włącz/wyłącz · Prawy klik: ustawienia`,statusLabel:'Alarm',statusOn:'włączony',statusOff:'wyłączony',
    ttsLanguage:'Język TTS',langAuto:'Automatycznie — ustawienia dostawcy Hermesa',languageHelp:'Tryb automatyczny zachowuje dostawcę TTS ustawionego w Hermesie. Wybór języka używa odpowiedniego głosu Edge TTS, bez zmieniania ustawień globalnych. Wymaga internetu i nie tłumaczy tekstu.',
    missingRecording:'Brak nagrania. Wybierz plik lub wygeneruj TTS, a potem użyj „Testuj”.',unplayable:'Nie można odtworzyć pliku dźwiękowego.',blockedAudio:detail=>`Odtwarzanie zablokowane. Kliknij „Testuj” w ustawieniach alarmu. ${detail || ''}`,missingWebAudio:'Web Audio nie jest dostępne.',unlockAudio:'Kliknij „Testuj”, aby zezwolić na odtwarzanie alarmu.',storageInterrupted:'Zapis dźwięku przerwany.',noRoute:'Brak aktywnej trasy dla sesji.',changedSpeech:'Tekst lub język TTS został zmieniony. Wygeneruj nowe nagranie.',missingLocks:'Ta wersja nie udostępnia blokady wielu okien. Alarm dźwiękowy wymaga navigator.locks.',
    testing:'Odtwarzanie testu…',testComplete:'Test zakończony. Jeśli było słychać dźwięk, alarm jest gotowy.',stopped:'Dźwięk zatrzymany.',invalidFile:'Wybierz MP3, WAV, OGG lub M4A.',fileTooLarge:'Plik może mieć maksymalnie 16 MiB.',fileSaved:'Plik zapisany lokalnie. Użyj „Testuj”.',textRequired:'Wpisz tekst komunikatu.',generatingNote:'Generowanie nagrania z wybranymi ustawieniami TTS…',emptySynthesis:'TTS nie zwrócił nagrania audio.',generated:'Nagranie zapisane. Powtórzenia nie wywołują ponownie usługi TTS.',
    generateFailed:detail=>`Nie udało się wygenerować TTS: ${detail}. Sprawdź backend hermes-attention i konfigurację TTS.`,pollFailed:detail=>`Nie można sprawdzić oczekujących decyzji: ${detail}`,unexpectedError:detail=>String(detail || 'Nieznany błąd'),needsLanguageBackend:'Uruchomiony backend nie obsługuje jeszcze wyboru języka TTS. Po zakończeniu bieżących zadań uruchom ponownie Hermesa/gateway, a następnie spróbuj ponownie.',speechName:'Komunikat TTS',defaultSpeechName:'Domyślny komunikat TTS'
  }
}
export function translate(locale,key,...args){const bundle=TRANSLATIONS[String(locale).toLowerCase().split('-')[0]] || TRANSLATIONS.en;const value=bundle[key] ?? TRANSLATIONS.en[key] ?? key;return typeof value==='function'?value(...args):value}
function message(key,...args){return {key,args}}
function renderMessage(t,value){return value&&typeof value==='object'&&value.key?t(value.key,...(value.args || [])):String(value || '')}
class AttentionError extends Error {constructor(code,detail=''){super(code);this.code=code;this.detail=detail}}
const TTS_LANGUAGES=[['auto',''],['pl-PL','Polski'],['en-US','English (US)'],['en-GB','English (UK)'],['de-DE','Deutsch'],['fr-FR','Français'],['es-ES','Español'],['it-IT','Italiano'],['pt-BR','Português (Brasil)'],['uk-UA','Українська'],['ja-JP','日本語']]
const DEFAULTS = {enabled:true,approval:true,clarify:true,mode:'tone',preset:'call',volume:70,repeatSeconds:20,maxMinutes:10,text:TRANSLATIONS.en.defaultPhrase,ttsLanguage:'auto'}
export function normaliseSettings(raw = {},defaults = {}) {
  raw = raw && typeof raw==='object' ? raw : {}
  const n = (key,min,max) => raw[key]!==null && raw[key]!=='' && Number.isFinite(Number(raw[key])) ? Math.min(max,Math.max(min,Number(raw[key]))) : DEFAULTS[key]
  return {...DEFAULTS,...Object.fromEntries(['enabled','approval','clarify'].map(k=>[k,typeof raw[k]==='boolean'?raw[k]:DEFAULTS[k]])),
    mode:['tone','file','tts','both'].includes(raw.mode)?raw.mode:'tone',preset:raw.preset==='bell'?'ding':['ding','call','urgent'].includes(raw.preset)?raw.preset:'call',
    volume:n('volume',0,100),repeatSeconds:n('repeatSeconds',5,300),maxMinutes:n('maxMinutes',1,60),
    text:typeof raw.text==='string'?raw.text.slice(0,500):(defaults.text || DEFAULTS.text),ttsLanguage:TTS_LANGUAGES.some(([code])=>code===raw.ttsLanguage)?raw.ttsLanguage:'auto'}
}
export function synthesisRequest(settings){const s=normaliseSettings(settings);return s.ttsLanguage==='auto'?{text:s.text.trim()}:{text:s.text.trim(),language:s.ttsLanguage}}
export function speechMatches(data,settings){return !!data&&data.text===settings.text.trim()&&((data.language || 'auto')===(settings.ttsLanguage || 'auto') || (data.bundled===true&&settings.ttsLanguage==='auto'))}
function bundledSpeech(settings){return (Array.isArray(BUNDLED_SPEECH)?BUNDLED_SPEECH:[BUNDLED_SPEECH]).find(data=>speechMatches(data,settings))}
export class AlarmQueue {
  constructor(settings = {}) { this.items = new Map(); this.generations=new Map();this.epochs=new Map();this.settings = normaliseSettings(settings) }
  scope(e){return JSON.stringify([e.connectionId || 'local',e.profile || 'default',e.session_id || ''])}
  key(e, id) { return JSON.stringify([e.connectionId || 'local', e.profile || 'default', e.session_id || '', id]) }
  acceptEpoch(scope,epoch){
    if(!Number.isFinite(epoch))return true
    const previous=this.epochs.get(scope)
    if(previous!==undefined&&epoch<previous)return false
    if(previous!==undefined&&epoch>previous){for(const [key,p] of this.items)if(p.scope===scope)this.items.delete(key);this.generations.delete(scope)}
    this.epochs.set(scope,epoch);return true
  }
  handle(e, now = Date.now()) {
    if(!this.acceptEpoch(this.scope(e),e.authority_epoch))return
    const p = e.payload || {}, id = p.prompt_id || p.request_id || p.id
    if (typeof id!=='string' || typeof e.session_id!=='string' || !e.session_id) return
    const key = this.key(e, id),scope=this.scope(e),generation=p.execution_generation ?? e.execution_generation
    if(Number.isFinite(generation)) {
      if(generation < (this.generations.get(scope) ?? -1))return
      this.generations.set(scope,generation)
    }
    if (e.type === 'approval.settled' || e.type === 'clarify.settled' || e.type === 'request.cancel') this.items.delete(key)
    if (e.type === 'approval.request' || e.type === 'clarify.request') {
      const requested = p.timeout_s ?? p.timeout ?? p.timeout_seconds
      const timeout = requested===undefined ? Infinity : Number.isFinite(Number(requested)) ? Math.min(86400,Math.max(1,Number(requested))) : 300
      if (!this.items.has(key)) this.items.set(key, {key,scope,id, sessionId:e.session_id, profile:e.profile || 'default', connectionId:e.connectionId || 'local', kind:e.type.split('.')[0], created:now, next:now+1500,expires:now+timeout*1000})
    }
  }
  reconcile(scope,snapshot,now=Date.now()) {
    if(!Array.isArray(snapshot.prompts)&&!Array.isArray(snapshot.open_requests))return false
    const scopeKey=this.scope(scope),generation=snapshot.execution_generation
    if(!this.acceptEpoch(scopeKey,snapshot.authority_epoch))return false
    if(Number.isFinite(generation)&&generation<(this.generations.get(scopeKey)??-1))return false
    const wanted=new Set()
    for(const p of snapshot.prompts || []) {
      if(!['approval','clarify'].includes(p.kind))continue
      this.handle({...scope,type:p.kind+'.request',payload:p},now);if(p.prompt_id)wanted.add(this.key(scope,p.prompt_id))
    }
    for(const r of snapshot.open_requests || []) {
      if(!['approval','clarify'].includes(r.method))continue
      const p=r.params || {},id=p.prompt_id || p.request_id || r.id
      this.handle({...scope,type:r.method+'.request',payload:{...p,prompt_id:id,execution_generation:generation}},now);if(id)wanted.add(this.key(scope,id))
    }
    for(const [key,p] of this.items)if(p.scope===scopeKey){if(!wanted.has(key))this.items.delete(key);else{p.confirmedAt=now;p.suspended=false}}
    if(Number.isFinite(generation))this.generations.set(scopeKey,generation)
    return true
  }
  rows() { return [...this.items.values()] }
  due(now = Date.now()) { return this.rows().filter(p => this.settings.enabled && this.settings[p.kind] && !p.muted && !p.suspended && (now<p.expires || p.confirmedAt>=p.expires) && now >= p.next && now-p.created < this.settings.maxMinutes*60000) }
  mark(keys,now) { for(const key of keys) { const p=this.items.get(key); if(p) p.next=now+this.settings.repeatSeconds*1000 } }
  mute(key) { const p=this.items.get(key); if(p) p.muted=true }
}

export function renderTone(preset,sampleRate,volume=70){
  const duration=preset==='call'?3.45:preset==='urgent'?2.52:2.6,data=new Float32Array(Math.ceil(sampleRate*duration)),gain=normaliseSettings({volume}).volume/100
  const rings=[[0,.42],[.63,1.05],[2.15,2.57],[2.78,3.2]]
  // Inharmonic bell modes decay at different rates after one short strike.
  const partials=[[880,1,.62],[2425,.34,.32],[4755,.15,.18],[7861,.06,.1]].filter(([hz])=>hz<sampleRate*.45)
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate,attack=Math.min(1,t/.003),tail=Math.min(1,(duration-t)/.04)
    if(preset==='call'){
      const ring=rings.find(([start,end])=>t>=start&&t<end);if(!ring)continue
      const elapsed=t-ring[0],envelope=Math.min(1,elapsed/.012,(ring[1]-t)/.028)
      const phase=2*Math.PI*t,wave=(Math.sin(440*phase)+Math.sin(480*phase)+.18*Math.sin(880*phase)+.18*Math.sin(960*phase))/2.36
      data[i]=.64*wave*envelope*(.82+.18*Math.cos(2*Math.PI*22*elapsed))*gain;continue
    }
    if(preset==='urgent'){
      const pulse=Math.floor(t/.28),elapsed=t-pulse*.28;if(elapsed>=.19)continue
      const hz=pulse%2?1200:800,phase=2*Math.PI*hz*elapsed,envelope=Math.min(1,elapsed/.008,(.19-elapsed)/.012)
      data[i]=.56*(Math.sin(phase)+.23*Math.sin(3*phase))/1.23*envelope*gain;continue
    }
    let value=0;for(const [hz,level,decay] of partials)value+=level*Math.exp(-t/decay)*Math.sin(2*Math.PI*hz*t)
    data[i]=value*.42*attack*tail*gain
  }
  data[0]=0;data[data.length-1]=0;return data
}
export class SoundPlayer {
  constructor(env = globalThis) { this.env=env; this.generation=0; this.cancel=null; this.context=null }
  stop() { this.generation++; this.cancel?.(); this.cancel=null }
  async play(settings, getAudio) {
    this.stop(); const token=this.generation
    if(settings.mode==='tone' || settings.mode==='both') {
      await this.tone(settings,token)
      if(token!==this.generation) return
    }
    if(settings.mode==='tone') return
    const data=await getAudio(settings.mode==='file'?'file':'speech')
    if(token!==this.generation) return
    if(!data?.url?.startsWith('data:audio/')) throw new AttentionError('missingRecording')
    await new Promise((resolve,reject)=>{
      const audio=new this.env.Audio(data.url); audio.volume=settings.volume/100
      let timer
      const finish=(error)=>{ this.env.clearTimeout(timer); audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load(); if(this.cancel===cancel)this.cancel=null; error?reject(error):resolve() }
      const cancel=()=>finish();this.cancel=cancel
      audio.onended=()=>finish();audio.onerror=()=>finish(new AttentionError('unplayable'))
      timer=this.env.setTimeout(()=>finish(),15000)
      audio.play().catch(e=>finish(new AttentionError('blockedAudio',e.message)))
    })
  }
  async tone(settings,token) {
    const Context=this.env.AudioContext || this.env.webkitAudioContext
    if(!Context) throw new AttentionError('missingWebAudio')
    this.context ||= new Context()
    await this.context.resume()
    if(token!==this.generation) return
    if(this.context.state==='suspended') throw new AttentionError('unlockAudio')
    const ctx=this.context,samples=renderTone(settings.preset,ctx.sampleRate,settings.volume),buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate)
    buffer.getChannelData(0).set(samples)
    await new Promise(resolve=>{
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination)
      const finish=()=>{source.onended=null;try{source.stop()}catch{}source.disconnect();if(this.cancel===cancel)this.cancel=null;resolve()}
      const cancel=()=>finish();this.cancel=cancel;source.onended=finish;source.start()
    })
  }
  dispose() { this.stop(); if(this.context) this.context.close().catch(()=>{});this.context=null }
}

const ID='hermes-attention', VERSION='1.4.3', ROUTE='/hermes-attention'
const BUNDLED_SPEECH = [] /* Public builds do not distribute personal or provider-generated recordings. */
function audioRecord(key,value) {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(ID,1)
    open.onupgradeneeded=()=>open.result.createObjectStore('audio')
    open.onerror=()=>reject(open.error)
    open.onsuccess=()=>{
      const db=open.result,tx=db.transaction('audio',value===undefined?'readonly':'readwrite'),store=tx.objectStore('audio')
      const request=value===undefined?store.get(key):store.put(value,key)
      let result;request.onsuccess=()=>{result=request.result}
      tx.oncomplete=()=>{db.close();resolve(value===undefined?result:value)}
      tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error || new AttentionError('storageInterrupted'))}
    }
  })
}

export class AttentionRuntime {
  constructor(ctx) {
    this.ctx=ctx;this.settings=this.readSettings();this.queue=new AlarmQueue(this.settings)
    this.player=new SoundPlayer();this.listeners=new Set();this.error='';this.note='';this.generating=false;this.disposed=false;this.playing=false;this.activeKeys=[];this.media={};this.cache={}
    this.channel=typeof BroadcastChannel==='function'?new BroadcastChannel(ID):null
    if(this.channel) this.channel.onmessage=({data})=>{
      if(data?.type==='mute') {for(const key of data.keys || [])this.queue.mute(key);this.player.stop()}
      if(data?.type==='settings') {this.settings=this.readSettings();this.queue.settings=this.settings;this.cache={};this.player.stop();this.refreshMedia()}
      this.publish()
    }
    this.scopes=new Map();this.routes=[];this.polling=false;this.lastInventory=0
    ctx.onEvent('*',e=>{
      if(e.session_id){const scope=this.track(e),event={...e,connectionId:scope.connectionId,profile:scope.profile};if(/^(approval|clarify)\.(request|settled)$|^request.cancel$/.test(e.type)) {if(scope.buffer)scope.buffer.push(event);this.queue.handle(event)}if(e.type==='session.replay_gap')scope.verified=0}
      this.stopIfSettled();this.publish()
    })
    ctx.setInterval(()=>{this.stopIfSettled();this.publish();void this.tick()},1000)
    ctx.setInterval(()=>void this.poll(),5000)
    if(ctx.setTimeout)ctx.setTimeout(()=>void this.poll(),100)
    ctx.onDispose(()=>{this.disposed=true;this.cancelAutoGenerate();this.player.dispose();this.channel?.close();this.listeners.clear()})
    if(typeof indexedDB!=='undefined') void this.refreshMedia()
  }
  t(key,...args){return this.ctx.i18n?.t?this.ctx.i18n.t(key,...args):translate('en',key,...args)}
  readSettings(){return normaliseSettings(this.ctx.storage.get('settings',null),{text:this.t('defaultPhrase')})}
  track(e){
    const scope={connectionId:e.connectionId || sdk.host.state?.connectionId?.get() || 'local',profile:e.profile || sdk.host.state?.profile?.get() || 'default',session_id:e.session_id}
    const key=this.queue.scope(scope);let record=this.scopes.get(key)
    if(!record){record={...scope,touched:Date.now(),verified:Date.now()};this.scopes.set(key,record)}else record.touched=Date.now()
    return record
  }
  async rpc(scope,method,params){
    const route=this.routes.find(r=>r.connectionId===scope.connectionId&&r.profile===scope.profile)
    const query=()=>route&&sdk.host.requestProfile?sdk.host.requestProfile(route,method,{...params,profile:scope.profile},12000):scope.connectionId===(sdk.host.state?.connectionId?.get()||'local')&&scope.profile===(sdk.host.state?.profile?.get()||'default')&&sdk.host.request?sdk.host.request(method,{...params,profile:scope.profile}):Promise.reject(new AttentionError('noRoute'))
    if(sdk.queryClient?.fetchQuery)return sdk.queryClient.fetchQuery({queryKey:[ID,scope.connectionId,scope.profile,method,params.session_id || 'live'],queryFn:query,staleTime:0,retry:false})
    return query()
  }
  async poll(){
    if(this.disposed||this.polling||(!sdk.host.request&&!sdk.host.requestProfile))return
    this.polling=true
    try{
      if(Date.now()-this.lastInventory>30000){
        if(sdk.host.profileRoutes)this.routes=await sdk.host.profileRoutes()
        const current={connectionId:sdk.host.state?.connectionId?.get() || 'local',profile:sdk.host.state?.profile?.get() || 'default'}
        const result=await this.rpc(current,'session.active_list',{})
        for(const row of result.sessions || [])if(row.running || ['starting','waiting','working','streaming','resuming'].includes(row.status))this.track({...current,session_id:row.session_id || row.id})
        this.lastInventory=Date.now()
      }
      for(const [key,scope] of [...this.scopes]){
        if(this.disposed)break
        if(Date.now()-scope.touched>600000&&!this.queue.rows().some(p=>p.scope===key)){this.scopes.delete(key);continue}
        scope.buffer=[]
        try{
          const snapshot=await this.rpc(scope,'session.resume',{session_id:scope.session_id,omit_messages:true})
          if(this.disposed)return
          this.queue.reconcile(scope,snapshot)
          for(const event of scope.buffer)if(!Number.isFinite(event.seq)||event.replay_epoch!==snapshot.replay_epoch||event.seq>snapshot.last_sequence)this.queue.handle(event)
          scope.verified=Date.now()
          if(snapshot.running===false&&!this.queue.rows().some(p=>p.scope===key))this.scopes.delete(key)
        }catch{scope.verified=0}
        finally{scope.buffer=null}
        for(const p of this.queue.rows())if(p.scope===key)p.suspended=!scope.verified
      }
      if(this.error?.key==='pollFailed' || (typeof this.error==='string'&&this.error.startsWith('Nie można sprawdzić oczekujących decyzji: ')))this.error=''
    }catch(e){this.error=message('pollFailed',this.errorText(e));for(const scope of this.scopes.values())scope.verified=0}
    finally{
      this.polling=false;this.stopIfSettled();this.publish()
      const health='scopes='+this.scopes.size+' verified='+[...this.scopes.values()].filter(s=>s.verified).length+' pending='+this.queue.rows().length+' inventory='+(this.lastInventory?'ok':'unavailable')
      if(health!==this.lastHealth){this.lastHealth=health;try{Promise.resolve(globalThis.hermesDesktop?.logLine?.('[hermes-attention] '+health)).catch(()=>{})}catch{}}
    }
  }
  publish(){for(const fn of this.listeners)fn()}
  errorText(e){return e instanceof Error?e.message:String(e)}
  errorMessage(e,fallback='unexpectedError'){return e?.code&&TRANSLATIONS.en[e.code]?message(e.code,e.detail):message(fallback,this.errorText(e))}
  speechKey(){return JSON.stringify([this.settings.text.trim(),this.settings.ttsLanguage])}
  cancelAutoGenerate(){clearTimeout(this.autoTimer);this.autoTimer=null;this.autoRequested=null}
  requestAutoGenerate(){
    this.cancelAutoGenerate()
    if(this.disposed||!this.settings.text.trim())return
    this.autoRequested=this.speechKey()
    this.autoTimer=setTimeout(()=>{this.autoTimer=null;this.flushAutoGenerate()},450)
  }
  flushAutoGenerate(){
    if(this.generating)return
    const key=this.autoRequested;this.autoRequested=null
    if(!key||this.disposed||key!==this.speechKey())return
    void this.generate({automatic:true})
  }
  update(patch){if(patch.text!==undefined||patch.ttsLanguage!==undefined)this.cancelAutoGenerate();this.settings=normaliseSettings({...this.settings,...patch});this.queue.settings=this.settings;this.ctx.storage.set('settings',this.settings);this.player.stop();if(patch.ttsLanguage!==undefined||patch.text!==undefined)void this.refreshMedia();this.channel?.postMessage({type:'settings'});this.publish()}
  async refreshMedia(){try{for(const kind of ['file','speech']){let data=await audioRecord(kind);if(kind==='speech'&&!speechMatches(data,this.settings))data=bundledSpeech(this.settings) || data;if(this.disposed)return;this.media[kind]=data?{name:data.name,text:data.text,language:data.language,bundled:data.bundled}:null}this.publish()}catch(e){this.error=this.errorMessage(e);this.publish()}}
  async getAudio(kind){
    let data=this.cache[kind] ||= await audioRecord(kind)
    if(kind==='speech'&&!speechMatches(data,this.settings))data=bundledSpeech(this.settings)
    if(kind==='speech'&&!speechMatches(data,this.settings))throw new AttentionError('changedSpeech')
    return data
  }
  stopIfSettled(){
    this.syncMuteState()
    const now=Date.now(),rows=this.queue.rows(now)
    for(const p of rows){const scope=this.scopes.get(p.scope);if(scope&&now-scope.verified>15000)p.suspended=true}
    if(this.activeKeys.length && (!this.settings.enabled || !rows.some(p=>this.activeKeys.includes(p.key)&&!p.muted&&!p.suspended&&this.settings[p.kind]&&now-p.created<this.settings.maxMinutes*60000)))this.player.stop()
  }
  async tick(){
    if(this.disposed||this.playing)return
    this.syncMuteState()
    const due=this.queue.due();if(!due.length)return
    this.playing=true
    const run=async lock=>{
      if(!lock || this.disposed)return
      const now=Date.now();let recent={}
      try{recent=JSON.parse(localStorage.getItem(ID+'.rings')||'{}')}catch{}
      const keys=this.queue.due(now).filter(p=>now-(Number(recent[p.key])||0)>=this.settings.repeatSeconds*1000).map(p=>p.key)
      this.queue.mark(due.map(p=>p.key),now)
      if(!keys.length)return
      recent=Object.fromEntries(Object.entries(recent).filter(([,t])=>now-t<3600000))
      for(const key of keys)recent[key]=now
      try{localStorage.setItem(ID+'.rings',JSON.stringify(recent))}catch{}
      this.activeKeys=keys
      try{await this.player.play(this.settings,k=>this.getAudio(k))}
      catch(e){this.error=this.errorMessage(e);this.publish();if(!this.disposed&&this.queue.due(now).length===0&&this.queue.rows().some(p=>keys.includes(p.key)&&!p.muted))await this.player.play({...this.settings,mode:'tone'},()=>null).catch(()=>{})}
      finally{this.activeKeys=[]}
    }
    try {
      if(globalThis.navigator?.locks)await navigator.locks.request(ID+'.sound',{ifAvailable:true},run)
      else {this.error=message('missingLocks');this.publish()}
    }catch(e){this.error=this.errorMessage(e);this.publish()}finally{this.playing=false}
  }
  syncMuteState(keys){
    let muted={}
    try{const saved=JSON.parse(globalThis.localStorage?.getItem(ID+'.quiet') || '{}');if(saved&&typeof saved==='object')muted=saved.muted || {}}catch{}
    const now=Date.now();muted=Object.fromEntries(Object.entries(muted).filter(([,time])=>Number.isFinite(time)&&time>now))
    if(keys){for(const key of keys)muted[key]=now+3600000;try{globalThis.localStorage?.setItem(ID+'.quiet',JSON.stringify({muted}))}catch{}}
    for(const p of this.queue.rows())if(muted[p.key])this.queue.mute(p.key)
  }
  mute(key){const keys=key?[key]:this.queue.rows().map(p=>p.key);for(const k of keys)this.queue.mute(k);this.syncMuteState(keys);this.player.stop();this.channel?.postMessage({type:'mute',keys});this.publish()}
  async test(){this.error='';this.note=message('testing');this.publish();try{await this.player.play(this.settings,k=>this.getAudio(k));this.note=message('testComplete')}catch(e){this.error=this.errorMessage(e);this.note=''}this.publish()}
  async importFile(file){
    if(!file)return
    try{
      if(!/\.(mp3|wav|ogg|m4a)$/i.test(file.name))throw new AttentionError('invalidFile')
      if(file.size>16*1024*1024)throw new AttentionError('fileTooLarge')
      let url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})
      const mime=/\.mp3$/i.test(file.name)?'audio/mpeg':/\.wav$/i.test(file.name)?'audio/wav':/\.ogg$/i.test(file.name)?'audio/ogg':'audio/mp4'
      url=String(url).replace(/^data:[^;]*;/,'data:'+mime+';')
      const data={url,name:file.name};await audioRecord('file',data);this.cache.file=data;this.media.file={name:file.name};this.error='';this.note=message('fileSaved');this.update({mode:'file'})
    }catch(e){this.error=this.errorMessage(e);this.publish()}
  }
  async generate({automatic=false}={}){
    if(this.generating||this.disposed)return
    this.cancelAutoGenerate()
    const body=synthesisRequest(this.settings),text=body.text,language=this.settings.ttsLanguage,key=this.speechKey()
    if(!text){if(!automatic){this.error=message('textRequired');this.publish()}return}
    this.generating=true;this.error='';this.note=message('generatingNote');this.publish()
    try{
      if(automatic){
        let cached;try{cached=await this.getAudio('speech')}catch{}
        if(this.disposed||key!==this.speechKey())return
        if(cached&&speechMatches(cached,this.settings)){this.media.speech={text:cached.text,language:cached.language,name:cached.name,bundled:cached.bundled};this.note='';return}
      }
      if(language!=='auto'){
        let capabilities
        try{capabilities=await this.ctx.rest('/capabilities',{timeoutMs:15000})}catch{throw new AttentionError('needsLanguageBackend')}
        if(!capabilities?.languages?.includes(language))throw new AttentionError('needsLanguageBackend')
      }
      if(this.disposed||key!==this.speechKey())return
      const result=await this.ctx.rest('/synthesize',{method:'POST',body,timeoutMs:120000})
      if(!result?.url?.startsWith('data:audio/'))throw new AttentionError('emptySynthesis')
      if(result.language&&result.language!==language)throw new AttentionError('emptySynthesis')
      if(this.disposed||key!==this.speechKey())return
      const data={url:result.url,text,language,voice:result.voice,engine:result.engine,name:this.t('speechName')}
      await audioRecord('speech',data);if(this.disposed||key!==this.speechKey())return;this.cache.speech=data;this.media.speech={text,language,name:data.name};this.note=''
    }catch(e){if(!this.disposed&&key===this.speechKey()){this.error=this.errorMessage(e,'generateFailed');this.note=''}}
    finally{
      if(key!==this.speechKey()&&this.note?.key==='generatingNote')this.note=''
      this.generating=false;this.publish()
      if(!this.autoTimer)this.flushAutoGenerate()
    }
  }
  open(){sdk.host.navigate(sdk.pluginSettingsHref?sdk.pluginSettingsHref(ID):ROUTE)}
}

function useModel(model){const [,change]=useState(0);useEffect(()=>{const fn=()=>change(n=>n+1);model.listeners.add(fn);return()=>model.listeners.delete(fn)},[model]);return model}
const controlStyle={border:'1px solid var(--ui-stroke-secondary)',borderRadius:6,padding:'6px 9px',color:'var(--ui-text-primary)',background:'var(--ui-bg-elevated)',maxWidth:'100%'}
function action(label,onClick,disabled=false){return jsx(sdk.Button || 'button',{type:'button',variant:'outline',size:'sm',onClick,disabled,children:label})}
function field(label,control,help){return jsxs('label',{style:{display:'grid',gap:6},children:[jsx('span',{className:'text-sm font-medium',children:label}),control,help&&jsx('span',{className:'text-xs text-(--ui-text-tertiary)',children:help})]})}
function check(model,key,label){return jsxs('label',{style:{display:'flex',alignItems:'center',gap:8},children:[jsx('input',{type:'checkbox',checked:model.settings[key],onChange:e=>model.update({[key]:e.target.checked})}),label]})}
function options(value,onChange,choices){return jsx('select',{value,onChange:e=>onChange(e.target.value),style:controlStyle,children:choices.map(([value,label])=>jsx('option',{value,children:label},value))})}
function AttentionPage({model}){
  const m=useModel(model),s=m.settings,rows=m.queue.rows(),file=useRef(null),t=sdk.usePluginI18n?sdk.usePluginI18n(ID):(key,...args)=>translate('en',key,...args)
  const number=(key,min,max)=>jsx(sdk.Input || 'input',{type:'number',min,max,value:s[key],onChange:e=>m.update({[key]:Number(e.target.value)}),style:{maxWidth:140}})
  return jsxs('div',{className:'h-full overflow-auto p-5',style:{color:'var(--ui-text-primary)'},children:[
    jsx('h2',{className:'text-lg font-semibold',children:t('pageTitle')}),
    jsx('p',{className:'mt-1 mb-5 text-sm text-(--ui-text-tertiary)',children:t('intro')}),
    jsxs('div',{style:{display:'grid',gap:18,maxWidth:760},children:[
      check(m,'enabled',t('enabled')),
      jsxs('div',{style:{display:'flex',flexWrap:'wrap',gap:18},children:[check(m,'approval',t('approval')),check(m,'clarify',t('clarify'))]}),
      field(t('modeLabel'),options(s.mode,v=>m.update({mode:v}),[['tone',t('modeTone')],['file',t('modeFile')],['tts',t('modeTTS')],['both',t('modeBoth')]])),
      field(t('presetLabel'),options(s.preset,v=>m.update({preset:v}),[['ding',t('presetDing')],['call',t('presetCall')],['urgent',t('presetUrgent')]])),
      field(t('volume',s.volume),jsx('input',{type:'range',min:0,max:100,value:s.volume,onChange:e=>m.update({volume:Number(e.target.value)}),style:{width:280,maxWidth:'100%'}}),t('volumeHelp')),
      jsxs('div',{style:{display:'flex',flexWrap:'wrap',gap:24},children:[field(t('repeatSeconds'),number('repeatSeconds',5,300)),field(t('maxMinutes'),number('maxMinutes',1,60))]}),
      field(t('fileLabel'),jsxs('div',{className:'flex flex-wrap items-center gap-3',children:[action(t('chooseFile'),()=>file.current?.click()),jsx('span',{className:'text-sm',children:m.media.file?.name || t('noFile')}),jsx('input',{ref:file,type:'file',accept:'.mp3,.wav,.ogg,.m4a,audio/*',style:{display:'none'},onChange:e=>{void m.importFile(e.target.files?.[0]);e.target.value=''}})]}),t('fileHelp')),
      field(t('textLabel'),jsx(sdk.Textarea || 'textarea',{value:s.text,maxLength:500,rows:3,onChange:e=>m.update({text:e.target.value}),onBlur:()=>m.requestAutoGenerate()}),t('textHelp')),
      field(t('ttsLanguage'),options(s.ttsLanguage,v=>{m.update({ttsLanguage:v});m.requestAutoGenerate()},TTS_LANGUAGES.map(([code,label])=>[code,code==='auto'?t('langAuto'):label])),t('languageHelp')),
      jsxs('div',{className:'flex flex-wrap gap-2',children:[action(t('test'),()=>void m.test()),action(t('stop'),()=>{m.player.stop();m.note=message('stopped');m.publish()})]}),
      m.error&&jsx('p',{role:'alert',className:'text-sm',style:{color:'var(--ui-red)'},children:renderMessage(t,m.error)}),m.note&&jsx('p',{role:'status',className:'text-sm',children:renderMessage(t,m.note)}),
      jsx('h3',{className:'font-semibold',children:t('pending',rows.length)}),
      !rows.length&&jsx('p',{className:'text-sm text-(--ui-text-tertiary)',children:t('none')}),
      ...rows.map(p=>jsxs('div',{className:'flex flex-wrap items-center justify-between gap-2 py-2',style:{borderBottom:'1px solid var(--ui-stroke-secondary)'},children:[jsx('span',{className:'text-sm',children:t(p.kind==='approval'?'kindApproval':'kindClarify')+' · '+p.profile+' · '+p.sessionId.slice(-8)+(p.muted?' · '+t('muted'):'')}),action(t('muteRequest'),()=>m.mute(p.key),p.muted)]},p.key)),
      rows.length>0&&action(t('muteAll'),()=>m.mute()),
      jsx('p',{className:'text-xs text-(--ui-text-tertiary)',children:t('behaviorHelp')}),
      jsx('p',{className:'text-xs text-(--ui-text-quaternary)',children:t('version',VERSION)})
    ]})
  ]})
}
function BellIcon({enabled}){
  return jsxs('svg',{width:19,height:19,viewBox:'0 0 24 24',fill:enabled?'currentColor':'none',stroke:enabled?'none':'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:false,children:[
    jsx('path',{d:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z'}),
    jsx('path',{d:'M9 19a3 3 0 0 0 6 0'}),
    !enabled&&jsx('path',{d:'M3 3l18 18'})
  ]})
}
function Status({model}){
  const m=useModel(model),count=m.queue.rows().length,enabled=m.settings.enabled,t=sdk.usePluginI18n?sdk.usePluginI18n(ID):(key,...args)=>translate('en',key,...args)
  // The host handles context menus during capture, before this button's handler.
  return jsx(sdk.Button || 'button',{'data-context-menu-skip':'',type:'button',variant:'ghost',size:'icon-titlebar','aria-pressed':enabled,'aria-label':t('statusLabel')+': '+t(enabled?'statusOn':'statusOff'),title:t('bellHint',t(enabled?'statusOn':'statusOff'),count),
    onClick:()=>m.update({enabled:!m.settings.enabled}),onContextMenu:e=>{e.preventDefault();e.stopPropagation();m.open()},
    className:'inline-flex h-7 w-7 items-center justify-center rounded hover:bg-(--chrome-action-hover)',style:{WebkitAppRegion:'no-drag',color:count&&enabled?'var(--ui-accent)':enabled?'var(--ui-text-secondary)':'var(--ui-text-tertiary)'},children:jsx(BellIcon,{enabled})})
}
export default {
  id:ID,name:'Hermes Attention',
  register(ctx){
    ctx.i18n?.register({...TRANSLATIONS,'pl-PL':TRANSLATIONS.pl,'en-US':TRANSLATIONS.en,'en-GB':TRANSLATIONS.en})
    const model=new AttentionRuntime(ctx)
    ctx.registerSettingsPage({id:'alarm',title:'Hermes Attention',render:()=>jsx(AttentionPage,{model})})
    ctx.register({id:'page',area:sdk.ROUTES_AREA || 'routes',data:{path:ROUTE},render:()=>jsx(AttentionPage,{model})})
    ctx.register({id:'bell',area:sdk.TITLEBAR_AREAS?.right || 'titleBar.right',order:150,render:()=>jsx(Status,{model})})
    ctx.register({id:'open',area:sdk.PALETTE_AREA || 'commandPalette',data:{id:ID+'.open',label:'Hermes Attention',keywords:['alarm','attention','sound','settings','dźwięk','ustawienia'],run:()=>model.open()}})
    globalThis.hermesDesktop?.logLine?.('[hermes-attention] loaded '+VERSION)
  }
}
