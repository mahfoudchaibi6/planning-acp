// =====================================================================
//  Planning médecins ACP – CH Valenciennes : FICHIER DE CONFIGURATION
//  Modifiez ce fichier pour changer la liste des médecins, les temps
//  partiels fixes, la règle « Nb répart. » ou le roulement des RCP.
//  ⚠ Ne mettez JAMAIS ici le code d'accès du service : ce dépôt est public.
// =====================================================================

window.PLANNING_CONFIG = {

  // --- Connexion Firebase ---------------------------------------------
  // Copiez ici le bloc « firebaseConfig » donné par la console Firebase
  // (Paramètres du projet > Vos applications > Application Web).
  // Ces valeurs ne sont pas secrètes : la protection vient des règles
  // Firestore et du code du service.
  // Tant que apiKey vaut "A_REMPLIR", l'appli tourne en MODE DÉMO
  // (données enregistrées uniquement dans ce navigateur).
  firebase: {
    apiKey: "A_REMPLIR",
    authDomain: "A_REMPLIR.firebaseapp.com",
    projectId: "A_REMPLIR",
    storageBucket: "A_REMPLIR.appspot.com",
    messagingSenderId: "A_REMPLIR",
    appId: "A_REMPLIR"
  },

  // --- Médecins (initiales, dans l'ordre d'affichage) -------------------
  medecins: ["MC", "DD", "PV", "LL", "KL", "SB", "JP", "MPE", "CC", "EFL"],

  // --- Temps partiels fixes, préremplis chaque semaine -----------------
  // jour : 1 = lundi … 5 = vendredi ; creneau : "J" (journée), "M" (matin), "AM" (après-midi)
  // Un médecin peut toujours modifier une semaine particulière.
  tempsPartiels: [
    { medecin: "KL", jour: 3, creneau: "J" },   // mercredi, pas de cas
    { medecin: "DD", jour: 3, creneau: "J" },   // mercredi, pas de cas
    { medecin: "SB", jour: 5, creneau: "J" },   // vendredi
    { medecin: "PV", jour: 4, creneau: "AM" }   // jeudi après-midi
  ],

  // --- Règle de calcul « Nb répart. » (valeurs par défaut) --------------
  // Pour chaque statut : true = le médecin NE prend PAS de cas sur ce créneau
  // (false = il reçoit quand même des cas, ex. télétravail).
  // Chaque demi-journée de présence compte 0,5. Modifiable aussi dans
  // l'onglet « Paramètres » de l'appli (les réglages y sont partagés).
  regleRepartition: {
    ABS: true,
    TP: true,
    TLT: false,     // le télétravail n'a pas d'impact sur la répartition
    RCP: true,
    CONGRES: true,
    FRAIS: false,
    MW: false,
    SCREEN: false
  },

  // --- Frais médical ----------------------------------------------------
  // Médecins à ne jamais proposer automatiquement pour le frais médical.
  fraisExclus: [],

  // --- Roulement des RCP (À COMPLÉTER PLUS TARD) ----------------------
  // Exemple de format :
  //   { nom: "RCP sein", jour: 1, creneau: "AM", rotation: ["KL", "SB"] }
  // → la semaine ISO n°N, le médecin prérempli est rotation[N % longueur].
  // Laissez la liste vide tant que le roulement n'est pas fourni.
  rcpRoulement: []
};
