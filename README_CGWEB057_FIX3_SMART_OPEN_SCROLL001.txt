CGWEB057 FIX3 - SMART_OPEN_SCROLL001
====================================

Symptome :
"Ouvrir Session intelligente" faisait remonter l'ecran vers le haut,
puis le scroll smooth pouvait lutter avec le deplacement manuel.

Cause :
openSmart() recliquait sur Apprentissage alors que CGWEB057 est deja
affiche dans ce panneau. Avec la navigation Plus courante, ce clic
declenchait navigatePlus("learning"), qui contient un scroll vers top=0.

Correction :
- ouverture directe de Session intelligente ;
- aucun nouveau clic sur Apprentissage ;
- retrait du focus ;
- conservation de window.scrollY sur plusieurs frames ;
- CGPLAY001 et la navigation generale restent inchanges ;
- aucune ecriture Firestore.
