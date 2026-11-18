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
    apiKey: "AIzaSyAwKcah1PSqIMPWbg4v3biMnuEszzDt1AU",
    authDomain: "planning-acp.firebaseapp.com",
    projectId: "planning-acp",
    storageBucket: "planning-acp.firebasestorage.app",
    messagingSenderId: "65973876997",
    appId: "1:65973876997:web:bdc41bfdbfbbe964d15f6c"
  },

  // --- Pathologistes seniors (initiales) --------------------------------
  medecins: ["MC", "DD", "PV", "LLA", "KL", "SB", "JP", "MPE", "CC"],

  // --- Dermatopathologiste (hors répartition générale) -------------------
  // Présente seulement les jours indiqués (1 = lundi). Colonne « MW ».
  dermato: { nom: "MW", jours: [1] },

  // --- Internes -----------------------------------------------------------
  internes: ["Florestan", "Emma"],
  // Seniors des internes : pas de minimum de jours. On évite seulement les absences
  // (absent, congrès) ; temps partiel, télétravail, formation et administratif ne comptent pas.

  // --- Temps partiels fixes, préremplis chaque semaine -----------------
  // jour : 1 = lundi … 5 = vendredi ; creneau : "J" (journée), "M" (matin), "AM" (après-midi)
  // (MPE a un jour variable : elle le saisit chaque semaine.)
  tempsPartiels: [
    { medecin: "KL", jour: 3, creneau: "J" },
    { medecin: "DD", jour: 3, creneau: "J" },
    { medecin: "SB", jour: 5, creneau: "J" },
    { medecin: "PV", jour: 4, creneau: "AM" }   // jeudi après-midi
  ],

  // --- Règle « Nb répart. » (valeurs de départ) --------------------------
  // true = ce statut RETIRE le médecin de la répartition sur le créneau.
  regleRepartition: {
    ABS: true,
    TP: true,
    CONGRES: true,
    FORMATION: true, // demi-journée de formation pédagogique : ½ part ce jour-là
    ADMIN: true,     // demi-journée administrative : ½ part ce jour-là
    TLT: false,      // le télétravail ne change pas la répartition
    FRAIS: false     // le médecin du frais reçoit quand même des cas
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

  // Absence considérée comme des vacances à partir de ce nombre de jours ouvrés d'affilée :
  // on arrête alors la répartition 2 jours avant le départ. En dessous : comme un temps partiel.
  joursVacances: 3,

  lundiPentecoteFerie: true,
  semainesInternesAffichees: 8
};
