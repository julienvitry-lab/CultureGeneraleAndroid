// CGIMPORT008 FIX3 · capture 12/12 + navigation sûre Quizypedia
// Règle : Culture Générale ne fabrique ni question, ni détail, ni distracteur.
// Les 4 propositions sont capturées telles qu'affichées par Quizypedia.

const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const cheerio = require('cheerio');
const chromiumModule = require('@sparticuz/chromium');
const chromium = chromiumModule.default || chromiumModule;
const puppeteer = require('puppeteer-core');

initializeApp();

const STOP = new Set([
  'navigation','communaute','soutenir le projet','nom d utilisateur','mot de passe',
  'se connecter','creer un compte','resultats et classements'
]);
const NOISE = new Set([
  'confirmer','annuler','fermer','quitter la partie','continuer a jouer',
  'nouvel utilisateur','duree','sur'
]);
const HEADER=/^(.+?)\s*[\(\[]\s*(\d+)\s*\/\s*(\d+)\s*[\)\]]\s*$/;
const DEFAULT_LABELS=[
  'Héroïne','Heroine','Œuvre','Oeuvre','Particularités','Particularites','Auteur','Auteurs',
  'Titre','Résumé','Description','Nom','Prénom','Partie','Élément','Element','Pays','Ville',
  'Région','Département','Capitale','Date','Année','Naissance','Décès','Lieu','Nationalité',
  'Profession','Fonction','Domaine','Catégorie','Genre','Type','Période','Créateur',
  'Réalisateur','Scénariste','Dessinateur','Compositeur','Interprète','Acteur','Actrice',
  'Personnage','Série','Album','Épisode','Sport','Club','Équipe','Langue','Surnom',
  'Population','Superficie','Altitude','Monnaie','Devise','Capacité','Origine','Famille',
  'Ordre','Classe','Espèce','Variété','Couleur','Matière','Symbole','Numéro','Formule',
  'Record','Publication','Éditeur','Vainqueur','Finaliste','Score','Résultat'
];

