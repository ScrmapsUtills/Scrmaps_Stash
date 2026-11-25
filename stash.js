(()=>{
'use strict';
if(new URLSearchParams(location.search).get('tab')!=='stash')return;
const host=document.createElement('aside');document.body.append(host);
const ui=host.attachShadow({mode:'closed'});
ui.innerHTML=`<style>:host{all:initial;position:fixed;bottom:12px;right:12px;z-index:2147483646;font:14px system-ui;color:#ebfaff}details{background:#12222c;border:1px solid #456777;border-radius:8px;padding:10px;width:285px}summary{cursor:pointer;font-weight:bold}label,small,output{display:block;margin:10px 0}input{max-width:100%}label:has(input[type=file]){padding:8px;border:1px dashed #6096a8;border-radius:6px}button{cursor:pointer;padding:5px 10px}pre{max-height:100px;overflow:auto;font:12px system-ui;white-space:pre-wrap}</style><details><summary>보관함 일괄 등록</summary><small>아래 두 사진 칸에 파일을 끌어놓거나 선택하세요. 파일명 숫자순으로 등록합니다. 각 묶음의 인증 사진을 같은 순서로 선택하세요. 인증 사진 하나를 공통으로 쓰려면 아래에 체크하세요.</small><label>아이템 코드 사진 (여러 장)<input id="items" type="file" multiple accept="image/*"></label><label>아이템 보관 후 받은 인증 코드 사진<input id="auth" type="file" multiple accept="image/*"></label><label><input id="shared" type="checkbox"> 같은 인증 코드로 모두 등록</label><pre></pre><button id="run">순서대로 등록</button> <button id="stop" disabled>중지</button><output></output></details>`;
const q=s=>ui.querySelector(s), msg=t=>q('output').textContent=t;
const sorted=id=>Array.from(q(id).files).sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
let skipped=0,unconfirmed=0;
let queue=[],cursor=0,running=false,stop=false,uncertain=false;
function prepare(){
 const items=sorted('#items'),auth=sorted('#auth'),shared=q('#shared').checked;
 cursor=0;skipped=0;unconfirmed=0;uncertain=false;queue=[];
 if(!items.length||auth.length!==(shared?1:items.length)){q('pre').textContent='';msg('아이템·인증 사진 개수를 확인하세요.');return;}
 queue=items.map((item,i)=>({item,auth:auth[shared?0:i]}));
 q('pre').textContent=queue.map((v,i)=>(i+1)+'. '+v.item.name+' / '+v.auth.name).join('\n');msg(queue.length+'묶음 준비됨');
}
for(const el of ui.querySelectorAll('input'))el.onchange=prepare;
for(const input of ui.querySelectorAll('input[type=file]')){
 const box=input.closest('label');
 box.ondragover=e=>{e.preventDefault();e.stopPropagation();};
 box.ondrop=e=>{
  e.preventDefault();e.stopPropagation();
  if(running)return;
  const files=Array.from(e.dataTransfer.files);
  if(!files.length||files.some(f=>!f.type.startsWith('image/')&&!/\.(png|jpe?g|bmp|webp)$/i.test(f.name))){
   msg('이미지 파일을 끌어놓으세요.');return;
  }
  input.files=e.dataTransfer.files;prepare();
 };
}
const clean=t=>(t||'').replace(/\s+/g,' ').trim();
const shown=e=>!!e.getClientRects().length;
const titles=['아이템 코드','인증 코드'];
// The site keeps this heading above each photo, including after OCR.
function zones(){
 const button=[...document.querySelectorAll('button')].find(b=>shown(b)&&clean(b.textContent)==='보관함에 등록');
 for(let root=button?.parentElement;root;root=root.parentElement){
  const files=[...root.querySelectorAll('input[type=file]')].filter(f=>!f.accept||/image|png|jpe?g/i.test(f.accept));
  const labels=[...root.querySelectorAll('*')].filter(e=>shown(e)&&clean(e.textContent).replace(/\s/g,'')==='스크린샷으로자동입력');
  const anchors=labels.filter(e=>!labels.some(other=>other!==e&&e.contains(other)));
  const pair=anchors.length===2?anchors:files.length===2?files:null;
  if(!pair)continue;
  return pair.map((el,i)=>{
   let area=el;
   while(area.parentElement&&!area.parentElement.contains(pair[1-i]))area=area.parentElement;
   const file=el.matches('input[type=file]')?el:area.querySelector('input[type=file]');
   const drop=[...area.querySelectorAll('*')].find(x=>shown(x)&&!x.children.length&&/끌어다|끌어놓/.test(x.textContent))||el;
   return {file,drop,area};
  });
 }
 throw Error('두 사진 영역이 보이는 보관함 등록 창을 열어 주세요.');
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(){if(stop)throw Error('중지했습니다.');if(new URLSearchParams(location.search).get('tab')!=='stash'||location.pathname!=='/class-rpg')throw Error('보관함 탭이 변경되었습니다.');}
function replacement(area){
 const matches=[...area.querySelectorAll('*')].filter(el=>shown(el)&&clean(el.textContent)==='다른 사진 고르기');
 return matches.find(el=>!matches.some(child=>child!==el&&el.contains(child)));
}
function currentCode(area){
 const field=[...area.querySelectorAll('input:not([type]),input[type=text],textarea')].find(el=>shown(el)&&el.maxLength!==1&&el.value.trim());
 return field?.value.trim()||'';
}
async function photoZone(index){
 let zone=zones()[index];
 const control=replacement(zone.area);
 if(!control)return zone;
 control.click();
 for(let step=0;step<100;step++){
  check();
  zone=zones()[index];
  if(!replacement(zone.area))return zone;
  await sleep(50);
 }
 throw Error(titles[index]+'의 다른 사진 고르기 화면이 열리지 않았습니다.');
}
async function recognize(title,image){
 check();
 const index=titles.indexOf(title), zone=await photoZone(index);
 const ready='아래 칸에 입력했습니다';
 const dt=new DataTransfer();dt.items.add(image);
 let finished=false;
 function inspect(records){
  for(const r of records){
   if(r.type==='characterData'&&!String(r.oldValue||'').includes(ready)&&r.target.textContent.includes(ready))finished=true;
   if(r.type==='childList'&&[...r.addedNodes].some(n=>n.textContent?.includes(ready)))finished=true;
  }
 }
 const observer=new MutationObserver(inspect);
 observer.observe(zone.area,{subtree:true,childList:true,characterData:true,characterDataOldValue:true});
 const code=area=>[...area.querySelectorAll('input:not([type]),input[type=text],textarea')].filter(e=>shown(e)&&e.maxLength!==1).map(e=>e.value.trim()).filter(Boolean);
 const before=code(zone.area).join('|');
 let cleared=!before;
 try{
  if(zone.file){
   zone.file.value='';zone.file.files=dt.files;
   for(const type of ['input','change'])zone.file.dispatchEvent(new Event(type,{bubbles:true,composed:true}));
  }else{
   for(const type of ['dragenter','dragover','drop'])zone.drop.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true,composed:true}));
  }
  for(let i=0;i<240;i++){
   await sleep(250);check();
   const area=zone.area.isConnected?zone.area:zones()[index].area;
   const value=code(area).join('|');
   if(!value)cleared=true;
   if((finished||area!==zone.area||cleared||value!==before)&&clean(area.textContent).includes(ready)&&
      (finished||area!==zone.area||!!value))return currentCode(area);
  }
  throw Error(title+' · '+image.name+' 인식 완료를 확인하지 못했습니다.');
 }finally{observer.disconnect();}
}
const success='보관함에 들어왔습니다.';
function resultKind(message){
 if(/이미|중복/.test(message)&&/보관|등록|사용된? 아이템|사용된? 코드|사용한 코드/.test(message))return 'duplicate';
 if(message.includes(success))return 'success';
 return 'other';
}
function notices(button){
 // Result text appears after the submit button. Ignore text in other settings panels.
 const texts=new Set();
 for(let row=button;row&&row!==document.body;row=row.parentElement){
  for(let el=row.nextElementSibling;el;el=el.nextElementSibling){
   if(el.matches('section,form,details')||el.querySelector('button,input,select,h1,h2,h3,h4'))break;
   const value=clean(el.textContent);
   if(shown(el)&&value&&value.length<=300)texts.add(value);
  }
  if(row.querySelector('input,textarea'))break;
 }
 for(const el of document.querySelectorAll('[role=alert],[role=status]')){
  if(shown(el)&&clean(el.textContent))texts.add(clean(el.textContent));
 }
 return texts;
}
async function submit(){
 const findButton=()=>Array.from(document.querySelectorAll('button')).find(b=>shown(b)&&clean(b.textContent)==='보관함에 등록');
 const button=findButton();
 if(!button||button.disabled)throw Error('등록 버튼 상태를 확인하세요.');
 const before=notices(button);
 const previous=new Set(before);
 uncertain=true;
 button.click();
 for(let i=0;i<200;i++){
  await sleep(100);check();
  const active=findButton();
  if(!active)continue;
  const current=notices(active);
  const fresh=[...current].filter(text=>!previous.has(text));
  for(const text of before)if(!current.has(text))previous.delete(text);
  const error=fresh.find(text=>resultKind(text)==='other');
  if(error){uncertain=false;throw Error(error);}
  if(active.disabled||active.getAttribute('aria-busy')==='true')continue;
  let result;
  if(fresh.some(text=>resultKind(text)==='duplicate'))result='duplicate';
  else if(fresh.some(text=>resultKind(text)==='success'))result='success';
  else if(i>=7&&[...current].some(text=>resultKind(text)!=='other'))result='unconfirmed';
  if(result){uncertain=false;return result;}
 }
 throw Error('등록 결과를 확인하지 못했습니다.');
}
q('#stop').onclick=()=>{stop=true;};
q('#run').onclick=async()=>{
 if(selling||running||!queue.length||cursor>=queue.length)return;
 if(uncertain){msg('직전 묶음의 등록 여부를 보관함에서 확인하고, 남은 사진만 다시 선택하세요.');return;}
 running=true;stop=false;q('#run').disabled=true;q('#stop').disabled=false;for(const e of ui.querySelectorAll('input'))e.disabled=true;
 let sharedCode='';
 try{while(cursor<queue.length){check();const v=queue[cursor],prefix=(cursor+1)+'/'+queue.length+' ';
 msg(prefix+'아이템 사진 인식 중');await recognize('아이템 코드',v.item);
 const shared=q('#shared').checked;
 if(!shared||!sharedCode||currentCode(zones()[1].area)!==sharedCode){
  msg(prefix+'인증 사진 인식 중');sharedCode=await recognize('인증 코드',v.auth);
 }
 check();
 msg(prefix+'등록 결과 대기 중');const result=await submit();cursor++;
 if(result==='duplicate')skipped++;
 if(result==='unconfirmed')unconfirmed++;
 }msg(cursor+'묶음 처리 · 등록 '+(cursor-skipped-unconfirmed)+' · 중복 건너뜀 '+skipped+' · 결과 미확인 '+unconfirmed);}catch(e){msg('완료 '+cursor+'/'+queue.length+' · '+e.message+(uncertain?' 직전 묶음의 등록 여부를 확인하세요.':''));}
 finally{running=false;q('#run').disabled=false;q('#stop').disabled=true;for(const e of ui.querySelectorAll('input'))e.disabled=false;}
};
const saleBox=document.createElement('details');
saleBox.innerHTML='<summary>룬 판매</summary><small>보관함에서 판매할 룬을 클릭하세요. 보유량보다 큰 수를 입력하면 해당 룬을 모두 판매합니다.</small><label>판매 개수 <input type="number" value="1" min="1" step="1" style="width:5em"></label><button type="button">같은 룬 판매</button> <button type="button" disabled>중지</button><output></output>';
ui.append(saleBox);
const [sellRun,sellStop]=saleBox.querySelectorAll('button');
const quantity=saleBox.querySelector('input'),saleStatus=saleBox.querySelector('output');
const saleCooldownMs=10000;
const saleTimeKey='scrmaps-stash:last-sale-click';
let lastSaleClick=Number(sessionStorage.getItem(saleTimeKey))||0;
function markSaleClick(){
 lastSaleClick=Date.now();
 sessionStorage.setItem(saleTimeKey,String(lastSaleClick));
}
let pick=null,selling=false,cancelSale=false;
function iconKey(tile){
 const image=tile.matches('img')?tile:tile.querySelector('img');
 if(image)return image.currentSrc||image.src;
 for(const el of [tile,...tile.querySelectorAll('*')]){
  const bg=getComputedStyle(el).backgroundImage;
  if(bg.includes('url('))return bg+' '+getComputedStyle(el).backgroundPosition;
 }
 return '';
}
function runeDetails(){
 const matches=[...document.querySelectorAll('button')].filter(b=>shown(b)&&/^팔기\s*[·ㆍ•]\s*[\d,]+\s*크레딧(?:$|[\s(·])/.test(clean(b.textContent)));
 if(matches.length!==1)return null;
 const button=matches[0];
 for(let box=button.parentElement;box&&box!==document.body;box=box.parentElement){
  if(box.querySelectorAll('img').length>1)break;
  const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);
  const names=new Set();
  while(walker.nextNode()){
   const m=clean(walker.currentNode.nodeValue).match(/^([가-힣A-Za-z0-9]+\s*룬)(?:\s+(?:일반|매직|레어|에픽|전설|유니크|신화))?$/);
   if(m)names.add(m[1]);
  }
  if(names.size===1)return {name:[...names][0],price:'팔기 · '+button.textContent.match(/([\d,]+)\s*크레딧/)[1].replace(/,/g,'')+' 크레딧',button,box};
 }
 return null;
}
function saleTimer(text){
 const lines=text.split(/\n/).map(clean);
 for(const line of lines){
  const match=line.match(/(\d+(?:\.\d+)?)\s*초/);
  if(match)return {seconds:Math.ceil(Number(match[1])),ready:false};
 }
 return {seconds:null,ready:lines.some(line=>line.includes('지금 다시 시도할 수 있습니다'))};
}
function tileAt(target){
 for(let el=target;el&&el!==document.body;el=el.parentElement){
  const grid=el.parentElement;
  if(!grid)break;
  const rect=el.getBoundingClientRect();
  if(rect.width<20||Math.abs(rect.width-rect.height)>8)continue;
  if(grid.children.length<2||!iconKey(el))continue;
  const peers=[...grid.children].filter(p=>Math.abs(p.getBoundingClientRect().width-rect.width)<3);
  if(peers.length>=2)return {grid,el};
 }
 return null;
}
document.addEventListener('click',event=>{
 if(!event.isTrusted||event.composedPath().includes(host))return;
 const manualButton=event.target.closest?.('button');
 if(manualButton&&manualButton===runeDetails()?.button)markSaleClick();
 const tile=tileAt(event.target);
 if(selling){cancelSale=true;return;}
 pick=null;
 if(!tile)return;
 const key=iconKey(tile.el);
 setTimeout(()=>{
  const info=runeDetails();
  if(!info||!tile.grid.isConnected||!(tile.grid.compareDocumentPosition(info.button)&Node.DOCUMENT_POSITION_FOLLOWING))return;
  pick={grid:tile.grid,key,name:info.name,price:info.price};
  saleStatus.textContent=info.name+' · '+info.price;
 },0);
},true);
sellStop.onclick=()=>{cancelSale=true;};
sellRun.onclick=async()=>{
 if(selling||running)return;
 const selected=pick,n=quantity.valueAsNumber;
 if(!selected||!Number.isSafeInteger(n)||n<1){saleStatus.textContent='보관함의 룬을 클릭하고 판매 개수를 입력하세요.';return;}
 const tiles=()=>[...selected.grid.children].filter(el=>shown(el)&&iconKey(el)===selected.key);
 const valid=info=>info&&info.name===selected.name&&info.price===selected.price;
 const target=Math.min(n,tiles().length);
 let sold=0;
 selling=true;cancelSale=false;sellRun.disabled=true;sellStop.disabled=false;
 try{
  if(!selected.grid.isConnected||!valid(runeDetails()))throw Error('판매할 룬을 다시 선택하세요.');
  if(!target)throw Error('판매 가능한 룬이 없습니다.');
  while(sold<target){
   checkSale();
   const candidates=tiles(),count=candidates.length;
   if(!count)throw Error('판매 가능한 룬이 없습니다.');
   if(!valid(runeDetails()))candidates[0].click();
   await sleep(150);
   checkSale();
   const waitStarted=Date.now();
   let sawCountdown=false;
   let missingSince=null;
   let reselected=false;
   let info;
   while(true){
    checkSale();
    info=runeDetails();
    if(Date.now()-waitStarted>120000)throw Error('룬 판매 창을 확인하세요.');
    if(!valid(info)){
     missingSince??=Date.now();
     saleStatus.textContent=selected.name+' 판매 '+sold+'/'+target+' · 룬 정보 갱신 대기 중';
     if(Date.now()-lastSaleClick>=saleCooldownMs&&Date.now()-missingSince>=2000){
      if(reselected){
       const detail=info?info.name+' · '+info.price:'판매 정보 없음';
       throw Error('선택한 '+selected.name+' 판매 중지 ('+detail+').');
      }
      const next=tiles()[0];
      if(!next)throw Error('판매 가능한 룬이 없습니다.');
      next.click();
      reselected=true;
      missingSince=Date.now();
     }
     await sleep(200);
     continue;
    }
    missingSince=null;
    const timer=saleTimer(info.box.innerText);
    const fallback=Math.max(0,Math.ceil((lastSaleClick+saleCooldownMs-Date.now())/1000));
    if(timer.seconds!==null)sawCountdown=true;
    const seconds=timer.seconds??(timer.ready&&sawCountdown?0:fallback);
    if(!seconds&&!info.button.disabled&&info.button.getAttribute('aria-disabled')!=='true')break;
    saleStatus.textContent=selected.name+' 판매 '+sold+'/'+target+' · '+(seconds?'다음 판매까지 '+seconds+'초':'판매 버튼 활성화 대기 중');
    await sleep(200);
   }
   markSaleClick();
   info.button.click();
   for(let i=0;i<120;i++){
    await sleep(150);
    if(!selected.grid.isConnected)throw Error('목록이 갱신되었습니다. 판매 내역을 확인하세요.');
    if(tiles().length===count-1){markSaleClick();sold++;break;}
    checkSale();
    if(i===119)throw Error('판매 결과를 확인하세요. 자동 판매를 중지했습니다.');
   }
   saleStatus.textContent=selected.name+' 판매 '+sold+'/'+target;
  }
 }catch(e){saleStatus.textContent='판매 확인 '+sold+'/'+target+' · '+e.message;}
 finally{selling=false;sellRun.disabled=false;sellStop.disabled=true;pick=null;}
 function checkSale(){
  if(cancelSale||location.pathname!=='/class-rpg'||new URLSearchParams(location.search).get('tab')!=='stash')throw Error('판매를 중지했습니다.');
 }
};
})();
