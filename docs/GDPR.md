# GDPR notes

This application processes personal data of **students (minors)** and **school staff** in France.
This document summarizes how the design maps to the GDPR (_RGPD_) and what each deploying school
must do. It is engineering documentation, not legal advice: **each school should involve its DPO
(délégué à la protection des données) before going live** — most French private schools share a
mutualized DPO through their diocesan network or management organization.

## Roles and lawful basis

- Each school is the **responsable de traitement** (data controller) for its own deployment. The
  project maintainers publish code; they operate nothing and see no data.
- Lawful basis (art. 6 RGPD): **mission d'intérêt public** (art. 6.1.e) for schools exercising
  their educational supervision duty (_obligation de surveillance des élèves_), or **intérêt
  légitime** (art. 6.1.f) — ensuring excluded students are supervised is a safety obligation.
  The school's DPO picks and documents the basis in the registre entry (template below).
- Purpose (_finalité_): ensure an excluded student is expected, tracked and searched for if
  missing; keep an audit trail for educational follow-up and accountability. Statistics are
  derived from the same records, per class/student/period, for internal steering only.

## Data minimization — full inventory

Everything stored, per the [data model](./DATA-MODEL.md). There is deliberately **no other
student data**: no birth date, no address, no photo, no grades, no family or health information.

| Data                | D1 table             | Personal data fields                                                                                                                           | Data subjects              |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Exclusion incidents | `exclusions`         | Student SIS id + display name and class name **as captured at incident time**; teacher id + name; reason, optional comment, status, timestamps | Students (minors), staff   |
| Audit trail         | `exclusion_events`   | Actor id + display name (or `system`), event type, optional comment, timestamp                                                                 | Staff, indirectly students |
| Staff accounts      | `users`              | E-mail, display name, role, PBKDF2 password hash + salt                                                                                        | Staff                      |
| Sessions            | `refresh_tokens`     | SHA-256-hashed refresh tokens linked to a staff account                                                                                        | Staff                      |
| Login rate limiting | `login_attempts`     | Staff e-mail, timestamp, success flag — pruned after 24 h by the cron handler                                                                  | Staff                      |
| Push targets        | `push_subscriptions` | Pseudonymous push endpoint or FCM token, web-push keys, optional device name                                                                   | Staff                      |

Student rosters (classes, names) are **read on demand from the SIS provider** and not stored;
only the id and display name of the one excluded student are denormalized into the incident row,
so the historical record stays accurate without mirroring the SIS. Free-text comments must not be
used for sensitive data (health, religion…) — staff training point.

## Per-school isolation

Each school runs a **fully independent Worker + D1 database + secrets** (a wrangler environment).
There is no shared database, no cross-school API, no aggregation layer. A school's data cannot
leak to another school by design, and each school can be deployed, purged or shut down
independently. Keep it that way when contributing (see the PR checklist).

## Retention and purge

Exclusion records are school-life data; the recommended retention is **`RETENTION_MONTHS` = 24**
(two school years — long enough for year-over-year educational follow-up, short enough to stay
proportionate). Schools may choose a shorter period in their registre entry.

Purge procedure (manual, run per school; adjust `-24 months` to your chosen retention):

```bash
cd apps/server
npx wrangler d1 execute DB --env <school-id> --remote --command \
  "DELETE FROM exclusion_events WHERE exclusion_id IN
     (SELECT id FROM exclusions WHERE created_at < datetime('now', '-24 months'));
   DELETE FROM exclusions WHERE created_at < datetime('now', '-24 months');"
```

Also covered automatically: `login_attempts` older than 24 h are pruned by the cron handler.
Staff accounts are kept while the person works at the school, then `disabled` (kept for audit
integrity of past events); push subscriptions die with the device registration and expired ones
are pruned on send.

## Data subject rights (droits des personnes)