function clean(s){
  return String(s??'')
    .replace(/\u00a0|\u202f|\ufeff/g,' ')
    .replace(/\r/g,'\n')
    .replace(/[ \t]+/g,' ')
    .replace(/\n+/g,'\n')
    .trim();
}
function one(s){return clean(s).replace(/\s+/g,' ').trim();}
function norm(s){
  return one(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function linesFromHtml(html){
  const $=cheerio.load(html);
  $('script,style,noscript,svg').remove();
  return clean($.root().text()).split(/\n+/).map(one).filter(Boolean);
}
function dynamicLabels(html){
  const $=cheerio.load(html);
  const set=new Set(DEFAULT_LABELS);
  $('dt,th,label,strong,b,i,em').each((_,el)=>{
    const t=one($(el).text());
    if(t.length>=1&&t.length<=55)set.add(t);
  });
  return [...set].sort((a,b)=>b.length-a.length);
}
function badHeader(name){
  const k=norm(name);
  return ['quizypedia','connexion','duels','defi','master quiz','themes','publie le',
    'record en','creer un theme','trouver '].some(x=>k.startsWith(x)) ||
    /^\d+ fiches?$/.test(k);
}
function prepare(lines){
  const out=[];
  for(let i=0;i<lines.length;i++){
    const line=one(lines[i]);
    if(HEADER.test(line)){out.push(line);continue;}
    if(i+1<lines.length &&
       /^[\(\[]\s*\d+\s*\/\s*\d+\s*[\)\]]$/.test(one(lines[i+1])) &&
       !badHeader(line)){
      out.push(`${line} ${one(lines[++i])}`);
      continue;
    }
    out.push(line);
  }
  return out;
}
function rawFiches(lines){
  lines=prepare(lines);
  const out=[];
  let cur=null,started=false,totalExpected=null;
  for(const line0 of lines){
    const line=one(line0);
    if(!line)continue;
    const key=norm(line.replace(/^[# *\.\-:]+|[# *\.\-:]+$/g,''));
    if(started && (STOP.has(key) || [...STOP].some(x=>key.startsWith(x+' ')) ||
       line.startsWith('Contenus ©'))) break;
    const m=line.match(HEADER);
    if(m&&!badHeader(m[1])){
      const total=Number(m[3]);
      if(totalExpected!==null && total!==totalExpected)continue;
      totalExpected=total;
      if(cur)out.push(cur);
      cur={
        name:one(m[1]),
        position:`(${m[2]} / ${m[3]})`,
        number:Number(m[2]),
        total,
        lines:[],
        fields:[]
      };
      started=true;
      continue;
    }
    if(cur&&!NOISE.has(key))cur.lines.push(line);
  }
  if(cur)out.push(cur);
  return out;
}
function inferLabels(fiches){
  const counts=new Map(),original=new Map();
  const min=fiches.length<=4?2:Math.max(2,Math.ceil(fiches.length*.35));
  for(const f of fiches){
    const seen=new Set();
    for(const line of f.lines){
      if(line.includes(':')){
        const left=one(line.split(':',1)[0]);
        if(left.length<=60){
          const k=norm(left);seen.add(k);
          if(!original.has(k))original.set(k,left);
        }
      }
      const tokens=line.split(/\s+/);
      for(let n=1;n<=Math.min(6,tokens.length-1);n++){
        const prefix=tokens.slice(0,n).join(' ').replace(/[ :]+$/,'');
        const value=tokens.slice(n).join(' ');
        if(!value||prefix.length>65||/[,;]$/.test(prefix)||
           !(/[A-ZÀ-ÖØ-Þ0-9]/.test(prefix[0]))) continue;
        const k=norm(prefix);seen.add(k);
        if(!original.has(k))original.set(k,prefix);
      }
    }
    for(const k of seen)counts.set(k,(counts.get(k)||0)+1);
  }
  return [...counts].filter(([,c])=>c>=min)
    .map(([k])=>original.get(k)).filter(Boolean);
}
function parseFields(lines,labels){
  const source=[...new Set([...DEFAULT_LABELS,...labels].map(one).filter(Boolean))];
  const labelByNorm=new Map(source.map(l=>[norm(l),l]));
  const ordered=[...source].sort((a,b)=>b.length-a.length);
  const result=[];
  let infoCounter=1;

  for(let i=0;i<lines.length;i++){
    const line=one(lines[i]);
    if(!line)continue;
    const key=norm(line.replace(/^[# *\.\-:]+|[# *\.\-:]+$/g,''));
    if(NOISE.has(key))continue;

    if(line.includes(':')){
      const p=line.indexOf(':');
      const left=one(line.slice(0,p)),right=one(line.slice(p+1));
      if(left.length>=1&&left.length<=65&&right){
        result.push({label:left,value:right});
        continue;
      }
    }

    const known=labelByNorm.get(norm(line));
    if(known&&i+1<lines.length){
      const next=one(lines[i+1]);
      if(next&&!labelByNorm.has(norm(next))&&!HEADER.test(next)){
        result.push({label:known,value:next});
        i++;
        continue;
      }
    }

    let best=null;
    for(const lab of ordered){
      if(!lab||line===lab||!line.toLowerCase().startsWith(lab.toLowerCase()+' '))continue;
      const value=one(line.slice(lab.length));
      if(value && (!best || lab.length>best.label.length))best={label:lab,value};
    }
    if(best){result.push(best);continue;}

    result.push({label:`Info ${infoCounter++}`,value:line});
  }

  const dedup=[],seen=new Set();
  for(const f of result){
    const k=norm(f.label)+'|'+norm(f.value);
    if(!f.value||seen.has(k))continue;
    seen.add(k);dedup.push(f);
  }
  return dedup;
}

function parseQuestionnaireUrl(raw){
  let u;
  try{u=new URL(raw);}catch{
    throw Object.assign(new Error('URL invalide.'),{status:400});
  }
  if(!/(^|\.)quizypedia\.fr$/i.test(u.hostname)){
    throw Object.assign(new Error('Seules les URL quizypedia.fr sont acceptées.'),{status:400});
  }
  const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if(parts.length<3||norm(parts[0])!=='quiz'){
    throw Object.assign(new Error(
      'CGIMPORT008 exige l’URL complète /quiz/<thème>/<questionnaire>/'
    ),{status:400});
  }
  return {
    url:u,
    theme:one(parts[1]),
    questionnaire:one(parts.slice(2).join(' / ')),
    pathname:u.pathname.replace(/\/+$/,'')+'/'
  };
}
async function requireUser(req){
  const h=String(req.headers.authorization||'');
  if(!h.startsWith('Bearer ')){
    throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});
  }
  return getAuth().verifyIdToken(h.slice(7));
}
function allSourceValues(fiches){
  const map=new Map();
  for(const fiche of fiches){
    map.set(norm(fiche.name),fiche.name);
    for(const field of fiche.fields||[]){
      const value=one(field.value),k=norm(value);
      if(k&&!map.has(k))map.set(k,value);
    }
  }
  return map;
}

/* FIX3 : jamais de terme vide, jamais de flèche générique. */
async function clickSafeText(page,labels,{allowStartsWith=false}={}){
  const safeLabels=labels.map(norm).filter(k=>k.length>=2);
  if(!safeLabels.length)return {ok:false,reason:'no-safe-label'};
  return page.evaluate(({safeLabels,allowStartsWith})=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const nodes=[...document.querySelectorAll(
      'button,a,[role="button"],input[type="button"],input[type="submit"],[onclick]'
    )];
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>8&&r.height>8&&cs.display!=='none'&&
        cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };
    for(const el of nodes){
      if(!visible(el))continue;
      const candidates=[
        el.value,el.innerText,el.textContent,
        el.getAttribute('aria-label'),el.getAttribute('title')
      ].map(n).filter(Boolean);
      const matches=candidates.some(k=>safeLabels.some(w=>
        k===w || (allowStartsWith&&k.startsWith(w+' '))
      ));
      if(!matches)continue;
      el.click();
      return {ok:true,text:(el.innerText||el.textContent||el.value||'').trim()};
    }
    return {ok:false};
  },{safeLabels,allowStartsWith});
}

async function collectOptions(page,sourceValues){
  return page.evaluate((sourceValues)=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const known=new Map(sourceValues.map(v=>[n(v),v]).filter(([k])=>k));
    const selectors=[
      'button','a','[role="button"]','input[type="button"]','input[type="submit"]',
      '[onclick]','label','[tabindex]','[class*="answer"]','[class*="response"]',
      '[class*="choice"]','[class*="proposition"]','[class*="option"]'
    ].join(',');
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>20&&r.height>14&&cs.display!=='none'&&
        cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };
    const score=el=>{
      const tag=el.tagName.toLowerCase(),cs=getComputedStyle(el),r=el.getBoundingClientRect();
      let s=0;
      if(tag==='button')s+=40;
      if(tag==='label')s+=24;
      if(tag==='a')s+=8;
      if(el.getAttribute('role')==='button')s+=30;
      if(el.hasAttribute('onclick'))s+=24;
      if(cs.cursor==='pointer')s+=18;
      if(el.tabIndex>=0)s+=8;
      if(r.width>100)s+=6;
      return s-(r.width*r.height/150000);
    };

    const found=[];
    for(const el of document.querySelectorAll(selectors)){
      if(!visible(el))continue;
      const raw=(el.value||el.innerText||el.textContent||'').trim().replace(/\s+/g,' ');
      const k=n(raw);
      if(!known.has(k))continue;
      found.push({el,text:known.get(k),norm:k,score:score(el)});
    }

    const best=new Map();
    for(const item of found){
      const prev=best.get(item.norm);
      if(!prev||item.score>prev.score)best.set(item.norm,item);
    }
    let items=[...best.values()].sort((a,b)=>b.score-a.score);
    if(items.length>4)items=items.slice(0,4);
    if(items.length!==4){
      return {
        ok:false,
        count:items.length,
        options:items.map(x=>x.text),
        url:location.href,
        clickable:[...document.querySelectorAll('button,a,[role="button"]')]
          .filter(visible)
          .map(el=>(el.innerText||el.textContent||el.getAttribute('aria-label')||'')
            .trim().replace(/\s+/g,' '))
          .filter(Boolean).slice(0,30)
      };
    }

    let common=items[0].el;
    while(common&&common!==document.body&&!items.every(x=>common.contains(x.el))){
      common=common.parentElement;
    }
    if(!common)common=document.body;

    const containerText=(common.innerText||'').trim().replace(/\s+/g,' ');
    const options=items.map(x=>x.text);
    return {
      ok:true,
      options,
      containerText,
      url:location.href,
      signature:options.map(n).join('|')+'||'+n(containerText).slice(0,1200)
    };
  },sourceValues);
}

function identifySourceFiche(fiches,options,containerText){
  const optionNorms=new Set(options.map(norm));
  const coverage=new Map();

  for(const fiche of fiches){
    const values=[{label:'Nom',value:fiche.name},...(fiche.fields||[])];
    for(const field of values){
      const lk=norm(field.label),vk=norm(field.value);
      if(!lk||!optionNorms.has(vk))continue;
      if(!coverage.has(lk))coverage.set(lk,{label:field.label,values:new Set()});
      coverage.get(lk).values.add(vk);
    }
  }
  const answerLabel=[...coverage.values()].sort((a,b)=>b.values.size-a.values.size)[0];
  if(!answerLabel||answerLabel.values.size<3){
    return {ok:false,error:'Champ de réponse non identifiable depuis les 4 propositions.'};
  }

  const answerLabelKey=norm(answerLabel.label);
  const visible=norm(containerText);
  const candidates=[];

  for(const fiche of fiches){
    const values=[{label:'Nom',value:fiche.name},...(fiche.fields||[])];
    const answerFields=values.filter(f=>
      norm(f.label)===answerLabelKey && optionNorms.has(norm(f.value))
    );
    if(answerFields.length!==1)continue;

    const clues=[];
    let score=0;
    for(const field of values){
      if(norm(field.label)===answerLabelKey)continue;
      const value=one(field.value),vk=norm(value);
      if(vk.length<3||optionNorms.has(vk))continue;
      if(visible.includes(vk)){
        clues.push({label:one(field.label),value});
        score+=Math.min(vk.length,300);
      }
    }
    if(score>0){
      candidates.push({
        fiche,
        answer:one(answerFields[0].value),
        clues,
        score
      });
    }
  }

  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length){
    return {ok:false,error:'Aucune fiche source ne correspond aux indices visibles.'};
  }
  if(candidates.length>1&&candidates[0].score===candidates[1].score){
    return {ok:false,error:'Correspondance ambiguë entre plusieurs fiches source.'};
  }

  const hit=candidates[0];
  const correctIndex=options.findIndex(v=>norm(v)===norm(hit.answer))+1;
  if(correctIndex<1){
    return {ok:false,error:'Réponse source absente des quatre propositions visibles.'};
  }

  const detail=hit.clues.length===1
    ? hit.clues[0].value
    : hit.clues.map(c=>`${c.label} : ${c.value}`).join('\n');

  return {
    ok:true,
    sourceFiche:hit.fiche.name,
    sourceNumber:hit.fiche.number,
    answerLabel:answerLabel.label,
    detail,
    correctIndex,
    correctText:hit.answer
  };
}

async function clickOption(page,text){
  return page.evaluate((target)=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const wanted=n(target);
    if(!wanted)return false;

    const selectors=[
      'button','a','[role="button"]','input[type="button"],input[type="submit"]',
      '[onclick]','label','[tabindex]','[class*="answer"]','[class*="response"]',
      '[class*="choice"]','[class*="proposition"]','[class*="option"]'
    ].join(',');
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>20&&r.height>14&&cs.display!=='none'&&
        cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };

    let best=null,bestScore=-1e9;
    for(const el of document.querySelectorAll(selectors)){
      if(!visible(el))continue;
      const raw=(el.value||el.innerText||el.textContent||'').trim().replace(/\s+/g,' ');
      if(n(raw)!==wanted)continue;
      const tag=el.tagName.toLowerCase(),cs=getComputedStyle(el),r=el.getBoundingClientRect();
      let s=(tag==='button'?40:0)+(tag==='label'?24:0)+
        (el.getAttribute('role')==='button'?30:0)+(el.hasAttribute('onclick')?24:0)+
        (cs.cursor==='pointer'?18:0)+(el.tabIndex>=0?8:0)-
        (r.width*r.height/150000);
      if(s>bestScore){best=el;bestScore=s;}
    }
    if(!best)return false;
    best.click();
    return true;
  },text);
}

