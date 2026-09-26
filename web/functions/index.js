// CGWEB116_FIX3_FIX4_FIX7_UNRESOLVED_QUESTION_SKIP001
// CGWEB116_FIX3_FIX4_FIX5_FICHE_IMAGE_LINK_CAPTURE001_IMAGE_SOURCE_NORMALIZE001_PHOTO_QUESTION_RESOLVE001
// CGWEB116_FIX3_FIX4_FIX4_PORTRAIT_AMBIGUITY_TIEBREAK001
// CGIMPORT010 · LEGACY_PLAYWRIGHT_PORT001 / DIRECT_QUIZ_CAPTURE001
// Moteur primaire : capture directe du payload réseau Quizypedia get_quiz_game.
// Champs historiques utilisés tels quels : quiz_items, question,
// proposed_responses, response_index, hints.
// Aucune reconstruction de la bonne réponse à partir des fiches source.
// CGIMPORT009 FIX5/FIX6 restent présents comme fallback de compatibilité.
// CGIMPORT009_FIX5_PORTRAIT_QUESTION_MATCH001_IMAGE_CONTEXT_IDENTITY001
// CGIMPORT009_FIX6_PORTRAIT_RESOURCE_TRACE001_IMAGE_RESOURCE_IDENTITY002
// CGIMPORT010_LEGACY_PLAYWRIGHT_PORT001_DIRECT_QUIZ_CAPTURE001

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

/* ============================================================
   CGWEB116 FIX3 FIX4 FIX5
   FICHE_IMAGE_LINK_CAPTURE001
   IMAGE_SOURCE_NORMALIZE001
   ============================================================ */

function cg116DecodeLoose(value){
  let text=String(value??'').trim();

  for(let i=0;i<3;i++){
    try{
      const decoded=decodeURIComponent(text);
      if(decoded===text)break;
      text=decoded;
    }catch{
      break;
    }
  }

  return text;
}