Requests go to the school (controller), typically via the vie scolaire or the DPO. Where the UI
does not cover a request, an admin can act directly on the database — examples below (always run
against the school's own environment, and prefer `--command` over ad-hoc dumps).

**Access (droit d'accès)** — everything about one student:

```bash
npx wrangler d1 execute DB --env <school-id> --remote --command \
  "SELECT * FROM exclusions WHERE student_id = '<sis-id>' ORDER BY created_at;
   SELECT ev.* FROM exclusion_events ev
     JOIN exclusions ex ON ex.id = ev.exclusion_id
   WHERE ex.student_id = '<sis-id>' ORDER BY ev.created_at;"
```

**Rectification (droit de rectification)** — e.g. a misspelled name captured at incident time:

```bash
npx wrangler d1 execute DB --env <school-id> --remote --command \
  "UPDATE exclusions SET student_name = 'Prénom Nom' WHERE student_id = '<sis-id>';"
```

**Erasure (droit à l'effacement)** — note that while the retention period runs, the school may
legitimately refuse erasure of incident records needed for its supervision duty (art. 17.3); the
DPO arbitrates. When erasure is granted:

```bash
npx wrangler d1 execute DB --env <school-id> --remote --command \
  "DELETE FROM exclusion_events WHERE exclusion_id IN
     (SELECT id FROM exclusions WHERE student_id = '<sis-id>');
   DELETE FROM exclusions WHERE student_id = '<sis-id>';"
```

For staff: accounts are disabled rather than deleted (audit integrity); their personal data is
limited to e-mail/display name and can be pseudonymized on request once no active incident
references them.

## Processors (sous-traitants)

| Processor                        | Role                                | Personal data exposed                                                                                                           |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare** (Workers, D1)     | Hosting and database                | Everything in the inventory above, within the school's own isolated stack                                                       |
| **Google** (FCM)                 | Push transport for Android/iOS apps | Pseudonymous device tokens + the minimal notification content (e.g. "Nouvelle exclusion — 2nde B") — no student database access |
| **Apple** (APNs, relayed by FCM) | Push transport for iOS              | Same as FCM                                                                                                                     |

Notification texts are deliberately terse; push payloads carry the minimum needed to alert staff.
All three providers operate under standard contractual clauses and/or the EU-U.S. Data Privacy
Framework — the DPO should record the current transfer mechanism in the registre entry and can
consider Cloudflare's EU Data Localization options if required.

## Registre des traitements — ready-to-copy entry (French)

Each school must add the deployment to its **registre des traitements** (art. 30 RGPD). Template
to adapt:

> **Nom du traitement** : Suivi en temps réel des exclusions de cours
> **Responsable de traitement** : [Nom de l'établissement], représenté par le chef
> d'établissement — [coordonnées]
> **DPO** : [nom et coordonnées du délégué à la protection des données]
> **Finalités** : garantir la prise en charge immédiate par la vie scolaire des élèves exclus de
> cours (sécurité et obligation de surveillance) ; assurer la traçabilité des incidents et leur
> suivi éducatif ; produire des statistiques internes anonymisées de pilotage.
> **Base légale** : mission d'intérêt public (art. 6.1.e RGPD) [ou intérêt légitime, art. 6.1.f —
> à arbitrer avec le DPO].
> **Catégories de personnes concernées** : élèves de l'établissement ; personnels (enseignants,
> vie scolaire, direction).
> **Catégories de données** : identification de l'élève (identifiant du système de gestion, nom,
> classe au moment de l'incident) ; incident (motif, commentaire éventuel, statut, horodatages) ;
> comptes des personnels (e-mail, nom, rôle, mot de passe haché) ; jetons de notification
> pseudonymes des terminaux des personnels.
> **Destinataires** : vie scolaire, direction, enseignant à l'origine du signalement (pour ses
> propres signalements). Aucune communication à des tiers.
> **Durée de conservation** : 24 mois après la création de l'incident [à adapter], puis purge ;
> comptes des personnels : durée des fonctions.
> **Transferts hors UE** : hébergement Cloudflare et transport des notifications Google
> FCM / Apple APNs — clauses contractuelles types et/ou EU-U.S. Data Privacy Framework
> [vérifier le mécanisme en vigueur].
> **Mesures de sécurité** : chiffrement TLS, authentification individuelle des personnels avec
> rôles, mots de passe hachés (PBKDF2-SHA256), limitation des tentatives de connexion,
> cloisonnement complet par établissement, journal d'audit immuable, secrets hors du code
> source.

Also inform students and families through the school's usual information channels (règlement
intérieur / information RGPD annuelle), as required by arts. 13–14.
