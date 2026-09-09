// CGIMPORT008 FIX1 · interop CommonJS/ESM @sparticuz/chromium v149
// CGIMPORT008 · import strict 1:1 Quizypedia
// Aucune question, aucun détail et aucun distracteur n'est inventé.
// Le navigateur serveur capture le questionnaire tel qu'il est présenté par Quizypedia.

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
  return ['quizypedia','connexion','duels','defi','master quiz','themes','publie le','record en','creer un theme','trouver ']
    .some(x=>k.startsWith(x)) || /^\d+ fiches?$/.test(k);
}
function prepare(lines){
  const out=[];
  for(let i=0;i<lines.length;i++){
    const line=one(lines[i]);
    if(HEADER.test(line)){out.push(line);continue;}
    if(i+1<lines.length && /^[\(\[]\s*\d+\s*\/\s*\d+\s*[\)\]]$/.test(one(lines[i+1])) && !badHeader(line)){
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
    if(started && (STOP.has(key)||[...STOP].some(x=>key.startsWith(x+' '))||line.startsWith('Contenus ©')))break;
    const m=line.match(HEADER);
    if(m&&!badHeader(m[1])){
      const total=Number(m[3]);
      if(totalExpected!==null&&total!==totalExpected)continue;
      totalExpected=total;
      if(cur)out.push(cur);
      cur={name:one(m[1]),position:`(${m[2]} / ${m[3]})`,number:Number(m[2]),total,lines:[],fields:[]};
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
          const k=norm(left);seen.add(k);if(!original.has(k))original.set(k,left);
        }
      }
      const tokens=line.split(/\s+/);
      for(let n=1;n<=Math.min(6,tokens.length-1);n++){
        const prefix=tokens.slice(0,n).join(' ').replace(/[ :]+$/,'');
        const value=tokens.slice(n).join(' ');
        if(!value||prefix.length>65||/[,;]$/.test(prefix)||!(/[A-ZÀ-ÖØ-Þ0-9]/.test(prefix[0])))continue;
        const k=norm(prefix);seen.add(k);if(!original.has(k))original.set(k,prefix);
      }
    }
    for(const k of seen)counts.set(k,(counts.get(k)||0)+1);
  }
  return [...counts].filter(([,c])=>c>=min).map(([k])=>original.get(k)).filter(Boolean);
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
        result.push({label:left,value:right});continue;
      }
    }

    const known=labelByNorm.get(norm(line));
    if(known&&i+1<lines.length){
      const next=one(lines[i+1]);
      if(next&&!labelByNorm.has(norm(next))&&!HEADER.test(next)){
        result.push({label:known,value:next});i++;continue;
      }
    }

    let matched=false;
    for(const lab of ordered){
      if(!lab||line===lab||!line.toLowerCase().startsWith(lab.toLowerCase()+' '))continue;
      const value=one(line.slice(lab.length));
      if(value){result.push({label:lab,value});matched=true;break;}
    }
    if(matched)continue;

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
  try{u=new URL(raw);}catch{throw Object.assign(new Error('URL invalide.'),{status:400});}
  if(!/(^|\.)quizypedia\.fr$/i.test(u.hostname)){
    throw Object.assign(new Error('Seules les URL quizypedia.fr sont acceptées.'),{status:400});
  }
  const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if(parts.length<3 || norm(parts[0])!=='quiz'){
    throw Object.assign(new Error(
      "CGIMPORT008 exige l’URL complète d’un questionnaire : /quiz/<thème>/<questionnaire>/"
    ),{status:400});
  }
  return {
    url:u,
    theme:one(parts[1]),
    questionnaire:one(parts.slice(2).join(' / '))
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
    for(const field of fiche.fields||[]){
      const value=one(field.value);
      const k=norm(value);
      if(k.length<1)continue;
      if(!map.has(k))map.set(k,value);
    }
  }
  return map;
}

async function clickText(page, labels){
  return page.evaluate((labels)=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const wanted=labels.map(n);
    const nodes=[...document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"],[onclick]')];
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>10&&r.height>10&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };
    for(const el of nodes){
      if(!visible(el))continue;
      const text=(el.value||el.innerText||el.textContent||'').trim();
      const k=n(text);
      if(wanted.some(w=>k===w||k.startsWith(w+' ')||k.includes(w))){
        el.click();return {ok:true,text};
      }
    }
    return {ok:false};
  },labels);
}

