# Planning médecins ACP – CH Valenciennes

Page web unique (HTML/JS) hébergée sur GitHub Pages, données dans Firebase Firestore (région Europe).

- **index.html / app.js** : l'application.
- **config.js** : liste des médecins, temps partiels fixes, règle « Nb répart. », roulement RCP, connexion Firebase.
- **firestore.rules** : règles de sécurité (modèle : le vrai code se met **uniquement dans la console Firebase**).

Pas de donnée patient, pas de motif d'absence : on saisit seulement un type (ABS, TLT, RCP, Congrès, Frais médical, MW, Screen, TP).

## Fonctionnement de la sécurité

Les données sont rangées sous `espaces/{code du service}/…`. Les règles Firestore n'autorisent la lecture
et l'écriture que si ce code est le bon. Le code n'est ni dans le dépôt ni dans le code de la page : chaque
utilisateur le tape une fois, il est ensuite mémorisé dans son navigateur (bouton « Oublier le code » dans
Paramètres). Une semaine figée ne peut plus être modifiée, même via l'API (contrôlé par les règles).

Choisissez un code **long** (16 caractères ou plus : lettres, chiffres, `-` ou `_`), car il n'y a pas de limite
au nombre d'essais.

## Mise en place Firebase (une seule fois)

1. https://console.firebase.google.com → **Ajouter un projet** → nom `planning-acp` → Google Analytics : désactivé.
2. Menu **Créer → Firestore Database** (ou *Bases de données et stockage → Firestore*) → **Créer une base de données**
   - Édition **Standard**, ID `(default)`.
   - Emplacement : **europe-west9 (Paris)** (ou europe-west1, Belgique). ⚠ Définitif.
   - Démarrer en **mode production**.
3. Onglet **Règles** : effacez tout, collez le contenu de `firestore.rules`, remplacez
   `REMPLACEZ_PAR_LE_CODE_DU_SERVICE` par votre code, cliquez **Publier**.
4. ⚙ **Paramètres du projet → Général → Vos applications → icône `</>` (Web)** → surnom `planning-acp`,
   ne cochez pas Firebase Hosting → **Enregistrer l'application**. Copiez les 6 valeurs de `firebaseConfig`.
5. Collez-les dans `config.js` (rubrique `firebase`) et poussez sur GitHub (ou envoyez-les-moi : elles ne sont pas secrètes).
6. Conseillé : **Google Cloud Console → API et services → Identifiants** → clé « Browser key » →
   *Restrictions relatives aux applications* : Sites Web → `https://VOTRE-COMPTE.github.io/*`.

Pour changer le code plus tard : modifiez-le dans l'onglet Règles et publiez. Attention, les données sont rangées
sous l'ancien code : elles n'apparaîtront plus (prévenez-moi pour les migrer).

Tant que `config.js` contient `A_REMPLIR`, l'appli tourne en **mode démo** (données dans le navigateur seulement).

## Modifier la configuration

Tout est dans `config.js` : médecins, temps partiels fixes (`tempsPartiels`), règle de calcul par défaut
(`regleRepartition`), médecins à ne pas proposer en frais médical (`fraisExclus`), roulement RCP (`rcpRoulement`).
La règle « Nb répart. » peut aussi être changée par le service dans l'onglet **Paramètres**.
