import {makeDemo} from './demo.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s,location.href);return ['https:','http:'].includes(u.protocol)?esc(u.href):'#';}catch{return '#';}};
const imageUrl=s=>s&&!String(s).includes('..')?safeUrl(s):null;
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
const date=s=>s?new Date(s).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'—';
const config=await fetch('./config.json').then(r=>{if(!r.ok)throw Error('Конфиг не найден');return r.json()}).catch(e=>{document.querySelector('#app').innerHTML=`<div class="empty">${esc(e.message)}. Проверь config.json.</div>`;throw e});
let snapshot=await fetch('./data/github.json').then(r=>r.json()).catch(()=>({available:false,error:'Снимок статистики недоступен.'}));
let vue=null;try{vue=await Promise.race([import('./assets/vue.esm-browser.prod.js'),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),1000))])}catch{/* Core interface remains usable without the optional Vue runtime. */}
const initial={route:location.hash==='#/roms'?'roms':'stats',days:30,demo:false,busy:false,message:''};
const state=vue?vue.reactive(initial):initial;
let nativeRender=()=>{};
const getData=()=>state.demo?makeDemo():snapshot;
const commits=d=>d.commits.filter(c=>Date.parse(c.date)>=Date.now()-state.days*86400000);
const panel=(n,title,content,meta='')=>`<section class="panel"><div class="panel-head"><h2><span class="index">${n}</span>${title}</h2><span class="mono">${meta}</span></div><div class="panel-body">${content}</div></section>`;
function badge(device,family){const image=imageUrl(family.image);return `<a class="badge" href="#/roms">${image?`<img src="${image}" alt="" loading="lazy">`:''}<span>${esc(device.codename)}</span><b>${esc(family.name)}</b></a>`}
function heatmap(d){if(!d.calendar.length)return '<div class="empty">Теплокарта появится после обновления данных.<br>Она показывает все публичные вклады GitHub, а не только коммиты.</div>';const days=d.calendar.flatMap(w=>w.contributionDays||w.days||[]);const max=Math.max(1,...days.map(x=>x.contributionCount));let months=[];days.forEach(x=>{const m=new Date(x.date).toLocaleDateString('ru-RU',{month:'short'});if(!months.includes(m))months.push(m)});const padding=days.length?'<span class="cell" style="visibility:hidden"></span>'.repeat(new Date(days[0].date).getUTCDay()):'';const cells=padding+days.map(x=>{const c=x.contributionCount;const level=c?Math.min(4,Math.ceil(c/max*4)):0;return `<span tabindex="0" class="cell l${level}" title="${esc(x.date)}: ${c} вкладов" aria-label="${esc(x.date)}: ${c} вкладов"></span>`}).join('');return `<div class="calendar-scroll"><div class="months">${months.map(m=>`<span>${m}</span>`).join('')}</div><div class="heatmap-wrap"><div class="daylabels"><span>Пн</span><span>Ср</span><span>Пт</span></div><div class="heatmap">${cells}</div></div></div><div class="calendar-foot"><span>${fmt(days.reduce((s,x)=>s+x.contributionCount,0))} вкладов за 12 месяцев</span><div class="legend"><span>Меньше</span>${[0,1,2,3,4].map(x=>`<i class="cell l${x}"></i>`).join('')}<span>Больше</span></div></div>`}
function histogram(d){if(!d.available)return '<div class="empty">Нет данных за выбранный период.</div>';const count=state.days===365?12:state.days===90?13:state.days===30?15:7;const bins=Array.from({length:count},(_,i)=>({start:Date.now()-state.days*86400000+i*state.days*86400000/count,value:0}));commits(d).forEach(c=>{const i=Math.min(count-1,Math.max(0,Math.floor((Date.parse(c.date)-(Date.now()-state.days*86400000))/(state.days*86400000/count))));bins[i].value++});const max=Math.max(1,...bins.map(b=>b.value));let svg=`<svg class="chart" viewBox="0 0 640 190" role="img" aria-label="Гистограмма найденных публичных коммитов за ${state.days} дней">`;for(let i=0;i<4;i++){const y=15+i*44;svg+=`<line x1="34" y1="${y}" x2="636" y2="${y}"/><text x="0" y="${y+4}">${Math.round(max*(1-i/3))}</text>`}bins.forEach((b,i)=>{const w=595/count;const height=b.value/max*130;svg+=`<rect x="${39+i*w}" y="${147-height}" width="${w*.64}" height="${height}" fill="${i%3===0?'#d8ef68':'#a9f52c'}"><title>${date(b.start)}: ${b.value} коммитов</title></rect>`;if(i%Math.ceil(count/5)===0)svg+=`<text x="${39+i*w}" y="177">${date(b.start)}</text>`});return svg+'</svg><div class="chart-footer">Коммиты, автор которых совпадает с профилем · выбранные репозитории</div>'}
function ranking(d){const counts=new Map;commits(d).forEach(c=>counts.set(c.repo,(counts.get(c.repo)||0)+1));const ranked=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6);if(!ranked.length)return '<div class="empty">Публичные коммиты за этот период не найдены.</div>';return ranked.map(([repo,n],i)=>`<div class="repo"><div class="repo-top"><a class="repo-name" href="https://github.com/${esc(repo)}" target="_blank" rel="noopener noreferrer">${String(i+1).padStart(2,'0')} / ${esc(repo.split('/').slice(1).join('/'))}</a><span class="repo-count">${n}</span></div><div class="bar-track"><div class="bar-fill" style="width:${n/ranked[0][1]*100}%"></div></div><span class="repo-owner">${esc(repo.split('/')[0])}</span></div>`).join('')}
function feed(d){const list=commits(d).slice(0,7);return list.length?list.map(c=>`<article class="commit"><i class="commit-mark"></i><div><a class="commit-title" href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.message.split('\n')[0])}</a><div class="commit-info"><a class="sha" href="${safeUrl(c.url)}">${esc(c.sha.slice(0,7))}</a><span>${esc(c.repo.split('/').pop())}</span><time datetime="${esc(c.date)}">${date(c.date)}</time></div></div></article>`).join(''):'<div class="empty">Нет коммитов за выбранный период.</div>'}
function languages(d){const colors=['#adff28','#dcf16a','#69bb47','#32a694','#7b935d'];const totals=new Map;d.repositories.forEach(r=>Object.entries(r.languages||{}).forEach(([l,n])=>totals.set(l,(totals.get(l)||0)+n)));const list=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,5);const sum=list.reduce((s,x)=>s+x[1],0);if(!sum)return '<div class="empty">Языки появятся после обновления.</div>';return `<div class="langbar">${list.map(([l,n],i)=>`<div style="width:${n/sum*100}%;background:${colors[i]}" title="${esc(l)}: ${(n/sum*100).toFixed(1)}%"></div>`).join('')}</div><div class="languages">${list.map(([l,n],i)=>`<span><i style="background:${colors[i]}"></i>${esc(l)} <small>${(n/sum*100).toFixed(1)}%</small></span>`).join('')}</div><div class="chart-footer">Доля байтов кода в проанализированных репозиториях</div>`}
function dashboard(d){const cs=commits(d);const repoCount=new Set(cs.map(c=>c.repo)).size;const contributionCount=d.calendar.flatMap(w=>w.contributionDays||[]).filter(x=>Date.parse(x.date)>=Date.now()-state.days*86400000).reduce((s,x)=>s+x.contributionCount,0);const metrics=[['Публичные вклады',d.available&&d.calendar.length?fmt(contributionCount):'—',`за ${state.days} дней`,true],['Найдено коммитов',d.available?fmt(cs.length):'—','в отслеживаемых репозиториях'],['Активные репозитории',d.available?repoCount:'—',`с твоими коммитами за ${state.days} дней`],['Звёзды репозиториев',d.available?fmt(d.repositories.reduce((s,r)=>s+(r.stars||0),0)):'—','суммарно · отслеживаемые']];return `<div class="toolbar"><div class="periods"><label>Период</label>${[7,30,90,365].map(n=>`<button data-days="${n}" class="${state.days===n?'selected':''}" aria-pressed="${state.days===n}">${n===365?'Год':n+' дн.'}</button>`).join('')}</div><div class="right-tools"><button data-action="demo" aria-pressed="${state.demo}">${state.demo?'Реальные данные':'Демо интерфейса'}</button><button data-action="refresh" ${state.busy?'disabled':''}>${state.busy?'Обновление…':'↻ Обновить'}</button></div></div>${state.demo?'<div class="notice"><b>ДЕМО /</b> Пример визуализации. Все числа и коммиты ниже — вымышленные, это не статистика VicTim.</div>':!d.available?`<div class="notice"><b>НЕТ СНИМКА /</b> ${esc(d.error||'Статистика ещё не загружена.')} Можно посмотреть демо интерфейса.</div>`:''}${state.message?`<p class="fetch-message" role="status">${esc(state.message)}</p>`:''}<div class="metrics">${metrics.map(([label,value,note,green])=>`<div class="metric"><div class="label">${label}<span class="index">⌁</span></div><div class="value ${green?'green':''}">${value}</div><small>${note}</small></div>`).join('')}</div><div class="grid"><div>${panel('01','Карта вкладов',heatmap(d),'12 МЕСЯЦЕВ')}${panel('02','Частота коммитов',histogram(d),state.days+' ДНЕЙ')}${panel('03','Последние коммиты',feed(d),'GIT LOG')}</div><div>${panel('04','Активные репозитории',ranking(d),'ПО КОММИТАМ')}${panel('05','Языки',languages(d),'CODE MIX')}${panel('06','Мейнтейнер',`<p class="subtitle">Устройства и прошивки, над которыми я работаю.</p><p class="subtitle">Напарник — <a href="https://github.com/GADGETN1K" target="_blank" rel="noopener noreferrer" style="color:var(--green)">GADGETN1K ↗</a></p><a class="maintainer-badge" href="https://crdroid.net/fire/12" target="_blank" rel="noopener noreferrer"><span class="maintainer-badge-status">✓ OFFICIAL</span><span><b>crDroid maintainer</b><small>Redmi 12 · fire</small></span></a><div class="badge-row">${config.devices.flatMap(device=>device.android.flatMap(a=>a.families.map(f=>badge(device,f)))).join('')}</div><p class="subtitle"><a href="#/roms">Открыть каталог прошивок /</a></p>`,'ROM DEV')}</div></div>${d.coverage&&!state.demo?`<p class="fetch-message">${esc(d.coverage)}${d.warnings?.length?` · ${esc(d.warnings.join(' · '))}`:''}</p>`:''}`}
function roms(){return `<div class="maintainer"><div><h2>Мои устройства / ${String(config.devices.length).padStart(2,'0')}</h2><p>Выбери устройство, Android и семейство. Последний уровень открывает страницу загрузки.</p></div><span class="tag">DEVICE → ANDROID → ROM → BUILD</span></div><div class="rom-layout"><div>${config.devices.map(device=>{const img=imageUrl(device.image);return `<section class="panel"><div class="device-summary">${img?`<img class="device-image" src="${img}" alt="${esc(device.name)}">`:`<div class="device-icon">${esc(device.codename.toUpperCase())}</div>`}<div><h2>${esc(device.name)}</h2><small>${esc(device.description)} / ${esc(device.codename)}</small></div></div><div class="tree">${device.android.map(android=>`<details open><summary>Android ${esc(android.version)} <small>OS</small></summary><div class="branch">${android.families.map(f=>`<details open><summary>${esc(f.name)} <small>${f.releases.length} ${f.releases.length===1?'версия':'версий'}</small></summary><div class="branch">${f.releases.map(r=>`<a class="release" href="${safeUrl(r.downloadUrl)}" target="_blank" rel="noopener noreferrer"><div class="release-left"><strong>${esc(r.version)}</strong><span class="status ${esc(r.status)}">${r.status==='official'?'Официальная':r.status==='unofficial'?'Неофициальная':'Статус не указан'}</span></div><span class="download-label">↓ Скачать</span></a>${r.note?`<p class="release-note">${esc(r.note)}</p>`:''}`).join('')}</div></details>`).join('')}</div></details>`).join('')}</div></section>`}).join('')||'<div class="empty">В конфиге пока нет устройств.</div>'}</div><aside class="rom-side"><div class="panel"><div class="panel-body"><p class="eyebrow">RELEASE DIRECTORY</p><h3>От устройства<br>до сборки.</h3>${[['01','Устройство'],['02','Версия Android'],['03','Семейство прошивок'],['04','Версия и загрузка']].map(([n,s])=>`<div class="tree-key"><span>${n}</span>${s}</div>`).join('')}<p>Официальный статус относится к конкретной сборке, а не ко всему устройству.</p><div class="badge-row"><span class="status">Официальная</span><span class="status unofficial">Неофициальная</span></div></div></div><p>Актуальные инструкции установки и требования к firmware — на странице загрузки.</p></aside></div>`}
function render(){const d=getData();const username=config.profile.username;const img=d.profile?.avatarUrl;return `<header class="topbar"><a class="brand" href="#/">V<span style="color:var(--green)">I</span>CTIM<em>_</em></a><nav aria-label="Основная навигация"><a href="#/" class="${state.route==='stats'?'active':''}" ${state.route==='stats'?'aria-current="page"':''}><span>01</span> Статистика</a><a href="#/roms" class="${state.route==='roms'?'active':''}" ${state.route==='roms'?'aria-current="page"':''}><span>02</span> Прошивки</a></nav><a class="github-link" href="https://github.com/${esc(username)}" target="_blank" rel="noopener noreferrer">&lt;/&gt; GitHub</a></header><main id="main" class="shell"><div class="systemline"><span><strong>//</strong> DEVELOPER TERMINAL <span style="color:#466433"> / </span> ${state.route==='stats'?'OVERVIEW':'RELEASES'}</span><span class="system-date">СНИМОК: ${date(snapshot.updatedAt)}</span></div><div class="intro"><div><p class="eyebrow">${state.route==='stats'?'GITHUB / '+esc(username):'ANDROID / MAINTAINED BY VICTIM'}</p><h1>${state.route==='stats'?'CODE. BUILD. <span>REPEAT.</span>':'CUSTOM <span>ROMS.</span>'}</h1><p class="subtitle">${state.route==='stats'?esc(config.profile.title)+' · '+config.profile.organizations.map(esc).join(' / '):'Устройства, версии Android и мои сборки прошивок.'}</p></div><a class="profile-mini" href="https://github.com/${esc(username)}">${img?`<img class="avatar" alt="Аватар ${esc(username)}" src="${safeUrl(img)}">`:'<div class="avatar">V</div>'}<div><b>${esc(config.profile.displayName)}</b><small>@${esc(username)}</small></div></a></div>${state.route==='stats'?dashboard(d):roms()}<footer class="footer"><span><b>VICTIM_</b> / ${new Date().getFullYear()} · OPEN SOURCE</span><span>${state.demo?'DEMO DATA':snapshot.available?'PUBLIC GITHUB SNAPSHOT':'AWAITING GITHUB DATA'} / <a href="https://github.com/${esc(username)}">@${esc(username)}</a></span></footer></main>`}
const container=document.querySelector('#app');if(vue){vue.createApp({setup(){return()=>vue.h('div',{innerHTML:render()})}}).mount(container)}else{nativeRender=()=>{container.innerHTML=render()};nativeRender()}
function update(){nativeRender()}
window.addEventListener('hashchange',()=>{state.route=location.hash==='#/roms'?'roms':'stats';state.message='';update();window.scrollTo(0,0)});
document.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.days){state.days=Number(button.dataset.days);update()}if(button.dataset.action==='demo'){state.demo=!state.demo;state.message='';update()}if(button.dataset.action==='refresh'){state.busy=true;state.message='';update();try{const r=await fetch('./data/github.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Снимок недоступен');snapshot=await r.json();state.message=snapshot.available?'Снимок загружен. Собран '+date(snapshot.updatedAt)+'.':'Новый снимок ещё не создан. Запусти workflow на GitHub.'}catch{state.message='Не удалось загрузить снимок. Проверь соединение.'}finally{state.busy=false;update()}}});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){e.target.hidden=true}},true);

