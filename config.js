// =====================================================================
//  Planning ACP – CH Valenciennes : FICHIER DE CONFIGURATION
//  Valeurs de départ. Médecins, internes et règle de répartition se
//  modifient ensuite directement dans l'appli (onglet « Paramètres »).
//  ⚠ Ne mettez JAMAIS ici le code d'accès du service : ce dépôt est public.
// =====================================================================

window.PLANNING_CONFIG = {

  // --- Connexion Firebase ---------------------------------------------
  // Bloc « firebaseConfig » donné par la console Firebase
  // (Paramètres du projet > Vos applications > Web).
  // Tant que apiKey vaut "A_REMPLIR" : MODE DÉMO (données dans ce navigateur).
  firebase: {
    apiKey: "A_REMPLIR",
    authDomain: "A_REMPLIR.firebaseapp.com",
    projectId: "A_REMPLIR",
    storageBucket: "A_REMPLIR.appspot.com",
    messagingSenderId: "A_REMPLIR",
    appId: "A_REMPLIR"
  },

  // --- Pathologistes seniors (initiales) --------------------------------
  medecins: ["MC", "DD", "PV", "LL", "KL", "SB", "JP", "MPE", "CC", "EFL"],

  // --- Dermatopathologiste (hors répartition générale) -------------------
  // Présente seulement les jours indiqués (1 = lundi). Colonne « MW ».
  dermato: { nom: "MW", jours: [1] },

  // --- Internes -----------------------------------------------------------
  internes: ["Florestan", "Emma"],
  // Un senior n'encadre un interne que s'il est disponible au moins ce
  // nombre de jours dans la semaine (hors jours fériés).
  joursMinimumEncadrement: 3,

  // --- Temps partiels fixes, préremplis chaque semaine -----------------
  // jour : 1 = lundi … 5 = vendredi ; creneau : "J" (journée), "M" (matin), "AM" (après-midi)
  tempsPartiels: [
    { medecin: "KL", jour: 3, creneau: "J" },
    { medecin: "DD", jour: 3, creneau: "J" },
    { medecin: "SB", jour: 5, creneau: "J" },
    { medecin: "PV", jour: 4, creneau: "AM" }
  ],

  // --- Règle « Nb répart. » (valeurs de départ) --------------------------
  // true = ce statut RETIRE le médecin de la répartition sur le créneau.
  regleRepartition: {
    ABS: true,
    TP: true,
    CONGRES: true,
    TLT: false,     // le télétravail ne change pas la répartition
    FRAIS: false,   // le médecin du frais reçoit quand même des cas
    SCREEN: false
  },

  // --- RCP du lundi soir --------------------------------------------------
  // Jours où l'on peut cocher « RCP » (1 = lundi). La RCP ne retire pas de la répartition.
  rcpJours: [1],
  // Roulement (à compléter plus tard) : liste de médecins à tour de rôle,
  // la semaine ISO n°N → rotation[N % longueur] prérempli en RCP.
  // Exemple : rcpRoulement: ["KL", "SB", "MC"]
  rcpRoulement: [],

  // --- Frais médical ----------------------------------------------------
  // Médecins à ne jamais proposer automatiquement pour le frais médical.
  fraisExclus: [],

  lundiPentecoteFerie: true,
  semainesInternesAffichees: 8
};
