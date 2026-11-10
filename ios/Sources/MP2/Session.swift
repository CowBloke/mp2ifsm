import Foundation
import Observation

/// État de connexion de l'app. Le jeton vit dans le trousseau, le profil en mémoire.
@MainActor @Observable
final class Session {
    private(set) var api: API
    private(set) var utilisateur: Utilisateur?
    /// Vrai dès qu'un jeton existe : l'app s'ouvre sur les onglets sans attendre le réseau.
    private(set) var connecte: Bool
    /// Dernières réponses des écrans (voir `Chargement`) : un écran déjà vu
    /// s'affiche aussitôt, puis se rafraîchit. Vidé à la déconnexion.
    @ObservationIgnored var memoire: [String: (valeur: Any, date: Date)] = [:]

    init() {
        let jeton = Trousseau.lire()
        api = API(jeton: jeton)
        connecte = jeton != nil
        if let donnees = UserDefaults.standard.data(forKey: "utilisateur") {
            utilisateur = try? JSONDecoder().decode(Utilisateur.self, from: donnees)
        }
    }

    func connexion(email: String, motDePasse: String) async throws {
        let r: ReponseConnexion = try await API(jeton: nil)
            .envoyer("POST", "api/app/connexion", ["email": email, "motDePasse": motDePasse])
        Trousseau.ecrire(r.jeton)
        api = API(jeton: r.jeton)
        mettreAJour(r.utilisateur)
        connecte = true
    }

    /// Création de compte avec le code d'invitation de la classe ; connecte aussitôt.
    func inscription(pseudo: String, email: String, motDePasse: String, code: String) async throws {
        let r: ReponseConnexion = try await API(jeton: nil)
            .envoyer("POST", "api/app/inscription", ["pseudo": pseudo, "email": email, "motDePasse": motDePasse, "code": code])
        Trousseau.ecrire(r.jeton)
        api = API(jeton: r.jeton)
        mettreAJour(r.utilisateur)
        connecte = true
    }

    func deconnexion() async {
        await Notifs.partage.oublier(api)
        _ = try? await api.envoyer("POST", "api/app/deconnexion")   // hors ligne : le jeton expirera seul
        oublier()
    }

    /// Profil rafraîchi par l'accueil (pseudo, rôle ou groupe changés depuis le site).
    func mettreAJour(_ u: Utilisateur) {
        utilisateur = u
        UserDefaults.standard.set(try? JSONEncoder().encode(u), forKey: "utilisateur")
    }

    func groupeChange(_ groupe: Int?) {
        guard var u = utilisateur else { return }
        u.groupeColle = groupe
        mettreAJour(u)
    }

    /// À appeler sur toute erreur : une session expirée ramène à la connexion.
    func signaler(_ erreur: Error) {
        if (erreur as? ErreurAPI)?.sessionExpiree == true { oublier() }
    }

    private func oublier() {
        Trousseau.effacer()
        memoire = [:]
        UserDefaults.standard.removeObject(forKey: "utilisateur")
        api = API(jeton: nil)
        utilisateur = nil
        connecte = false
    }
}
