// CGIMPORT009 FIX4 · diagnostic exact des fiches manquantes + multi-session Firebase
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

function parseQuizypediaUrl(raw){
  let u;
  try{u=new URL(raw);}catch{
    throw Object.assign(new Error('URL invalide.'),{status:400});
  }
  if(!/(^|\.)quizypedia\.fr$/i.test(u.hostname)){
    throw Object.assign(new Error('Seules les URL quizypedia.fr sont acceptées.'),{status:400});
  }

  const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if(parts.length<2||norm(parts[0])!=='quiz'){
    throw Object.assign(new Error(
      'URL Quizypedia attendue : /quiz/<thème>/ ou /quiz/<thème>/<questionnaire>/'
    ),{status:400});
  }

  const theme=one(parts[1]);
  const kind=parts.length>=3?'questionnaire':'theme';

  return {
    url:u,
    kind,
    theme,
    questionnaire:kind==='questionnaire'?one(parts.slice(2).join(' / ')):'',
    pathname:u.pathname.replace(/\/+$/,'')+'/'
  };
}

function fetchHeaders(){
  return {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '+
      'Chrome/149.0 Safari/537.36',
    'accept-language':'fr-FR,fr;q=0.9'
  };
}

async function fetchQuizypedia(url){
  const response=await fetch(url,{
    redirect:'follow',
    headers:fetchHeaders()
  });
  if(!response.ok)throw new Error(`Quizypedia HTTP ${response.status}`);
  return {
    response,
    html:await response.text()
  };
}