// Only child changes are observed; motion attributes do not trigger re-rendering.
const motionRoutes=new Set();
function enhanceMotion(){
 const heading=container.querySelector('h1');
 if(heading&&!motionRoutes.has(state.route)){
  motionRoutes.add(state.route);heading.classList.add('motion-title');
 }
 container.querySelectorAll('.panel,.metric,.maintainer,.device-summary').forEach((el,i)=>el.style.setProperty('--motion-delay',Math.min(i,7)*55+'ms'));
}
const motionObserver=new MutationObserver(enhanceMotion);
motionObserver.observe(container,{childList:true,subtree:true});enhanceMotion();

const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
function enhanceTerminal(){
 if(motionPreference.matches)return;
 container.querySelectorAll('.heatmap .cell').forEach((el,i)=>el.style.setProperty('--cell-delay',Math.floor(i/7)*12+'ms'));
 container.querySelectorAll('.chart rect').forEach((el,i)=>el.style.setProperty('--chart-delay',i*35+'ms'));
 container.querySelectorAll('.commit,.repo').forEach((el,i)=>el.style.setProperty('--row-delay',Math.min(i,10)*45+'ms'));
}
const terminalObserver=new MutationObserver(enhanceTerminal);
terminalObserver.observe(container,{childList:true,subtree:true});enhanceTerminal();
let spotlightFrame=0;
container.addEventListener('pointermove',e=>{
 if(motionPreference.matches||e.pointerType!=='mouse'||spotlightFrame)return;
 const panel=e.target.closest('.panel');if(!panel)return;
 spotlightFrame=requestAnimationFrame(()=>{const rect=panel.getBoundingClientRect();panel.style.setProperty('--spot-x',e.clientX-rect.left+'px');panel.style.setProperty('--spot-y',e.clientY-rect.top+'px');spotlightFrame=0});
});
function showTerminalRipple(e,keyboard=false){
 if(motionPreference.matches)return;
 const target=e.target.closest('button,summary,.badge,.maintainer-badge,.release,.topbar a');if(!target)return;
 const rect=target.getBoundingClientRect();
 const x=keyboard?rect.left+rect.width/2:e.clientX;
 const y=keyboard?rect.top+rect.height/2:e.clientY;
 const ripple=document.createElement('span');ripple.className='terminal-ripple';ripple.setAttribute('aria-hidden','true');
 ripple.style.left=x+'px';ripple.style.top=y+'px';document.body.append(ripple);
 ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});setTimeout(()=>ripple.remove(),1100);
}
// Capture the initial touch before navigation or UI replacement occurs.
document.addEventListener('pointerdown',e=>showTerminalRipple(e),{capture:true,passive:true});
document.addEventListener('click',e=>{if(e.detail===0)showTerminalRipple(e,true)},{capture:true});

