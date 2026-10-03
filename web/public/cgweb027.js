import {
  getApp,
  getApps
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';

import {
  getFirestore,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import {
  getStorage,
  ref,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

const CGWEB027_VERSION=
  'CGWEB134_ANDROID_PREVIEW_QR001';

const $=
  id=>document.getElementById(id);

const esc=
  v=>String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');

let Q=null;
let REVEALED=false;


/*
 * Compatibilité catalogue historique.
 */
function answerOf(q){
  return window.CGQR001.resolveAnswer(q);
}


async function imageUrl(path){

  if(!path)return '';

  if(/^https?:/i.test(path)){
    return path;
  }

  if(!getApps().length){
    return '';
  }

  try{
    return await getDownloadURL(
      ref(
        getStorage(getApp()),
        path
      )
    );
  }catch{
    return '';
  }
}


async function load(){

  const id=
    $('cg27Id')
      .value
      .trim();

  if(!id)return;

  if(!getApps().length){
    $('cg27State').textContent=
      'Firebase indisponible.';
    return;
  }

  const u=
    window.CGWEB001
      ?.getUser
      ?.();

  if(!u)return;

  const s=
    await getDoc(
      doc(
        getFirestore(getApp()),
        'users',
        u.uid,
        'questions',
        id
      )
    );

  if(!s.exists()){
    $('cg27State').textContent=
      'Question introuvable.';
    return;
  }

  Q={
    id:s.id,
    ...s.data()
  };

  REVEALED=false;

  await render();
}


async function render(){

  if(!Q)return;

  const mode=
    $('cg27Mode').value;

  const tablet=
    $('cg27Device').value==='tablet';

  const answer=
    answerOf(Q);

  const reveal=
    mode==='revision' ||
    REVEALED;

  $('cg27Shell').className=
    'cg27-device '+
    (
      tablet
        ? 'tablet'
        : 'phone'
    );

  const url=
    await imageUrl(
      Q.image_file
    );


  const answerHtml=
    reveal

      ? `
        <div class="cg27-answer revealed">
          <span>Réponse</span>
          <b>${esc(answer||'—')}</b>
          ${
            Q.detail
              ? `<small>${esc(Q.detail)}</small>`
              : ''
          }
        </div>
      `

      : `
        <button
          id="cg27Reveal"
          class="cg27-answer cg27-reveal"
          type="button"
        >
          Afficher la réponse
        </button>
      `;


  const bottom=
    mode==='defi'
      ? 'Question / Réponse · 1 / 3'
      : reveal
        ? 'Question suivante'
        : 'Réfléchis puis révèle la réponse';


  $('cg27Screen').innerHTML=`
    <div class="cg27-top">
      ${esc(Q.theme||Q.megatheme||'Culture générale')}
    </div>

    <div class="cg27-question">
      ${esc(Q.question||'')}
    </div>

    ${
      url
        ? `<div class="cg27-image"><img src="${esc(url)}"></div>`
        : ''
    }

    ${answerHtml}

    <div class="cg27-bottom">
      ${esc(bottom)}
    </div>
  `;


  $('cg27Reveal')
    ?.addEventListener(
      'click',
      async()=>{
        REVEALED=true;
        await render();
      }
    );


  $('cg27State').textContent=
    `#${Q.id} · Question / Réponse · ${
      tablet
        ? 'tablette'
        : 'téléphone'
    }`;
}


function init(){

  if($('cgweb027Panel'))return;

  const p=
    document.createElement('section');

  p.id='cgweb027Panel';
  p.className='cg27-panel';

  p.innerHTML=`
    <header>
      <div>
        <div class="k">
          CGWEB134 · ANDROID_PREVIEW_QR001
        </div>

        <h2>Simulateur Android</h2>

        <p>
          Aperçu Question / Réponse téléphone et tablette.
        </p>
      </div>
    </header>

    <div class="cg27-tools">

      <input
        id="cg27Id"
        placeholder="ID question"
      >

      <button id="cg27Load">
        Charger
      </button>

      <select id="cg27Device">
        <option value="phone">Téléphone</option>
        <option value="tablet">Tablette</option>
      </select>

      <select id="cg27Mode">
        <option value="standard">Question / Réponse</option>
        <option value="revision">Révision</option>
        <option value="defi">Défi</option>
      </select>

    </div>

    <div class="cg27-stage">
      <div id="cg27Shell" class="cg27-device phone">
        <div id="cg27Screen" class="cg27-screen">
          <div class="cg27-placeholder">
            Charge une question
          </div>
        </div>
      </div>
    </div>

    <div id="cg27State"></div>
  `;

  (
    document.querySelector('main') ||
    document.body
  ).appendChild(p);


  $('cg27Load').onclick=
    load;

  $('cg27Id').onkeydown=
    e=>{
      if(e.key==='Enter')load();
    };

  $('cg27Device').onchange=
    render;

  $('cg27Mode').onchange=
    async()=>{
      REVEALED=false;
      await render();
    };
}


window.CGWEB027_API={
  open:async id=>{
    $('cg27Id').value=id;
    await load();
  }
};


document.readyState==='loading'
  ? document.addEventListener(
      'DOMContentLoaded',
      init
    )
  : init();