async function waitForNewState(page,sourceValues,previousSignature,timeoutMs=5500){
  const end=Date.now()+timeoutMs;
  let last=null;
  while(Date.now()<end){
    await sleep(250);
    last=await collectOptions(page,sourceValues);
    if(last.ok&&last.signature!==previousSignature)return last;
  }
  return null;
}

/* FIX3 : navigation sûre.
   1) on attend d'abord la transition automatique ;
   2) sinon on clique seulement un contrôle explicitement nommé ;
   3) aucune flèche générique, aucun includes("") possible. */
async function advanceSafely(page,sourceValues,previousState,questionnairePath){
  let next=await waitForNewState(page,sourceValues,previousState.signature,3200);
  if(next)return {ok:true,state:next,mode:'auto'};

  const currentPath=await page.evaluate(()=>location.pathname);
  if(!currentPath.startsWith(questionnairePath.replace(/\/+$/,''))){
    return {ok:false,error:`Sortie du questionnaire détectée : ${currentPath}`};
  }

  const clicked=await clickSafeText(page,[
    'Question suivante','Suivant','Continuer','Prochaine question'
  ],{allowStartsWith:false});

  if(!clicked.ok){
    return {ok:false,error:'Aucune transition automatique et aucun bouton Suivant sûr détecté.'};
  }

  next=await waitForNewState(page,sourceValues,previousState.signature,5000);
  if(next)return {ok:true,state:next,mode:'button'};

  return {ok:false,error:`Le bouton « ${clicked.text||'Suivant'} » n’a pas affiché une nouvelle question.`};
}