async function collectOptions(page, sourceValues){
  return page.evaluate((sourceValues)=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const known=new Map(sourceValues.map(v=>[n(v),v]));
    const selectors=[
      'button','a','[role="button"]','input[type="button"]','input[type="submit"]',
      '[onclick]','label','[tabindex]','[class*="answer"]','[class*="response"]',
      '[class*="choice"]','[class*="proposition"]'
    ].join(',');
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>20&&r.height>14&&r.bottom>0&&r.top<innerHeight&&
        cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };
    const score=el=>{
      const tag=el.tagName.toLowerCase(),cs=getComputedStyle(el);
      let s=0;
      if(tag==='button')s+=30;
      if(tag==='label')s+=20;
      if(tag==='a')s+=10;
      if(el.getAttribute('role')==='button')s+=25;
      if(el.hasAttribute('onclick'))s+=20;
      if(cs.cursor==='pointer')s+=15;
      if(el.tabIndex>=0)s+=8;
      const r=el.getBoundingClientRect();
      if(r.width>100)s+=4;
      return s-(r.width*r.height/100000);
    };

    const found=[];
    for(const el of document.querySelectorAll(selectors)){
      if(!visible(el))continue;
      const raw=(el.value||el.innerText||el.textContent||'').trim().replace(/\s+/g,' ');
      const k=n(raw);
      if(!known.has(k))continue;
      const r=el.getBoundingClientRect();
      found.push({el,text:known.get(k),norm:k,score:score(el),rect:{x:r.x,y:r.y,w:r.width,h:r.height}});
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
        clickable:[...document.querySelectorAll('button,a,[role="button"]')]
          .filter(visible).map(el=>(el.innerText||el.textContent||'').trim().replace(/\s+/g,' ')).filter(Boolean).slice(0,30)
      };
    }

    // Trouver le plus petit ancêtre commun aux quatre propositions.
    let common=items[0].el;
    while(common&&common!==document.body&&!items.every(x=>common.contains(x.el))) common=common.parentElement;
    if(!common)common=document.body;
    const containerText=(common.innerText||'').trim().replace(/\s+/g,' ');

    return {
      ok:true,
      options:items.map(x=>x.text),
      containerText,
      rects:items.map(x=>x.rect)
    };
  },sourceValues);
}

function identifySourceFiche(fiches, options, containerText){
  const optionNorms=new Set(options.map(norm));

  // Le champ de réponse est le libellé dont les valeurs couvrent le mieux les 4 options visibles.
  const labelCoverage=new Map();
  for(const fiche of fiches){
    for(const field of fiche.fields||[]){
      const lk=norm(field.label),vk=norm(field.value);
      if(!lk||!optionNorms.has(vk))continue;
      if(!labelCoverage.has(lk))labelCoverage.set(lk,{label:field.label,values:new Set()});
      labelCoverage.get(lk).values.add(vk);
    }
  }
  const answerLabel=[...labelCoverage.values()].sort((a,b)=>b.values.size-a.values.size)[0];
  if(!answerLabel||answerLabel.values.size<3){
    return {ok:false,error:"Impossible d’identifier le champ de réponse à partir des 4 propositions Quizypedia."};
  }
  const answerLabelKey=norm(answerLabel.label);
  const visible=norm(containerText);

  const candidates=[];
  for(const fiche of fiches){
    const answerFields=(fiche.fields||[]).filter(f=>norm(f.label)===answerLabelKey && optionNorms.has(norm(f.value)));
    if(answerFields.length!==1)continue;

    const clues=[];
    let score=0;
    for(const field of fiche.fields||[]){
      if(norm(field.label)===answerLabelKey)continue;
      const value=one(field.value),vk=norm(value);
      if(vk.length<3||optionNorms.has(vk))continue;
      if(visible.includes(vk)){
        clues.push({label:one(field.label),value});
        score+=Math.min(vk.length,300);
      }
    }
    if(score>0)candidates.push({fiche,answer:one(answerFields[0].value),clues,score});
  }

  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length){
    return {ok:false,error:"Aucune fiche source ne correspond aux indices visibles du questionnaire."};
  }
  if(candidates.length>1&&candidates[0].score===candidates[1].score){
    return {ok:false,error:"Plusieurs fiches source correspondent aux mêmes indices visibles ; capture strictement 1:1 impossible."};
  }

  const hit=candidates[0];
  const correctIndex=options.findIndex(v=>norm(v)===norm(hit.answer))+1;
  if(correctIndex<1){
    return {ok:false,error:"La réponse source n’est pas présente parmi les quatre propositions visibles."};
  }

  let detail='';
  if(hit.clues.length===1){
    detail=hit.clues[0].value; // strict : valeur exacte, sans reformulation.
  }else{
    detail=hit.clues.map(c=>`${c.label} : ${c.value}`).join('\n');
  }

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

async function clickOption(page, text){
  return page.evaluate((target)=>{
    const n=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const wanted=n(target);
    const selectors=[
      'button','a','[role="button"]','input[type="button"]','input[type="submit"]',
      '[onclick]','label','[tabindex]','[class*="answer"]','[class*="response"]',
      '[class*="choice"]','[class*="proposition"]'
    ].join(',');
    const visible=el=>{
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>20&&r.height>14&&r.bottom>0&&r.top<innerHeight&&
        cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };
    let best=null,bestScore=-1e9;
    for(const el of document.querySelectorAll(selectors)){
      if(!visible(el))continue;
      const raw=(el.value||el.innerText||el.textContent||'').trim().replace(/\s+/g,' ');
      if(n(raw)!==wanted)continue;
      const tag=el.tagName.toLowerCase(),cs=getComputedStyle(el),r=el.getBoundingClientRect();
      let s=(tag==='button'?30:0)+(tag==='label'?20:0)+(el.getAttribute('role')==='button'?25:0)+
        (el.hasAttribute('onclick')?20:0)+(cs.cursor==='pointer'?15:0)+(el.tabIndex>=0?8:0)-
        (r.width*r.height/100000);
      if(s>bestScore){best=el;bestScore=s;}
    }
    if(!best)return false;
    best.click();return true;
  },text);
}