function discoverQuestionnairesFromTheme(html,effectiveUrl,theme){
  const $=cheerio.load(html);
  const themeKey=norm(theme);
  const found=[];
  const seen=new Set();

  const pushCandidate=(rawHref,label='')=>{
    rawHref=one(rawHref);
    if(!rawHref)return;

    let u;
    try{u=new URL(rawHref,effectiveUrl);}catch{return;}
    if(!/(^|\.)quizypedia\.fr$/i.test(u.hostname))return;

    let parts;
    try{
      parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    }catch{
      return;
    }

    if(parts.length<3||norm(parts[0])!=='quiz'||norm(parts[1])!==themeKey)return;

    const title=one(parts.slice(2).join(' / '));
    if(!title)return;

    const canonicalPath='/'+parts.map(p=>encodeURIComponent(p).replace(/%2F/gi,'%252F')).join('/')+'/';
    const canonical=new URL(canonicalPath,u.origin).toString();
    const key=norm(title)+'|'+canonical.toLowerCase();
    if(seen.has(key))return;
    seen.add(key);

    const visibleLabel=one(label);
    found.push({
      title,
      label:visibleLabel&&norm(visibleLabel)!==norm(theme)?visibleLabel:title,
      url:canonical
    });
  };

  $('a[href],form[action],[data-href],[data-url]').each((_,el)=>{
    const node=$(el);
    const href=
      node.attr('href')||
      node.attr('action')||
      node.attr('data-href')||
      node.attr('data-url')||
      '';
    pushCandidate(href,node.text());
  });

  // Fallback : certaines pages peuvent injecter des URL dans des attributs ou scripts.
  if(!found.length){
    const re=/["']([^"']*\/quiz\/[^"']+)["']/g;
    let m;
    while((m=re.exec(html))!==null){
      pushCandidate(m[1],'');
    }
  }

  return found;
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
    const plain=s=>String(s??'').trim().replace(/[ \t]+/g,' ').replace(/\r/g,'');
    const oneLine=s=>plain(s).replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
    const known=new Map(sourceValues.map(v=>[n(v),v]).filter(([k])=>k));
    const pathParts=decodeURIComponent(location.pathname).split('/').filter(Boolean);
    const questionnaireFromUrl=pathParts.length>=3 ? pathParts.slice(2).join(' / ') : '';
    const questionnaireNorm=n(questionnaireFromUrl);

    const selectors=[
      'button','a','[role="button"]','input[type="button"]','input[type="submit"]',
      '[onclick]','label','[tabindex]','[class*="answer"]','[class*="response"]',
      '[class*="choice"]','[class*="proposition"]','[class*="option"]'
    ].join(',');

    const visible=el=>{
      if(!el||!el.getBoundingClientRect)return false;
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>20&&r.height>14&&cs.display!=='none'&&
        cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;
    };

    const scoreOption=el=>{
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
      const raw=oneLine(el.value||el.innerText||el.textContent||'');
      const k=n(raw);
      if(!known.has(k))continue;
      found.push({el,text:known.get(k),norm:k,score:scoreOption(el)});
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
          .map(el=>oneLine(el.innerText||el.textContent||el.getAttribute('aria-label')||''))
          .filter(Boolean).slice(0,30)
      };
    }

    const optionNorms=new Set(items.map(x=>x.norm));
    const options=items.map(x=>x.text);
    const clueEntries=[...known.entries()]
      .filter(([k])=>k.length>=4&&!optionNorms.has(k))
      .sort((a,b)=>b[0].length-a[0].length);

    const hitList=text=>{
      const nt=n(text);
      const hits=[];
      const seen=new Set();
      for(const [k,original] of clueEntries){
        if(seen.has(k)||!nt.includes(k))continue;
        seen.add(k);
        hits.push({norm:k,text:original,length:k.length});
        if(hits.length>=30)break;
      }
      return hits;
    };

    const optionRects=items.map(x=>x.el.getBoundingClientRect());
    const left=Math.min(...optionRects.map(r=>r.left));
    const right=Math.max(...optionRects.map(r=>r.right));
    const top=Math.min(...optionRects.map(r=>r.top));
    const answerWidth=Math.max(1,right-left);

    /*
     * FIX6 : trouver le PANNEAU DE QUESTION, pas seulement le wrapper A/B/C/D.
     *
     * On cherche un bloc visible situé au-dessus des quatre propositions,
     * horizontalement aligné avec elles, contenant :
     * - au moins une valeur source de la fiche ;
     * - et idéalement le véritable intitulé visible de la question.
     *
     * Le score favorise :
     * - plusieurs indices source ;
     * - un texte avec "?" ;
     * - l'intitulé du questionnaire s'il est réellement visible ;
     * - la proximité immédiate au-dessus des réponses.
     */
    const blockSelectors='article,section,fieldset,form,div,main,[role="group"],[class*="question"],[class*="quiz"]';
    const panelCandidates=[];

    const candidateQuestionScore=(el,text)=>{
      const nt=n(text);
      const descendants=[el,...el.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span,strong,b')];
      let bestQ={text:'',score:-1};

      for(const node of descendants){
        if(!visible(node))continue;
        const raw=oneLine(node.innerText||node.textContent||'');
        if(raw.length<4||raw.length>260)continue;

        const nk=n(raw);
        if(!nk||optionNorms.has(nk))continue;
        if(options.some(v=>nk===n(v)))continue;

        const cs=getComputedStyle(node);
        const size=parseFloat(cs.fontSize)||0;
        const weight=parseInt(cs.fontWeight,10)||400;
        const tag=node.tagName.toLowerCase();

        let score=0;
        if(/[?？]/.test(raw))score+=1200;
        if(questionnaireNorm&&nk===questionnaireNorm)score+=1000;
        else if(questionnaireNorm&&nk.includes(questionnaireNorm)&&questionnaireNorm.length>=8)score+=650;
        if(/^h[1-6]$/.test(tag))score+=260;
        if(weight>=600)score+=130;
        score+=Math.min(size,40)*4;
        if(raw.length<=140)score+=80;
        if(hitList(raw).length)score-=220;

        if(score>bestQ.score)bestQ={text:raw,score};
      }

      return bestQ;
    };

    for(const el of document.querySelectorAll(blockSelectors)){
      if(!visible(el)||el===document.body||el===document.documentElement)continue;
      if(items.some(x=>el===x.el||el.contains(x.el)))continue;

      const r=el.getBoundingClientRect();
      if(r.top>=top+30||r.bottom>top+45)continue;

      const overlap=Math.max(0,Math.min(r.right,right)-Math.max(r.left,left));
      const overlapRatio=overlap/Math.max(1,Math.min(r.width,answerWidth));
      if(overlapRatio<0.35)continue;

      const distance=Math.max(0,top-r.bottom);
      if(distance>760)continue;

      const rawText=plain(el.innerText||'');
      const flat=oneLine(rawText);
      if(flat.length<8||flat.length>4200)continue;

      const hits=hitList(flat);
      if(!hits.length)continue;

      const q=candidateQuestionScore(el,flat);
      const hitScore=hits.reduce((sum,h)=>sum+Math.min(h.length,220),0);
      let score=
        hits.length*320+
        hitScore+
        Math.max(0,q.score)+
        Math.max(0,320-distance);

      // Éviter un immense conteneur de page lorsqu'un panneau plus précis existe.
      score-=Math.min((r.width*r.height)/6000,260);

      panelCandidates.push({
        el,
        rawText,
        flat,
        hits,
        question:q.text,
        questionScore:q.score,
        distance,
        score,
        area:r.width*r.height
      });
    }

    panelCandidates.sort((a,b)=>
      b.score-a.score ||
      b.hits.length-a.hits.length ||
      a.distance-b.distance ||
      a.area-b.area
    );

    let panel=panelCandidates[0]||null;

    /*
     * Fallback : si le panneau est structurellement lié aux réponses dans un
     * même parent, remonter depuis leur ancêtre commun et conserver le premier
     * bloc contenant plusieurs valeurs source. Ce fallback sert uniquement au
     * contexte ; le mode verbatim reste signalé comme dégradé si aucun intitulé
     * de question n'est extrait.
     */
    let common=items[0].el;
    while(common&&common!==document.body&&!items.every(x=>common.contains(x.el))){
      common=common.parentElement;
    }
    if(!common)common=document.body;

    if(!panel){
      let node=common;
      for(let depth=0;node&&depth<10;depth++,node=node.parentElement){
        if(node===document.documentElement)break;
        const rawText=plain(node.innerText||'');
        const flat=oneLine(rawText);
        const hits=hitList(flat);
        if(!hits.length)continue;
        const q=candidateQuestionScore(node,flat);
        panel={
          el:node,rawText,flat,hits,
          question:q.text,questionScore:q.score,
          distance:0,score:0,area:0
        };
        if(hits.length>=2||q.text)break;
      }
    }

    let panelRaw=panel?.rawText||'';
    let panelText=panel?.flat||'';
    let panelHits=panel?.hits||[];
    let questionText=panel?.question||'';

    /*
     * Reconstituer les lignes visibles du panneau.
     * innerText conserve les ruptures visuelles de Quizypedia.
     */
    let lines=String(panelRaw||'')
      .replace(/\u00a0|\u202f/g,' ')
      .replace(/\r/g,'\n')
      .split(/\n+/)
      .map(s=>s.replace(/[ \t]+/g,' ').trim())
      .filter(Boolean);

    // Si le candidat DOM de question n'a pas été trouvé, chercher une ligne.
    if(!questionText){
      const withQuestionMark=lines.find(line=>/[?？]/.test(line));
      if(withQuestionMark)questionText=withQuestionMark;
      else if(questionnaireNorm){
        const same=lines.find(line=>n(line)===questionnaireNorm);
        if(same)questionText=same;
      }
    }

    const qNorm=n(questionText);
    let qIndex=qNorm ? lines.findIndex(line=>n(line)===qNorm) : -1;

    /*
     * Ne garder dans "detail" que ce qui est VISUELLEMENT après la question
     * dans le panneau. Les titres placés avant la question (ex. nom du thème)
     * sont exclus.
     */
    let detailLines=qIndex>=0 ? lines.slice(qIndex+1) : [];

    // Supprimer d'éventuels compteurs et toute proposition A/B/C/D si un
    // conteneur de fallback les a incluses.
    detailLines=detailLines.filter(line=>{
      const k=n(line);
      if(!k)return false;
      if(/^[\(\[]?\s*\d+\s*\/\s*\d+\s*[\)\]]?$/.test(line))return false;
      if(optionNorms.has(k))return false;
      if(/^[abcd]\s*[.:\-]\s*/i.test(line)){
        const tail=n(line.replace(/^[abcd]\s*[.:\-]\s*/i,''));
        if(optionNorms.has(tail))return false;
      }
      return true;
    });

    /*
     * Quizypedia peut rendre un libellé et sa valeur sur deux lignes
     * ("Particularités :" puis le texte). On les rassemble sans changer les
     * mots ni la ponctuation source.
     */
    const merged=[];
    for(let i=0;i<detailLines.length;i++){
      const line=detailLines[i];
      if(/:\s*$/.test(line)&&i+1<detailLines.length){
        merged.push(`${line} ${detailLines[++i]}`.trim());
      }else{
        merged.push(line);
      }
    }

    const detailText=merged.join('\n').trim();

    /*
     * Contexte d'identification : panneau complet s'il existe, sinon fallback
     * historique. L'identification de la bonne fiche reste indépendante de
     * l'extraction verbatim question/detail.
     */
    let contextText=panelText;
    let contextHits=panelHits;

    if(!contextHits.length){
      const main=document.querySelector('main,[role="main"],#main,.main,.content')||document.body;
      contextText=oneLine(main.innerText||document.body.innerText||'');
      contextHits=hitList(contextText);
    }

    const signature=
      options.map(n).join('|')+'||'+
      n(questionText)+'||'+
      n(detailText).slice(0,1800);

    return {
      ok:true,
      options,
      questionText,
      detailText,
      panelText,
      panelLines:lines.slice(0,30),
      panelHits:panelHits.map(h=>h.text),
      verbatimPanel:Boolean(questionText),
      contextText,
      contextHits:contextHits.map(h=>h.text),
      url:location.href,
      signature
    };
  },sourceValues);
}

