import Foundation

/*
 * Miroir du JSON des routes `api/app` (clés snake_case converties).
 * Les sources côté serveur sont indiquées pour chaque groupe.
 */

// MARK: Session — api/app/connexion

struct Utilisateur: Codable, Sendable, Equatable {
    let id: String
    var displayName: String
    var role: String
    var groupeColle: Int?
    var email: String?
    /// Membre de Toilet! (rubrique cachée) ; connu une fois l'accueil chargé.
    var toilet: Bool?

    var estAdmin: Bool { role == "admin" }
    var initiale: String { displayName.trimmingCharacters(in: .whitespaces).prefix(1).uppercased() }
}

struct ReponseConnexion: Decodable, Sendable {
    let jeton: String
    let utilisateur: Utilisateur
}

// MARK: Communs

struct Matiere: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let nom: String
    let couleur: String?
    /// Fourni seulement là où les matières archivées sont listées.
    var archivee: Bool? = nil
}

// MARK: Accueil — api/app/accueil

struct Accueil: Decodable, Sendable {
    let utilisateur: Utilisateur
    let message: MessageClasse
    let colles: [Colle]
    let echeances: [Echeance]
    let matieres: [Matiere]
    let fiches: ResumeFiches
    let marche: MarcheProche?
}

struct MessageClasse: Decodable, Sendable {
    let texte: String
    let updatedAt: Date?
    let auteur: String?
}

struct Echeance: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let titre: String
    let subjectId: Int?
    let matiere: String?
    let couleur: String?
    let dueAt: Date
    let details: String?
    let auteur: String
    let createdBy: String
}

struct ResumeFiches: Decodable, Sendable {
    struct Paquet: Decodable, Sendable { let slug: String; let titre: String; let n: Int }
    let aReviser: Int
    let nouvelles: Int
    let revisesAujourdhui: Int
    let prochainPaquet: Paquet?

    var total: Int { aReviser + nouvelles }
}

struct MarcheProche: Decodable, Sendable {
    let id: Int
    let slug: String
    let question: String
    let closesAt: Date
    /// Centièmes de pricoupenkoin.
    let cagnotte: Int
    let maMise: Int
}

// MARK: Colles — api/app/colles (src/lib/colles.ts)

struct Colle: Decodable, Sendable, Identifiable, Hashable {
    struct Alternative: Decodable, Sendable, Hashable {
        let debut: Date
        let fin: Date
        let salle: String
        let condition: String
    }
    let id: String
    let code: String
    let creneau: String
    let matiere: String
    let couleur: String?
    let colleur: String
    let debut: Date
    let fin: Date
    let salle: String
    let alternative: Alternative?
    let notes: [String]
}

struct ReponseColles: Decodable, Sendable {
    struct Semaine: Decodable, Sendable {
        struct Periode: Decodable, Sendable { let id: String; let libelle: String; let anneeScolaire: String; let notes: [String] }
        let lundi: String
        let periode: Periode?
        let numero: Int?
        let rotation: String?
        let colles: [Colle]
        let notes: [String]
    }
    let groupe: Int?
    let moi: Int?
    let groupeMax: Int
    let lundi: String
    let lundiCourant: String
    let semaine: Semaine?
    let aVenir: [Colle]
}

// MARK: Documents — api/app/documents (src/lib/documents.ts)

struct ReponseDocuments: Decodable, Sendable {
    let dossiers: [Dossier]
    let documents: [Document]
    let usage: Occupation
    let matieres: [Matiere]
}

struct Dossier: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let parentId: Int?
    let nom: String
    let couleur: String?
    let matiere: String?
    let subjectId: Int?
    let nbElements: Int
}

struct Document: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let originalName: String
    let mime: String
    let taille: Int
    let matiere: String?
    let couleur: String?
    let chapitre: String?
    let tags: [String]
    let uploader: String
    let createdAt: Date
    let peutSupprimer: Bool
}

struct Occupation: Decodable, Sendable {
    let utiliseMembre: Int
    let quotaMembre: Int
    let utiliseGlobal: Int
    let plafondGlobal: Int
}

// MARK: Fiches — api/app/fiches, api/app/revision (src/lib/revision.ts)

struct ReponseFiches: Decodable, Sendable {
    let paquets: [Paquet]
    let matieres: [Matiere]
}

struct Paquet: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let slug: String
    let titre: String
    let subjectId: Int?
    let matiere: String?
    let couleur: String?
    var abonne: Bool
    let description: String?
    let createur: String
    let total: Int
    let nouvelles: Int
    let apprentissage: Int
    let aRevoir: Int
    let createdAt: Date
    var likes: Int
    var aime: Bool

    /// Cartes à faire maintenant (comme le compteur du site).
    var aFaire: Int { nouvelles + apprentissage + aRevoir }
}