async function captureStrictQuestionnaire(url, fiches, questionnaire){
  if(typeof chromium.executablePath!=='function'){
    throw new Error(
      `CGIMPORT008 Chromium API incompatible: executablePath=${typeof chromium.executablePath}; `+
      `exports=${Object.keys(chromiumModule||{}).join(',')}`
    );
  }
  chromium.setGraphicsMode = false;
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

    // Fermer d'éventuels bandeaux non essentiels sans jamais répondre au quiz.
    await clickText(page,['Accepter','Tout accepter','J’accepte']).catch(()=>{});

    // Le mode normal parcourt normalement les fiches du questionnaire une fois chacune.
    let start=await clickText(page,['Jeu normal']);
    if(!start.ok)start=await clickText(page,['Entraînement']);
    if(!start.ok){
      return {questions:[],complete:false,diagnostics:['Bouton Jeu normal / Entraînement introuvable.']};
    }
    await new Promise(r=>setTimeout(r,1300));

    const sourceValues=[...allSourceValues(fiches).values()];
    const questions=[];
    const seen=new Set();
    const expected=fiches.length;
    const maxTurns=Math.max(12,expected*3);

    for(let turn=0;turn<maxTurns && seen.size<expected;turn++){
      let state=null;
      for(let attempt=0;attempt<15;attempt++){
        state=await collectOptions(page,sourceValues);
        if(state.ok)break;
        await new Promise(r=>setTimeout(r,300));
      }
      if(!state||!state.ok){
        diagnostics.push(`Tour ${turn+1}: ${state?.count??0} proposition(s) source détectée(s).`);
        if(state?.clickable?.length)diagnostics.push(`Éléments cliquables: ${state.clickable.join(' | ')}`);
        break;
      }

      const match=identifySourceFiche(fiches,state.options,state.containerText);
      if(!match.ok){
        diagnostics.push(`Tour ${turn+1}: ${match.error}`);
        diagnostics.push(`Propositions: ${state.options.join(' | ')}`);
        diagnostics.push(`Bloc visible: ${state.containerText.slice(0,800)}`);
        break;
      }

      if(!seen.has(match.sourceNumber)){
        questions.push({
          question:questionnaire,               // exact depuis l'URL Quizypedia
          detail:match.detail,                  // exact depuis la/les propriété(s) visible(s)
          options:state.options,                // exactes telles qu'affichées par Quizypedia
          correct_index:match.correctIndex,     // position de la réponse source dans ces 4 options
          correct_text:match.correctText,
          source_fiche:match.sourceFiche,
          source_number:match.sourceNumber,
          answer_label:match.answerLabel
        });
        seen.add(match.sourceNumber);
      }

      const clicked=await clickOption(page,match.correctText);
      if(!clicked){
        diagnostics.push(`Tour ${turn+1}: impossible de cliquer la réponse source « ${match.correctText} ».`);
        break;
      }

      await new Promise(r=>setTimeout(r,650));
      await clickText(page,['Suivant','Continuer','Question suivante','→']).catch(()=>{});
      await new Promise(r=>setTimeout(r,450));
    }

    questions.sort((a,b)=>a.source_number-b.source_number);
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
  timeoutSeconds:180,
  memory:'1GiB',
  concurrency:4
},async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Méthode non autorisée.'});
    await requireUser(req);

    const raw=one(req.body?.url);
    const parsed=parseQuestionnaireUrl(raw);

    const response=await fetch(parsed.url.toString(),{
      redirect:'follow',
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0 Safari/537.36',
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
      throw new Error(`CGIMPORT008 strict : seulement ${fiches.length} fiche(s) source détectée(s).`);
    }

    const capture=await captureStrictQuestionnaire(response.url,fiches,parsed.questionnaire);

    return res.json({
      ok:true,
      strict:true,
      strictComplete:capture.complete,
      requestedUrl:raw,
      effectiveUrl:response.url,
      theme:parsed.theme,
      questionnaire:parsed.questionnaire,
      fiches:fiches.map(f=>({
        name:f.name,position:f.position,number:f.number,total:f.total,
        fullText:f.lines.join(' | '),fields:f.fields
      })),
      questions:capture.questions,
      diagnostics:capture.diagnostics
    });
  }catch(e){
    console.error('CGIMPORT008',e);
    return res.status(e.status||500).json({
      ok:false,
      strict:true,
      error:e.message||'Erreur serveur CGIMPORT008.'
    });
  }
});