function identifySourceFiche(fiches,options,contextText){
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

  const answerLabel=[...coverage.values()]
    .sort((a,b)=>b.values.size-a.values.size)[0];
  if(!answerLabel||answerLabel.values.size<3){
    return {ok:false,error:'Champ de réponse non identifiable depuis les 4 propositions.'};
  }

  const answerLabelKey=norm(answerLabel.label);
  const visible=norm(contextText);
  const candidates=[];
  const semanticBonus=/description|particular|resume|résumé|detail|détail|indice|definition|définition|info/i;

  for(const fiche of fiches){
    const values=[{label:'Nom',value:fiche.name},...(fiche.fields||[])];
    const answerFields=values.filter(f=>
      norm(f.label)===answerLabelKey&&optionNorms.has(norm(f.value))
    );
    if(answerFields.length!==1)continue;

    const clues=[];
    let score=0;
    for(const field of values){
      if(norm(field.label)===answerLabelKey)continue;
      const value=one(field.value),vk=norm(value);
      if(vk.length<4||optionNorms.has(vk))continue;
      if(!visible.includes(vk))continue;

      const label=one(field.label);
      const longBonus=Math.min(vk.length,500);
      const discriminantBonus=vk.length>=25?180:vk.length>=12?70:0;
      const labelBonus=semanticBonus.test(label)?120:0;
      clues.push({label,value,length:vk.length});
      score+=longBonus+discriminantBonus+labelBonus;
    }

    if(score>0){
      candidates.push({
        fiche,
        answer:one(answerFields[0].value),
        clues,
        score,
        longest:Math.max(...clues.map(c=>c.length))
      });
    }
  }

  candidates.sort((a,b)=>
    b.score-a.score || b.longest-a.longest || a.fiche.number-b.fiche.number
  );

  if(!candidates.length){
    return {ok:false,error:'Aucune fiche source ne correspond au contexte complet de la question.'};
  }
  if(candidates.length>1 &&
     candidates[0].score===candidates[1].score &&
     candidates[0].longest===candidates[1].longest){
    return {ok:false,error:'Correspondance ambiguë entre plusieurs fiches source dans le contexte complet.'};
  }

  const hit=candidates[0];
  const correctIndex=options.findIndex(v=>norm(v)===norm(hit.answer))+1;
  if(correctIndex<1){
    return {ok:false,error:'Réponse source absente des quatre propositions visibles.'};
  }

  /* Le détail reste 1:1 : on reprend les valeurs source réellement trouvées.
     Si plusieurs indices sont affichés, ils restent séparés par leurs libellés. */
  const bestClues=[...hit.clues].sort((a,b)=>b.length-a.length);
  const detail=bestClues.length===1
    ? bestClues[0].value
    : bestClues.map(c=>`${c.label} : ${c.value}`).join('\n');

  return {
    ok:true,
    sourceFiche:hit.fiche.name,
    sourceNumber:hit.fiche.number,
    answerLabel:answerLabel.label,
    detail,
    correctIndex,
    correctText:hit.answer,
    matchScore:hit.score
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
  const sessionStats=[];
  try{
    const sourceValues=[...allSourceValues(fiches).values()];
    const expected=fiches.length;
    const questions=[];
    const seen=new Set();

    // FIX3 : plusieurs parties indépendantes, chacune dans une page neuve avec stockage nettoyé.
    const maxSessions=Math.min(10,Math.max(5,Math.ceil(expected/2)));
    let consecutiveNoProgress=0;
    let sessionsUsed=0;

    for(let session=1;session<=maxSessions&&seen.size<expected;session++){
      sessionsUsed=session;
      const seenBefore=seen.size;
      let page=null;
      let cdp=null;
      let sessionEnd='';

      try{
        /*
         * FIX3 FIREBASE :
         * ne pas créer de BrowserContext isolé avec Chromium headless-shell.
         * Chaque session utilise une page neuve dans le contexte par défaut,
         * puis vide explicitement cookies, cache et stockage de Quizypedia.
         */
        page=await browser.newPage();
        await page.setCacheEnabled(false).catch(()=>{});

        cdp=await page.createCDPSession().catch(()=>null);
        if(cdp){
          await cdp.send('Network.enable').catch(()=>{});
          await cdp.send('Network.clearBrowserCookies').catch(()=>{});
          await cdp.send('Network.clearBrowserCache').catch(()=>{});
          await cdp.send('Storage.clearDataForOrigin',{
            origin:new URL(url).origin,
            storageTypes:'all'
          }).catch(()=>{});
        }

        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '+
          '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({'Accept-Language':'fr-FR,fr;q=0.9'});
        page.setDefaultNavigationTimeout(50000);

        await page.goto(url,{
          waitUntil:'networkidle2',
          timeout:50000
        });

        await clickSafeText(page,['Accepter','Tout accepter','J accepte'],{
          allowStartsWith:false
        }).catch(()=>{});

        const started=await startGame(page);
        if(!started){
          sessionEnd='démarrage du jeu introuvable';
          diagnostics.push(`Session ${session}: bouton Jeu normal / Entraînement introuvable.`);
          continue;
        }

        let state=null;
        for(let attempt=0;attempt<18;attempt++){
          state=await collectOptions(page,sourceValues);
          if(state.ok)break;
          await sleep(300);
        }

        if(!state||!state.ok){
          sessionEnd='première question non détectée';
          diagnostics.push(`Session ${session}: première question non détectée.`);
          continue;
        }

        const maxTurns=Math.max(expected*3,24);

        for(let turn=1;turn<=maxTurns&&seen.size<expected;turn++){
          if(!state?.ok){
            sessionEnd='état de question absent';
            diagnostics.push(`Session ${session}, tour ${turn}: état de question absent.`);
            break;
          }

          const match=identifySourceFiche(fiches,state.options,state.contextText);
          if(!match.ok){
            sessionEnd='question non identifiable';
            diagnostics.push(`Session ${session}, tour ${turn}: ${match.error}`);
            diagnostics.push(`Propositions: ${state.options.join(' | ')}`);
            if(state.contextHits?.length){
              diagnostics.push(
                `Valeurs source dans le contexte: ${state.contextHits.slice(0,8).join(' | ')}`
              );
            }
            if(state.panelLines?.length){
              diagnostics.push(
                `Panneau visible: ${state.panelLines.slice(0,12).join(' | ')}`
              );
            }
            break;
          }

          if(!seen.has(match.sourceNumber)){
            if(!state.questionText){
              sessionEnd='intitulé visible introuvable';
              diagnostics.push(
                `Session ${session}, tour ${turn}: panneau Quizypedia trouvé mais intitulé visible de question introuvable.`
              );
              if(state.panelLines?.length){
                diagnostics.push(`Panneau: ${state.panelLines.slice(0,12).join(' | ')}`);
              }
              break;
            }

            questions.push({
              question:state.questionText,
              detail:state.detailText||'',
              options:state.options,
              correct_index:match.correctIndex,
              correct_text:match.correctText,
              source_fiche:match.sourceFiche,
              source_number:match.sourceNumber,
              answer_label:match.answerLabel,
              verbatim_panel:true
            });
            seen.add(match.sourceNumber);
          }

          if(seen.size>=expected){
            sessionEnd='capture complète';
            break;
          }

          const clicked=await clickOption(page,match.correctText);
          if(!clicked){
            sessionEnd='réponse source non cliquable';
            diagnostics.push(
              `Session ${session}, tour ${turn}: réponse source « ${match.correctText} » non cliquable.`
            );
            break;
          }

          const advanced=await advanceSafely(
            page,sourceValues,state,questionnairePath
          );

          if(!advanced.ok){
            /*
             * FIX2 : absence de Suivant = FIN DE PARTIE probable.
             * Ce n'est plus une erreur fatale. On ferme cette session puis on
             * relance automatiquement une partie totalement neuve en gardant
             * toutes les fiches déjà capturées dans "seen".
             */
            sessionEnd='fin de partie probable';
            diagnostics.push(
              `Session ${session}, tour ${turn}: fin de partie probable ; reprise automatique dans une nouvelle session.`
            );
            break;
          }

          state=advanced.state;
        }
      }catch(e){
        sessionEnd=`exception: ${e.message}`;
        diagnostics.push(`Session ${session}: ${e.message}`);
      }finally{
        const newCount=seen.size-seenBefore;
        sessionStats.push({
          session,
          newQuestions:newCount,
          totalSeen:seen.size,
          end:sessionEnd||'session terminée'
        });

        if(cdp)await cdp.detach().catch(()=>{});
        if(page)await page.close().catch(()=>{});

        if(newCount===0)consecutiveNoProgress++;
        else consecutiveNoProgress=0;
      }

      if(seen.size>=expected)break;

      // Évite de tourner inutilement si 3 sessions neuves consécutives n'apportent rien.
      if(consecutiveNoProgress>=3){
        diagnostics.push(
          `Arrêt de sécurité après ${consecutiveNoProgress} sessions consécutives sans nouvelle fiche.`
        );
        break;
      }

      // Petit délai avant de relancer une partie indépendante.
      await sleep(500);
    }

    questions.sort((a,b)=>a.source_number-b.source_number);

    const missingFiches=fiches
      .filter(f=>!seen.has(Number(f.number)))
      .map(f=>({
        number:Number(f.number),
        total:Number(f.total||expected),
        name:one(f.name),
        position:f.position||`(${f.number} / ${f.total||expected})`
      }))
      .sort((a,b)=>a.number-b.number);

    if(questions.length!==expected){
      const missingText=missingFiches.length
        ? missingFiches.map(f=>`${f.name} — n°${f.number}/${f.total}`).join(' ; ')
        : 'indéterminée';

      diagnostics.unshift(
        `Fiche(s) source manquante(s) : ${missingText}.`
      );
      diagnostics.unshift(
        `Capture incomplète après reprise multi-session : ${questions.length}/${expected}.`
      );
    }else if(sessionStats.length>1){
      diagnostics.unshift(
        `Capture complète ${questions.length}/${expected} en ${sessionStats.length} session(s) Firebase-compatibles.`
      );
    }

    return {
      questions,
      complete:questions.length===expected,
      diagnostics,
      missingFiches,
      sessionsUsed:sessionStats.length,
      sessionStats
    };
  }finally{
    await browser.close().catch(()=>{});
  }
}

exports.cgimport002Quizypedia=onRequest({
  region:'europe-west1',
  timeoutSeconds:420,
  memory:'1GiB',
  concurrency:2,
  cors:[
    'https://culturegeneralesync.web.app',
    'https://culturegeneralesync.firebaseapp.com'
  ]
},async(req,res)=>{
  const startedAt=Date.now();
  try{
    if(req.method!=='POST'){
      return res.status(405).json({ok:false,error:'Méthode non autorisée.'});
    }
    await requireUser(req);

    const raw=one(req.body?.url);
    const mode=one(req.body?.mode||'auto').toLowerCase();
    const parsed=parseQuizypediaUrl(raw);

    /*
     * CGIMPORT009 DISCOVERY
     * Une URL de thème ne lance pas Chromium. On lit seulement la page du thème
     * et on renvoie les questionnaires appartenant exactement à ce thème.
     */
    if(mode==='discover'||parsed.kind==='theme'){
      const {response,html}=await fetchQuizypedia(parsed.url.toString());
      const effectiveParsed=parseQuizypediaUrl(response.url);

      const questionnaires=discoverQuestionnairesFromTheme(
        html,
        response.url,
        effectiveParsed.theme||parsed.theme
      );

      console.log('CGIMPORT009 discover:',{
        theme:effectiveParsed.theme||parsed.theme,
        count:questionnaires.length,
        ms:Date.now()-startedAt
      });

      return res.json({
        ok:true,
        mode:'discover',
        kind:'theme',
        requestedUrl:raw,
        effectiveUrl:response.url,
        theme:effectiveParsed.theme||parsed.theme,
        questionnaires,
        count:questionnaires.length
      });
    }

    if(parsed.kind!=='questionnaire'){
      throw Object.assign(new Error(
        'Une URL de questionnaire est requise pour la capture individuelle.'
      ),{status:400});
    }

    /*
     * CAPTURE INDIVIDUELLE
     * Le moteur FIX6 reste inchangé : chaque appel ne traite qu'un questionnaire.
     * Le frontend CGIMPORT009 enchaîne ces appels un par un pour éviter un énorme
     * traitement serveur unique.
     */
    console.log('CGIMPORT009 FIX4 capture start:',{
      url:parsed.url.toString(),
      questionnaire:parsed.questionnaire
    });

    const {response,html}=await fetchQuizypedia(parsed.url.toString());
    const lines=linesFromHtml(html);
    const labels=dynamicLabels(html);
    const fiches=rawFiches(lines);
    const inferred=inferLabels(fiches);
    const allLabels=[...new Set([...labels,...inferred])];
    for(const f of fiches)f.fields=parseFields(f.lines,allLabels);

    if(fiches.length<4){
      throw new Error(
        `CGIMPORT009 strict : seulement ${fiches.length} fiche(s) source détectée(s).`
      );
    }

    const capture=await captureStrictQuestionnaire(
      response.url,
      fiches,
      parsed.questionnaire,
      parsed.pathname
    );

    console.log('CGIMPORT009 FIX4 capture end:',{
      questionnaire:parsed.questionnaire,
      questions:capture.questions.length,
      fiches:fiches.length,
      complete:capture.complete,
      ms:Date.now()-startedAt
    });

    return res.json({
      ok:true,
      mode:'capture',
      kind:'questionnaire',
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
      diagnostics:capture.diagnostics,
      missingFiches:capture.missingFiches||[],
      sessionsUsed:capture.sessionsUsed||1,
      sessionStats:capture.sessionStats||[]
    });
  }catch(e){
    console.error('CGIMPORT009 FIX4',e);
    return res.status(e.status||500).json({
      ok:false,
      strict:true,
      error:e.message||'Erreur serveur CGIMPORT009 FIX4.'
    });
  }
});

// CGIMAGE005_EXPORT
exports.cgimage005MigrateBatch = require('./cgimage005').cgimage005MigrateBatch;