struct CarteRendue: Decodable, Sendable, Equatable {
    struct Note: Decodable, Sendable, Equatable, Identifiable {
        let cle: String
        let label: String
        let touche: String
        let intervalle: String
        var id: String { cle }
    }
    struct Restant: Decodable, Sendable, Equatable {
        let nouvelles: Int
        let apprentissage: Int
        let aRevoir: Int
        var total: Int { nouvelles + apprentissage + aRevoir }
    }
    let jeton: String
    let cardId: Int
    let rectoHtml: String
    let rectoReveleHtml: String
    let versoHtml: String
    let trousHtml: [String]
    let auteur: String
    let signalee: Bool
    let apercu: [Note]
    let restant: Restant
    let nouvelle: Bool
    let paquet: String
}

struct ReponseCarte: Decodable, Sendable { let carte: CarteRendue? }

struct ResultatRevision: Decodable, Sendable {
    let cardId: Int
    let etat: String
    let intervalle: String
}

struct ReponsePaquet: Decodable, Sendable {
    let abonne: Bool?
    let likes: Int?
    let aime: Bool?
}

/// api/app/fiches/<id> : la fiche complète d'un paquet.
struct FichePaquet: Decodable, Sendable {
    var paquet: Paquet
    let peutModifier: Bool
    let matieres: [Matiere]
    let stats: StatsPaquet?
    let cartes: [CarteListe]
}

struct StatsPaquet: Decodable, Sendable {
    struct Jour: Decodable, Sendable, Identifiable { let jour: String; let n: Int; var id: String { jour } }
    /// Part des réponses réussies sur les cartes mûres (90 jours), nil sans données.
    let retention: Double?
    let revisions30j: Int
    let cartesVues: Int
    let total: Int
    let aVenir: [Jour]
}

struct CarteListe: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let recto: String
    let verso: String
    let auteur: String
    let revisions: Int
    let signalements: Int
    let etat: String?
    let due: Date?
    let rectoHtml: String
    let versoHtml: String
    let peutSupprimer: Bool
}

struct VersionCarte: Decodable, Sendable, Identifiable {
    let id: Int
    let auteur: String
    let editedAt: Date
    let motif: String?
    let rectoHtml: String
    let versoHtml: String
}

struct ReponseHistorique: Decodable, Sendable { let versions: [VersionCarte] }
struct ReponseApercu: Decodable, Sendable { let recto: String; let verso: String }
struct PaquetCree: Decodable, Sendable { let id: Int; let slug: String }
struct CarteCreee: Decodable, Sendable { let cardId: Int }

// MARK: Vidéos — api/app/videos (src/lib/videos.ts)

struct Video: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let titre: String
    let description: String
    let auteurId: String
    let auteur: String
    let matiereId: Int?
    let matiere: String?
    let couleur: String?
    let dureeMs: Int
    var likes: Int
    var aime: Bool
    let vues: Int
    var commentaires: Int
    let musique: String?
}

struct ProfilVideos: Decodable, Sendable {
    let id: String
    let pseudo: String
    let videos: Int
    let likes: Int
    let vues: Int
}

struct ReponseVideos: Decodable, Sendable {
    struct EnCours: Decodable, Sendable, Identifiable, Hashable { let id: Int; let titre: String; let statut: String }
    let videos: [Video]
    let profil: ProfilVideos?
    let enCours: [EnCours]
    let matieres: [Matiere]
}

struct CommentaireVideo: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let auteurId: String
    let auteur: String
    let texte: String
}

struct ReponseCommentaires: Decodable, Sendable { let commentaires: [CommentaireVideo] }

struct ReponseJaime: Decodable, Sendable { let likes: Int; let aime: Bool }

// MARK: Cours — api/app/cours (src/lib/cours.ts)

struct ReponseCours: Decodable, Sendable { let chapitres: [ChapitreCours] }

struct ChapitreCours: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let cle: String
    let numero: Int?
    let titre: String
    let resume: String
    let subjectId: Int?
    let matiere: String?
    let couleur: String?
    let fichiers: [FichierCours]
    let paquets: [Paquet]

    var supports: [FichierCours] { fichiers.filter { $0.genre == "cours" || $0.genre == "td" || $0.genre == "autre" } }
    var corriges: [FichierCours] { fichiers.filter { $0.genre == "correction" || $0.genre == "dm" } }
}

struct FichierCours: Decodable, Sendable, Identifiable, Hashable {
    let id: Int
    let cle: String
    let genre: String
    let titre: String
    let taille: Int
    let pages: Int
    let updatedAt: Date

    var libelleGenre: String {
        switch genre {
        case "correction": "Corrigé"
        case "dm": "DM"
        case "td": "TD"
        case "cours": "Cours"
        default: "Document"
        }
    }
}

struct ReponseRechercheCours: Decodable, Sendable {
    let resultats: [ResultatCours]
    let debut: String
    let fin: String
}

struct ResultatCours: Decodable, Sendable, Identifiable, Hashable {
    let fichierId: Int
    let fichier: String
    let genre: String
    let chapitre: String
    let matiere: String?
    let couleur: String?
    let page: Int
    let extrait: String
    var id: String { "\(fichierId)-\(page)" }
}

// MARK: Notifications — api/app/notifications (src/lib/notif-prefs.ts)

struct EtatNotif: Decodable, Sendable, Equatable {
    var flash: Bool
    var flashHeure: Int
    var devoirs: Bool
    var messages: Bool
    var appareils: Int?
    var heureMin: Int?
    var heureMax: Int?
}

