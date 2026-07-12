/*
MIT License
Copyright (c) 2026 Ronan Le Meillat - SCTG Development
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Every UI string of the client, in French, in one typed object. Domain labels (statuses,
 * reasons, roles) come from `@exclusions/shared` and must not be duplicated here.
 */
export const t = {
  app: {
    name: "Exclusions",
    tagline: "Suivi des exclusions de cours",
    loading: "Chargement…",
  },
  common: {
    error: "Une erreur est survenue. Veuillez réessayer.",
    retry: "Réessayer",
    back: "Retour",
    cancel: "Annuler",
    save: "Enregistrer",
    close: "Fermer",
    search: "Rechercher",
    empty: "Aucun résultat",
    optional: "facultatif",
    previousPage: "Page précédente",
    nextPage: "Page suivante",
    pageOf: "Page {page} sur {pages}",
  },
  tabs: {
    report: "Signaler",
    dashboard: "Suivi",
    history: "Historique",
    stats: "Statistiques",
    users: "Utilisateurs",
    settings: "Réglages",
  },
  login: {
    title: "Connexion",
    subtitle: "Espace enseignants et vie scolaire",
    email: "Adresse e-mail",
    password: "Mot de passe",
    submit: "Se connecter",
    submitting: "Connexion…",
    invalidCredentials: "Adresse e-mail ou mot de passe incorrect.",
    rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
  },
  report: {
    title: "Signaler une exclusion",
    stepClass: "1. Choisissez la classe",
    stepStudent: "2. Choisissez l'élève",
    stepReason: "3. Motif de l'exclusion",
    searchStudent: "Rechercher un élève…",
    studentsEmpty: "Aucun élève trouvé",
    commentLabel: "Commentaire",
    commentPlaceholder: "Précisions éventuelles…",
    commentRequired: "Un commentaire est obligatoire pour le motif « Autre motif ».",
    confirm: "Confirmer l'exclusion",
    submitting: "Envoi en cours…",
    successTitle: "Exclusion signalée",
    successBody: "La vie scolaire a été notifiée. L'élève est attendu.",
    newExclusion: "Nouvelle exclusion",
    changeClass: "Changer de classe",
    changeStudent: "Changer d'élève",
  },
  dashboard: {
    title: "Suivi en direct",
    empty: "Aucune exclusion en cours",
    emptyHint: "Les nouveaux signalements apparaîtront ici automatiquement.",
    reportedBy: "Signalé par",
    detail: "Détail",
    elapsedLabel: "Temps écoulé",
    elapsedTitle: "Temps écoulé depuis le signalement",
  },
  actions: {
    acknowledged: "Prendre en compte",
    arrived: "Élève arrivé",
    missing: "Introuvable",
    resolved: "Clôturer",
    cancelled: "Annuler",
    commentPromptResolve: "Commentaire de clôture (facultatif) :",
    commentPromptCancel: "Motif de l'annulation (facultatif) :",
  },
  detail: {
    title: "Détail de l'exclusion",
    student: "Élève",
    class: "Classe",
    teacher: "Enseignant",
    reason: "Motif",
    comment: "Commentaire",
    status: "Statut",
    createdAt: "Signalée le",
    arrivalDelay: "Délai d'arrivée",
    timeline: "Historique",
    eventCreated: "Signalement créé",
    notFound: "Exclusion introuvable.",
  },
  history: {
    title: "Historique",
    statusFilter: "Statut",
    classFilter: "Classe",
    allClasses: "Toutes les classes",
    from: "Du",
    to: "Au",
    empty: "Aucune exclusion sur cette période.",
    results: "{count} exclusion(s)",
  },
  stats: {
    title: "Statistiques",
    from: "Du",
    to: "Au",
    total: "Exclusions",
    arrivedRate: "Élèves arrivés",
    avgArrival: "Délai moyen d'arrivée",
    missingRate: "Élèves manquants",
    noData: "Aucune donnée sur cette période.",
    timelineTitle: "Évolution des exclusions",
    bucketDay: "Jour",
    bucketWeek: "Semaine",
    bucketMonth: "Mois",
    byClassTitle: "Par classe (top 15)",
    byStudentTitle: "Élèves les plus exclus (top 20)",
    byStatusTitle: "Répartition par statut",
    student: "Élève",
    class: "Classe",
    count: "Exclusions",
    rank: "N°",
  },
  users: {
    title: "Utilisateurs",
    create: "Créer un utilisateur",
    email: "Adresse e-mail",
    displayName: "Nom affiché",
    role: "Rôle",
    password: "Mot de passe",
    passwordHint: "Au moins 10 caractères.",
    disabled: "Désactivé",
    active: "Actif",
    disable: "Désactiver",
    enable: "Réactiver",
    resetPassword: "Réinitialiser le mot de passe",
    resetPasswordPrompt: "Nouveau mot de passe (au moins 10 caractères) :",
    resetPasswordConfirm: "Réinitialiser",
    passwordTooShort: "Le mot de passe doit contenir au moins 10 caractères.",
    created: "Utilisateur créé.",
    updated: "Utilisateur mis à jour.",
    passwordReset: "Mot de passe réinitialisé.",
    empty: "Aucun utilisateur.",
  },
  settings: {
    title: "Réglages",
    profile: "Profil",
    notifications: "Notifications",
    pushEnabled: "Notifications activées sur cet appareil.",
    pushDisabled: "Notifications désactivées sur cet appareil.",
    enablePush: "Activer les notifications",
    disablePush: "Désactiver les notifications",
    password: "Changer le mot de passe",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    passwordHint: "Au moins 10 caractères.",
    passwordChanged: "Mot de passe modifié.",
    wrongPassword: "Mot de passe actuel incorrect.",
    logout: "Se déconnecter",
    version: "Version",
  },
  push: {
    unsupported:
      "Les notifications push ne sont pas prises en charge par ce navigateur. Sur iPhone ou iPad, installez d'abord l'application sur l'écran d'accueil (Partager → Sur l'écran d'accueil).",
    permissionDenied:
      "Les notifications ont été refusées. Autorisez-les dans les réglages de votre appareil.",
    error: "Impossible d'activer les notifications. Veuillez réessayer.",
  },
} as const;

/** Interpolates `{name}` placeholders in an i18n template. */
export function tf(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
