CGWEB036 FIX3E - NAVIGATION_PANEL_REHOME001
==========================================

Cause corrigee :
Import Quizypedia et Creation de questions avaient bien ete promus comme pages
principales logiques, mais leurs <section> restaient physiquement imbriquees
dans la page Plus. Quand Plus etait masquee, leurs contenus etaient donc masques
par leur ancetre, ce qui produisait une page vide.

Correction :
- extraction physique du panneau Import hors de Plus ;
- extraction physique du panneau Creation hors de Plus ;
- insertion comme vrais panneaux top-level ;
- conservation des 6 sous-onglets Import ;
- conservation des 6 panneaux internes Import ;
- conservation du routage navigateImport(currentImport).

Navigation conservee :
Repertoire / Import Quizypedia / Creation de questions / Plus