struct ReponseEssai: Decodable, Sendable { let appareils: Int }

// MARK: Marché — api/app/marche (src/lib/queries.ts, src/lib/paris.ts). Montants en centièmes de PCK.

struct Marche: Decodable, Sendable, Identifiable, Hashable {
    struct Issue: Decodable, Sendable, Identifiable, Hashable {
        let id: Int
        let label: String
        let position: Int
        let mises: Int
        let parieurs: Int
        let maMise: Int
    }
    let id: Int
    let slug: String
    let question: String
    let description: String?
    let closesAt: Date
    let status: String              // open | closed | resolved | cancelled
    let resolvedOutcomeId: Int?
    let cagnotte: Int
    let parieurs: Int
    let maMise: Int
    let monGain: Int?
    let issues: [Issue]

    var ouvert: Bool { status == "open" }
}

struct PositionMarche: Decodable, Sendable, Identifiable, Hashable {
    let betId: Int
    let slug: String
    let question: String
    let status: String
    let outcomeLabel: String
    let amount: Int
    let payout: Int?
    let gagnant: Bool?
    var id: Int { betId }
}

struct ReponseMarches: Decodable, Sendable {
    let marches: [Marche]
    let solde: Int
    let positions: [PositionMarche]
}

struct ReponseMarche: Decodable, Sendable {
    let marche: Marche
    let solde: Int
}

struct ResultatPari: Decodable, Sendable {
    let betId: Int
    let soldeCentimes: Int
    let miseCentimes: Int
}

struct ReponseClassement: Decodable, Sendable {
    struct Ligne: Decodable, Sendable, Identifiable, Hashable {
        let userId: String
        let displayName: String
        let resultat: Int
        let paris: Int
        var id: String { userId }
    }
    struct Mouvement: Decodable, Sendable, Identifiable, Hashable {
        let id: Int
        let kind: String
        let amount: Int
        let memo: String?
        let createdAt: Date
        let question: String?
    }
    let classement: [Ligne]
    let mouvements: [Mouvement]
    let reglees: [PositionMarche]
}

// MARK: Toilet! — api/app/toilet (src/lib/toilet.ts)

struct StatutToilet: Decodable, Sendable, Equatable {
    let seuil: Int
    let titre: String
    let emoji: String
    let devise: String
}

struct ProchainStatut: Decodable, Sendable {
    let titre: String
    let emoji: String
    let restant: Int
}

struct ReponseToilet: Decodable, Sendable {
    struct Stats: Decodable, Sendable { let total: Int; let aujourdhui: Int; let dernier: Date? }
    struct Ligne: Decodable, Sendable, Identifiable {
        let pseudo: String
        let n: Int
        let photos: Int
        let total: Int
        let statut: StatutToilet
        let moi: Bool
        var id: String { pseudo }
    }
    struct Passage: Decodable, Sendable, Identifiable {
        let id: Int
        let pseudo: String
        let creeLe: Date
        let photo: Bool
        let peutSupprimer: Bool
    }
    struct APreuver: Decodable, Sendable, Identifiable { let id: Int; let creeLe: Date }

    let periode: String
    let stats: Stats
    let statut: StatutToilet
    let prochain: ProchainStatut?
    let progression: Double
    let classement: [Ligne]
    let fil: [Passage]
    let aProuver: [APreuver]
    let lien: String?
}

// MARK: Profil — api/app/profil (src/lib/profil.ts)

struct ReponseProfil: Decodable, Sendable {
    struct Portefeuille: Decodable, Sendable {
        struct EnAttente: Decodable, Sendable, Hashable { let sens: String; let montant: Int; let creeLe: Date }
        /// Centièmes de PCK.
        let solde: Int
        let kcRetirables: Int
        /// Faux tant que kcmaths n'est pas branché : solde seul.
        let transferts: Bool
        let enAttente: [EnAttente]
    }
    struct Positions: Decodable, Sendable { let ouvertes: [PositionMarche]; let reglees: [PositionMarche] }
    struct Mouvement: Decodable, Sendable, Identifiable {
        let id: Int
        let kind: String
        let amount: Int
        let createdAt: Date
        let question: String?
        var libelle: String {
            question ?? ["deposit": "Dépôt", "withdrawal": "Retrait", "bet": "Mise",
                         "payout": "Gain", "refund": "Remboursement"][kind] ?? kind
        }
    }
    struct Retour: Decodable, Sendable, Identifiable {
        let id: Int
        let categorie: String
        let message: String
        let statut: String
        let reponse: String
        let createdAt: Date
    }
    struct Proposition: Decodable, Sendable, Identifiable {
        let id: Int
        let question: String
        let closesAt: Date
        let issues: [String]
        let status: String
        let reviewNote: String?
    }

    let portefeuille: Portefeuille
    let positions: Positions
    let releve: [Mouvement]
    let partageStats: Bool
    let groupeMax: Int
    let retours: [Retour]
    let propositions: [Proposition]
}

struct ResultatTransfert: Decodable, Sendable {
    let statut: String
    let motif: String?
    let solde: Int
}