async function startGame(page){
  // N'accepte que des libellés non vides et explicites.
  let r=await clickSafeText(page,['Jeu normal'],{allowStartsWith:true});
  if(!r.ok)r=await clickSafeText(page,['Entraînement'],{allowStartsWith:true});
  if(!r.ok)return false;
  await sleep(1200);
  return true;
}

async function captureStrictQuestionnaire(url,fiches,questionnaire,questionnairePath){
  if(typeof chromium.executablePath!=='function'){
    throw new Error(
      `Chromium API incompatible: executablePath=${typeof chromium.executablePath}`
    );
  }

  chromium.setGraphicsMode=false;
  const headlessType='shell';
  const browser=await puppeteer.launch({
    args:await puppeteer.defaultArgs({args:chromium.args,headless:headlessType}),
    defaultViewport:{width:1440,height:1000,deviceScaleFactor:1},
    executablePath:await chromium.executablePath(),
    headless:headlessType
  });

  const diagnostics=[];
  try{
    const page=await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '+
      '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'Accept-Language':'fr-FR,fr;q=0.9'});
    await page.goto(url,{waitUntil:'networkidle2',timeout:50000});

    await clickSafeText(page,['Accepter','Tout accepter','J accepte'],{
      allowStartsWith:false
    }).catch(()=>{});

    const sourceValues=[...allSourceValues(fiches).values()];
    const expected=fiches.length;
    const questions=[];
    const seen=new Set();
    const maxSessions=5;

    for(let session=1;session<=maxSessions&&seen.size<expected;session++){
      if(session>1){
        // Revenir exactement au questionnaire avant de relancer une partie.
        await page.goto(url,{waitUntil:'networkidle2',timeout:50000});
        await sleep(700);
      }

      const started=await startGame(page);
      if(!started){
        diagnostics.push(`Session ${session}: bouton Jeu normal / Entraînement introuvable.`);
        break;
      }

      let state=null;
      for(let attempt=0;attempt<18;attempt++){
        state=await collectOptions(page,sourceValues);
        if(state.ok)break;
        await sleep(300);
      }
      if(!state||!state.ok){
        diagnostics.push(`Session ${session}: première question non détectée.`);
        continue;
      }

      const maxTurns=Math.max(expected*3,24);
      for(let turn=1;turn<=maxTurns&&seen.size<expected;turn++){
        if(!state?.ok){
          diagnostics.push(`Session ${session}, tour ${turn}: état de question absent.`);
          break;
        }

        const match=identifySourceFiche(fiches,state.options,state.containerText);
        if(!match.ok){
          diagnostics.push(`Session ${session}, tour ${turn}: ${match.error}`);
          diagnostics.push(`Propositions: ${state.options.join(' | ')}`);
          break;
        }

        if(!seen.has(match.sourceNumber)){
          questions.push({
            question:questionnaire,
            detail:match.detail,
            options:state.options,
            correct_index:match.correctIndex,
            correct_text:match.correctText,
            source_fiche:match.sourceFiche,
            source_number:match.sourceNumber,
            answer_label:match.answerLabel
          });
          seen.add(match.sourceNumber);
        }

        if(seen.size>=expected)break;

        const clicked=await clickOption(page,match.correctText);
        if(!clicked){
          diagnostics.push(
            `Session ${session}, tour ${turn}: réponse source « ${match.correctText} » non cliquable.`
          );
          break;
        }

        const advanced=await advanceSafely(
          page,sourceValues,state,questionnairePath
        );
        if(!advanced.ok){
          diagnostics.push(`Session ${session}, tour ${turn}: ${advanced.error}`);
          break;
        }

        state=advanced.state;
      }
    }

    questions.sort((a,b)=>a.source_number-b.source_number);
    if(questions.length!==expected){
      diagnostics.unshift(
        `Capture incomplète après sessions sûres : ${questions.length}/${expected}.`
      );
    }

    return {
      questions,
      complete:questions.length===expected,
      diagnostics
    };
  }finally{
    await browser.close().catch(()=>{});
  }
}

