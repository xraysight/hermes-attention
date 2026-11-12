const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function load(overrides={}){
 const file=path.join(__dirname,'..','plugin.js');
 const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const sandbox={console,URL,Date,Map,Set,JSON,Math,Number,String,Boolean,Array,Object,Promise,Error,RegExp,setTimeout,clearTimeout, exports:{}, sdk:{},useEffect(){},useState(){},useRef(){},jsx(){},jsxs(){},...overrides};
 vm.createContext(sandbox);
 const clean=source.replace(/^import .* from .*\n/gm,'').replace(/export default /g,'const plugin = ').replace(/export (?=(class|function|const) )/g,'');
 vm.runInContext(clean+'\nif(typeof testAudioRecord===\"function\")audioRecord=testAudioRecord;\nexports.renderTone=typeof renderTone===\"undefined\"?undefined:renderTone;exports.Queue=typeof AlarmQueue===\"undefined\"?undefined:AlarmQueue; exports.normalise=typeof normaliseSettings===\"undefined\"?undefined:normaliseSettings; exports.SoundPlayer=typeof SoundPlayer===\"undefined\"?undefined:SoundPlayer; exports.plugin=typeof plugin===\"undefined\"?undefined:plugin; exports.Runtime=typeof AttentionRuntime===\"undefined\"?undefined:AttentionRuntime;exports.translations=typeof TRANSLATIONS===\"undefined\"?undefined:TRANSLATIONS;exports.translate=typeof translate===\"undefined\"?undefined:translate;exports.speechMatches=typeof speechMatches===\"undefined\"?undefined:speechMatches;exports.synthesisRequest=typeof synthesisRequest===\"undefined\"?undefined:synthesisRequest;',sandbox);
 return sandbox.exports;
}
const event=(type,id='p1',scope={})=>({type,session_id:'s1',profile:'default',connectionId:'local',payload:{prompt_id:id,timeout:300},...scope});
test('approval starts an alarm, exact settlement removes it',()=>{
 const {Queue}=load(); assert.equal(typeof Queue,'function','AlarmQueue implementation is missing');
 const q=new Queue(); q.handle(event('approval.request'),1000);
 assert.equal(q.rows(3000).length,1); assert.equal(q.due(3000).length,1);
 q.handle(event('approval.settled'),4000); assert.equal(q.rows(4000).length,0);
});
test('repeat schedule respects per-prompt mute, timeout and safety cap',()=>{
 const {Queue}=load(),q=new Queue({repeatSeconds:20,maxMinutes:1});
 q.handle(event('clarify.request'),1000); let [p]=q.due(3000); assert.ok(p);
 q.mark([p.key],3000); assert.equal(q.due(21000).length,0); assert.equal(q.due(23000).length,1);
 q.mute(p.key); assert.equal(q.due(24000).length,0);
 const q2=new Queue({maxMinutes:1}); q2.handle(event('approval.request'),1000);
 assert.equal(q2.due(62000).length,0,'safety duration caps sound');
 assert.equal(q2.due(302000).length,0,'elapsed request timeout suspends alarm pending authoritative snapshot');
});
test('requests are isolated by scope, deduplicated and removed on cancellation',()=>{
 const {Queue,normalise}=load(),q=new Queue();
 q.handle(event('approval.request'),1000); q.handle(event('approval.request'),2000);
 q.handle(event('approval.request','p1',{connectionId:'remote'}),1000);
 assert.equal(q.rows(3000).length,2);
 q.handle(event('request.cancel','p1'),3000); assert.equal(q.rows(3000).length,1);
 q.handle(event('approval.settled','p1',{connectionId:'remote'}),4000); assert.equal(q.rows(4000).length,0);
 const safe=normalise({volume:999,repeatSeconds:-1,maxMinutes:Infinity,mode:'bad'});
 assert.equal(safe.volume,100);assert.equal(safe.repeatSeconds,5);assert.equal(safe.maxMinutes,10);assert.equal(safe.mode,'tone');
 q.handle(event('clarify.request','p2',{payload:{prompt_id:'p2',timeout:Infinity}}),1000);
 assert.equal(q.due(302000).length,0,'malformed timeout must not alarm forever');
});
test('audio playback is cancellable and file/TTS modes use the selected cached audio',async()=>{
 const api=load(); assert.equal(typeof api.SoundPlayer,'function','audio player missing');
 const played=[];
 class Audio {constructor(url){this.src=url;this.volume=1;this.paused=false;played.push(this)} play(){return Promise.resolve()} pause(){this.paused=true} load(){} removeAttribute(){this.src=''} }
 const env={Audio,setTimeout,clearTimeout}; const player=new api.SoundPlayer(env);
 let finished=false;const result=player.play({mode:'file',volume:35},async()=>({url:'data:audio/wav;base64,UklGRg=='})).then(()=>{finished=true});
 await new Promise(r=>setImmediate(r));assert.equal(played.length,1);assert.equal(played[0].volume,.35);
 player.stop();await result;assert.equal(played[0].paused,true);assert.equal(finished,true);
 const pending=new api.SoundPlayer(env);let release;const slow=pending.play({mode:'tts',volume:50},()=>new Promise(r=>release=r));pending.stop();release({url:'data:audio/wav;base64,UklGRg=='});await slow;assert.equal(played.length,1,'cancelled load must never start');
});
test('plugin registers settings, scoped listeners, timers and safe disposal',()=>{
 const registrations=[],settings=[],events=[],timers=[],disposers=[];
 const {plugin}=load({sdk:{host:{navigate(){},state:{}}}});
 assert.equal(typeof plugin?.register,'function','plugin registration missing');
 const ctx={storage:{get:(k,f)=>f,set(){}},register:c=>registrations.push(c),registerSettingsPage:p=>settings.push(p),onEvent:(t,cb)=>events.push([t,cb]),setInterval:(cb,ms)=>timers.push([cb,ms]),onDispose:cb=>disposers.push(cb)};
 plugin.register(ctx);assert.equal(settings[0].id,'alarm');assert.ok(registrations.some(c=>c.area==='titleBar.right'));assert.ok(!registrations.some(c=>c.area==='statusBar.right'));
 assert.ok(events.some(([t])=>t==='*'));assert.ok(timers.length>0);assert.ok(disposers.length>0);
 disposers.forEach(fn=>fn());
});
test('snapshots discover batch clarify and authoritatively clear expired requests',()=>{
 const {Queue}=load(),q=new Queue();const scope={session_id:'s1',profile:'default',connectionId:'local'};
 assert.equal(typeof q.reconcile,'function','snapshot reconciliation missing');
 q.reconcile(scope,{execution_generation:2,prompts:[],open_requests:[{id:'srq-batch',method:'clarify',params:{session_id:'s1',questions:[{qid:'q1',question:'Choose'}]}}]},1000);
 assert.equal(q.rows(3000).length,1);assert.equal(q.due(3000).length,1);
 q.handle(event('request.cancel','srq-batch',{payload:{id:'srq-batch'}}),4000);assert.equal(q.rows(4000).length,0);
 q.reconcile(scope,{execution_generation:2,prompts:[{kind:'approval',prompt_id:'p2',timeout_s:5}],open_requests:[]},5000);
 assert.equal(q.due(11000).length,0,'elapsed TTL suspends until reverified');
 q.reconcile(scope,{execution_generation:2,prompts:[],open_requests:[]},11000);assert.equal(q.rows(11000).length,0);
});
test('runtime polls snapshots for Desktop batch questions without reading messages',async()=>{
 const calls=[],disposers=[];const host={state:{connectionId:{get:()=> 'local'},profile:{get:()=> 'default'}},profileRoutes:async()=>[{connectionId:'local',profile:'default'}],requestProfile:async(route,method,params)=>{calls.push([method,params]);return method==='session.active_list'?{sessions:[{session_id:'s1',running:true}]}:{session_id:'s1',execution_generation:1,last_sequence:1,prompts:[],open_requests:[{id:'srq-question',method:'clarify',params:{questions:[{qid:'q1'}]}}]}}};
 const {Runtime}=load({sdk:{host}});const ctx={storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose:f=>disposers.push(f)};
 const r=new Runtime(ctx);assert.equal(typeof r.poll,'function','background reconciliation missing');await r.poll();assert.equal(r.queue.rows().length,1);assert.equal(calls.find(([m])=>m==='session.resume')[1].omit_messages,true);disposers.forEach(f=>f());
});
test('muting reaches windows that discover a request later',()=>{
 const storage=new Map(),env={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sdk:{host:{state:{}}}};
 const {Runtime}=load(env),ctx={storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}};
 const a=new Runtime(ctx),b=new Runtime(ctx),now=Date.now();a.queue.handle(event('approval.request'),now-3000);a.mute();b.queue.handle(event('approval.request'),now-3000);
 assert.equal(typeof b.syncMuteState,'function','shared mute persistence missing');b.syncMuteState();assert.equal(b.queue.due(now).length,0);
});
test('gateway restart accepts a fresh authority epoch but rejects old-generation events',()=>{
 const {Queue}=load(),q=new Queue(),scope={session_id:'s1',connectionId:'local',profile:'default'};
 q.reconcile(scope,{authority_epoch:1,execution_generation:5,prompts:[{kind:'approval',prompt_id:'old',execution_generation:5}],open_requests:[]},1000);
 q.reconcile(scope,{authority_epoch:2,execution_generation:0,prompts:[{kind:'clarify',prompt_id:'new',execution_generation:0}],open_requests:[]},2000);
 assert.equal(q.rows().length,1);assert.equal(q.rows()[0].id,'new');
 q.handle({...event('approval.request','old'),authority_epoch:1,execution_generation:5},3000);assert.equal(q.rows().length,1);
});
test('SDK inventory uses public active_list contract and clears a recovered poll error',async()=>{
 const calls=[];const host={state:{connectionId:{get:()=> 'local'},profile:{get:()=> 'default'}},profileRoutes:async()=>[{connectionId:'local',profile:'default'}],requestProfile:async(route,method,params)=>{
  calls.push([method,params]);
  if(method==='session.list'&&'scope' in params)throw Error('invalid params for session.list: scope: Extra inputs are not permitted');
  if(method==='session.active_list'){assert.deepEqual(Object.keys(params).sort(),['profile']);return {sessions:[{id:'waiting-session',status:'waiting'},{id:'idle-session',status:'idle'}]}}
  if(method==='session.resume'){assert.equal(params.session_id,'waiting-session');assert.equal(params.omit_messages,true);return {running:true,execution_generation:1,prompts:[],open_requests:[{id:'batch',method:'clarify',params:{questions:[{qid:'q1'}]}}]}}
  throw Error('Wrong inventory method: '+method);
 }};
 const {Runtime}=load({sdk:{host}}),ctx={storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}};
 const r=new Runtime(ctx);r.error={key:'pollFailed',args:['Previous failure']};await r.poll();
 assert.equal(r.error,'','a successful refresh must remove its stale error banner');
 assert.equal(r.queue.rows().length,1,'waiting sessions must be discovered even without running field');
 assert.ok(calls.some(([method])=>method==='session.active_list'));
});
test('Polish and English bundles have identical keys and unknown locales fall back to English',()=>{
 const {translations,translate}=load();assert.ok(translations,'translation bundles missing');
 assert.deepEqual(Object.keys(translations.pl).sort(),Object.keys(translations.en).sort());
 assert.equal(translate('pl-PL','test'),'Testuj');assert.equal(translate('en-US','test'),'Test');assert.equal(translate('de-DE','test'),'Test');
 assert.equal(translate('pl','pending',3),'Oczekujące decyzje: 3');assert.equal(translate('en','pending',3),'Pending decisions: 3');
 assert.ok(translate('en','defaultPhrase').startsWith('Hermes '));assert.ok(translate('pl','defaultPhrase').startsWith('Hermes '));
});
test('plugin follows app locale at render time without changing the saved TTS text',()=>{
 let locale='pl',registered;const pages=[],saved={text:'A custom message that must remain unchanged.',ttsLanguage:'pl-PL',volume:42};
 const api=load({sdk:{host:{state:{},navigate(){}},usePluginI18n:()=> (key,...args)=>api.translate(locale,key,...args)},useState:()=>[0,()=>{}],useRef:()=>({current:null}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
 const ctx={storage:{get:(key,fallback)=>key==='settings'?saved:fallback,set(){throw Error('locale changes must not save user text')}},i18n:{register:bundles=>registered=bundles,t:(key,...args)=>api.translate(locale,key,...args)},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose(){}};
 api.plugin.register(ctx);assert.ok(registered?.en&&registered?.pl,'SDK translation registration missing');
 const wrapper=pages[0].render(),model=wrapper.props.model;
 const text=node=>node==null||node===false?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(' '):text(node.props?.children);
 assert.ok(text(wrapper.type(wrapper.props)).includes('Testuj'));locale='en';assert.ok(text(wrapper.type(wrapper.props)).includes('Enable sound alerts'));
 assert.equal(model.settings.text,saved.text);assert.equal(model.settings.ttsLanguage,'pl-PL');assert.equal(model.settings.volume,42);
});
test('TTS language is explicit in requests and cannot silently reuse a different cached voice',()=>{
 const {normalise,synthesisRequest,speechMatches}=load();assert.equal(typeof synthesisRequest,'function','language-aware request builder missing');
 const auto=normalise({text:' Keep my words '});assert.equal(auto.ttsLanguage,'auto');assert.deepEqual(JSON.parse(JSON.stringify(synthesisRequest(auto))),{text:'Keep my words'});
 const pl=normalise({...auto,ttsLanguage:'pl-PL'});assert.deepEqual(JSON.parse(JSON.stringify(synthesisRequest(pl))),{text:'Keep my words',language:'pl-PL'});
 assert.equal(speechMatches({text:'Keep my words'},auto),true,'old untagged recordings remain valid for auto');
 assert.equal(speechMatches({text:'Keep my words'},pl),false,'old recordings must not be relabelled Polish');
 assert.equal(speechMatches({text:'Keep my words',language:'pl-PL'},pl),true);
 assert.equal(speechMatches({text:'Keep my words',language:'en-US'},pl),false);
 assert.equal(normalise({text:'unchanged',ttsLanguage:'xx-XX'}).ttsLanguage,'auto');
});
test('automatic speech preparation is debounced, cancellable and disabled for empty text',async()=>{
 const timers=new Map();let id=0;const disposers=[];
 const {Runtime,normalise}=load({sdk:{host:{state:{}}},setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:key=>timers.delete(key)});
 const ctx={storage:{get:(k,f)=>f,set(){}},onEvent(){},setInterval(){},onDispose:fn=>disposers.push(fn)};
 const r=new Runtime(ctx);r.refreshMedia=async()=>{};const calls=[];r.generate=async options=>calls.push([r.settings.text,r.settings.ttsLanguage,options.automatic]);
 assert.ok(!('autoGenerate' in normalise({autoGenerate:false})),'legacy opt-out must not remain a setting');assert.equal(timers.size,0,'opening settings must not synthesize');
 r.update({text:'First'});assert.equal(timers.size,0,'typing alone must not synthesize');
 r.requestAutoGenerate();r.update({ttsLanguage:'en-US'});r.requestAutoGenerate();assert.equal(timers.size,1);
 for(const [key,fn] of [...timers]){timers.delete(key);fn()}assert.deepEqual(calls,[['First','en-US',true]]);
 r.requestAutoGenerate();r.update({text:'Still typing'});assert.equal(timers.size,0,'a draft cancels pending committed text');
 r.update({autoGenerate:false});r.requestAutoGenerate();assert.equal(timers.size,1,'legacy false must not disable automatic preparation');
 r.update({text:'  '});r.requestAutoGenerate();assert.equal(timers.size,0);
 r.update({text:'Last'});r.requestAutoGenerate();disposers.forEach(fn=>fn());assert.equal(timers.size,0);
});
test('automatic preparation reuses matching audio without contacting a TTS provider',async()=>{
 let requests=0;const {Runtime}=load({sdk:{host:{state:{}}}});
 const ctx={storage:{get:(k,f)=>f,set(){}},onEvent(){},setInterval(){},onDispose(){},rest:async()=>{requests++;throw Error('a matching recording must not be regenerated')}};
 const r=new Runtime(ctx);r.getAudio=async()=>({text:r.settings.text.trim(),language:'auto',name:'Existing',url:'data:audio/mpeg;base64,dGVzdA=='});
 await r.generate({automatic:true});assert.equal(requests,0);assert.equal(r.error,'');assert.equal(r.note,'','cached audio should be reused silently');assert.equal(r.generating,false);
});
test('changes during synthesis queue only the last committed request and never save stale output',async()=>{
 const timers=new Map();let id=0,release;const requests=[];
 const {Runtime}=load({sdk:{host:{state:{}}},setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:key=>timers.delete(key)});
 const ctx={storage:{get:(k,f)=>f,set(){}},onEvent(){},setInterval(){},onDispose(){},rest:async(path,options)=>{requests.push(options.body);if(requests.length===1)return await new Promise(resolve=>release=resolve);throw Error('offline')}};
 const r=new Runtime(ctx);r.refreshMedia=async()=>{};r.getAudio=async()=>{throw Error('missing')};const first=r.generate();
 r.update({text:'Intermediate'});r.requestAutoGenerate();r.update({text:'Newest committed text'});r.requestAutoGenerate();
 for(const [key,fn] of [...timers]){timers.delete(key);fn()}assert.equal(requests.length,1,'requests must not overlap');
 release({url:'data:audio/mpeg;base64,dGVzdA=='});await first;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,2);assert.equal(requests[1].text,'Newest committed text');assert.equal(r.cache.speech,undefined,'stale audio must not be saved');assert.equal(r.generating,false);assert.equal(timers.size,0,'failed synthesis must not start an automatic retry loop');
});
test('UI commits text on blur and prepares speech immediately after language selection',()=>{
 const pages=[];const api=load({sdk:{host:{state:{}},usePluginI18n:()=>(key,...args)=>api.translate('en',key,...args)},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
 const ctx={storage:{get:(key,f)=>key==='settings'?{text:'Saved text',ttsLanguage:'pl-PL'}:f,set(){}},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose(){}};
 api.plugin.register(ctx);const wrapper=pages[0].render(),r=wrapper.props.model;let commits=0;r.requestAutoGenerate=()=>commits++;r.refreshMedia=async()=>{};
 const nodes=[];const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(wrapper.type(wrapper.props));
 const text=nodes.find(n=>n.props?.rows===3),language=nodes.find(n=>n.type==='select'&&n.props.value==='pl-PL');
 assert.equal(typeof text.props.onBlur,'function');text.props.onChange({target:{value:'Edited text'}});assert.equal(commits,0);text.props.onBlur();assert.equal(commits,1);
 language.props.onChange({target:{value:'en-US'}});assert.equal(commits,2);assert.equal(r.settings.ttsLanguage,'en-US');assert.equal(r.settings.text,'Edited text');
 assert.ok(!nodes.some(n=>n.type==='label'&&JSON.stringify(n.props.children).includes('Automatically prepare TTS recordings')));assert.ok(!JSON.stringify(nodes).includes('When automatic preparation is on'),'obsolete option description must be absent');
});
test('new speech is persisted without a success announcement',async()=>{
 const stored=[];const {Runtime}=load({sdk:{host:{state:{}}},testAudioRecord:async(key,data)=>{if(data)stored.push([key,data]);return data}});
 const ctx={storage:{get:(k,f)=>f,set(){}},onEvent(){},setInterval(){},onDispose(){},rest:async()=>({url:'data:audio/mpeg;base64,dGVzdA=='})};
 const r=new Runtime(ctx);await r.generate({automatic:true});assert.equal(stored.length,1);assert.equal(stored[0][0],'speech');assert.ok(r.cache.speech);assert.equal(r.error,'');assert.equal(r.note,'');
});
test('settings omit manual generation and ready notices but retain progress and errors',()=>{
 const pages=[];const api=load({sdk:{host:{state:{}},usePluginI18n:()=>(key,...args)=>api.translate('en',key,...args)},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
 const ctx={storage:{get:(key,f)=>key==='settings'?{text:'Saved text',ttsLanguage:'pl-PL'}:f,set(){}},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose(){}};
 api.plugin.register(ctx);const w=pages[0].render(),r=w.props.model;r.media.speech={text:'Saved text',language:'pl-PL'};r.note={key:'generatingNote',args:[]};r.error={key:'generateFailed',args:['Connection offline']};
 const rendered=JSON.stringify(w.type(w.props));assert.ok(!rendered.includes('Generate TTS'),'manual generation button and its instructions must be absent');assert.ok(!rendered.includes('Recording ready'),'success notices must be absent');assert.ok(rendered.includes('Generating a recording'));assert.ok(rendered.includes('Connection offline'));
});
test('titlebar right click opens settings directly without toggling the live alarm',()=>{
 for(const withMenuSDK of [true,false]){
  const registrations=[],navigations=[];let saved=null,stops=0,writes=0;
  const menu=withMenuSDK?{ContextMenu:'context-root',ContextMenuTrigger:'context-trigger',ContextMenuContent:'context-content',ContextMenuItem:'context-item'}:{};
  const {plugin}=load({sdk:{host:{state:{},navigate:path=>navigations.push(path)},pluginSettingsHref:id=>'/settings?tab=plugins&plugin='+id,...menu},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
  const ctx={storage:{get:(key,f)=>key==='settings'?(saved||f):f,set:(key,value)=>{if(key==='settings'){saved=value;writes++}}},register:c=>registrations.push(c),registerSettingsPage(){},onEvent(){},setInterval(){},onDispose(){}};
  plugin.register(ctx);const wrapper=registrations.find(c=>c.area==='titleBar.right').render(),model=wrapper.props.model;model.player.stop=()=>stops++;
  const render=()=>wrapper.type(wrapper.props),icon=node=>node.props.children.type(node.props.children.props);
  const rightClick=button=>{
   const enabled=model.settings.enabled,previousStops=stops,previousWrites=writes;let prevented=0,stopped=0;
   assert.equal(typeof button.props.onContextMenu,'function');
   button.props.onContextMenu({preventDefault(){prevented++},stopPropagation(){stopped++}});
   assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(model.settings.enabled,enabled);
   assert.equal(stops,previousStops,'opening settings must not interrupt playback');assert.equal(writes,previousWrites,'opening settings must not save or toggle settings');
  };
  let button=render();assert.equal(button.type,'button','no context-menu wrapper should be rendered');
  assert.equal(button.props['data-context-menu-skip'],'','the host capture listener must leave the bell gesture to the plugin');
  assert.equal(button.props['aria-pressed'],true);assert.equal(button.props.style.WebkitAppRegion,'no-drag');assert.equal(icon(button).props.fill,'currentColor');
  rightClick(button);
  button.props.onClick();assert.equal(saved.enabled,false);assert.equal(stops,1);
  const off=render();assert.equal(off.props['aria-pressed'],false);assert.equal(icon(off).props.fill,'none');assert.ok(icon(off).props.children.some(n=>n&&n.props?.d==='M3 3l18 18'));
  rightClick(off);button.props.onClick();assert.equal(saved.enabled,true,'a handler must read the latest state even before rerender');
  assert.deepEqual(navigations,['/settings?tab=plugins&plugin=hermes-attention','/settings?tab=plugins&plugin=hermes-attention']);
 }
});
test('Ding is one decaying bell strike with a smooth tail and safe peak',()=>{
 const {renderTone}=load();assert.equal(typeof renderTone,'function');const rate=24000,data=renderTone('ding',rate,70);
 const rms=(a,b)=>Math.sqrt(data.slice(Math.floor(a*rate),Math.floor(b*rate)).reduce((sum,x)=>sum+x*x,0)/Math.floor((b-a)*rate));
 assert.ok(data.length>=rate*2);assert.ok(data.every(Number.isFinite));assert.ok(rms(.01,.15)>rms(1.8,2.2)*8,'the bell must ring out, not repeat a beep');assert.ok(Math.max(...data.map(Math.abs))<.9);assert.equal(data[0],0);assert.equal(data[data.length-1],0);
});
test('Call rings in two telephone double-bursts separated by real silence',()=>{
 const {renderTone}=load(),rate=24000,data=renderTone('call',rate,70);const peak=(a,b)=>data.slice(Math.floor(a*rate),Math.floor(b*rate)).reduce((m,v)=>Math.max(m,Math.abs(v)),0);
 assert.ok(peak(.08,.3)>.1);assert.equal(peak(.45,.6),0,'there must be a gap between rings');assert.ok(peak(.7,.9)>.1);assert.equal(peak(1.1,2),0,'telephone cadence needs a long pause');assert.ok(peak(2.2,2.4)>.1);assert.ok(peak(2.85,3)>.1);assert.equal(data[data.length-1],0);
});
test('Urgent is a rapid alternating two-tone alarm, with gaps and volume scaling',()=>{
 const {renderTone}=load(),rate=24000,data=renderTone('urgent',rate,100),quiet=renderTone('urgent',rate,0),half=renderTone('urgent',rate,50);
 const peak=(a,b)=>data.slice(Math.floor(a*rate),Math.floor(b*rate)).reduce((m,v)=>Math.max(m,Math.abs(v)),0);
 const crossings=(a,b)=>{let n=0;for(let i=Math.floor(a*rate)+1;i<Math.floor(b*rate);i++)if(data[i-1]<=0&&data[i]>0)n++;return n};
 assert.ok(peak(.03,.13)>.2);assert.equal(peak(.21,.26),0);assert.ok(peak(.31,.41)>.2);assert.ok(crossings(.31,.41)>crossings(.03,.13)*1.35,'successive pulses must alternate pitch');assert.equal(peak(.77,.82),0);assert.ok(quiet.every(x=>x===0));assert.ok(data.every((x,i)=>Number.isFinite(x)&&Math.abs(x)<.9&&Math.abs(half[i]-x/2)<1e-6));
});
test('SoundPlayer actually plays the distinct generated PCM for every preset',async()=>{
 let played;class Context{constructor(){this.sampleRate=24000;this.state='running';this.destination={}}async resume(){}async close(){}createBuffer(channels,length){const data=new Float32Array(length);played=data;return {getChannelData:()=>data}}createBufferSource(){return {connect(){},disconnect(){},stop(){},start(){setImmediate(()=>this.onended?.())}}}}
 const {SoundPlayer,renderTone}=load(),player=new SoundPlayer({AudioContext:Context});
 for(const preset of ['ding','call','urgent']){await player.play({mode:'tone',preset,volume:35},()=>null);const expected=renderTone(preset,24000,35);assert.equal(played.length,expected.length,preset+' must use its own duration');assert.ok(played.every((x,i)=>x===expected[i]),preset+' must use the new waveform')}
 player.dispose();
});
test('preset picker exposes Ding, Call, Urgent and migrates the old Bell selection',()=>{
 const pages=[],api=load({sdk:{host:{state:{}}},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
 assert.equal(api.normalise({preset:'bell'}).preset,'ding');assert.equal(api.normalise({preset:'ding'}).preset,'ding');
 const ctx={storage:{get:(k,f)=>f,set(){}},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose(){}};api.plugin.register(ctx);const w=pages[0].render();
 const nodes=[];const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(w.type(w.props));
 const select=nodes.find(n=>n.type==='select'&&n.props.value==='call');assert.deepEqual(Array.from(select.props.children,n=>n.props.value),['ding','call','urgent']);assert.deepEqual(Array.from(select.props.children,n=>n.props.children),['Ding','Call','Urgent']);
});
test('settings expose only playback test and stop controls in both languages',()=>{
 for(const locale of ['en','pl']){
  const pages=[],api=load({sdk:{host:{state:{}},usePluginI18n:()=>(key,...args)=>api.translate(locale,key,...args)},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
  const ctx={storage:{get:(k,f)=>f},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose(){}};
  api.plugin.register(ctx);const w=pages[0].render(),nodes=[];
  const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(w.type(w.props));
  const controls=nodes.find(n=>n.props?.className==='flex flex-wrap gap-2');
  assert.deepEqual(Array.from(controls.props.children,n=>n.props.children),[api.translate(locale,'test'),api.translate(locale,'stop')]);
  for(const key of ['snooze','resume','snoozedUntil'])assert.ok(!(key in api.translations[locale]),'retired control translations must be removed');
 }
});
test('legacy pause state cannot suppress active requests or erase shared mutes',()=>{
 const now=Date.now(),storage=new Map(),channels=[];
 class Channel{constructor(){channels.push(this)}postMessage(){}close(){}}
 const {Runtime,Queue}=load({BroadcastChannel:Channel,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sdk:{host:{state:{}}}});
 const ctx={storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}};
 const r=new Runtime(ctx);r.queue.handle(event('approval.request','muted'),now-3000);r.queue.handle(event('clarify.request','active'),now-3000);
 const key=r.queue.rows().find(p=>p.id==='muted').key;
 storage.set('hermes-attention.quiet',JSON.stringify({muted:{[key]:now+60000},until:now+300000}));
 r.stopIfSettled();assert.deepEqual(Array.from(r.queue.due(now),p=>p.id),['active']);
 let stops=0;r.player.stop=()=>stops++;channels[0].onmessage({data:{type:'snooze',until:now+300000}});
 assert.equal(stops,0,'an obsolete broadcast must not stop playback');assert.deepEqual(Array.from(r.queue.due(now),p=>p.id),['active']);
 assert.equal(r.queue.snoozedUntil,undefined);assert.equal(typeof r.snooze,'undefined');assert.equal(typeof Queue.prototype.snooze,'undefined');
 r.mute(key);assert.ok(!('until' in JSON.parse(storage.get('hermes-attention.quiet'))),'new mute writes must not persist the retired pause timer');
});
module.exports={load,event};
