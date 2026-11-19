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
test('poll discovers a focused remote batch question while the active gateway remains local',async()=>{
 const local={connectionId:'local',profile:'default',targetProfile:'default',mode:'local'},remote={connectionId:'synthetic-remote',profile:'default',targetProfile:'default',mode:'remote'},unused={...remote,connectionId:'synthetic-unused'};
 const calls=[],disposers=[];const host={state:{connectionId:{get:()=>local.connectionId},profile:{get:()=>local.profile},focusedSessionOwner:{get:()=>({connectionId:remote.connectionId,profile:remote.profile})},focusedSessionId:{get:()=>'synthetic-remote-session'}},
  profileRoutes:async()=>[local,remote,unused],requestProfile:async(route,method,params)=>{
   calls.push({route,method,params});assert.notEqual(route.connectionId,unused.connectionId,'unfocused saved remotes must not be contacted');
   if(method==='session.active_list'){assert.equal(route,local);return {sessions:[]}}
   assert.equal(route,remote);assert.equal(method,'session.resume');assert.equal(params.session_id,'synthetic-remote-session');assert.equal(params.omit_messages,true);
   return {running:true,prompts:[],open_requests:[{id:'synthetic-remote-question',method:'clarify',params:{questions:[{qid:'q1',question:'Synthetic choice'}]}}]}
  }};
 const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose:fn=>disposers.push(fn)});
 await r.poll();assert.equal(r.queue.rows().length,1,'the focused remote question must be detected without a gateway event');
 assert.equal(r.queue.rows()[0].connectionId,remote.connectionId);assert.equal(r.queue.rows()[0].sessionId,'synthetic-remote-session');assert.equal(calls.filter(call=>call.method==='session.resume').length,1);
 disposers.forEach(fn=>fn());
});
test('focused remote requests settle through snapshots without depending on another inventory scan',async()=>{
 const local={connectionId:'local',profile:'default'},remote={connectionId:'synthetic-remote',profile:'default'},calls=[],disposers=[];
 let focused=false,pending=true;const host={state:{connectionId:{get:()=>local.connectionId},profile:{get:()=>local.profile},focusedSessionOwner:{get:()=>focused?remote:null},focusedSessionId:{get:()=>focused?'synthetic-remote-session':null}},profileRoutes:async()=>[local,remote],requestProfile:async(route,method,params)=>{
  calls.push({route,method,params});if(method==='session.active_list')return {sessions:[]};assert.equal(route,remote);
  return {running:pending,prompts:[],open_requests:pending?[{id:'synthetic-question',method:'clarify',params:{}}]:[]}
 }};
 const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose:fn=>disposers.push(fn)});
 await r.poll();assert.equal(r.queue.rows().length,0);focused=true;await r.poll();assert.equal(r.queue.rows().length,1);
 pending=false;await r.poll();assert.equal(r.queue.rows().length,0);assert.equal(calls.filter(call=>call.method==='session.active_list').length,1);disposers.forEach(fn=>fn());
});
test('focused session discovery does not guess an ambiguous or incomplete owner',async()=>{
 for(const [owner,id] of [[null,'synthetic-session'],[{profile:'default'},'synthetic-session'],[{connectionId:'synthetic-remote'},'synthetic-session'],[{connectionId:'synthetic-remote',profile:'default'},null]]){
  const calls=[],disposers=[];const host={state:{connectionId:{get:()=>'local'},profile:{get:()=>'default'},focusedSessionOwner:{get:()=>owner},focusedSessionId:{get:()=>id}},profileRoutes:async()=>[{connectionId:'local',profile:'default'}],requestProfile:async(route,method)=>{calls.push(method);assert.equal(route.connectionId,'local');return {sessions:[]}}};
  const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose:fn=>disposers.push(fn)});
  await r.poll();assert.deepEqual(calls,['session.active_list']);assert.equal(r.scopes.size,0);assert.equal(r.queue.rows().length,0);disposers.forEach(fn=>fn());
 }
});
test('resume uses the stored session key without changing the runtime queue identity',async()=>{
 for(const discovery of ['focused','inventory']){
  const route={connectionId:'synthetic-remote',profile:'default',targetProfile:'default'};
  const runtimeId='synthetic-runtime',storedId='synthetic-stored',calls=[],disposers=[];
  const atom=value=>({get:()=>value});let pending=true,listener;
  const host={state:{connectionId:atom(route.connectionId),profile:atom(route.profile),...discovery==='focused'&&{focusedSessionOwner:atom(route),focusedSessionId:atom(runtimeId),focusedStoredSessionId:atom(storedId)}},
   profileRoutes:async()=>[route],requestProfile:async(actual,method,params)=>{
    assert.equal(actual,route);
    if(method==='session.active_list')return {sessions:[{id:runtimeId,status:'waiting',...discovery==='inventory'&&{session_key:storedId}}]};
    calls.push(params.session_id);assert.equal(params.omit_messages,true);
    if(params.session_id!==storedId)throw new Error('Session not found');
    return {session_id:runtimeId,session_key:storedId,messages_omitted:true,running:true,...pending&&{open_requests:[{id:'synthetic-question',method:'clarify',params:{}}]}};
   }};
  const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent:(_,fn)=>{listener=fn},setInterval(){},onDispose:fn=>disposers.push(fn)});
  await r.poll();assert.equal(r.queue.rows().length,1,discovery);assert.equal(r.queue.rows()[0].sessionId,runtimeId);
  listener({type:'clarify.request',session_id:runtimeId,connectionId:route.connectionId,profile:route.profile,payload:{request_id:'synthetic-question'}});
  assert.equal(r.queue.rows().length,1);
  let stops=0;r.activeKeys=[r.queue.rows()[0].key];r.player.stop=()=>{stops++;r.activeKeys=[]};
  pending=false;await r.poll();assert.equal(r.queue.rows().length,0);assert.equal(stops,1);
  await r.poll();assert.equal(r.queue.due(Date.now()+30000).length,0);assert.deepEqual(calls,[storedId,storedId,storedId]);
  disposers.forEach(fn=>fn());
 }
});
test('unrecognized snapshots suspend repeats without clearing a pending request',async()=>{
 const route={connectionId:'synthetic-remote',profile:'default'},atom=value=>({get:()=>value});
 const control={running:true,prompts:[],open_requests:[{id:'synthetic-question',method:'clarify'}]};let snapshot=control;
 const host={state:{connectionId:atom(route.connectionId),profile:atom(route.profile)},profileRoutes:async()=>[route],requestProfile:async(_,method)=>method==='session.active_list'?{sessions:[{id:'synthetic-runtime',session_key:'synthetic-stored',status:'waiting'}]}:snapshot};
 const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}});
 await r.poll();assert.equal(r.queue.rows().length,1);
 for(const invalid of [{running:true},{session_id:'wrong-runtime',session_key:'synthetic-stored',messages_omitted:true,running:true},{session_id:'synthetic-runtime',session_key:'synthetic-stored',messages_omitted:true,running:true,open_requests:null},{session_id:'synthetic-runtime',session_key:'synthetic-stored',messages_omitted:true,running:true,pending_approval:{id:'other'}}]){
  snapshot=invalid;await r.poll();assert.equal(r.queue.rows().length,1);assert.equal(r.queue.due(Date.now()+30000).length,0);
 }
 snapshot=control;await r.poll();assert.equal(r.queue.due(Date.now()+30000).length,1);
});
test('inventory failure does not block a known focused remote session',async()=>{
 const local={connectionId:'local',profile:'default'},remote={connectionId:'synthetic-remote',profile:'default'},atom=value=>({get:()=>value});
 let failures=2,pending=true,reads=0;
 const host={state:{connectionId:atom(local.connectionId),profile:atom(local.profile),focusedSessionOwner:atom(remote),focusedSessionId:atom('synthetic-session')},profileRoutes:async()=>[local,remote],requestProfile:async(route,method)=>{
  if(method==='session.active_list'){assert.equal(route,local);if(failures-->0)throw Error('Inventory unavailable');return {sessions:[]}}
  assert.equal(route,remote);reads++;return {running:true,open_requests:pending?[{id:'synthetic-question',method:'clarify'}]:[]};
 }};
 const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}});
 await r.poll();assert.equal(r.queue.rows().length,1);assert.equal(r.error.key,'pollFailed');assert.equal(r.queue.due(Date.now()+3000).length,1);
 pending=false;await r.poll();assert.equal(r.queue.rows().length,0);assert.equal(r.error.key,'pollFailed');
 await r.poll();assert.equal(r.error,'');assert.equal(reads,3);
});
test('legacy settlement accepts precisely the runtime fallback key used for resume',async()=>{
 const route={connectionId:'synthetic-remote',profile:'default'},atom=value=>({get:()=>value}),id='synthetic-runtime';
 const state={session_id:id,session_key:id,messages_omitted:true,running:true};let snapshot={...state,open_requests:[{id:'synthetic-question',method:'clarify'}]};
 const host={state:{connectionId:atom(route.connectionId),profile:atom(route.profile)},profileRoutes:async()=>[route],requestProfile:async(_,method,params)=>{
  if(method==='session.active_list')return {sessions:[{id,status:'waiting'}]};assert.equal(params.session_id,id);return snapshot;
 }};
 const {Runtime}=load({sdk:{host}}),r=new Runtime({storage:{get:(k,f)=>f},onEvent(){},setInterval(){},onDispose(){}});
 await r.poll();assert.equal(r.queue.rows().length,1);
 snapshot={...state,session_key:'other-key'};await r.poll();assert.equal(r.queue.rows().length,1);assert.equal(r.queue.due(Date.now()+3000).length,0);
 snapshot={...state,open_requests:[{id:'synthetic-question',method:'clarify'}]};await r.poll();
 let stops=0;r.activeKeys=[r.queue.rows()[0].key];r.player.stop=()=>{stops++;r.activeKeys=[]};
 snapshot=state;await r.poll();assert.equal(r.queue.rows().length,0);assert.equal(stops,1);
 await r.poll();assert.equal(r.queue.due(Date.now()+30000).length,0);
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
 assert.equal(translate('en','defaultPhrase'),'Your Hermes needs you now!');assert.equal(translate('pl','defaultPhrase'),'Your Hermes needs you now!');
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
test('fresh settings keep Sound signal and the same initial TTS message in every UI locale',()=>{
 for(const locale of ['en','pl','de-DE']){
  const api=load({sdk:{host:{state:{}}}}),writes=[];
  const ctx={storage:{get:(k,f)=>f,set:(k,v)=>writes.push([k,v])},i18n:{t:(key,...args)=>api.translate(locale,key,...args)},onEvent(){},setInterval(){},onDispose(){}};
  const r=new api.Runtime(ctx);
  assert.equal(r.settings.mode,'tone');assert.equal(r.settings.text,'Your Hermes needs you now!');assert.equal(writes.length,0);
 }
});
test('bundled MP3 is available offline without importing or persisting a file',async()=>{
 const writes=[],api=load({sdk:{host:{state:{}}},testAudioRecord:async(key,value)=>{assert.equal(value,undefined,'defaults must not overwrite stored audio');return undefined}});
 const ctx={storage:{get:(k,f)=>f,set:(k,v)=>writes.push([k,v])},onEvent(){},setInterval(){},onDispose(){},rest:()=>{throw Error('default audio must not use a provider')}};
 const r=new api.Runtime(ctx);await r.refreshMedia();
 assert.equal(r.media.file?.name,'synth-digital-alarm.mp3');assert.equal(r.media.file?.bundled,true);
 const data=await r.getAudio('file');assert.ok(data.url.startsWith('data:audio/mpeg;base64,'));
 const actual=Buffer.from(data.url.split(',')[1],'base64'),asset=fs.readFileSync(path.join(__dirname,'..','audio','synth-digital-alarm.mp3'));
 assert.deepEqual(actual,asset,'embedded playback must match the attributed source asset');assert.ok(actual.length>0);
 assert.equal(r.settings.mode,'tone');assert.equal(writes.length,0);assert.equal(r.note,'');assert.equal(r.error,'');
});
test('saved recordings and custom settings take precedence over bundled defaults',async()=>{
 const saved={url:'data:audio/mpeg;base64,c3ludGhldGlj',name:'synthetic-user-audio.mp3'},settings={mode:'file',text:'Keep my own message.',ttsLanguage:'pl-PL'};
 const api=load({sdk:{host:{state:{}}},testAudioRecord:async(key,value)=>{assert.equal(value,undefined);return key==='file'?saved:undefined}});
 const ctx={storage:{get:(key,fallback)=>key==='settings'?settings:fallback,set(){throw Error('defaults must not write settings')}},onEvent(){},setInterval(){},onDispose(){}};
 const r=new api.Runtime(ctx);await r.refreshMedia();assert.equal(r.media.file.name,saved.name);assert.equal(await r.getAudio('file'),saved);
 assert.equal(r.settings.mode,'file');assert.equal(r.settings.text,settings.text);assert.equal(r.settings.ttsLanguage,'pl-PL');
});
test('desktop entry uses SDK surfaces without raw host bridge access',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','plugin.js'),'utf8');
 assert.ok(!source.includes('hermesDesktop'),'catalog builds must not use the raw host bridge');
});
function previewHarness({settings=null,record,rest,request}={}){
 const pages=[],played=[],requests=[],disposers=[],timers=new Map(),audio=new Map(record?[['speech',record]]:[]);let nextTimer=0;
 class Audio {
  constructor(url){this.src=url}
  play(){played.push(this.src);setImmediate(()=>this.onended?.());return Promise.resolve()}
  pause(){} removeAttribute(){this.src=''} load(){}
 }
 const api=load({Audio,sdk:{host:{state:{},request}},useState:()=>[0,()=>{}],useRef:()=>({}),jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearTimeout:id=>timers.delete(id),
  testAudioRecord:async(key,value)=>{if(value!==undefined)audio.set(key,value);return audio.get(key)}});
 const ctx={storage:{get:(key,f)=>key==='settings'?(settings||f):f,set(){}},register(){},registerSettingsPage:p=>pages.push(p),onEvent(){},setInterval(){},onDispose:fn=>disposers.push(fn),
  rest:async(route,options)=>{requests.push([route,options]);return rest?rest(route,options):{url:'data:audio/mpeg;base64,dGVzdA=='}}};
 api.plugin.register(ctx);const wrapper=pages[0].render(),model=wrapper.props.model,nodes=[];
 const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(wrapper.type(wrapper.props));
 const mode=nodes.find(n=>n.type==='select'&&['tone','file','tts','both'].includes(n.props.value));
 return {model,played,requests,audio,timers,dispose:()=>disposers.forEach(fn=>fn()),selectMode:value=>mode.props.onChange({target:{value}})};
}
test('first TTS preview prepares the unchanged default message and caches it for later tests',async()=>{
 const h=previewHarness();assert.equal(h.requests.length,0,'opening settings must not synthesize');h.selectMode('tts');
 assert.equal(h.requests.length,0,'selecting a mode alone must not synthesize');await h.model.test();
 assert.equal(h.requests.length,1,'Test must prepare a missing recording');assert.equal(h.requests[0][0],'/synthesize');
 assert.equal(h.requests[0][1].body.text,'Your Hermes needs you now!');assert.equal(h.played.length,1);assert.equal(h.model.error,'');
 assert.equal(h.audio.get('speech').text,'Your Hermes needs you now!');await h.model.test();
 assert.equal(h.requests.length,1,'later previews must reuse cached speech');assert.equal(h.played.length,2);assert.equal(h.timers.size,0);h.dispose();
});
test('TTS preview waits for synthesis already in progress without a duplicate request',async()=>{
 let release;const h=previewHarness({rest:()=>new Promise(resolve=>release=resolve)});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 let finished=false;const preview=h.model.test().then(()=>{finished=true});await new Promise(resolve=>setImmediate(resolve));
 const finishedBeforeRecording=finished;release({url:'data:audio/mpeg;base64,dGVzdA=='});await Promise.all([preparation,preview]);
 assert.equal(finishedBeforeRecording,false,'Test must wait for the in-flight recording');assert.equal(h.requests.length,1);assert.equal(h.played.length,1);assert.equal(h.model.error,'');h.dispose();
});
for(const expired of [false,true])test(`Test waits for current speech after stale synthesis ${expired?'after':'before'} debounce expiry`,async()=>{
 const pending=[];const h=previewHarness({rest:()=>new Promise(resolve=>pending.push(resolve))});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 h.model.update({text:'Current synthetic message B'});h.model.requestAutoGenerate();
 if(expired){for(const [id,fn] of h.timers){h.timers.delete(id);fn()}}
 let finished=false;const preview=h.model.test().then(()=>{finished=true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.requests.length,1,'Test must wait for stale synthesis A before requesting B');
 pending[0]({url:'data:audio/mpeg;base64,c3RhbGU='});await preparation;await new Promise(resolve=>setImmediate(resolve));
 const waitedForB=!finished,staleCached=h.audio.has('speech'),playedBeforeB=h.played.length;
 pending[1]?.({url:'data:audio/mpeg;base64,Y3VycmVudA=='});await preview;
 assert.equal(waitedForB,true,'Test must remain pending until current speech B is prepared');
 assert.equal(h.requests.length,2,'Test must initiate or join exactly one synthesis for B');
 assert.equal(h.requests[1][1].body.text,'Current synthetic message B');assert.equal(staleCached,false);assert.equal(playedBeforeB,0);
 assert.deepEqual(h.played,['data:audio/mpeg;base64,Y3VycmVudA==']);assert.equal(h.audio.get('speech').text,'Current synthetic message B');
 assert.equal(h.model.error,'');assert.equal(h.timers.size,0);h.dispose();
});
for(const boundary of ['stale synthesis','current synthesis'])for(const cancellation of ['Stop','edit','disposal'])test(`${cancellation} while Test waits for ${boundary} prevents delayed playback`,async()=>{
 const pending=[];const h=previewHarness({rest:()=>new Promise(resolve=>pending.push(resolve))});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 h.model.update({text:'Current synthetic message B'});h.model.requestAutoGenerate();const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 if(boundary==='current synthesis'){pending[0]({url:'data:audio/mpeg;base64,c3RhbGU='});await preparation;await new Promise(resolve=>setImmediate(resolve))}
 if(cancellation==='Stop')h.model.player.stop();else if(cancellation==='edit')h.model.update({text:'New synthetic message C'});else h.dispose();
 if(boundary==='stale synthesis')pending[0]({url:'data:audio/mpeg;base64,c3RhbGU='});else pending[1]({url:'data:audio/mpeg;base64,Y3VycmVudA=='});
 await Promise.all([preparation,preview]);assert.equal(h.requests.length,boundary==='stale synthesis'?1:2);assert.equal(h.played.length,0);
 assert.equal(h.audio.has('speech'),boundary==='current synthesis'&&cancellation==='Stop');assert.equal(h.model.error,'');h.dispose();
});
test('repeated Test clicks after stale synthesis coalesce current preparation and play once',async()=>{
 const pending=[];const h=previewHarness({rest:()=>new Promise(resolve=>pending.push(resolve))});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 h.model.update({text:'Current synthetic message B'});h.model.requestAutoGenerate();const first=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 const second=h.model.test();await new Promise(resolve=>setImmediate(resolve));pending[0]({url:'data:audio/mpeg;base64,c3RhbGU='});
 await preparation;await new Promise(resolve=>setImmediate(resolve));const matching=h.model.generate({automatic:true});
 assert.equal(h.requests.length,2);assert.equal(h.audio.has('speech'),false);pending[1]({url:'data:audio/mpeg;base64,Y3VycmVudA=='});
 await Promise.all([first,second,matching]);assert.equal(h.requests.length,2);assert.deepEqual(h.played,['data:audio/mpeg;base64,Y3VycmVudA==']);assert.equal(h.model.error,'');h.dispose();
});
for(const failed of ['stale','current'])test(`Test handles a ${failed} backend failure after a speech-key change without retries`,async()=>{
 const pending=[];const h=previewHarness({rest:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 h.model.update({text:'Current synthetic message B'});h.model.requestAutoGenerate();
 for(const [id,fn] of h.timers){h.timers.delete(id);fn()}
 const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 if(failed==='stale')pending[0].reject(Error('Synthetic stale failure'));else pending[0].resolve({url:'data:audio/mpeg;base64,c3RhbGU='});
 await preparation;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests.length,2);assert.equal(h.audio.has('speech'),false);
 if(failed==='current')pending[1].reject(Error('Synthetic current failure'));else pending[1].resolve({url:'data:audio/mpeg;base64,Y3VycmVudA=='});
 await preview;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests.length,2);assert.equal(h.timers.size,0);
 if(failed==='current'){assert.equal(h.played.length,0);assert.equal(h.audio.has('speech'),false);assert.equal(h.model.error.key,'generateFailed');assert.ok(h.model.error.args[0].includes('Synthetic current failure'))}
 else{assert.deepEqual(h.played,['data:audio/mpeg;base64,Y3VycmVudA==']);assert.equal(h.model.error,'')}
 h.dispose();
});
test('Test waits for the captured current language after stale synthesis',async()=>{
 const pending=[];const h=previewHarness({rest:route=>route==='/capabilities'?Promise.resolve({languages:['de-DE']}):new Promise(resolve=>pending.push(resolve))});h.selectMode('tts');
 const preparation=h.model.generate({automatic:true});await new Promise(resolve=>setImmediate(resolve));
 h.model.update({ttsLanguage:'de-DE'});h.model.requestAutoGenerate();const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 pending[0]({url:'data:audio/mpeg;base64,c3RhbGU='});await preparation;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.audio.has('speech'),false);assert.equal(h.played.length,0);assert.equal(h.requests.length,3);assert.equal(h.requests[2][1].body.language,'de-DE');
 pending[1]({url:'data:audio/mpeg;base64,Y3VycmVudA==',language:'de-DE'});await preview;
 assert.equal(h.audio.get('speech').language,'de-DE');assert.deepEqual(h.played,['data:audio/mpeg;base64,Y3VycmVudA==']);assert.equal(h.model.error,'');h.dispose();
});
test('stopping a TTS preview before its cache lookup finishes does not start synthesis',async()=>{
 const h=previewHarness();h.selectMode('tts');const preview=h.model.test();h.model.player.stop();await preview;
 assert.equal(h.requests.length,0,'a cancelled preview must not contact the TTS provider');assert.equal(h.played.length,0);h.dispose();
});
test('TTS preview preserves backend failures instead of reporting a changed message',async()=>{
 const h=previewHarness({rest:async()=>{throw Error('Synthetic helper unavailable')}});h.selectMode('tts');await h.model.test();
 assert.equal(h.requests.length,1);assert.equal(h.played.length,0);assert.equal(h.model.error.key,'generateFailed');
 assert.ok(h.model.error.args[0].includes('Synthetic helper unavailable'));assert.equal(h.timers.size,0,'failures must not schedule retries');h.dispose();
});
test('TTS preview plays successful synthesis while preserving a concurrent polling failure',async()=>{
 let release;const polled=[],h=previewHarness({rest:()=>new Promise(resolve=>release=resolve),request:async method=>{polled.push(method);throw Error('Synthetic poll unavailable')}});h.selectMode('tts');
 const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));await h.model.poll();
 assert.deepEqual(polled,['session.active_list']);assert.equal(h.model.error.key,'pollFailed');const diagnostic=h.model.error;
 release({url:'data:audio/mpeg;base64,dGVzdA=='});await preview;
 assert.equal(h.requests.length,1);assert.equal(h.audio.get('speech').text,h.model.settings.text);assert.equal(h.audio.get('speech').language,h.model.settings.ttsLanguage);
 assert.deepEqual(h.played,['data:audio/mpeg;base64,dGVzdA=='],'a polling banner must not prevent successful speech playback');
 assert.equal(h.model.error,diagnostic,'successful preview must retain the unrelated polling diagnostic');h.dispose();
});
test('TTS preview reports its own synthesis failure when polling overwrites the shared error before task resumption',async()=>{
 let rejectSynthesis,pollTask,TaskPromise;const h=previewHarness({rest:()=>new Promise((resolve,reject)=>rejectSynthesis=reject),request:()=>{throw Error('Unexpected host request')}});h.selectMode('tts');
 // A same-realm rejection lets poll() update the banner before the synthesis waiter resumes.
 const polled=[];h.model.rpc=(scope,method)=>{polled.push(method);return TaskPromise.reject(Error('Synthetic concurrent poll failure'))};
 h.model.listeners.add(()=>{if(!h.model.generating&&h.model.error?.key==='generateFailed'&&!pollTask)pollTask=h.model.poll()});
 const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));TaskPromise=h.model.synthesisTask.constructor;rejectSynthesis(Error('Synthetic synthesis unavailable'));
 await preview;await pollTask;
 assert.deepEqual(polled,['session.active_list']);assert.equal(h.requests.length,1);assert.equal(h.audio.has('speech'),false);assert.equal(h.played.length,0);
 assert.equal(h.model.error.key,'generateFailed','preview must use its task outcome, not the background error banner');
 assert.ok(h.model.error.args[0].includes('Synthetic synthesis unavailable'));assert.equal(h.timers.size,0);h.dispose();
});
test('TTS preview rejects empty text without contacting a provider',async()=>{
 const h=previewHarness({settings:{mode:'tts',text:'   '}});await h.model.test();assert.equal(h.requests.length,0);assert.equal(h.played.length,0);assert.equal(h.model.error.key,'textRequired');h.dispose();
});
test('TTS preview replaces a recording for the wrong language and preserves explicit locale requests',async()=>{
 const h=previewHarness({settings:{mode:'tts',text:'Synthetic notice',ttsLanguage:'pl-PL'},record:{url:'data:audio/mpeg;base64,b2xk',text:'Synthetic notice',language:'en-US'},
  rest:async(route,options)=>route==='/capabilities'?{languages:['pl-PL']}:{url:'data:audio/mpeg;base64,bmV3',language:options.body.language}});
 await h.model.test();assert.equal(h.requests.length,2);assert.equal(h.requests[0][0],'/capabilities');assert.equal(h.requests[1][1].body.language,'pl-PL');
 assert.equal(h.audio.get('speech').language,'pl-PL');assert.deepEqual(h.played,['data:audio/mpeg;base64,bmV3']);assert.equal(h.model.error,'');h.dispose();
});
test('TTS preview reuses an existing recording even when the helper is unavailable',async()=>{
 const h=previewHarness({record:{url:'data:audio/mpeg;base64,dGVzdA==',text:'Your Hermes needs you now!',language:'auto'},rest:async()=>{throw Error('Helper must not be contacted')}});
 h.selectMode('tts');await h.model.test();assert.equal(h.requests.length,0);assert.equal(h.played.length,1);assert.equal(h.model.error,'');h.dispose();
});
test('Stop during TTS preparation prevents delayed playback but retains the prepared recording',async()=>{
 let release;const h=previewHarness({rest:()=>new Promise(resolve=>release=resolve)});h.selectMode('tts');const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 h.model.player.stop();release({url:'data:audio/mpeg;base64,dGVzdA=='});await preview;assert.equal(h.requests.length,1);assert.equal(h.played.length,0);assert.ok(h.audio.get('speech'));h.dispose();
});
test('editing text during a TTS preview rejects stale output and cancels playback',async()=>{
 let release;const h=previewHarness({rest:()=>new Promise(resolve=>release=resolve)});h.selectMode('tts');const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 h.model.update({text:'New synthetic message'});release({url:'data:audio/mpeg;base64,dGVzdA=='});await preview;
 assert.equal(h.requests.length,1);assert.equal(h.played.length,0);assert.equal(h.audio.has('speech'),false);assert.equal(h.model.error,'');h.dispose();
});
test('disposal during a TTS preview prevents saving or playing the late recording',async()=>{
 let release;const h=previewHarness({rest:()=>new Promise(resolve=>release=resolve)});h.selectMode('tts');const preview=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 h.dispose();release({url:'data:audio/mpeg;base64,dGVzdA=='});await preview;assert.equal(h.played.length,0);assert.equal(h.audio.has('speech'),false);assert.equal(h.model.error,'');
});
test('repeated Test clicks share in-flight synthesis and play only the latest preview',async()=>{
 let release;const h=previewHarness({rest:()=>new Promise(resolve=>release=resolve)});h.selectMode('tts');const first=h.model.test();await new Promise(resolve=>setImmediate(resolve));
 const second=h.model.test();await new Promise(resolve=>setImmediate(resolve));release({url:'data:audio/mpeg;base64,dGVzdA=='});await Promise.all([first,second]);
 assert.equal(h.requests.length,1);assert.equal(h.played.length,1);assert.equal(h.model.error,'');h.dispose();
});
test('combined previews prepare speech while file previews never request TTS',async()=>{
 const h=previewHarness();let tones=0;h.model.player.tone=async()=>{tones++};h.selectMode('both');await h.model.test();
 assert.equal(tones,1);assert.equal(h.requests.length,1);assert.equal(h.played.length,1);h.dispose();
 const file=previewHarness();file.selectMode('file');await file.model.test();assert.equal(file.requests.length,0);assert.equal(file.played.length,1);assert.equal(file.model.error,'');file.dispose();
});
module.exports={load,event};
