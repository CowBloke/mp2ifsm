import Foundation

/// Erreur affichable : le serveur renvoie déjà `{ erreur }` en français.
struct ErreurAPI: LocalizedError, Sendable {
    let message: String
    let statut: Int
    var errorDescription: String? { message }
    var sessionExpiree: Bool { statut == 401 }

    static let reseau = ErreurAPI(message: "Pas de connexion au serveur. Vérifie ton réseau.", statut: 0)
}

/// Corps de réponse ignoré.
struct Vide: Decodable, Sendable {}

/// Client des routes `api/app` du serveur. Immuable : une nouvelle instance par session.
struct API: Sendable {
    static let base = URL(string: "https://mp2ifsm.com")!

    let jeton: String?

    private static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.httpCookieStorage = nil            // l'app s'authentifie par jeton, jamais par cookie
        return URLSession(configuration: c)
    }()

    static let decodeur: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { dec in
            let brut = try dec.singleValueContainer().decode(String.self)
            // Le serveur sérialise avec toISOString() : « 2026-11-10T07:00:00.000Z ».
            if let date = try? Date(brut, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return date }
            if let date = try? Date(brut, strategy: Date.ISO8601FormatStyle()) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath,
                                                    debugDescription: "Date illisible : \(brut)"))
        }
        return d
    }()

    // MARK: Requêtes JSON

    func get<T: Decodable>(_ chemin: String, _ parametres: [String: String?] = [:]) async throws -> T {
        var composants = URLComponents(url: Self.base.appending(path: chemin), resolvingAgainstBaseURL: false)!
        let items = parametres.compactMap { cle, valeur in valeur.map { URLQueryItem(name: cle, value: $0) } }
        if !items.isEmpty { composants.queryItems = items }
        return try await executer(URLRequest(url: composants.url!))
    }

    func envoyer<T: Decodable>(_ methode: String, _ chemin: String, _ corps: [String: Any?]? = nil) async throws -> T {
        try await executer(requete(methode, chemin, corps))
    }

    /// Variante sans réponse utile (le serveur renvoie `{}`).
    @discardableResult
    func envoyer(_ methode: String, _ chemin: String, _ corps: [String: Any?]? = nil) async throws -> Vide {
        try await executer(requete(methode, chemin, corps)) as Vide
    }

    private func requete(_ methode: String, _ chemin: String, _ corps: [String: Any?]?) throws -> URLRequest {
        var req = URLRequest(url: Self.base.appending(path: chemin))
        req.httpMethod = methode
        if let corps {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: corps.mapValues { $0 ?? NSNull() })
        }
        return req
    }

    // MARK: Fichiers

    /// Télécharge un fichier privé dans un dossier temporaire, sous son nom d'origine
    /// (QuickLook choisit l'aperçu d'après l'extension).
    func telecharger(_ chemin: String, nom: String) async throws -> URL {
        var req = URLRequest(url: Self.base.appending(path: chemin))
        authentifier(&req)
        let (temporaire, reponse): (URL, URLResponse)
        do { (temporaire, reponse) = try await Self.session.download(for: req) }
        catch { throw ErreurAPI.reseau }
        try verifier(reponse, donnees: nil)
        let dossier = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        let nomSur = nom.replacingOccurrences(of: "/", with: "-")
        let destination = dossier.appending(path: nomSur.isEmpty ? "document" : nomSur)
        try FileManager.default.moveItem(at: temporaire, to: destination)
        return destination
    }

    /// Envoi multipart vers la route du site (`fichier`, `dossier`).
    func deposer(fichier: URL, dossier: Int?) async throws {
        let acces = fichier.startAccessingSecurityScopedResource()
        defer { if acces { fichier.stopAccessingSecurityScopedResource() } }
        let contenu = try Data(contentsOf: fichier)
        _ = try await formulaire("api/documents/upload", champs: dossier.map { ["dossier": String($0)] } ?? [:],
                                 fichier: ("fichier", fichier.lastPathComponent, contenu), delai: 300)
    }

    /// Image d'une carte (`api/fiches/image`) ; renvoie le Markdown à insérer.
    func envoyerImageCarte(_ donnees: Data, nom: String) async throws -> String {
        struct Reponse: Decodable { let markdown: String }
        let brut = try await formulaire("api/fiches/image", champs: [:], fichier: ("image", nom, donnees), delai: 120)
        guard let r = try? Self.decodeur.decode(Reponse.self, from: brut) else {
            throw ErreurAPI(message: "Réponse inattendue du serveur. Mets l’app à jour.", statut: -1)
        }
        return r.markdown
    }

    /// Passage Toilet! (photo de preuve facultative) ; renvoie le nouveau total.
    func passageToilet(photo: Data?) async throws -> Int {
        struct Reponse: Decodable { let total: Int }
        let brut = try await formulaire("api/toilet/passage", champs: [:],
                                        fichier: photo.map { ("photo", "preuve.jpg", $0) }, delai: 60)
        return (try? Self.decodeur.decode(Reponse.self, from: brut).total) ?? 0
    }

    /// Photo ajoutée après coup à un passage sans preuve.
    func prouverPassage(_ id: Int, photo: Data) async throws {
        _ = try await formulaire("api/toilet/passage/\(id)/photo", champs: [:],
                                 fichier: ("photo", "preuve.jpg", photo), delai: 60)
    }

    /// POST multipart : champs texte et un fichier facultatif. Renvoie le corps de la réponse.
    private func formulaire(_ chemin: String, champs: [String: String],
                            fichier: (champ: String, nom: String, donnees: Data)?, delai: TimeInterval) async throws -> Data {
        let limite = "mp2-\(UUID().uuidString)"
        var corps = Data()
        for (nom, valeur) in champs {
            corps.append("--\(limite)\r\nContent-Disposition: form-data; name=\"\(nom)\"\r\n\r\n\(valeur)\r\n")
        }
        if let fichier {
            let nom = fichier.nom.replacingOccurrences(of: "\"", with: "")
            corps.append("--\(limite)\r\nContent-Disposition: form-data; name=\"\(fichier.champ)\"; filename=\"\(nom)\"\r\n")
            corps.append("Content-Type: application/octet-stream\r\n\r\n")
            corps.append(fichier.donnees)
            corps.append("\r\n")
        }
        corps.append("--\(limite)--\r\n")

        var req = URLRequest(url: Self.base.appending(path: chemin))
        req.httpMethod = "POST"
        req.timeoutInterval = delai
        req.setValue("multipart/form-data; boundary=\(limite)", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        authentifier(&req)
        let (donnees, reponse): (Data, URLResponse)
        do { (donnees, reponse) = try await Self.session.upload(for: req, from: corps) }
        catch { throw ErreurAPI.reseau }
        try verifier(reponse, donnees: donnees)
        return donnees
    }

    // MARK: Interne

    private func authentifier(_ req: inout URLRequest) {
        if let jeton { req.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
    }

    private func executer<T: Decodable>(_ requete: URLRequest) async throws -> T {
        var req = requete
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        authentifier(&req)
        let (donnees, reponse): (Data, URLResponse)
        do { (donnees, reponse) = try await Self.session.data(for: req) }
        catch { throw ErreurAPI.reseau }
        try verifier(reponse, donnees: donnees)
        do { return try Self.decodeur.decode(T.self, from: donnees) }
        catch {
            #if DEBUG
            print("Décodage \(T.self) :", error)
            #endif
            throw ErreurAPI(message: "Réponse inattendue du serveur. Mets l’app à jour.", statut: -1)
        }
    }

    private func verifier(_ reponse: URLResponse, donnees: Data?) throws {
        guard let http = reponse as? HTTPURLResponse else { throw ErreurAPI.reseau }
        guard !(200..<300).contains(http.statusCode) else { return }
        struct Corps: Decodable { let erreur: String }
        let message = donnees.flatMap { try? JSONDecoder().decode(Corps.self, from: $0).erreur }
        switch http.statusCode {
        case 401: throw ErreurAPI(message: message ?? "Session expirée, reconnecte-toi.", statut: 401)
        case 404, 410: throw ErreurAPI(message: message ?? "Introuvable.", statut: http.statusCode)
        default: throw ErreurAPI(message: message ?? "Une erreur est survenue, réessaie.", statut: http.statusCode)
        }
    }
}

private extension Data {
    mutating func append(_ texte: String) { append(Data(texte.utf8)) }
}