exports.cgimport002Quizypedia=onRequest({
  region:'europe-west1',
  timeoutSeconds:300,
  memory:'1GiB',
  concurrency:2
},async(req,res)=>{
  try{
    if(req.method!=='POST'){
      return res.status(405).json({ok:false,error:'Méthode non autorisée.'});
    }
    await requireUser(req);

    const raw=one(req.body?.url);
    const parsed=parseQuestionnaireUrl(raw);

    const response=await fetch(parsed.url.toString(),{
      redirect:'follow',
      headers:{
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '+
          'Chrome/149.0 Safari/537.36',
        'accept-language':'fr-FR,fr;q=0.9'
      }
    });
    if(!response.ok)throw new Error(`Quizypedia HTTP ${response.status}`);

    const html=await response.text();
    const lines=linesFromHtml(html);
    const labels=dynamicLabels(html);
    const fiches=rawFiches(lines);
    const inferred=inferLabels(fiches);
    const allLabels=[...new Set([...labels,...inferred])];
    for(const f of fiches)f.fields=parseFields(f.lines,allLabels);

    if(fiches.length<4){
      throw new Error(
        `CGIMPORT008 strict : seulement ${fiches.length} fiche(s) source détectée(s).`
      );
    }

    const capture=await captureStrictQuestionnaire(
      response.url,
      fiches,
      parsed.questionnaire,
      parsed.pathname
    );

    return res.json({
      ok:true,
      strict:true,
      strictComplete:capture.complete,
      requestedUrl:raw,
      effectiveUrl:response.url,
      theme:parsed.theme,
      questionnaire:parsed.questionnaire,
      fiches:fiches.map(f=>({
        name:f.name,
        position:f.position,
        number:f.number,
        total:f.total,
        fullText:f.lines.join(' | '),
        fields:f.fields
      })),
      questions:capture.questions,
      diagnostics:capture.diagnostics
    });
  }catch(e){
    console.error('CGIMPORT008 FIX3',e);
    return res.status(e.status||500).json({
      ok:false,
      strict:true,
      error:e.message||'Erreur serveur CGIMPORT008 FIX3.'
    });
  }
});