const treeTransitions=new WeakMap();
container.addEventListener('click',e=>{
 const summary=e.target.closest('.tree summary');if(!summary)return;
 const details=summary.parentElement;
 const branch=details.querySelector(':scope > .branch');if(!branch)return;
 e.preventDefault();
 const previous=treeTransitions.get(details);
 const opening=previous?!previous.opening:!details.open;
 const currentHeight=details.open?branch.getBoundingClientRect().height:0;
 previous?.animation.cancel();
 if(motionPreference.matches){details.open=opening;branch.style.removeProperty('overflow');treeTransitions.delete(details);return;}
 details.open=true;
 branch.style.overflow='hidden';
 const fullHeight=branch.scrollHeight;
 const animation=branch.animate([
  {height:currentHeight+'px',opacity:currentHeight?1:0,transform:currentHeight?'translateX(0)':'translateX(-6px)'},
  {height:(opening?fullHeight:0)+'px',opacity:opening?1:0,transform:opening?'translateX(0)':'translateX(-6px)'}
 ],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
 const transition={animation,opening};treeTransitions.set(details,transition);
 animation.finished.then(()=>{
  if(treeTransitions.get(details)!==transition)return;
  details.open=opening;animation.cancel();branch.style.removeProperty('overflow');treeTransitions.delete(details);
 }).catch(()=>{});
},{capture:true});
