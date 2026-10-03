const {onRequest}=require('firebase-functions/v2/https');
const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');

if(!getApps().length)initializeApp();

const REGION='europe-west1';
const MAX_IDS=250;

// CGWEB134_BACKEND_QR_FIELDS001
// CGWEB134_QUALITY_QR001

function one(v){
  return String(v??'').replace(/\s+/g,' ').trim();
}

function norm(v){
  return one(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();
}

function cors(req,res){
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods','POST, OPTIONS');

  if(req.method==='OPTIONS'){
    res.status(204).send('');
    return true;
  }

  return false;
}

function json(res,status,body){
  res.status(status)
    .set('content-type','application/json; charset=utf-8')
    .send(JSON.stringify(body));
}

async function requireUser(req){
  const h=String(req.headers.authorization||'');

  if(!h.startsWith('Bearer ')){
    throw Object.assign(
      new Error('Authentification Firebase requise.'),
      {status:401}
    );
  }

  return getAuth().verifyIdToken(h.slice(7));
}

function hasHtml(v){
  return /<[^>]{1,80}>|&nbsp;|&#160;|&amp;nbsp;/i
    .test(String(v??''));
}

/*
 * answer est prioritaire.
 * correct_index + proposition historique ne sert
 * qu'à lire le catalogue pré-Q/R.
 */
function answerOf(q){
  const direct=
    one(
      q?.answer ??
      q?.correct_answer ??
      ''
    );

  if(direct)return direct;

  const n=Number(q?.correct_index);

  if(
    Number.isInteger(n) &&
    n>=1 &&
    n<=4
  ){
    return one(
      q?.[`proposition_${String.fromCharCode(96+n)}`]
    );
  }

  if(n===0){
    return one(q?.proposition_a);
  }

  return '';
}

exports.cgweb020QualityScan=onRequest(
  {
    region:REGION,
    timeoutSeconds:540,
    memory:'1GiB'
  },
  async(req,res)=>{

    if(cors(req,res))return;

    try{

      if(req.method!=='POST'){
        return json(
          res,
          405,
          {ok:false,error:'POST attendu.'}
        );
      }

      const user=
        await requireUser(req);

      const db=
        getFirestore();

      /*
       * Analyse volontairement manuelle.
       * Aucun scan périodique n'est ajouté.
       */
      const snap=
        await db
          .collection('users')
          .doc(user.uid)
          .collection('questions')
          .get();

      const defs={

        missing_question:{
          label:'Question vide',
          severity:'error',
          description:'Le champ question est vide.'
        },

        missing_answer:{
          label:'Réponse absente',
          severity:'error',
          description:'Aucune réponse Q/R exploitable n’est disponible.'
        },

        missing_theme:{
          label:'Thème vide',
          severity:'warn',
          description:'Le champ theme est vide.'
        },

        missing_megatheme:{
          label:'Mégathème vide',
          severity:'warn',
          description:'Le champ megatheme est vide.'
        },

        image_flag_without_file:{
          label:'Image déclarée mais fichier absent',
          severity:'error',
          description:'is_image = 1 alors que image_file est vide.'
        },

        image_file_without_flag:{
          label:'Fichier image sans drapeau image',
          severity:'warn',
          description:'image_file est renseigné alors que is_image n’est pas à 1.'
        },

        missing_but_image_exists:{
          label:'Image présente mais signalée introuvable',
          severity:'warn',
          description:'non_trouve = 1 alors qu’un image_file existe.'
        },

        html_artifacts:{
          label:'HTML résiduel',
          severity:'warn',
          description:'Du HTML ou une entité &nbsp; subsiste dans le contenu Q/R.'
        },

        exact_duplicate_question:{
          label:'Questions identiques',
          severity:'warn',
          description:'Plusieurs documents possèdent exactement la même question normalisée.'
        }
      };

      const issues={};
      const problemIds=new Set();
      const dups=new Map();

      for(const [k,d] of Object.entries(defs)){
        issues[k]={
          ...d,
          count:0,
          ids:[]
        };
      }

      const hit=(k,id)=>{
        issues[k].count++;

        if(issues[k].ids.length<MAX_IDS){
          issues[k].ids.push(String(id));
        }

        problemIds.add(String(id));
      };


      for(const doc of snap.docs){

        const id=doc.id;
        const q=doc.data()||{};

        const question=one(q.question);
        const answer=answerOf(q);
        const image=one(q.image_file);

        const isImage=
          Number(q.is_image||0)===1;

        const missing=
          Number(q.non_trouve||0)===1;


        if(!question){
          hit('missing_question',id);
        }

        if(!answer){
          hit('missing_answer',id);
        }

        if(!one(q.theme)){
          hit('missing_theme',id);
        }

        if(!one(q.megatheme)){
          hit('missing_megatheme',id);
        }

        if(isImage&&!image){
          hit('image_flag_without_file',id);
        }

        if(image&&!isImage){
          hit('image_file_without_flag',id);
        }

        if(missing&&image){
          hit('missing_but_image_exists',id);
        }

        if(
          [
            q.question,
            q.detail,
            answer
          ].some(hasHtml)
        ){
          hit('html_artifacts',id);
        }

        const nq=norm(question);

        if(nq){
          if(!dups.has(nq)){
            dups.set(nq,[]);
          }

          dups.get(nq).push(id);
        }
      }


      for(const ids of dups.values()){
        if(ids.length>1){
          for(const id of ids){
            hit(
              'exact_duplicate_question',
              id
            );
          }
        }
      }


      const total=snap.size;
      const problem=problemIds.size;
      const clean=Math.max(0,total-problem);

      const score=
        total
          ? (clean/total)*100
          : 100;


      return json(
        res,
        200,
        {
          ok:true,
          schema:'CGWEB134_QUALITY_QR001',
          generated_at:Date.now(),
          question_count:total,
          clean_question_count:clean,
          problem_question_count:problem,
          quality_score:score,
          issues
        }
      );

    }catch(e){

      return json(
        res,
        Number(e?.status)||500,
        {
          ok:false,
          error:e?.message||String(e)
        }
      );
    }
  }
);
