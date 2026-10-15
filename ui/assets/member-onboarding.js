/* Contact verification is owned by the configured identity service, never by the office nickname. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZEROOnboarding=api;})(typeof window==='object'?window:globalThis,function(root){
'use strict';
const mounted=new WeakMap();
const errors={AUTH_PROVIDER_UNAVAILABLE:'인증 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',AUTH_TOKEN_INVALID:'인증 시간이 지났습니다. 다른 방법 선택을 눌러 다시 인증해 주세요.',AUTH_IDENTITY_CONFLICT:'이미 다른 계정에 연결된 인증입니다. 기존 계정에서 로그아웃한 뒤 다시 로그인해 주세요.',AUTH_SEND_FAILED:'인증번호를 보내지 못했습니다. 연락처와 연결 상태를 확인해 주세요.',AUTH_VERIFY_FAILED:'인증번호를 확인하지 못했습니다. 번호를 확인하거나 다시 요청해 주세요.',AUTH_METHOD_UNPROVEN:'이 인증 방법을 확인하지 못했습니다. 다른 방법으로 다시 인증해 주세요.',AUTH_RATE_LIMITED:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',AUTH_CODE_INVALID:'인증번호를 확인해 주세요.',AUTH_OTP_INVALID:'인증번호를 확인해 주세요.',AUTH_EXPIRED:'인증 시간이 지났습니다. 처음부터 다시 인증해 주세요.',AUTH_NOT_CONFIGURED:'인증 서비스 연결을 준비하고 있습니다.',AUTH_DISABLED:'이 인증 방법은 아직 연결되지 않았습니다.',AUTH_CONTACT_INVALID:'이메일 또는 휴대폰 번호를 확인해 주세요.',AUTH_CAPTCHA_REQUIRED:'인증 서비스의 보안 확인 설정이 필요합니다.',NICK_TAKEN:'이미 사용 중인 닉네임입니다.',NICK_INVALID:'닉네임은 2~12자의 한글·영문·숫자·밑줄로 입력해 주세요.',NICK_RESERVED:'사용할 수 없는 닉네임입니다.'};
const message=e=>errors[e?.code]||'지금은 인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
function mount(target,options){
 mounted.get(target)?.destroy();const doc=root.document,client=options.client||root.ZEROMemberAuth;
 const box=doc.createElement('div');box.className='member-onboarding';target.replaceChildren(box);
 let alive=true,epoch=0,timer=null,config=null,contact=null,accessToken=null,method=null;
 const node=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const active=turn=>alive&&epoch===turn&&options.active()!==false;
 const stop=()=>{root.clearInterval(timer);timer=null;};
 function screen(title,sub){epoch++;stop();box.querySelectorAll('input').forEach(input=>{input.value='';});options.title.textContent=title;options.subtitle.textContent=sub;box.replaceChildren();return epoch;}
 function button(text,cls='secondary-button'){const e=node('button',cls,text);e.type='button';return e;}
 function status(){const e=node('p','member-status');e.setAttribute('role','status');e.setAttribute('aria-live','polite');return e;}
 function field(label,type,props){const wrap=node('label','member-field'),input=node('input');input.type=type;Object.assign(input,props);wrap.append(node('span','',label),input);return {wrap,input};}
 function back(){const e=button('다른 방법 선택','member-back');e.addEventListener('click',welcome);return e;}
 function icon(kind){const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('aria-hidden','true');
 const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='email'?'M4 5h16v14H4z M4 6l8 6 8-6':kind==='phone'?'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z M10 17h4':'M8 8a4 4 0 108 0 4 4 0 00-8 0 M4 21v-2a8 8 0 0116 0v2');svg.append(path);return svg;}
 function choice(kind,label,description,action){const b=button('','member-choice');b.dataset.method=kind;const copy=node('span','member-choice-copy');copy.append(node('strong','',label),node('small','',description));b.append(icon(kind),copy);b.addEventListener('click',action);return {button:b,detail:copy.children[1]};}
 function welcome(){
  const turn=screen('ZERO 시작하기','회원 로그인 또는 방문자 체험을 선택하세요.');contact=null;accessToken=null;method=null;
  const choices=node('div','member-choices'),email=choice('email','이메일로 계속','인증번호로 가입 · 로그인',()=>identify('email')),phone=choice('phone','휴대폰으로 계속','문자 인증으로 가입 · 로그인',()=>identify('phone'));
  choices.append(email.button,phone.button);const guest=choice('guest','방문자로 체험하기','닉네임만 입력 · 이 기기에서 체험',visitor),note=status(),retry=button('인증 연결 다시 확인');
  const load=async()=>{retry.disabled=true;note.textContent='인증 방법을 확인하고 있습니다.';try{const result=await options.loadConfig();if(!active(turn))return;config=result;note.textContent=result.email_enabled||result.phone_enabled?'처음 가입과 다시 로그인 모두 같은 방법을 사용합니다.':'인증 서비스 연결 전입니다. 방문자로 먼저 체험하세요.';email.detail.textContent=result.email_enabled?'인증번호로 가입 · 로그인':'인증 서비스 연결 준비 중';phone.detail.textContent=result.phone_enabled?'문자 인증으로 가입 · 로그인':'문자 인증 서비스 연결 준비 중';}catch(_){if(active(turn))note.textContent='인증 연결을 확인하지 못했습니다. 다시 확인하거나 방문자로 체험하세요.';}finally{if(active(turn))retry.disabled=false;}};
  retry.addEventListener('click',load);const legacy=node('details','member-legacy');legacy.append(node('summary','','이전 방문자 데이터 불러오기'));const recover=button('기존 복구 코드 사용');recover.addEventListener('click',()=>{controller.destroy();options.onRecover();});legacy.append(recover);
  box.append(choices,node('p','member-separator','또는'),guest.button,node('p','member-privacy','방문자 닉네임은 전광판·수익률 랭킹에 등록되지 않습니다. 인증한 회원의 연락처도 공개되지 않습니다.'),note,retry,legacy);load();
 }
 function visitor(){
  screen('방문자로 둘러보기','회원가입 없이 사무실과 주식 입문 학교를 체험하세요.');const f=field('방문자 닉네임','text',{maxLength:12,autocomplete:'nickname',placeholder:'예: 아침연구원',value:options.guestName||''}),note=status(),go=button('방문자로 입장','primary-button'),form=node('form','member-form');go.type='submit';
  form.addEventListener('submit',event=>{event.preventDefault();const nick=f.input.value.trim(),problem=options.nickProblem(nick);if(problem){note.textContent=problem;return;}options.onGuest(nick);});
  form.append(f.wrap,node('p','member-privacy','이 기기에 닉네임만 저장합니다. 전광판 등록과 회원 데이터 저장에는 이메일 또는 휴대폰 인증이 필요합니다.'),note,go);box.append(form,back());f.input.focus?.();
 }
 function identify(next){
  method=next;const name=next==='email'?'이메일':'휴대폰',enabled=config?.[next+'_enabled']===true;
  const turn=screen(name+'로 계속',enabled?'인증번호로 간편하게 가입하고 로그인하세요.':'인증 서비스 연결을 준비하고 있습니다.');
  if(!enabled||!client){box.append(node('p','member-privacy',name+' 인증 연결 후 사용할 수 있습니다. 방문자 체험은 지금 이용할 수 있습니다.'),back());return;}
  const f=field(next==='email'?'이메일 주소':'휴대폰 번호',next==='email'?'email':'tel',{autocomplete:next==='email'?'email':'tel',placeholder:next==='email'?'name@example.com':'010-1234-5678',maxLength:254}),form=node('form','member-form'),go=button('인증번호 받기','primary-button'),note=status();go.type='submit';let busy=false;
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;let normalized;try{normalized=client.normalizeContact(next,f.input.value);}catch(error){note.textContent=message(error);return;}busy=true;go.disabled=true;note.textContent='인증번호를 요청하고 있습니다.';
   try{await client.sendCode(config,next,normalized);if(!active(turn))return;contact=normalized;f.input.value='';code();}catch(error){if(active(turn))note.textContent=message(error);}finally{busy=false;if(active(turn))go.disabled=false;}});
  form.append(f.wrap,node('p','member-privacy','연락처는 인증 제공업체에서 처리하며 ZERO 전광판에는 공개되지 않습니다.'),note,go);box.append(form,back());f.input.focus?.();
 }
 function code(){
  const turn=screen('인증번호를 입력해 주세요',method==='email'?'입력한 이메일로 인증번호를 보냈습니다.':'입력한 휴대폰으로 인증번호를 보냈습니다.'),form=node('form','member-form'),f=field('인증번호','text',{inputMode:'numeric',autocomplete:'one-time-code',maxLength:10,placeholder:'인증번호'}),go=button('인증하고 계속','primary-button'),resend=button('인증번호 다시 받기'),note=status();go.type='submit';let busy=false,until=Date.now()+60000;
  const tick=()=>{const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));resend.disabled=busy||!!accessToken||seconds>0;resend.textContent=seconds?'재전송까지 '+seconds+'초':'인증번호 다시 받기';};tick();timer=root.setInterval(tick,1000);
  resend.addEventListener('click',async()=>{if(busy||accessToken||Date.now()<until)return;busy=true;tick();try{await client.sendCode(config,method,contact);if(active(turn)){until=Date.now()+60000;note.textContent='인증번호를 다시 보냈습니다.';}}catch(error){if(active(turn))note.textContent=message(error);}finally{busy=false;if(active(turn))tick();}});
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;go.disabled=true;tick();note.textContent='인증번호를 확인하고 있습니다.';
   try{if(accessToken){await complete(undefined,turn);return;}const verified=await client.verifyCode(config,method,contact,f.input.value.trim());if(!active(turn))return;accessToken=verified.access_token;contact=null;f.input.value='';await complete(undefined,turn);}catch(error){if(active(turn))note.textContent=message(error);}finally{busy=false;if(active(turn)){go.disabled=false;tick();}}});
  form.append(f.wrap,note,go);box.append(form,resend,back());f.input.focus?.();
 }
 async function complete(nick,turn){
  try{const result=await options.complete(method,accessToken,nick);if(!active(turn))return;accessToken=null;contact=null;stop();await options.onMember(result);}
  catch(error){if(!active(turn))return;if(['NICK_REQUIRED','AUTH_NICK_REQUIRED'].includes(error?.code)){nickname();return;}throw error;}
 }
 function nickname(){
  const turn=screen('사용할 닉네임을 정해 주세요','인증을 마쳤습니다. 전광판에 표시할 이름을 정하세요.'),form=node('form','member-form'),f=field('회원 닉네임','text',{maxLength:12,autocomplete:'nickname',placeholder:'2~12자',value:options.memberNick||options.guestName||''}),note=status(),go=button('가입 완료','primary-button');go.type='submit';let busy=false;
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const value=f.input.value.trim(),problem=options.nickProblem(value);if(problem){note.textContent=problem;return;}busy=true;go.disabled=true;note.textContent='닉네임을 확인하고 있습니다.';try{await complete(value,turn);}catch(error){if(active(turn))note.textContent=message(error);}finally{busy=false;if(active(turn))go.disabled=false;}});
  form.append(f.wrap,node('p','member-privacy','회원 닉네임은 다른 회원과 중복될 수 없습니다. 인증 회원 자격과 투자 수익률 검증은 별개입니다.'),note,go);box.append(form,back());f.input.focus?.();
 }
 const controller={destroy(){if(!alive)return;alive=false;epoch++;stop();contact=null;accessToken=null;box.querySelectorAll('input').forEach(input=>{input.value='';});box.remove();mounted.delete(target);}};
 mounted.set(target,controller);welcome();return controller;
}
return Object.freeze({mount});
});