function cg116ImageKey(raw){

  let text=
    cg116DecodeLoose(raw);

  if(!text)return '';


  /*
   * Cas typiques :
   *
   * fr.wikipedia.org/.../Fichier:Maurice_Thorez_(1900-1964).jpg
   * upload.wikimedia.org/.../300px-Maurice_Thorez_(1900-1964).jpg
   *
   * On veut dans les deux cas :
   * maurice thorez 1900 1964
   */

  const fileMatch=
    text.match(
      /(?:fichier|file)\s*:\s*([^?#&]+)/i
    );

  if(fileMatch){
    text=fileMatch[1];
  }else{
    text=
      text
        .split(/[?#]/)[0]
        .split('/')
        .filter(Boolean)
        .pop() || text;
  }


  text=
    cg116DecodeLoose(text)
      .replace(/^thumb[-_]/i,'')
      .replace(/^\d{2,5}px[-_]/i,'')
      .replace(
        /\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)$/i,
        ''
      )
      .replace(/[_+]+/g,' ');


  return norm(text);
}


function cg116LooksLikeImageLink(raw,label=''){

  const text=
    cg116DecodeLoose(raw);

  const lab=
    norm(label);


  return (
    /\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)(?:[?#]|$)/i.test(text) ||
    /upload\.wikimedia\.org/i.test(text) ||
    /(?:fichier|file)\s*:/i.test(text) ||
    /\/media\//i.test(text) ||
    /(?:image|photo|portrait|vignette)/i.test(lab)
  );
}


function cg116AttachFicheImageLinks(
  html,
  fiches,
  effectiveUrl
){

  const $=
    cheerio.load(html);


  for(const fiche of fiches){
    fiche.imageLinks=[];
  }


  const seen=
    new Set();


  const absolute=raw=>{

    raw=one(raw);

    if(!raw)return '';

    try{
      return new URL(
        raw,
        effectiveUrl
      ).toString();
    }catch{
      return raw;
    }
  };


  const identifyFicheFromNode=node=>{

    let current=node;


    /*
     * On remonte dans le DOM jusqu'au bloc de la fiche.
     * Une seule fiche doit être identifiable dans ce bloc.
     */
    for(
      let depth=0;
      current && depth<12;
      depth++
    ){

      const text=
        norm(
          $(current).text()
        );


      if(text){

        const hits=
          fiches.filter(fiche=>{

            const name=
              norm(fiche.name);

            return (
              name.length>=4 &&
              text.includes(name)
            );
          });


        if(hits.length===1){
          return hits[0];
        }
      }


      current=
        $(current)
          .parent()
          .get(0);
    }


    return null;
  };


  const selector=[
    'a[href]',
    'img[src]',
    'img[data-src]',
    'img[data-original]',
    'img[data-lazy-src]',
    'img[srcset]',
    'source[src]',
    'source[srcset]'
  ].join(',');


  $(selector).each((_,node)=>{

    const el=
      $(node);


    const urls=[];


    const add=value=>{
      value=one(value);

      if(value){
        urls.push(
          absolute(value)
        );
      }
    };


    add(el.attr('href'));
    add(el.attr('src'));
    add(el.attr('data-src'));
    add(el.attr('data-original'));
    add(el.attr('data-lazy-src'));


    const srcset=
      one(
        el.attr('srcset') ||
        el.attr('data-srcset')
      );


    if(srcset){

      for(const part of srcset.split(',')){

        const src=
          part
            .trim()
            .split(/\s+/)[0];

        if(src){
          add(src);
        }
      }
    }


    const figure=
      el.closest('figure');


    const metadata=[
      el.attr('alt'),
      el.attr('title'),
      el.attr('aria-label'),
      el.text(),
      figure.length
        ? figure
            .find('figcaption')
            .first()
            .text()
        : ''
    ]
      .map(one)
      .filter(Boolean);


    const uniqueUrls=
      [...new Set(urls)];


    const relevant=
      uniqueUrls.some(
        url=>
          cg116LooksLikeImageLink(
            url,
            metadata.join(' ')
          )
      ) ||
      metadata.some(
        text=>
          cg116LooksLikeImageLink(
            '',
            text
          )
      );


    if(!relevant){
      return;
    }


    let fiche=
      identifyFicheFromNode(node);


    /*
     * Sécurité complémentaire :
     * le nom du fichier peut lui-même contenir
     * explicitement le nom d'une fiche.
     */
    if(!fiche){

      const combined=
        norm(
          [
            ...uniqueUrls,
            ...metadata
          ].join(' | ')
        );


      const matching=
        fiches.filter(f=>{

          const name=
            norm(f.name);

          return (
            name.length>=4 &&
            combined.includes(name)
          );
        });


      if(matching.length===1){
        fiche=matching[0];
      }
    }


    if(!fiche){
      return;
    }


    const keys=[
      ...new Set(
        [
          ...uniqueUrls,
          ...metadata
        ]
          .map(cg116ImageKey)
          .filter(
            key=>
              key.length>=5
          )
      )
    ];


    if(!keys.length){
      return;
    }


    const signature=
      [
        fiche.number,
        ...keys
      ].join('|');


    if(seen.has(signature)){
      return;
    }

    seen.add(signature);


    fiche.imageLinks.push({
      urls:uniqueUrls,
      metadata,
      keys
    });
  });


  return {
    fiches:
      fiches.filter(
        f=>
          f.imageLinks.length
      ).length,

    links:
      fiches.reduce(
        (sum,f)=>
          sum+f.imageLinks.length,
        0
      )
  };
}


/*
 * Résolution d'une question photo.
 *
 * On compare uniquement :
 * - l'URL / nom de fichier conservé dans la fiche ;
 * - l'URL / nom de fichier chargé pendant la question.
 */
function cg116ResolvePhotoQuestion({
  fiches,
  options,
  answerLabelKey,
  imageContextText='',
  resourceRecentText='',
  resourceAllText='',
  allowedNumbers=null
}){

  const optionNorms=
    new Set(
      options.map(norm)
    );


  const contexts=[
    {
      raw:imageContextText,
      mode:'fiche-image-dom',
      weight:30000
    },
    {
      raw:resourceRecentText,
      mode:'fiche-image-resource-recent',
      weight:20000
    },
    {
      raw:resourceAllText,
      mode:'fiche-image-resource-all',
      weight:10000
    }
  ]
    .filter(
      x=>one(x.raw)
    );


  for(const context of contexts){

    const contextNorm=
      norm(
        cg116DecodeLoose(
          context.raw
        )
      );


    const contextCompact=
      contextNorm.replace(
        /\s+/g,
        ''
      );


    const rows=[];


    for(const fiche of fiches){

      if(
        allowedNumbers &&
        !allowedNumbers.has(
          Number(fiche.number)
        )
      ){
        continue;
      }


      if(
        !Array.isArray(
          fiche.imageLinks
        ) ||
        !fiche.imageLinks.length
      ){
        continue;
      }


      const values=[
        {
          label:'Nom',
          value:fiche.name
        },
        ...(fiche.fields||[])
      ];


      const answerFields=
        values.filter(
          field=>
            norm(field.label)===
              answerLabelKey &&
            optionNorms.has(
              norm(field.value)
            )
        );


      if(answerFields.length!==1){
        continue;
      }


      let bestScore=0;
      let bestKey='';


      for(const link of fiche.imageLinks){

        for(const key0 of link.keys||[]){

          const key=
            norm(key0);


          if(key.length<5){
            continue;
          }


          const compact=
            key.replace(
              /\s+/g,
              ''
            );


          const normalHit=
            contextNorm.includes(
              key
            );


          const compactHit=
            compact.length>=6 &&
            contextCompact.includes(
              compact
            );


          if(
            !normalHit &&
            !compactHit
          ){
            continue;
          }


          const score=
            context.weight +
            Math.min(
              key.length,
              1000
            );


          if(score>bestScore){
            bestScore=score;
            bestKey=key;
          }
        }
      }


      if(bestScore){

        rows.push({
          fiche,
          answer:
            one(
              answerFields[0].value
            ),
          score:bestScore,
          key:bestKey,
          mode:context.mode
        });
      }
    }


    rows.sort(
      (a,b)=>
        b.score-a.score ||
        a.fiche.number-
        b.fiche.number
    );


    if(!rows.length){
      continue;
    }


    /*
     * Règle absolue :
     * une seule fiche doit gagner.
     */
    if(
      rows.length>1 &&
      rows[0].score===
      rows[1].score
    ){
      continue;
    }


    const hit=
      rows[0];


    const correctIndex=
      options.findIndex(
        value=>
          norm(value)===
          norm(hit.answer)
      )+1;


    if(correctIndex<1){
      continue;
    }


    return {
      ok:true,
      sourceFiche:
        hit.fiche.name,
      sourceNumber:
        hit.fiche.number,
      answerLabel:'',
      detail:'',
      correctIndex,
      correctText:
        hit.answer,
      matchScore:
        hit.score,
      matchMode:
        hit.mode,
      imageKey:
        hit.key
    };
  }


  return null;
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
     * FIX5 · IMAGE_CONTEXT_IDENTITY001
     *
     * Les questions de type « portrait » n'ont parfois aucun indice textuel
     * permettant d'identifier la fiche source. On collecte alors UNIQUEMENT
     * l'identité exposée par le DOM de l'image visible :
     * alt/title/aria-label/data-*, URL src/currentSrc/background-image,
     * lien parent et éventuelle légende <figcaption>.
     *
     * Aucune reconnaissance visuelle, aucun OCR, aucune déduction externe.
     */
    const decodeSafe=value=>{
      const raw=String(value??'');
      try{return decodeURIComponent(raw);}catch{return raw;}
    };

    const imageCandidates=[];
    const imageSelector=[
      'img','picture img','svg image',
      '[class*="portrait"]','[class*="photo"]','[class*="image"]','[class*="picture"]',
      '[style*="background-image"]'
    ].join(',');

    for(const node of document.querySelectorAll(imageSelector)){
      const el=node.tagName?.toLowerCase()==='image' ? (node.ownerSVGElement||node) : node;
      if(!visible(el))continue;

      const r=el.getBoundingClientRect();
      if(r.width<45||r.height<45)continue;
      if(r.top>top+80)continue;

      const overlap=Math.max(0,Math.min(r.right,right)-Math.max(r.left,left));
      const overlapRatio=overlap/Math.max(1,Math.min(r.width,answerWidth));
      if(overlapRatio<0.20)continue;

      const distance=Math.max(0,top-r.bottom);
      if(distance>900)continue;

      const attrs=[];
      for(const a of [...(node.attributes||[])]){
        if(!a?.value)continue;
        if(a.name==='style'&&a.value.length>500)continue;
        attrs.push(`${a.name}=${decodeSafe(a.value)}`);
      }

      let src='';
      if(node.tagName?.toLowerCase()==='img'){
        src=node.currentSrc||node.src||node.getAttribute('src')||
          node.getAttribute('data-src')||node.getAttribute('data-original')||
          node.getAttribute('data-lazy-src')||'';
      }else if(node.tagName?.toLowerCase()==='image'){
        src=node.getAttribute('href')||node.getAttribute('xlink:href')||'';
      }

      const bg=getComputedStyle(el).backgroundImage||'';
      const bgUrl=(bg.match(/url\(["']?(.+?)["']?\)/)||[])[1]||'';

      const figure=node.closest?.('figure');
      const caption=figure?.querySelector?.('figcaption');
      const link=node.closest?.('a[href]');

      const meta=[
        node.getAttribute?.('alt'),
        node.getAttribute?.('title'),
        node.getAttribute?.('aria-label'),
        src,
        bgUrl,
        link?.href,
        caption?.innerText,
        attrs.join(' ')
      ]
        .map(decodeSafe)
        .map(oneLine)
        .filter(Boolean)
        .join(' | ');

      if(!meta)continue;

      let score=overlapRatio*500+Math.max(0,500-distance);
      score+=Math.min((r.width*r.height)/3500,220);
      if(node.tagName?.toLowerCase()==='img')score+=80;
      if(node.getAttribute?.('alt'))score+=100;
      if(node.getAttribute?.('title')||node.getAttribute?.('aria-label'))score+=80;

      imageCandidates.push({
        meta,
        score,
        distance,
        area:r.width*r.height
      });
    }

    imageCandidates.sort((a,b)=>
      b.score-a.score || a.distance-b.distance || b.area-a.area
    );

    const imageContextSources=[];
    const imageSeen=new Set();
    for(const candidate of imageCandidates){
      const k=n(candidate.meta);
      if(!k||imageSeen.has(k))continue;
      imageSeen.add(k);
      imageContextSources.push(candidate.meta);
      if(imageContextSources.length>=4)break;
    }
    const imageContextText=oneLine(imageContextSources.join(' | '));

    /*
     * FIX6 · PORTRAIT_RESOURCE_TRACE001
     *
     * Certains portraits sont dessinés ou encapsulés de sorte que le DOM
     * visible n'expose ni src, ni alt exploitable. Chromium conserve malgré
     * tout la liste des ressources chargées dans Resource Timing.
     *
     * On collecte :
     * - performance.getEntriesByType('resource') ;
     * - les src/currentSrc/srcset encore présents dans img/source ;
     * - uniquement les ressources d'allure image OU contenant une proposition.
     *
     * Aucun pixel n'est lu. Aucun OCR. Aucune reconnaissance faciale.
     */
    const optionKeys=options.map((text,index)=>{
      const key=n(text);
      return {
        index:index+1,
        text,
        key,
        compact:key.replace(/\s+/g,'')
      };
    });

    const resourceRows=[];
    const resourceSeen=new Set();
    const perfNow=performance.now();

    const optionMatchesInResource=text=>{
      const key=n(text);
      const compact=key.replace(/\s+/g,'');
      const hits=[];
      for(const opt of optionKeys){
        if(opt.key.length<4)continue;
        const phrase=key.includes(opt.key);
        const compactHit=
          opt.compact.length>=6 && compact.includes(opt.compact);
        if(phrase||compactHit)hits.push(opt.index);
      }
      return [...new Set(hits)];
    };

    const addResource=(raw,kind='other',responseEnd=null)=>{
      const decoded=oneLine(decodeSafe(raw));
      if(!decoded)return;

      const normalized=n(decoded);
      if(!normalized)return;

      const lower=decoded.toLowerCase();
      const matches=optionMatchesInResource(decoded);

      const imageLike=
        kind==='img' ||
        kind==='image' ||
        kind==='dom-img' ||
        kind==='dom-source' ||
        /\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)(?:[?#]|$)/i.test(lower) ||
        /(?:image|img|photo|portrait|picture|media|thumbnail|thumb)/i.test(lower);

      if(!imageLike && !matches.length)return;

      const dedupKey=kind+'|'+normalized;
      if(resourceSeen.has(dedupKey))return;
      resourceSeen.add(dedupKey);

      let ageMs=null;
      if(Number.isFinite(Number(responseEnd)) && Number(responseEnd)>0){
        ageMs=Math.max(0,perfNow-Number(responseEnd));
      }

      resourceRows.push({
        text:decoded,
        kind,
        ageMs,
        recent:ageMs!==null && ageMs<=20000,
        matches
      });
    };

    try{
      for(const entry of performance.getEntriesByType('resource')||[]){
        addResource(
          entry.name,
          String(entry.initiatorType||'resource').toLowerCase(),
          entry.responseEnd||entry.startTime||null
        );
      }
    }catch{}

    for(const img of document.querySelectorAll('img')){
      addResource(
        img.currentSrc || img.src || img.getAttribute('src') ||
        img.getAttribute('data-src') || img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') || '',
        'dom-img',
        null
      );

      const srcset=img.getAttribute('srcset')||img.getAttribute('data-srcset')||'';
      for(const part of srcset.split(',')){
        const candidate=part.trim().split(/\s+/)[0]||'';
        if(candidate)addResource(candidate,'dom-img',null);
      }
    }

    for(const source of document.querySelectorAll('source[srcset],source[src]')){
      const srcset=source.getAttribute('srcset')||source.getAttribute('src')||'';
      for(const part of srcset.split(',')){
        const candidate=part.trim().split(/\s+/)[0]||'';
        if(candidate)addResource(candidate,'dom-source',null);
      }
    }

    resourceRows.sort((a,b)=>{
      const matchDiff=b.matches.length-a.matches.length;
      if(matchDiff)return matchDiff;
      const recentDiff=Number(b.recent)-Number(a.recent);
      if(recentDiff)return recentDiff;
      const aa=a.ageMs===null?1e12:a.ageMs;
      const bb=b.ageMs===null?1e12:b.ageMs;
      return aa-bb;
    });

    const resourceRecentRows=resourceRows.filter(r=>r.recent);
    const resourceRecentText=oneLine(
      resourceRecentRows.slice(0,40).map(r=>r.text).join(' | ')
    );
    const resourceAllText=oneLine(
      resourceRows.slice(0,100).map(r=>r.text).join(' | ')
    );

    const resourceContextSources=resourceRows.slice(0,12).map(r=>{
      const age=r.ageMs===null?'':` · ${Math.round(r.ageMs)} ms`;
      const matches=r.matches.length?` · option(s) ${r.matches.join(',')}`:'';
      return `${r.kind}${age}${matches} · ${r.text}`;
    });

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

    /*
     * FIX5 : un panneau portrait peut ne contenir aucune valeur textuelle
     * provenant de la fiche. Dans ce cas, chercher prudemment un intitulé
     * interrogatif visible au-dessus des quatre réponses.
     */
    if(!questionText&&imageContextText){
      const qCandidates=[];
      for(const node of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span,strong,b')){
        if(!visible(node))continue;
        const raw=oneLine(node.innerText||node.textContent||'');
        if(raw.length<4||raw.length>260||!/[?？]/.test(raw))continue;

        const nk=n(raw);
        if(!nk||optionNorms.has(nk))continue;

        const r=node.getBoundingClientRect();
        if(r.top>=top+40||r.bottom>top+80)continue;

        const overlap=Math.max(0,Math.min(r.right,right)-Math.max(r.left,left));
        const overlapRatio=overlap/Math.max(1,Math.min(r.width,answerWidth));
        if(overlapRatio<0.25)continue;

        const distance=Math.max(0,top-r.bottom);
        if(distance>900)continue;

        const tag=node.tagName.toLowerCase();
        const cs=getComputedStyle(node);
        const size=parseFloat(cs.fontSize)||0;
        const weight=parseInt(cs.fontWeight,10)||400;

        let score=1800+overlapRatio*300+Math.max(0,500-distance);
        if(/^h[1-6]$/.test(tag))score+=200;
        if(weight>=600)score+=100;
        score+=Math.min(size,40)*3;

        qCandidates.push({raw,score,distance});
      }

      qCandidates.sort((a,b)=>b.score-a.score||a.distance-b.distance);
      if(qCandidates[0]){
        questionText=qCandidates[0].raw;
        if(!panelText){
          panelText=questionText;
          panelRaw=questionText;
          lines=[questionText];
        }
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
      n(detailText).slice(0,1800)+'||'+
      n(imageContextText).slice(0,1200);

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
      imageContextText,
      imageContextSources,
      resourceRecentText,
      resourceAllText,
      resourceContextSources,
      url:location.href,
      signature
    };
  },sourceValues);
}

function identifySourceFiche(
  fiches,
  options,
  contextText,
  imageContextText='',
  resourceRecentText='',
  resourceAllText=''
){
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

  const photoResolve=(allowedNumbers=null)=>
    cg116ResolvePhotoQuestion({
      fiches,
      options,
      answerLabelKey,
      imageContextText,
      resourceRecentText,
      resourceAllText,
      allowedNumbers
    });

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

    const photoMatch=
      photoResolve();

    if(photoMatch){
      photoMatch.answerLabel=
        answerLabel.label;

      return photoMatch;
    }

    /*
     * FIX6 · identité stricte hors contexte texte.
     *
     * Ordre :
     *   1. métadonnées DOM de l'image (FIX5)
     *   2. ressources image chargées dans les 20 dernières secondes
     *   3. ensemble des ressources image connues de la page
     *
     * A chaque étape : exactement UNE des quatre propositions doit ressortir.
     */
    const identityMatch=(rawContext,matchMode)=>{
      const visible=norm(rawContext);
      const compact=visible.replace(/\s+/g,'');
      if(!visible)return {kind:'none'};

      const matches=[];

      for(const fiche of fiches){
        const values=[{label:'Nom',value:fiche.name},...(fiche.fields||[])];
        const answerFields=values.filter(f=>
          norm(f.label)===answerLabelKey && optionNorms.has(norm(f.value))
        );
        if(answerFields.length!==1)continue;

        const answer=one(answerFields[0].value);
        const answerKey=norm(answer);
        const answerCompact=answerKey.replace(/\s+/g,'');

        if(answerKey.length<4 || answerCompact.length<4)continue;

        const phraseMatch=visible.includes(answerKey);
        const compactMatch=
          answerCompact.length>=6 && compact.includes(answerCompact);

        if(!phraseMatch && !compactMatch)continue;

        matches.push({
          fiche,
          answer,
          phraseMatch,
          compactMatch
        });
      }

      const unique=new Map();
      for(const x of matches){
        unique.set(Number(x.fiche.number),x);
      }
      const rows=[...unique.values()];

      if(rows.length===0)return {kind:'none'};
      if(rows.length>1)return {kind:'ambiguous',count:rows.length};

      const hit=rows[0];
      const correctIndex=options.findIndex(v=>norm(v)===norm(hit.answer))+1;
      if(correctIndex<1){
        return {kind:'invalid'};
      }

      return {
        kind:'one',
        value:{
          ok:true,
          sourceFiche:hit.fiche.name,
          sourceNumber:hit.fiche.number,
          answerLabel:answerLabel.label,
          detail:'',
          correctIndex,
          correctText:hit.answer,
          matchScore:1000,
          matchMode
        }
      };
    };

    const imageMatch=identityMatch(imageContextText,'image-context');
    if(imageMatch.kind==='one')return imageMatch.value;
    if(imageMatch.kind==='ambiguous'){
      return {
        ok:false,
        error:'Contexte image ambigu : plusieurs réponses visibles sont présentes dans les métadonnées de l’image.'
      };
    }
    if(imageMatch.kind==='invalid'){
      return {
        ok:false,
        error:'Identité image trouvée mais réponse absente des quatre propositions visibles.'
      };
    }

    const recentResourceMatch=identityMatch(
      resourceRecentText,
      'image-resource-recent'
    );
    if(recentResourceMatch.kind==='one')return recentResourceMatch.value;
    if(recentResourceMatch.kind==='ambiguous'){
      return {
        ok:false,
        error:'Ressources image récentes ambiguës : plusieurs propositions visibles apparaissent dans les ressources chargées.'
      };
    }
    if(recentResourceMatch.kind==='invalid'){
      return {
        ok:false,
        error:'Identité trouvée dans une ressource image récente mais absente des quatre propositions visibles.'
      };
    }

    const allResourceMatch=identityMatch(
      resourceAllText,
      'image-resource-all'
    );
    if(allResourceMatch.kind==='one')return allResourceMatch.value;
    if(allResourceMatch.kind==='ambiguous'){
      return {
        ok:false,
        error:'Ressources image ambiguës : plusieurs propositions visibles apparaissent dans les ressources connues de la page.'
      };
    }
    if(allResourceMatch.kind==='invalid'){
      return {
        ok:false,
        error:'Identité trouvée dans une ressource image mais absente des quatre propositions visibles.'
      };
    }

    return {
      ok:false,
      error:'Aucune fiche source ne correspond au contexte texte, aux métadonnées image ni aux ressources image chargées.'
    };
  }
  if(candidates.length>1 &&
     candidates[0].score===candidates[1].score &&
     candidates[0].longest===candidates[1].longest){

    /*
     * CGWEB116 FIX3 FIX4 FIX4
     * PORTRAIT_AMBIGUITY_TIEBREAK001
     *
     * Plusieurs fiches peuvent partager exactement le même
     * contexte textuel : portrait, photo, drapeau, monument...
     *
     * Avant de déclarer l'ambiguïté, utiliser l'identité
     * éventuellement portée par l'image visible ou sa ressource.
     */

    const topScore=candidates[0].score;
    const topLongest=candidates[0].longest;

    const tiedNumbers=new Set(
      candidates
        .filter(c=>
          c.score===topScore &&
          c.longest===topLongest
        )
        .map(c=>Number(c.fiche.number))
    );


    const photoMatch=
      photoResolve(
        tiedNumbers
      );

    if(photoMatch){

      photoMatch.answerLabel=
        answerLabel.label;

      return photoMatch;
    }


    const resolveImageTie=(rawContext,matchMode)=>{

      const visible=norm(rawContext);
      const compact=visible.replace(/\\s+/g,'');

      if(!visible)return null;

      const hits=[];


      for(const fiche of fiches){

        if(!tiedNumbers.has(Number(fiche.number))){
          continue;
        }

        const values=[
          {label:'Nom',value:fiche.name},
          ...(fiche.fields||[])
        ];

        const answerFields=
          values.filter(f=>
            norm(f.label)===answerLabelKey &&
            optionNorms.has(norm(f.value))
          );

        if(answerFields.length!==1)continue;

        const answer=one(answerFields[0].value);
        const key=norm(answer);
        const compactKey=key.replace(/\\s+/g,'');

        if(key.length<4)continue;

        const phrase=
          visible.includes(key);

        const compactHit=
          compactKey.length>=6 &&
          compact.includes(compactKey);

        if(!phrase&&!compactHit)continue;

        hits.push({
          fiche,
          answer
        });
      }


      const unique=new Map();

      for(const hit of hits){
        unique.set(
          Number(hit.fiche.number),
          hit
        );
      }

      const rows=[...unique.values()];

      /*
       * Sécurité absolue :
       * l'image doit identifier UNE SEULE fiche.
       */
      if(rows.length!==1){
        return null;
      }


      const hit=rows[0];

      const correctIndex=
        options.findIndex(
          v=>norm(v)===norm(hit.answer)
        )+1;

      if(correctIndex<1){
        return null;
      }


      return {
        ok:true,
        sourceFiche:hit.fiche.name,
        sourceNumber:hit.fiche.number,
        answerLabel:answerLabel.label,
        detail:'',
        correctIndex,
        correctText:hit.answer,
        matchScore:topScore+2000,
        matchMode
      };
    };


    /*
     * Priorité à l'image réellement associée
     * à la question courante.
     */
    const contexts=[
      [
        imageContextText,
        'image-context-tiebreak'
      ],
      [
        resourceRecentText,
        'image-resource-recent-tiebreak'
      ],
      [
        resourceAllText,
        'image-resource-all-tiebreak'
      ]
    ];


    for(const [context,mode] of contexts){

      const resolved=
        resolveImageTie(
          context,
          mode
        );

      if(resolved){
        return resolved;
      }
    }


    return {
      ok:false,
      error:'Correspondance ambiguë entre plusieurs fiches source dans le contexte complet.'
    };
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
    matchScore:hit.score,
    matchMode:'text-context'
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


/* ==================================================================
   CGIMPORT010 · LEGACY_PLAYWRIGHT_PORT001 / DIRECT_QUIZ_CAPTURE001

   Port du moteur historique quizypedia_extract_v8_playwright.py :
   - ouvrir le questionnaire ;
   - cliquer « Jeu normal » ;
   - capturer la réponse réseau get_quiz_game ;
   - lire quiz_items / question / proposed_responses /
     response_index / hints directement depuis Quizypedia.

   Le DOM et les fiches sources ne servent PLUS à déterminer la bonne
   réponse lorsque ce payload officiel est disponible.
   ================================================================== */

function cgimport010Plain(value){
  if(value===null||value===undefined)return '';
  let text='';

  if(typeof value==='string'){
    text=value;
  }else if(typeof value==='number'||typeof value==='boolean'){
    text=String(value);
  }else if(typeof value==='object'){
    const preferred=[
      'text','label','response','answer','value','name','title',
      'question','content','description'
    ];
    for(const key of preferred){
      if(value[key]!==undefined&&value[key]!==null){
        const candidate=cgimport010Plain(value[key]);
        if(candidate){text=candidate;break;}
      }
    }
  }

  text=String(text||'').trim();
  if(!text)return '';

  if(/<[^>]+>/.test(text)){
    try{
      const $=cheerio.load(`<div>${text}</div>`);
      text=$('div').text();
    }catch{}
  }

  return one(text);
}

function cgimport010FlattenHints(value,depth=0,out=[]){
  if(depth>5||value===null||value===undefined)return out;

  if(typeof value==='string'||typeof value==='number'){
    const t=cgimport010Plain(value);
    if(t)out.push(t);
    return out;
  }

  if(Array.isArray(value)){
    for(const item of value)cgimport010FlattenHints(item,depth+1,out);
    return out;
  }

  if(typeof value==='object'){
    const preferred=[
      'hint','hints','text','label','content','description',
      'value','title'
    ];

    let used=false;
    for(const key of preferred){
      if(value[key]!==undefined){
        used=true;
        cgimport010FlattenHints(value[key],depth+1,out);
      }
    }

    if(!used){
      for(const [key,val] of Object.entries(value)){
        if(/^(id|index|response_index|correct|order|position)$/i.test(key))continue;
        cgimport010FlattenHints(val,depth+1,out);
      }
    }
  }

  return out;
}

function cgimport010FindImageUrl(value,depth=0){
  if(depth>6||value===null||value===undefined)return '';

  if(typeof value==='string'){
    const raw=String(value).trim();
    if(
      /^https?:\/\//i.test(raw)&&
      (
        /\.(?:avif|gif|jpe?g|jfif|png|svg|webp)(?:[?#].*)?$/i.test(raw)||
        /(?:image|img|photo|portrait|picture|media|thumbnail|thumb)/i.test(raw)
      )
    )return raw;
    return '';
  }

  if(Array.isArray(value)){
    for(const item of value){
      const hit=cgimport010FindImageUrl(item,depth+1);
      if(hit)return hit;
    }
    return '';
  }

  if(typeof value==='object'){
    const priority=[
      'image','image_url','imageUrl','img','photo','picture',
      'media','src','url'
    ];

    for(const key of priority){
      if(value[key]!==undefined){
        const hit=cgimport010FindImageUrl(value[key],depth+1);
        if(hit)return hit;
      }
    }

    for(const [key,val] of Object.entries(value)){
      if(priority.includes(key))continue;
      const hit=cgimport010FindImageUrl(val,depth+1);
      if(hit)return hit;
    }
  }

  return '';
}

function cgimport010FindQuizItems(payload,depth=0){
  if(depth>7||payload===null||payload===undefined)return null;

  if(Array.isArray(payload)){
    if(
      payload.length&&
      payload.some(item=>
        item&&typeof item==='object'&&
        ('question' in item)&&
        ('proposed_responses' in item)
      )
    )return payload;

    for(const item of payload){
      const hit=cgimport010FindQuizItems(item,depth+1);
      if(hit)return hit;
    }
    return null;
  }

  if(typeof payload!=='object')return null;

  if(Array.isArray(payload.quiz_items))return payload.quiz_items;

  const priority=[
    'data','result','quiz_game','quizGame','game','quiz',
    'payload','response'
  ];

  for(const key of priority){
    if(payload[key]!==undefined){
      const hit=cgimport010FindQuizItems(payload[key],depth+1);
      if(hit)return hit;
    }
  }

  for(const [key,val] of Object.entries(payload)){
    if(priority.includes(key)||key==='quiz_items')continue;
    const hit=cgimport010FindQuizItems(val,depth+1);
    if(hit)return hit;
  }

  return null;
}

function cgimport010Responses(raw){
  let value=raw;

  if(typeof value==='string'){
    const trimmed=value.trim();
    if(
      (trimmed.startsWith('[')&&trimmed.endsWith(']'))||
      (trimmed.startsWith('{')&&trimmed.endsWith('}'))
    ){
      try{value=JSON.parse(trimmed);}catch{}
    }
  }

  if(value&&typeof value==='object'&&!Array.isArray(value)){
    value=Object.keys(value)
      .sort((a,b)=>Number(a)-Number(b))
      .map(k=>value[k]);
  }

  if(!Array.isArray(value))return [];

  return value
    .map(cgimport010Plain)
    .map(one)
    .filter(Boolean);
}

function cgimport010CorrectIndex(item,options){
  const raw=
    item?.response_index ??
    item?.responseIndex ??
    item?.correct_index ??
    item?.correctIndex;

  // Le payload historique get_quiz_game expose response_index :
  // il s'agit d'un index de tableau, donc 0..3.
  if(raw!==null&&raw!==undefined&&raw!==''){
    if(typeof raw==='string'&&/^[A-D]$/i.test(raw.trim())){
      return raw.trim().toUpperCase().charCodeAt(0)-64;
    }

    const n=Number(raw);
    if(Number.isInteger(n)&&n>=0&&n<options.length)return n+1;
  }

  // Fallback uniquement si Quizypedia fournit aussi explicitement
  // le texte de la bonne réponse dans SON payload.
  const explicit=
    item?.correct_response ??
    item?.correctResponse ??
    item?.correct_answer ??
    item?.correctAnswer ??
    item?.response;

  const good=cgimport010Plain(explicit);
  if(good){
    const k=norm(good);
    const at=options.findIndex(v=>norm(v)===k);
    if(at>=0)return at+1;
  }

  return 0;
}

function cgimport010ParsePayload(payload,fiches=[]){
  const items=cgimport010FindQuizItems(payload);
  if(!Array.isArray(items)||!items.length){
    return {
      ok:false,
      questions:[],
      diagnostics:['Payload get_quiz_game reçu mais quiz_items introuvable.']
    };
  }

  const ficheByName=new Map(
    (fiches||[]).map(f=>[norm(f.name),f])
  );

  const questions=[];
  const diagnostics=[];
  const seen=new Set();

  for(let i=0;i<items.length;i++){
    const item=items[i]||{};

    const question=cgimport010Plain(
      item.question ??
      item.question_text ??
      item.questionText ??
      item.label
    );

    const options=cgimport010Responses(
      item.proposed_responses ??
      item.proposedResponses ??
      item.responses ??
      item.answers ??
      item.options
    );

    const correctIndex=cgimport010CorrectIndex(item,options);

    const hints=[
      ...new Set(
        cgimport010FlattenHints(item.hints ?? item.hint ?? [])
          .map(one)
          .filter(Boolean)
      )
    ];

    const detail=hints.join(' · ');
    const imageUrl=cgimport010FindImageUrl(item);

    if(!question){
      diagnostics.push(`quiz_items[${i}] ignoré : question vide.`);
      continue;
    }
    if(options.length!==4){
      diagnostics.push(
        `quiz_items[${i}] ignoré : ${options.length} proposition(s), 4 attendues.`
      );
      continue;
    }
    if(correctIndex<1||correctIndex>4){
      diagnostics.push(
        `quiz_items[${i}] ignoré : response_index invalide ou absent.`
      );
      continue;
    }

    const signature=
      norm(question)+'||'+options.map(norm).join('|');

    if(seen.has(signature))continue;
    seen.add(signature);

    const correctText=options[correctIndex-1];
    const fiche=ficheByName.get(norm(correctText))||null;

    questions.push({
      question,
      detail,
      options,
      correct_index:correctIndex,
      correct_text:correctText,
      source_fiche:fiche?.name||correctText||'',
      source_number:Number(fiche?.number||0),
      answer_label:'response_index',
      match_mode:'browser-get-quiz-game',
      source:'browser_get_quiz_game',
      image_url:imageUrl||'',
      verbatim_panel:false
    });
  }

  return {
    ok:questions.length>0,
    questions,
    diagnostics,
    rawCount:items.length
  };
}

function cgimport010AttachGetQuizGameTap(page){
  const payloads=[];
  const urls=[];
  let active=true;

  const handler=async response=>{
    if(!active)return;

    const url=String(response.url?.()||'');
    if(!/get[_-]?quiz[_-]?game/i.test(url))return;

    urls.push(url);

    try{
      let payload=null;

      try{
        payload=await response.json();
      }catch{
        const text=await response.text().catch(()=>'');
        if(text){
          try{payload=JSON.parse(text);}catch{}
        }
      }

      if(payload!==null&&payload!==undefined){
        payloads.push(payload);
      }
    }catch{}
  };

  page.on('response',handler);

  return {
    async wait(timeoutMs=5000){
      const until=Date.now()+timeoutMs;
      while(Date.now()<until){
        if(payloads.length)return payloads[payloads.length-1];
        await sleep(100);
      }
      return payloads.length?payloads[payloads.length-1]:null;
    },
    cancel(){
      active=false;
      try{page.off('response',handler);}catch{}
    },
    urls,
    payloads
  };
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

  const imageLinkCount=
    fiches.reduce(
      (sum,fiche)=>
        sum+
        (
          Array.isArray(fiche.imageLinks)
            ? fiche.imageLinks.length
            : 0
        ),
      0
    );

  const imageFicheCount=
    fiches.filter(
      fiche=>
        Array.isArray(fiche.imageLinks) &&
        fiche.imageLinks.length
    ).length;

  diagnostics.push(
    `FICHE_IMAGE_LINK_CAPTURE001 : ${imageLinkCount} lien(s) image pour ${imageFicheCount}/${fiches.length} fiche(s).`
  );
  try{
    const sourceValues=[...allSourceValues(fiches).values()];

    /*
     * CGWEB116 FIX3 FIX4 FIX7
     * PHOTO_EXPECTED_IMAGE_COUNT001
     *
     * Pour un questionnaire explicitement basé sur
     * image / photo / portrait / vignette :
     *
     * une fiche qui ne possède réellement aucune image
     * n'est pas une question photo capturable.
     */
    const fullExpected=fiches.length;

    const questionnaireIdentity=
      norm(
        `${questionnaire||''} ${questionnairePath||''}`
      );

    const photoQuestionnaire=[
      'image',
      'photo',
      'portrait',
      'visuel',
      'vignette'
    ].some(
      token=>questionnaireIdentity.includes(token)
    );

    const imageTargetNumbers=
      new Set(
        fiches
          .filter(
            fiche=>
              Array.isArray(fiche.imageLinks) &&
              fiche.imageLinks.length>0
          )
          .map(
            fiche=>Number(fiche.number)
          )
      );

    /*
     * Sécurité :
     * si aucun lien image n'a pu être recensé,
     * on conserve le fonctionnement strict historique.
     */
    const targetNumbers=
      (
        photoQuestionnaire &&
        imageTargetNumbers.size>0
      )
        ? imageTargetNumbers
        : new Set(
            fiches.map(
              fiche=>Number(fiche.number)
            )
          );

    const expected=
      targetNumbers.size;

    const questions=[];
    const seen=new Set();

    const targetSeenCount=()=>
      [...targetNumbers]
        .filter(
          number=>seen.has(number)
        )
        .length;

    const targetComplete=()=>
      [...targetNumbers]
        .every(
          number=>seen.has(number)
        );

    const excludedNoImageFiches=
      photoQuestionnaire
        ? fiches
            .filter(
              fiche=>
                !targetNumbers.has(
                  Number(fiche.number)
                )
            )
            .map(
              fiche=>({
                number:Number(fiche.number),
                total:Number(fiche.total||fullExpected),
                name:one(fiche.name),
                position:
                  fiche.position||
                  `(${fiche.number} / ${fiche.total||fullExpected})`
              })
            )
        : [];

    let skippedUnresolved=0;

    if(photoQuestionnaire){
      diagnostics.push(
        `PHOTO_EXPECTED_IMAGE_COUNT001 : ${expected}/${fullExpected} fiche(s) avec image constituent la cible photo.`
      );

      if(excludedNoImageFiches.length){
        diagnostics.push(
          `Fiche(s) sans image volontairement hors cible : ${
            excludedNoImageFiches
              .map(f=>f.name)
              .join(' ; ')
          }.`
        );
      }
    }

    // FIX3 : plusieurs parties indépendantes, chacune dans une page neuve avec stockage nettoyé.
    const maxSessions=Math.min(10,Math.max(5,Math.ceil(expected/2)));
    let consecutiveNoProgress=0;
    let sessionsUsed=0;

    for(let session=1;session<=maxSessions&&targetSeenCount()<expected;session++){
      sessionsUsed=session;
      const seenBefore=targetSeenCount();
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

        const cgimport010Tap=cgimport010AttachGetQuizGameTap(page);
        const started=await startGame(page);

        if(started){
          const directPayload=await cgimport010Tap.wait(5000);
          const direct=cgimport010ParsePayload(directPayload,fiches);

          /*
           * Sur un questionnaire photo avec une fiche sans image,
           * Quizypedia peut légitimement renvoyer 8 questions pour
           * 9 fiches.
           *
           * On vérifie donc la couverture des 8 fiches AVEC image,
           * pas seulement questions.length === fiches.length.
           */
          const directRelevantQuestions=
            photoQuestionnaire
              ? direct.questions.filter(
                  q=>
                    targetNumbers.has(
                      Number(q.source_number)
                    )
                )
              : direct.questions;

          const directTargetSeen=
            new Set(
              directRelevantQuestions
                .map(
                  q=>Number(q.source_number)
                )
                .filter(Boolean)
            );

          const directTargetComplete=
            [...targetNumbers]
              .every(
                number=>
                  directTargetSeen.has(number)
              );

          if(directPayload){
            diagnostics.push(
              `CGIMPORT010 get_quiz_game: ${direct.questions.length}/${direct.rawCount||0} question(s) valides.`
            );
            diagnostics.push(...(direct.diagnostics||[]).slice(0,8));
          }else{
            diagnostics.push(
              `CGIMPORT010: aucune réponse get_quiz_game interceptée ; fallback DOM strict.`
            );
          }

          if(direct.ok&&directTargetComplete){
            cgimport010Tap.cancel();

            sessionStats.push({
              session,
              captured:direct.questions.length,
              expected,
              mode:'browser_get_quiz_game'
            });

            diagnostics.push(
              `CGIMPORT010 DIRECT_QUIZ_CAPTURE001 réussi : ${direct.questions.length}/${expected} en une session.`
            );

            await page.close().catch(()=>{});

            return {
              questions:direct.questions,
              complete:true,
              diagnostics,
              missingFiches:[],
              sessionsUsed:1,
              sessionStats,
              captureMode:'browser_get_quiz_game'
            };
          }
        }

        cgimport010Tap.cancel();

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

        for(let turn=1;turn<=maxTurns&&targetSeenCount()<expected;turn++){
          if(!state?.ok){
            sessionEnd='état de question absent';
            diagnostics.push(`Session ${session}, tour ${turn}: état de question absent.`);
            break;
          }

          const match=identifySourceFiche(
            fiches,
            state.options,
            state.contextText,
            state.imageContextText,
            state.resourceRecentText,
            state.resourceAllText
          );
          if(!match.ok){

            /*
             * UNRESOLVED_QUESTION_SKIP001
             *
             * Une question sans image / sans identité exploitable
             * ne doit plus empêcher d'atteindre les suivantes.
             *
             * Elle n'est PAS ajoutée à questions[].
             * Une réponse visible est uniquement cliquée afin
             * de demander à Quizypedia la question suivante.
             */
            skippedUnresolved++;

            sessionEnd=
              'question non identifiable ignorée';

            diagnostics.push(
              `Session ${session}, tour ${turn}: ${match.error}`
            );

            diagnostics.push(
              `Propositions: ${state.options.join(' | ')}`
            );

            if(state.contextHits?.length){
              diagnostics.push(
                `Valeurs source dans le contexte: ${state.contextHits.slice(0,8).join(' | ')}`
              );
            }

            if(state.imageContextSources?.length){
              diagnostics.push(
                `Contexte image: ${state.imageContextSources.slice(0,3).join(' | ')}`
              );
            }

            if(state.resourceContextSources?.length){
              diagnostics.push(
                `Ressources image détectées: ${state.resourceContextSources.slice(0,10).join(' | ')}`
              );
            }

            if(state.panelLines?.length){
              diagnostics.push(
                `Panneau visible: ${state.panelLines.slice(0,12).join(' | ')}`
              );
            }

            const skipChoice=
              state.options.find(Boolean)||'';

            const skipClicked=
              skipChoice
                ? await clickOption(
                    page,
                    skipChoice
                  )
                : false;

            if(!skipClicked){
              sessionEnd=
                'question non identifiable et aucune proposition cliquable';

              diagnostics.push(
                `Session ${session}, tour ${turn}: question ignorée mais aucune proposition visible n'a pu être cliquée.`
              );

              break;
            }

            const skippedAdvance=
              await advanceSafely(
                page,
                sourceValues,
                state,
                questionnairePath
              );

            if(!skippedAdvance.ok){
              sessionEnd=
                'fin de partie après question ignorée';

              diagnostics.push(
                `Session ${session}, tour ${turn}: question non importée puis fin de partie probable (${skippedAdvance.error||'aucune question suivante'}).`
              );

              break;
            }

            diagnostics.push(
              `Session ${session}, tour ${turn}: question non identifiable ignorée sans import ; poursuite vers la question suivante.`
            );

            state=
              skippedAdvance.state;

            continue;
          }

          if(
            targetNumbers.has(
              Number(match.sourceNumber)
            ) &&
            !seen.has(
              Number(match.sourceNumber)
            )
          ){
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
              match_mode:match.matchMode||'text-context',
              verbatim_panel:true
            });
            seen.add(Number(match.sourceNumber));
          }

          if(targetComplete()){
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
        const newCount=targetSeenCount()-seenBefore;
        sessionStats.push({
          session,
          newQuestions:newCount,
          totalSeen:targetSeenCount(),
          end:sessionEnd||'session terminée'
        });

        if(cdp)await cdp.detach().catch(()=>{});
        if(page)await page.close().catch(()=>{});

        if(newCount===0)consecutiveNoProgress++;
        else consecutiveNoProgress=0;
      }

      if(targetComplete())break;

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

    if(skippedUnresolved>0){
      diagnostics.unshift(
        `UNRESOLVED_QUESTION_SKIP001 : ${skippedUnresolved} question(s) non identifiable(s) franchie(s) sans import afin de poursuivre la partie.`
      );
    }

    const missingFiches=fiches
      .filter(
        f=>
          targetNumbers.has(Number(f.number)) &&
          !seen.has(Number(f.number))
      )
      .map(f=>({
        number:Number(f.number),
        total:Number(f.total||expected),
        name:one(f.name),
        position:f.position||`(${f.number} / ${f.total||expected})`
      }))
      .sort((a,b)=>a.number-b.number);

    if(!targetComplete()){
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

      /*
       * SAFE_PARTIAL_IMPORT001
       *
       * "complete" ne signifie PAS qu'une capture partielle
       * quelconque est acceptée.
       *
       * En mode photo, cela signifie que toutes les fiches
       * disposant réellement d'une image ont été capturées.
       */
      complete:targetComplete(),

      expectedCapture:expected,
      fullExpected,
      photoMode:photoQuestionnaire,
      capturedTargetCount:targetSeenCount(),
      excludedNoImageFiches,
      skippedUnresolved,

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
    console.log('CGIMPORT010 capture start:',{
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

    const imageLinkStats=
      cg116AttachFicheImageLinks(
        html,
        fiches,
        response.url
      );

    console.log(
      'CGWEB116 FICHE_IMAGE_LINK_CAPTURE001',
      imageLinkStats
    );

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

    console.log('CGIMPORT010 capture end:',{
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

      expectedCapture:
        Number(
          capture.expectedCapture ||
          fiches.length
        ),

      fullExpected:
        Number(
          capture.fullExpected ||
          fiches.length
        ),

      capturedTargetCount:
        Number(
          capture.capturedTargetCount ??
          capture.questions.length
        ),

      photoMode:
        Boolean(
          capture.photoMode
        ),

      excludedNoImageFiches:
        capture.excludedNoImageFiches||[],

      skippedUnresolved:
        Number(
          capture.skippedUnresolved||0
        ),

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
    console.error('CGIMPORT010',e);
    return res.status(e.status||500).json({
      ok:false,
      strict:true,
      error:e.message||'Erreur serveur CGIMPORT010.'
    });
  }
});

// CGIMAGE005_EXPORT
exports.cgimage005MigrateBatch = require('./cgimage005').cgimage005MigrateBatch;

// CGIMAGE007_EXPORT
exports.cgimage007RecoverFailed = require('./cgimage007').cgimage007RecoverFailed;

// CGIMAGE008_EXPORT
exports.cgimage008SuggestCandidates = require('./cgimage008').cgimage008SuggestCandidates;
exports.cgimage008ApplyCandidate = require('./cgimage008').cgimage008ApplyCandidate;

// CGWEB018_FIX4_EXPORT
exports.cgweb018ThemeContains = require('./cgweb018').cgweb018ThemeContains;

// CGWEB020_EXPORT
exports.cgweb020QualityScan = require('./cgweb020').cgweb020QualityScan;

// CGWEB021_EXPORT
exports.cgweb021Bulk = require('./cgweb021').cgweb021Bulk;

// CGWEB022_024_025_EXPORTS
exports.cgweb022History = require('./cgweb022').cgweb022History;
exports.cgweb025Duplicates = require('./cgweb025').cgweb025Duplicates;

exports.cgweb026ImageCenter = require('./cgweb026').cgweb026ImageCenter;
exports.cgweb028Analytics = require('./cgweb028').cgweb028Analytics;
exports.cgweb029Restore = require('./cgweb029').cgweb029Restore;
// CGWEB030_EXPORT
exports.cgweb030Lists = require('./cgweb030').cgweb030Lists;
// CGWEB031_EXPORT
exports.cgweb031Home = require('./cgweb031').cgweb031Home;
// CGWEB032_EXPORT
exports.cgweb032Search = require('./cgweb032').cgweb032Search;


// CGWEB116_FIX3_FIX4_FIX6_FICHE_IMAGE_LINK_CAPTURE001_IMAGE_SOURCE_NORMALIZE001_PHOTO_QUESTION_RESOLVE001
(function installCGWEB116Fix6() {
  if (globalThis.__CGWEB116_FIX6_INSTALLED__) return;
  globalThis.__CGWEB116_FIX6_INSTALLED__ = true;

  const FIX6_MARK =
    "CGWEB116_FIX3_FIX4_FIX6_FICHE_IMAGE_LINK_CAPTURE001_IMAGE_SOURCE_NORMALIZE001_PHOTO_QUESTION_RESOLVE001";

  function cg116Fix6SafeString(v) {
    return typeof v === "string" ? v.trim() : "";
  }

  function cg116Fix6Push(set, value) {
    const v = cg116Fix6SafeString(value);
    if (v) set.add(v);
  }

  function cg116Fix6DecodeLoose(v) {
    let out = cg116Fix6SafeString(v);
    if (!out) return "";
    try { out = decodeURIComponent(out); } catch (_) {}
    out = out.replace(/\+/g, " ");
    return out;
  }

  function cg116Fix6NormalizeImageUrl(raw) {
    let u = cg116Fix6DecodeLoose(raw);
    if (!u) return "";
    u = u.replace(/&amp;/g, "&");
    u = u.split("#")[0].split("?")[0];
    u = u.replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:Redirect\/file\//i, "https://commons.wikimedia.org/wiki/File:");
    u = u.replace(/^https?:\/\/(?:upload\.wikimedia\.org|upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\//i, "https://upload.wikimedia.org/wikipedia/commons/thumb/");
    u = u.replace(/^https?:\/\/(?:www\.)?quizypedia\.fr\/+/i, "https://www.quizypedia.fr/");
    u = u.replace(/\/{2,}/g, "/").replace(/^https:\//, "https://").replace(/^http:\//, "http://");
    return u;
  }

  function cg116Fix6FileNameFromUrl(raw) {
    const u = cg116Fix6NormalizeImageUrl(raw);
    if (!u) return "";
    const mFile = u.match(/\/wiki\/File:([^/?#]+)/i);
    if (mFile) return cg116Fix6DecodeLoose(mFile[1]).toLowerCase();

    const parts = u.split("/");
    if (!parts.length) return "";
    const last = cg116Fix6DecodeLoose(parts[parts.length - 1]).toLowerCase();
    if (!last) return "";

    // Wikimedia thumb -> original file token often appears before /123px-...
    const px = last.match(/^\d+px-(.+)$/i);
    if (px) return px[1].toLowerCase();

    return last;
  }

  function cg116Fix6BaseName(raw) {
    const f = cg116Fix6FileNameFromUrl(raw);
    if (!f) return "";
    return f
      .replace(/\.(jpg|jpeg|png|webp|gif|svg)$/i, "")
      .replace(/[_\s]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function cg116Fix6WikimediaVariants(raw) {
    const out = new Set();
    const u = cg116Fix6NormalizeImageUrl(raw);
    if (!u) return [];

    cg116Fix6Push(out, u);

    const fileName = cg116Fix6FileNameFromUrl(u);
    const baseName = cg116Fix6BaseName(u);

    if (fileName) {
      cg116Fix6Push(out, fileName);
      cg116Fix6Push(out, fileName.replace(/\.(jpg|jpeg|png|webp|gif|svg)$/i, ""));
      cg116Fix6Push(out, `file:${fileName}`);
      cg116Fix6Push(out, `https://commons.wikimedia.org/wiki/File:${fileName}`);
    }

    if (baseName) cg116Fix6Push(out, baseName);

    const wikiFile = u.match(/\/wiki\/File:([^/?#]+)/i);
    if (wikiFile) {
      const n = cg116Fix6DecodeLoose(wikiFile[1]);
      cg116Fix6Push(out, n);
      cg116Fix6Push(out, n.replace(/\.(jpg|jpeg|png|webp|gif|svg)$/i, ""));
    }

    return [...out].filter(Boolean);
  }

  function cg116Fix6LooksLikeImageUrl(v) {
    const s = cg116Fix6SafeString(v).toLowerCase();
    if (!s) return false;
    if (/\.(jpg|jpeg|png|webp|gif|svg)(?:$|[?#])/.test(s)) return true;
    if (s.includes("/wiki/file:")) return true;
    if (s.includes("/thumb/")) return true;
    if (s.includes("special:redirect/file")) return true;
    if (s.includes("quizypedia.fr") && s.includes("/img/")) return true;
    return false;
  }

  function cg116Fix6CollectImageUrls(value, out, depth, seen) {
    if (depth > 4) return;
    if (value == null) return;

    if (typeof value === "string") {
      if (cg116Fix6LooksLikeImageUrl(value)) out.add(cg116Fix6NormalizeImageUrl(value));
      return;
    }

    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => cg116Fix6CollectImageUrls(item, out, depth + 1, seen));
      return;
    }

    for (const [k, v] of Object.entries(value)) {
      const key = String(k || "").toLowerCase();
      if (
        key.includes("image") ||
        key.includes("img") ||
        key.includes("thumb") ||
        key.includes("thumbnail") ||
        key.includes("source")
      ) {
        cg116Fix6CollectImageUrls(v, out, depth + 1, seen);
      }
    }
  }

  function cg116Fix6BuildCatalog(fiche) {
    const urlSet = new Set();
    cg116Fix6CollectImageUrls(fiche, urlSet, 0, new WeakSet());

    const linkArrayNames = [
      "__cg116ImageLinks",
      "__cg116FicheImageLinks",
      "imageLinks",
      "thumbnailLinks",
      "sourceImageLinks",
      "__imageLinks",
    ];

    for (const name of linkArrayNames) {
      const arr = fiche && fiche[name];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") {
            urlSet.add(cg116Fix6NormalizeImageUrl(item));
          } else if (item && typeof item === "object") {
            for (const candidate of Object.values(item)) {
              if (typeof candidate === "string" && cg116Fix6LooksLikeImageUrl(candidate)) {
                urlSet.add(cg116Fix6NormalizeImageUrl(candidate));
              }
            }
          }
        }
      }
    }

    const expanded = new Set();
    for (const u of urlSet) {
      cg116Fix6Push(expanded, u);
      for (const v of cg116Fix6WikimediaVariants(u)) cg116Fix6Push(expanded, v);
    }

    fiche.__cg116ImageLinks = [...new Set([...(Array.isArray(fiche.__cg116ImageLinks) ? fiche.__cg116ImageLinks : []), ...[...urlSet].filter(Boolean)])];
    fiche.__cg116Fix6Catalog = [...expanded].filter(Boolean);
    fiche.__cg116Fix6HasImage = fiche.__cg116Fix6Catalog.length > 0;

    return fiche;
  }

  function cg116Fix6EnrichArray(arr) {
    if (!Array.isArray(arr)) return;
    for (const fiche of arr) {
      if (fiche && typeof fiche === "object") cg116Fix6BuildCatalog(fiche);
    }
  }

  function cg116Fix6FindFicheArrays(scope, out, seen, depth) {
    if (!scope || depth > 4) return;
    if (typeof scope !== "object") return;
    if (seen.has(scope)) return;
    seen.add(scope);

    if (Array.isArray(scope)) {
      if (
        scope.length &&
        scope.every((x) => x && typeof x === "object") &&
        scope.some((x) =>
          Object.keys(x || {}).some((k) =>
            /(fiche|image|thumb|thumbnail|nom|title|question)/i.test(String(k))
          )
        )
      ) {
        out.push(scope);
      }
      for (const item of scope) cg116Fix6FindFicheArrays(item, out, seen, depth + 1);
      return;
    }

    for (const value of Object.values(scope)) {
      cg116Fix6FindFicheArrays(value, out, seen, depth + 1);
    }
  }

  function cg116Fix6EnrichScope(scope) {
    const arrays = [];
    cg116Fix6FindFicheArrays(scope, arrays, new WeakSet(), 0);
    for (const arr of arrays) cg116Fix6EnrichArray(arr);
  }

  if (typeof cg116AttachFicheImageLinks === "function") {
    const baseAttach = cg116AttachFicheImageLinks;
    cg116AttachFicheImageLinks = function (...args) {
      const result = baseAttach.apply(this, args);
      try {
        for (const arg of args) cg116Fix6EnrichScope(arg);
      } catch (_) {}
      return result;
    };
  }

  if (typeof cg116ResolvePhotoQuestion === "function") {
    const baseResolve = cg116ResolvePhotoQuestion;
    cg116ResolvePhotoQuestion = function (...args) {
      try {
        if (args.length) cg116Fix6EnrichScope(args[0]);
      } catch (_) {}
      return baseResolve.apply(this, args);
    };
  }

  console.log(FIX6_MARK + " : fallback vignette Quizypedia + normalisation image activés");
})();

